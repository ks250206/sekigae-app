import { installRulesDevHooks } from "./devHooks";
import { RulesEditor } from "./RulesEditor";

installRulesDevHooks();

/**
 * ③ ルール画面。違反数・実行可能性はエンジン / 席配置側が実装後に
 * <RulesEditor violationCounts={...} feasibility={...} /> として渡す。
 */
export default function RulesPage() {
  return <RulesEditor />;
}
