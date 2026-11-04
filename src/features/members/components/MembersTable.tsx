/**
 * 名簿テーブル（スプレッドシート風）。#67 #69 #70 #78 #81
 * - セルをダブルクリック / Enter / F2 で編集、Esc で取消、矢印・Tab で移動
 * - 最終行で Enter を押すと行を追加。1 セルの確定 = 1 回の Undo
 * - チェックボックスで選択（Shift で範囲）
 */
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { GENDERS } from "@/domain/genders";
import type { ID, Lab, Member } from "@/domain/schema";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/project";
import { normalizeName, parseTags } from "../lib/normalize";
import { prevSeatActions } from "../lib/prevPlan";
import type { MemberRow, SortKey, SortState } from "../lib/table";
import { ChangeBadge, LabBadge, PrevPlacementText, RoleBadge } from "./badges";
import { PrevSeatEditor } from "./PrevSeatEditor";
import { NativeRoleOptions } from "./RoleSelect";

export const COLUMN_KEYS = [
  "name",
  "kana",
  "lab",
  "gender",
  "role",
  "tags",
  "prev",
  "current",
  "change",
  "note",
] as const;
export type ColumnKey = (typeof COLUMN_KEYS)[number];

type EditKind = "text" | "lab" | "gender" | "role" | "prev";
const EDIT_KIND: Partial<Record<ColumnKey, EditKind>> = {
  name: "text",
  kana: "text",
  tags: "text",
  note: "text",
  lab: "lab",
  gender: "gender",
  role: "role",
  prev: "prev",
};
const SORT_KEY: Partial<Record<ColumnKey, SortKey>> = {
  name: "name",
  lab: "lab",
  gender: "gender",
  role: "role",
  prev: "prev",
  current: "current",
  change: "change",
};
const COL_CLASS: Record<ColumnKey, string> = {
  name: "min-w-36",
  kana: "min-w-28",
  lab: "min-w-28",
  gender: "min-w-20",
  role: "min-w-24",
  tags: "min-w-32",
  prev: "min-w-40",
  current: "min-w-32",
  change: "min-w-28",
  note: "min-w-40",
};

type Move = "up" | "down" | "left" | "right";
interface Active {
  row: ID;
  col: ColumnKey;
}

export interface MembersTableProps {
  rows: readonly MemberRow[];
  columns: readonly ColumnKey[];
  labs: readonly Lab[];
  readOnly: boolean;
  selected: ReadonlySet<ID>;
  onToggleSelect: (id: ID, range: boolean) => void;
  onToggleAll: () => void;
  sort: SortState;
  onSort: (key: SortKey) => void;
  onOpenEdit: (id: ID) => void;
  /** 最終行で Enter → 行を追加して新しい ID を返す */
  onAddRow: () => ID | undefined;
}

function rawValue(m: Member, col: ColumnKey): string {
  switch (col) {
    case "name":
      return m.name;
    case "kana":
      return m.kana ?? "";
    case "tags":
      return m.tags.join(", ");
    case "note":
      return m.note ?? "";
    case "lab":
      return m.labId ?? "";
    case "gender":
      return m.gender;
    case "role":
      return m.role;
    default:
      return "";
  }
}

/** 1 セル分の確定（変更がなければ何もしない = Undo 履歴を汚さない） */
function commitCell(m: Member, col: ColumnKey, raw: string) {
  const s = useProjectStore.getState();
  const patch: Partial<Member> = {};
  switch (col) {
    case "name": {
      const v = normalizeName(raw);
      if (!v || v === m.name) return;
      patch.name = v;
      break;
    }
    case "kana":
    case "note": {
      const v = raw.trim();
      if (v === (m[col] ?? "")) return;
      patch[col] = v || undefined;
      break;
    }
    case "tags": {
      const v = parseTags(raw);
      if (v.join("\u0001") === m.tags.join("\u0001")) return;
      patch.tags = v;
      break;
    }
    case "lab":
      if ((m.labId ?? "") === raw) return;
      patch.labId = raw || undefined;
      break;
    case "gender":
      if (m.gender === raw) return;
      patch.gender = raw as Member["gender"];
      break;
    case "role":
      if (m.role === raw) return;
      patch.role = raw as Member["role"];
      break;
    default:
      return;
  }
  s.updateMember(m.id, patch);
}

function clearCell(m: Member, col: ColumnKey) {
  const s = useProjectStore.getState();
  if (col === "kana" && m.kana) s.updateMember(m.id, { kana: undefined });
  else if (col === "note" && m.note) s.updateMember(m.id, { note: undefined });
  else if (col === "tags" && m.tags.length) s.updateMember(m.id, { tags: [] });
  else if (col === "lab" && m.labId) s.updateMember(m.id, { labId: undefined });
  else if (col === "prev") prevSeatActions.clear([m.id]);
}

export function MembersTable(props: MembersTableProps) {
  const { rows, columns, readOnly, selected, sort, onSort, onAddRow } = props;
  const { t } = useTranslation("members");
  const [active, setActive] = useState<Active | null>(null);
  const [editing, setEditing] = useState<{ initial: string } | null>(null);
  const [prevOpen, setPrevOpen] = useState<ID | null>(null);
  const focusPending = useRef(false);
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  const rowIndex = useCallback((id: ID) => rows.findIndex((r) => r.member.id === id), [rows]);

  // アクティブセルへフォーカスを移す
  useLayoutEffect(() => {
    if (!focusPending.current || !active || editing) return;
    const el = bodyRef.current?.querySelector<HTMLElement>(
      `[data-row="${CSS.escape(active.row)}"][data-col="${active.col}"]`,
    );
    if (el) {
      el.focus({ preventScroll: false });
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      focusPending.current = false;
    }
  });

  // 行が消えたらアクティブセルを外す
  useEffect(() => {
    if (active && rowIndex(active.row) < 0 && !editing) setActive(null);
  }, [active, editing, rowIndex]);

  const go = useCallback(
    (a: Active | null, edit: { initial: string } | null = null) => {
      focusPending.current = true;
      setActive(a);
      setEditing(edit);
    },
    [],
  );

  const moveFrom = useCallback(
    (from: Active, dir: Move): Active | "addRow" | null => {
      const ri = rowIndex(from.row);
      const ci = columns.indexOf(from.col);
      if (ri < 0 || ci < 0) return null;
      if (dir === "up") return ri > 0 ? { row: rows[ri - 1]!.member.id, col: from.col } : from;
      if (dir === "down")
        return ri < rows.length - 1 ? { row: rows[ri + 1]!.member.id, col: from.col } : "addRow";
      if (dir === "left") {
        if (ci > 0) return { row: from.row, col: columns[ci - 1]! };
        return ri > 0 ? { row: rows[ri - 1]!.member.id, col: columns.at(-1)! } : from;
      }
      if (ci < columns.length - 1) return { row: from.row, col: columns[ci + 1]! };
      return ri < rows.length - 1 ? { row: rows[ri + 1]!.member.id, col: columns[0]! } : from;
    },
    [rows, columns, rowIndex],
  );

  const startEdit = useCallback(
    (a: Active, initial?: string) => {
      if (readOnly) return;
      const kind = EDIT_KIND[a.col];
      if (!kind) return;
      if (kind === "prev") {
        setActive(a);
        setEditing(null);
        setPrevOpen(a.row);
        return;
      }
      const m = rows[rowIndex(a.row)]?.member;
      if (!m) return;
      setActive(a);
      setEditing({ initial: initial ?? rawValue(m, a.col) });
    },
    [readOnly, rows, rowIndex],
  );

  const finishEdit = useCallback(
    (value: string | null, move: Move | null) => {
      if (!active) return;
      const m = rows[rowIndex(active.row)]?.member;
      if (m && value !== null) commitCell(m, active.col, value);
      if (!move) {
        // Esc はセルにフォーカスを戻す。blur（他所をクリック）は奪わない
        if (value === null) go(active);
        else setEditing(null);
        return;
      }
      const next = moveFrom(active, move);
      if (next === "addRow") {
        if (move === "down" && !readOnly) {
          const id = onAddRow();
          if (id) {
            go({ row: id, col: columns.includes("name") ? "name" : active.col }, { initial: "" });
            return;
          }
        }
        go(active);
      } else go(next);
    },
    [active, rows, rowIndex, moveFrom, go, onAddRow, readOnly, columns],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLTableSectionElement>) => {
    if (editing || prevOpen) return;
    const td = (e.target as HTMLElement).closest<HTMLElement>("td[data-col]");
    if (!td || e.target !== td) return;
    const a: Active = { row: td.dataset.row!, col: td.dataset.col as ColumnKey };
    const m = rows[rowIndex(a.row)]?.member;
    const dirs: Record<string, Move> = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
    };
    if (dirs[e.key]) {
      e.preventDefault();
      const n = moveFrom(a, dirs[e.key]!);
      if (n && n !== "addRow") go(n);
    } else if (e.key === "Tab") {
      const n = moveFrom(a, e.shiftKey ? "left" : "right");
      if (n && n !== "addRow" && (n.row !== a.row || n.col !== a.col)) {
        e.preventDefault();
        go(n);
      }
    } else if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      if (EDIT_KIND[a.col]) startEdit(a);
      else if (e.key === "Enter") {
        const n = moveFrom(a, "down");
        if (n && n !== "addRow") go(n);
      }
    } else if ((e.key === "Delete" || e.key === "Backspace") && m && !readOnly) {
      e.preventDefault();
      clearCell(m, a.col);
    } else if (
      e.key.length === 1 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      EDIT_KIND[a.col] === "text"
    ) {
      e.preventDefault();
      startEdit(a, e.key);
    }
  };

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.member.id));
  const someSelected = !allSelected && rows.some((r) => selected.has(r.member.id));

  return (
    <table className="w-full border-separate border-spacing-0 text-sm" data-testid="members-table">
      <thead className="bg-background/95 sticky top-0 z-10 backdrop-blur">
        <tr>
          {!readOnly && (
            <th className="w-10 border-b px-3 py-2 text-left">
              <Checkbox
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={() => props.onToggleAll()}
                aria-label={t("table.selectAll")}
                data-testid="select-all"
              />
            </th>
          )}
          {columns.map((c) => {
            const sk = SORT_KEY[c];
            const sorted = sk && sort.key === sk;
            return (
              <th
                key={c}
                className={cn(
                  "text-muted-foreground border-b px-2 py-2 text-left text-xs font-medium whitespace-nowrap",
                  COL_CLASS[c],
                )}
                aria-sort={sorted ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
              >
                {sk ? (
                  <button
                    type="button"
                    className="hover:text-foreground -mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5"
                    onClick={() => onSort(sk)}
                    data-testid={`sort-${c}`}
                  >
                    {t(`columns.${c}`)}
                    {sorted ? (
                      sort.dir === "asc" ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      )
                    ) : (
                      <ArrowUpDown className="size-3 opacity-40" />
                    )}
                  </button>
                ) : (
                  t(`columns.${c}`)
                )}
              </th>
            );
          })}
          <th className="w-10 border-b" />
        </tr>
      </thead>
      <tbody ref={bodyRef} onKeyDown={onKeyDown}>
        {rows.map((r) => (
          <MemberRowView
            key={r.member.id}
            row={r}
            columns={columns}
            labs={props.labs}
            readOnly={readOnly}
            selected={selected.has(r.member.id)}
            activeCol={active?.row === r.member.id ? active.col : null}
            editing={active?.row === r.member.id ? editing : null}
            prevOpen={prevOpen === r.member.id}
            onActivate={setActive}
            onStartEdit={startEdit}
            onFinishEdit={finishEdit}
            onPrevOpenChange={(open) => {
              setPrevOpen(open ? r.member.id : null);
              if (!open) go({ row: r.member.id, col: "prev" });
            }}
            onToggleSelect={props.onToggleSelect}
            onOpenEdit={props.onOpenEdit}
          />
        ))}
      </tbody>
    </table>
  );
}

interface RowProps {
  row: MemberRow;
  columns: readonly ColumnKey[];
  labs: readonly Lab[];
  readOnly: boolean;
  selected: boolean;
  activeCol: ColumnKey | null;
  editing: { initial: string } | null;
  prevOpen: boolean;
  onActivate: (a: Active) => void;
  onStartEdit: (a: Active) => void;
  onFinishEdit: (value: string | null, move: Move | null) => void;
  onPrevOpenChange: (open: boolean) => void;
  onToggleSelect: (id: ID, range: boolean) => void;
  onOpenEdit: (id: ID) => void;
}

const MemberRowView = memo(function MemberRowView(p: RowProps) {
  const { t } = useTranslation("members");
  const { member: m } = p.row;
  const cell = (col: ColumnKey): ReactNode => {
    const isEditing = p.activeCol === col && p.editing;
    if (isEditing) return <CellEditor col={col} initial={p.editing!.initial} labs={p.labs} onDone={p.onFinishEdit} />;
    switch (col) {
      case "name":
        return m.name ? (
          <span className="font-medium">{m.name}</span>
        ) : (
          <span className="text-muted-foreground italic">{t("table.noName")}</span>
        );
      case "kana":
        return <span className="text-muted-foreground">{m.kana}</span>;
      case "lab":
        return <LabBadge lab={p.row.lab} />;
      case "gender":
        return <span>{t(`common:genders.${m.gender}`)}</span>;
      case "role":
        return <RoleBadge role={m.role} />;
      case "tags":
        return (
          <span className="flex flex-wrap gap-1">
            {m.tags.map((tag) => (
              <span key={tag} className="bg-secondary rounded px-1.5 py-0.5 text-xs">
                {tag}
              </span>
            ))}
          </span>
        );
      case "prev":
        return (
          <PrevSeatEditor memberId={m.id} open={p.prevOpen} onOpenChange={p.onPrevOpenChange}>
            <span className="block min-h-5" data-testid="prev-cell">
              <PrevPlacementText placement={p.row.prev} />
            </span>
          </PrevSeatEditor>
        );
      case "current":
        return p.row.current ? (
          <span>
            {p.row.current.room.name}
            <span className="text-muted-foreground"> / </span>
            <span className="font-medium tabular-nums">{p.row.current.seat.label || "?"}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">{t("table.unassigned")}</span>
        );
      case "change":
        return <ChangeBadge kind={p.row.change} />;
      case "note":
        return (
          <span className="text-muted-foreground line-clamp-1" title={m.note}>
            {m.note}
          </span>
        );
    }
  };
  return (
    <tr
      className={cn(
        "group hover:bg-muted/40",
        p.selected && "bg-primary/5 hover:bg-primary/10",
      )}
      data-member={m.id}
      data-testid="member-row"
      aria-selected={p.selected}
    >
      {!p.readOnly && (
        <td className="border-b px-3 py-1.5">
          <Checkbox
            checked={p.selected}
            onClick={(e) => {
              e.preventDefault();
              p.onToggleSelect(m.id, e.shiftKey);
            }}
            aria-label={t("table.selectRow", { name: m.name })}
            data-testid="row-select"
          />
        </td>
      )}
      {p.columns.map((col) => {
        const active = p.activeCol === col;
        const editable = !p.readOnly && !!EDIT_KIND[col];
        return (
          <td
            key={col}
            data-row={m.id}
            data-col={col}
            tabIndex={active ? 0 : -1}
            className={cn(
              "h-10 border-b px-2 py-1 align-middle outline-none",
              editable && "cursor-cell",
              active && "ring-primary/70 bg-primary/5 ring-2 ring-inset",
              p.activeCol === col && p.editing && "bg-background py-0.5",
            )}
            onMouseDown={() => !active && p.onActivate({ row: m.id, col })}
            onFocus={() => !active && p.onActivate({ row: m.id, col })}
            onDoubleClick={() => editable && p.onStartEdit({ row: m.id, col })}
            onClick={() => col === "prev" && active && editable && p.onStartEdit({ row: m.id, col })}
          >
            {cell(col)}
          </td>
        );
      })}
      <td className="border-b px-1 text-right">
        {!p.readOnly && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            onClick={() => p.onOpenEdit(m.id)}
            aria-label={t("table.editRow", { name: m.name })}
            data-testid="row-edit"
          >
            <Pencil />
          </Button>
        )}
      </td>
    </tr>
  );
});

function CellEditor({
  col,
  initial,
  labs,
  onDone,
}: {
  col: ColumnKey;
  initial: string;
  labs: readonly Lab[];
  onDone: (value: string | null, move: Move | null) => void;
}) {
  const { t } = useTranslation("members");
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const ref = useRef<HTMLInputElement & HTMLSelectElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    if (el instanceof HTMLInputElement) {
      const n = el.value.length;
      el.setSelectionRange(n, n);
    }
  }, []);
  const finish = (v: string | null, move: Move | null) => {
    if (done.current) return;
    done.current = true;
    onDone(v, move);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    e.stopPropagation();
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter") {
      e.preventDefault();
      finish(value, e.shiftKey ? "up" : "down");
    } else if (e.key === "Tab") {
      e.preventDefault();
      finish(value, e.shiftKey ? "left" : "right");
    } else if (e.key === "Escape") {
      e.preventDefault();
      finish(null, null);
    }
  };
  const common = {
    ref,
    value,
    onKeyDown,
    onBlur: () => finish(value, null),
    "data-testid": `cell-editor-${col}`,
    className:
      "border-ring bg-background focus-visible:ring-ring/40 h-8 w-full rounded-md border px-2 text-sm outline-none focus-visible:ring-2",
  } as const;
  const kind = EDIT_KIND[col];
  if (kind === "lab")
    return (
      <select {...common} onChange={(e) => setValue(e.target.value)} aria-label={t("columns.lab")}>
        <option value="">{t("lab.none")}</option>
        {labs.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    );
  if (kind === "gender")
    return (
      <select {...common} onChange={(e) => setValue(e.target.value)} aria-label={t("columns.gender")}>
        {GENDERS.map((g) => (
          <option key={g} value={g}>
            {t(`common:genders.${g}`)}
          </option>
        ))}
      </select>
    );
  if (kind === "role")
    return (
      <select {...common} onChange={(e) => setValue(e.target.value)} aria-label={t("columns.role")}>
        <NativeRoleOptions />
      </select>
    );
  return (
    <input
      {...common}
      onChange={(e) => setValue(e.target.value)}
      aria-label={t(`columns.${col}`)}
      placeholder={col === "tags" ? t("tags.inlinePlaceholder") : undefined}
    />
  );
}
