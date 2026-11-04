/**
 * ブロックの文（#88）。i18n テンプレート + <Trans components> でスロットを埋め込むので、
 * 言語ごとに語順が変わる。
 */
import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { RuleBlock } from "@/domain/rules";
import { BLOCKS, CATEGORY_COLORS } from "../registry";
import { SlotEditor } from "./Slots";

export function BlockSentence({
  block,
  onChange,
  autoOpen,
  onAutoOpened,
}: {
  block: RuleBlock;
  onChange: (b: RuleBlock) => void;
  /** マウント直後に開くスロット名 */
  autoOpen?: string | null;
  onAutoOpened?: () => void;
}) {
  const { t } = useTranslation("rules");
  const def = BLOCKS[block.type];
  const color = CATEGORY_COLORS[def.category];
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!autoOpen) return;
    // 追加アニメーションの後に開く
    const id = window.setTimeout(() => {
      setOpen(autoOpen);
      onAutoOpened?.();
    }, 180);
    return () => window.clearTimeout(id);
  }, [autoOpen, onAutoOpened]);

  const components = Object.fromEntries(
    def.slots.map((slot) => [
      slot.name,
      <SlotEditor
        key={slot.name}
        block={block}
        slot={slot}
        onChange={onChange}
        color={color}
        open={open === slot.name}
        onOpenChange={(o) => setOpen(o ? slot.name : null)}
      />,
    ]),
  );

  return (
    <p className="text-[15px] leading-8 font-medium" data-testid="rule-sentence">
      <Trans t={t} i18nKey={`${def.i18nKey}.template` as never} components={components} />
    </p>
  );
}
