import { Check, ChevronsUpDown, FolderCog, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatRelative } from "@/lib/format";
import { createProject, switchProject, usePersistence } from "@/store/persistence";
import { useProjectStore } from "@/store/project";
import { toast } from "sonner";
import { openProjectDialog } from "./dialogStore";

const MAX_RECENT = 8;

/** ヘッダーのプロジェクト切替（最近使った順） */
export function ProjectSwitcher() {
  const { t, i18n } = useTranslation();
  const name = useProjectStore((s) => s.project.name);
  const currentId = useProjectStore((s) => s.project.id);
  const projects = usePersistence((s) => s.projects);
  const lng = i18n.resolvedLanguage ?? "ja";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="max-w-[40vw] min-w-0 gap-1 px-2 md:max-w-56"
          aria-label={t("project.switcher")}
          data-testid="project-switcher"
          data-tour="project-switcher"
        >
          <span className="truncate" data-testid="project-name">
            {name}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
          {t("project.recent")}
        </DropdownMenuLabel>
        {projects.slice(0, MAX_RECENT).map((m) => (
          <DropdownMenuItem
            key={m.id}
            onSelect={() => switchProject(m.id)}
            data-testid="project-switcher-item"
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">{m.name}</span>
              <span className="text-muted-foreground text-xs">
                {formatRelative(m.updatedAt, lng)}
              </span>
            </div>
            {m.id === currentId && <Check className="size-4 shrink-0" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            if (createProject()) toast.success(t("project.created"));
          }}
          data-testid="project-new"
        >
          <Plus className="size-4" />
          {t("project.new")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={openProjectDialog} data-testid="project-manage">
          <FolderCog className="size-4" />
          {t("project.manage")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
