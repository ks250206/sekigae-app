/** インスペクタ用の入力部品（確定時にだけストアへ書く = 1 回の Undo） */
import { Plus, X } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** 外部の値が変わったらローカルの編集中の値も追従させる */
function useSynced(value: string) {
  const [v, setV] = useState(value);
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setV(value);
  }
  return [v, setV] as const;
}

export function Field({
  label,
  htmlFor,
  children,
  hint,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={htmlFor} className="text-muted-foreground text-xs">
        {label}
      </Label>
      {children}
      {hint}
    </div>
  );
}

/** Enter / blur で確定するテキスト入力 */
export function CommitInput({
  value,
  onCommit,
  id,
  className,
  invalid,
  ...rest
}: {
  value: string;
  onCommit: (v: string) => void;
  id?: string;
  className?: string;
  invalid?: boolean;
  placeholder?: string;
  type?: string;
  min?: number;
  max?: number;
  "data-testid"?: string;
  "aria-label"?: string;
}) {
  const [v, setV] = useSynced(value);
  const commit = () => {
    if (v !== value) onCommit(v);
  };
  return (
    <Input
      id={id}
      value={v}
      aria-invalid={invalid || undefined}
      className={cn("h-8", className)}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          setV(value);
          e.currentTarget.blur();
        }
      }}
      {...rest}
    />
  );
}

export function CommitTextarea({
  value,
  onCommit,
  id,
  placeholder,
}: {
  value: string;
  onCommit: (v: string) => void;
  id?: string;
  placeholder?: string;
}) {
  const [v, setV] = useSynced(value);
  return (
    <Textarea
      id={id}
      value={v}
      rows={2}
      placeholder={placeholder}
      className="min-h-14 resize-none text-sm"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
    />
  );
}

/** タグ編集（チップ + 入力 + 候補） */
export function TagEditor({
  tags,
  suggestions,
  onAdd,
  onRemove,
  partial,
}: {
  tags: string[];
  suggestions: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  /** 一部の選択席だけが持つタグ（複数選択時） */
  partial?: string[];
}) {
  const { t } = useTranslation("rooms");
  const [v, setV] = useState("");
  const listId = useId();
  const add = () => {
    const tag = v.trim();
    if (tag) onAdd(tag);
    setV("");
  };
  const rest = suggestions.filter((s) => !tags.includes(s));
  return (
    <div className="space-y-1.5" data-testid="tag-editor">
      <div className="flex flex-wrap gap-1">
        {[
          ...tags.map((x) => [x, false] as const),
          ...(partial ?? []).map((x) => [x, true] as const),
        ].map(([tag, part]) => (
          <span
            key={tag}
            className={cn(
              "bg-secondary text-secondary-foreground inline-flex items-center gap-0.5 rounded-full py-0.5 pr-1 pl-2 text-xs",
              part && "border border-dashed bg-transparent",
            )}
            title={part ? t("inspector.partialTag") : undefined}
          >
            {tag}
            <button
              type="button"
              aria-label={t("inspector.removeTag", { tag })}
              className="hover:bg-background rounded-full p-0.5"
              onClick={() => onRemove(tag)}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        <Input
          className="h-7 text-xs"
          value={v}
          list={listId}
          placeholder={t("inspector.addTag")}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          data-testid="tag-input"
        />
        <button
          type="button"
          className="hover:bg-accent grid size-7 shrink-0 place-items-center rounded-md border"
          aria-label={t("inspector.addTag")}
          onClick={add}
        >
          <Plus className="size-3.5" />
        </button>
        <datalist id={listId}>
          {rest.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
      {rest.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {rest.slice(0, 6).map((s) => (
            <button
              key={s}
              type="button"
              className="text-muted-foreground hover:text-foreground hover:border-primary/50 rounded-full border border-dashed px-2 py-0.5 text-[11px] transition-colors"
              onClick={() => onAdd(s)}
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
