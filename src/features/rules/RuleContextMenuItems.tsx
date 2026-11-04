/**
 * contextActions のメニュー項目を shadcn の ContextMenu に描画する（#97）。
 * 使い方:
 *   <ContextMenuContent>
 *     <RuleContextMenuItems items={ruleActionsForSeat(seat.id)} />
 *   </ContextMenuContent>
 */
import { Check } from "lucide-react";
import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import type { RuleActionItem } from "./contextActions";

export function RuleContextMenuItems({ items }: { items: RuleActionItem[] }) {
  return (
    <>
      {items.map((item) => {
        const Icon = item.icon;
        if (item.children) {
          if (!item.children.length) return null;
          return (
            <ContextMenuSub key={item.id}>
              <ContextMenuSubTrigger data-testid={`rule-action-${item.id}`}>
                {Icon && <Icon />}
                {item.label}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="max-h-80 overflow-y-auto">
                <RuleContextMenuItems items={item.children} />
              </ContextMenuSubContent>
            </ContextMenuSub>
          );
        }
        return (
          <ContextMenuItem
            key={item.id}
            onSelect={() => item.run?.()}
            data-testid={`rule-action-${item.id}`}
            data-exists={item.exists ? "true" : undefined}
          >
            {Icon && <Icon />}
            <span className="flex-1">{item.label}</span>
            {item.exists && <Check className="text-muted-foreground" />}
          </ContextMenuItem>
        );
      })}
    </>
  );
}
