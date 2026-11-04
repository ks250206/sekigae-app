import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { modKey } from "@/lib/keyboard";
import { getShortcutGroups } from "./shortcutGroups";

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation("onboarding");
  const groups = getShortcutGroups();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("shortcuts.title")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-6 sm:grid-cols-2">
          {groups.map((g) => (
            <section key={g.title}>
              <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                {t(g.title as never)}
              </h3>
              <ul className="space-y-1.5">
                {g.items.map((it) => (
                  <li
                    key={it.label + it.keys.join()}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span>{t(it.label as never)}</span>
                    <span className="flex gap-1">
                      {it.keys.map((k) => (
                        <kbd
                          key={k}
                          className="bg-muted text-muted-foreground min-w-6 rounded border px-1.5 py-0.5 text-center font-mono text-[11px]"
                        >
                          {k === "Mod" ? modKey() : k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
