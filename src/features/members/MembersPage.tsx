/** ② 名簿。docs/DESIGN.md §7.3 */
import {
  CalendarClock,
  ChevronDown,
  ClipboardPaste,
  Download,
  FileSpreadsheet,
  FlaskConical,
  Search,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { ID } from "@/domain/schema";
import { formatNumber } from "@/lib/format";
import { isEditableTarget, modKey } from "@/lib/keyboard";
import { usePrefs } from "@/store/prefs";
import { useProjectStore } from "@/store/project";
import { previousPlan } from "@/store/selectors";
import { BulkBar } from "./components/BulkBar";
import { ColumnsMenu, FilterChips, FilterMenu } from "./components/FilterMenu";
import { ImportDialog, type ImportSource } from "./components/ImportDialog";
import { LabsDialog } from "./components/LabsDialog";
import { MemberDialog } from "./components/MemberDialog";
import { MembersTable } from "./components/MembersTable";
import { SummaryBar } from "./components/SummaryBar";
import { YearUpdateWizard } from "./components/YearUpdateWizard";
import { useIsMobile } from "./lib/useIsMobile";
import { useTemplateDownload } from "./lib/useTemplateDownload";
import "./lib/testHook";
import {
  COLUMN_KEYS,
  EMPTY_FILTER,
  activeFilterCount,
  allTags,
  buildRows,
  filterRows,
  sortRows,
  type ColumnKey,
  type RowFilter,
  type SortKey,
  type SortState,
} from "./lib/table";

interface TablePrefs {
  hidden: ColumnKey[];
  sort: SortState;
}
const PREFS_KEY = "members.table";
const DEFAULT_PREFS: TablePrefs = { hidden: [], sort: { key: "role", dir: "asc" } };

export default function MembersPage() {
  const { t, i18n } = useTranslation(["members", "common"]);
  const project = useProjectStore((s) => s.project);
  const readOnly = useIsMobile();
  const storedPrefs = usePrefs((s) => s.ui[PREFS_KEY] as Partial<TablePrefs> | undefined);
  const setUi = usePrefs((s) => s.setUi);
  const sort = storedPrefs?.sort ?? DEFAULT_PREFS.sort;
  const hidden = storedPrefs?.hidden ?? DEFAULT_PREFS.hidden;
  const savePrefs = (p: Partial<TablePrefs>) => setUi(PREFS_KEY, { sort, hidden, ...p });

  const [filter, setFilterState] = useState<RowFilter>(EMPTY_FILTER);
  const query = useDeferredValue(filter.query);
  const [rawSelected, setSelected] = useState<Set<ID>>(new Set());
  const anchor = useRef<ID | null>(null);
  /** Enter で追加した行は並べ替え・絞り込みに関わらず末尾に固定（編集を続けられるように） */
  const [pinned, setPinned] = useState<ID[]>([]);
  const [dialog, setDialog] = useState<
    | { kind: "member"; id?: ID }
    | { kind: "labs" }
    | { kind: "import"; source: ImportSource }
    | { kind: "wizard" }
    | null
  >(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const downloadTemplate = useTemplateDownload();

  const hasPrev = !!previousPlan(project);
  const columns = COLUMN_KEYS.filter((c) => !hidden.includes(c) && (c !== "change" || hasPrev));
  // 削除されたメンバーは選択から外して扱う
  const selected = useMemo(() => {
    const ids = new Set(project.members.map((m) => m.id));
    return new Set([...rawSelected].filter((id) => ids.has(id)));
  }, [rawSelected, project.members]);
  const allRows = useMemo(() => buildRows(project), [project]);
  const tags = useMemo(() => allTags(project.members), [project.members]);
  const labOrder = useMemo(() => project.labs.map((l) => l.id), [project.labs]);
  const rows = useMemo(() => {
    const pin = new Set(pinned);
    const body = sortRows(
      filterRows(
        allRows.filter((r) => !pin.has(r.member.id)),
        { ...filter, query },
      ),
      sort,
      i18n.language,
      labOrder,
    );
    const byId = new Map(allRows.map((r) => [r.member.id, r]));
    return [...body, ...pinned.map((id) => byId.get(id)).filter((r) => r !== undefined)];
  }, [allRows, filter, query, sort, i18n.language, labOrder, pinned]);

  // 並べ替え・絞り込みを変えたら固定行を解除
  const setFilter = (f: RowFilter | ((f: RowFilter) => RowFilter)) => {
    setFilterState(f);
    setPinned([]);
  };

  // "/" で検索欄へ、Esc で選択解除
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target) || dialog) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape" && selected.size) setSelected(new Set());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, selected.size]);

  const onSort = (key: SortKey) => {
    setPinned([]);
    savePrefs({
      sort:
        sort.key === key ? { key, dir: sort.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    });
  };

  const onToggleSelect = useCallback(
    (id: ID, range: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        const ids = rows.map((r) => r.member.id);
        const a = anchor.current ? ids.indexOf(anchor.current) : -1;
        const b = ids.indexOf(id);
        if (range && a >= 0 && b >= 0) {
          const on = !prev.has(id) || prev.has(anchor.current!);
          for (const x of ids.slice(Math.min(a, b), Math.max(a, b) + 1)) {
            if (on) next.add(x);
            else next.delete(x);
          }
        } else if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      anchor.current = id;
    },
    [rows],
  );

  const onToggleAll = () => {
    const ids = rows.map((r) => r.member.id);
    const all = ids.every((id) => selected.has(id));
    setSelected(all ? new Set() : new Set(ids));
  };

  const onAddRow = useCallback(() => {
    const last = rows.at(-1)?.member;
    const [id] = useProjectStore
      .getState()
      .addMembers([{ name: "", labId: last?.labId, role: last?.role ?? "m1" }]);
    if (id) setPinned((p) => [...p, id]);
    return id;
  }, [rows]);

  const openEdit = useCallback((id: ID) => setDialog({ kind: "member", id }), [setDialog]);
  const total = project.members.length;
  const filtered = activeFilterCount(filter) > 0 || !!filter.query.trim();

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          !readOnly && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDialog({ kind: "wizard" })}
                data-testid="open-wizard"
                data-tour="members-wizard"
              >
                <CalendarClock />
                {t("actions.yearUpdate")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDialog({ kind: "labs" })}
                data-testid="open-labs"
                data-tour="members-labs"
              >
                <FlaskConical />
                {t("actions.labs")}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="open-import"
                    data-tour="members-import"
                  >
                    <FileSpreadsheet />
                    {t("actions.import")}
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => setDialog({ kind: "import", source: "file" })}
                    data-testid="import-file-item"
                  >
                    <FileSpreadsheet />
                    {t("import.fromFile")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => setDialog({ kind: "import", source: "paste" })}
                    data-testid="import-paste-item"
                  >
                    <ClipboardPaste />
                    {t("import.fromPaste")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => void downloadTemplate()}
                    data-testid="template-item"
                  >
                    <Download />
                    {t("import.template.download")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                size="sm"
                onClick={() => setDialog({ kind: "member" })}
                data-testid="add-member"
                data-tour="members-add"
              >
                <UserPlus />
                {t("actions.add")}
              </Button>
            </>
          )
        }
      />

      {total === 0 ? (
        <EmptyState
          readOnly={readOnly}
          onAdd={() => setDialog({ kind: "member" })}
          onImport={(source) => setDialog({ kind: "import", source })}
        />
      ) : (
        <>
          <SummaryBar project={project} rows={allRows} />
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 md:px-6">
            <div className="relative w-full max-w-xs">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                ref={searchRef}
                value={filter.query}
                onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
                onKeyDown={(e) => e.key === "Escape" && setFilter((f) => ({ ...f, query: "" }))}
                placeholder={t("search.placeholder", { key: "/" })}
                className="h-8 pr-8 pl-8"
                aria-label={t("search.label")}
                data-testid="member-search"
              />
              {filter.query && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
                  onClick={() => setFilter((f) => ({ ...f, query: "" }))}
                  aria-label={t("common:actions.clear")}
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <FilterMenu
              filter={filter}
              onChange={setFilter}
              labs={project.labs}
              tags={tags}
              showChange={hasPrev}
            />
            <FilterChips filter={filter} onChange={setFilter} labs={project.labs} />
            <div className="flex-1" />
            <span
              className="text-muted-foreground text-xs tabular-nums"
              data-testid="visible-count"
            >
              {filtered
                ? t("table.countFiltered", {
                    shown: formatNumber(rows.length, i18n.language),
                    total: formatNumber(total, i18n.language),
                  })
                : t("table.count", { count: total })}
            </span>
            <ColumnsMenu hidden={hidden} onChange={(h) => savePrefs({ hidden: h })} />
          </div>
          {selected.size > 0 && !readOnly && (
            <BulkBar
              ids={[...selected]}
              members={project.members}
              labs={project.labs}
              tagSuggestions={tags}
              onClear={() => setSelected(new Set())}
            />
          )}
          <div className="min-h-0 flex-1 overflow-auto" data-tour="members-table">
            {rows.length === 0 ? (
              <div className="text-muted-foreground flex flex-col items-center gap-2 py-16 text-sm">
                <Search className="size-6" />
                {t("table.noMatch")}
                <Button variant="ghost" size="sm" onClick={() => setFilter(EMPTY_FILTER)}>
                  {t("filter.clear")}
                </Button>
              </div>
            ) : (
              <MembersTable
                rows={rows}
                columns={columns}
                labs={project.labs}
                readOnly={readOnly}
                selected={selected}
                onToggleSelect={onToggleSelect}
                onToggleAll={onToggleAll}
                sort={sort}
                onSort={onSort}
                onOpenEdit={openEdit}
                onAddRow={onAddRow}
              />
            )}
            {!readOnly && rows.length > 0 && (
              <p className="text-muted-foreground px-4 py-3 text-xs md:px-6">
                {t("table.keyboardHint", { mod: modKey() })}
              </p>
            )}
          </div>
        </>
      )}

      {/* 開くたびにマウントし、状態を初期化する */}
      {dialog?.kind === "member" && (
        <MemberDialog open onOpenChange={(o) => !o && setDialog(null)} memberId={dialog.id} />
      )}
      {dialog?.kind === "labs" && <LabsDialog open onOpenChange={(o) => !o && setDialog(null)} />}
      {dialog?.kind === "import" && (
        <ImportDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          initialSource={dialog.source}
        />
      )}
      {dialog?.kind === "wizard" && (
        <YearUpdateWizard
          open
          onOpenChange={(o) => !o && setDialog(null)}
          onImport={() => setDialog({ kind: "import", source: "file" })}
        />
      )}
    </div>
  );
}

function EmptyState({
  readOnly,
  onAdd,
  onImport,
}: {
  readOnly: boolean;
  onAdd: () => void;
  onImport: (s: ImportSource) => void;
}) {
  const { t } = useTranslation(["members", "common"]);
  return (
    <div className="flex flex-1 items-center justify-center p-6" data-testid="members-empty">
      <div className="max-w-md text-center">
        <div className="bg-primary/10 text-primary mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl">
          <Users className="size-7" />
        </div>
        <h2 className="text-lg font-semibold">{t("empty.title")}</h2>
        <p className="text-muted-foreground mt-1 text-sm">{t("empty.description")}</p>
        {!readOnly && (
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button onClick={onAdd} data-testid="empty-add">
              <UserPlus />
              {t("actions.add")}
            </Button>
            <Button variant="outline" onClick={() => onImport("file")} data-testid="empty-import">
              <FileSpreadsheet />
              {t("import.fromFile")}
            </Button>
            <Button variant="outline" onClick={() => onImport("paste")} data-testid="empty-paste">
              <ClipboardPaste />
              {t("import.fromPaste")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
