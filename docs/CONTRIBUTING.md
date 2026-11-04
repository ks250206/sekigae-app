# 開発メモ

## コマンド

| コマンド             | 内容                                                 |
| -------------------- | ---------------------------------------------------- |
| `pnpm dev`           | 開発サーバー                                         |
| `pnpm build`         | 型チェック + 本番ビルド（`dist/`、PWA 含む）         |
| `pnpm preview`       | ビルド結果のプレビュー                               |
| `pnpm exec vp check` | フォーマット・lint・型チェック（`--fix` で自動修正） |
| `pnpm test`          | 単体テスト (Vitest, `vite-plus/test`)                |
| `pnpm e2e`           | E2E テスト (Playwright。事前に `pnpm build`)         |
| `pnpm i18n:check`    | ja / en の翻訳キー差分チェック                       |
| `pnpm icons`         | `public/favicon.svg` から PWA アイコンを生成         |

## ディレクトリ

```
src/
  app/            ルーター・シェル・ヘッダー・テーマ・PWA
  components/ui/  shadcn/ui（生成物。fmt / lint 対象外）
  components/     共通コンポーネント
  domain/         型・zod スキーマ・マスタ・幾何計算（React 非依存）
  store/          zustand ストア・永続化
  features/<name> 画面ごとの機能（rooms, members, rules, seating, export, onboarding）
  engine/         ルール評価・ソルバー・Worker（React 非依存）
  graphics/       SVG 部品・カラートークン
  i18n/           i18next 設定と locales/<lang>/<namespace>.json
  lib/            汎用ユーティリティ（React 非依存）
tests/e2e/        Playwright
```

- `domain/` `engine/` `lib/` から React・UI 層の import は lint で禁止。
- テストはソースの隣に `*.test.ts(x)`。`import { describe, it, expect } from "vite-plus/test"`。
- 翻訳キーは `名前空間:画面.要素.状態`。機能ごとの文言はその機能の名前空間 JSON に追加し、ja / en 両方に書く。
- 主要要素には `data-tour="..."`（ガイドツアー用）、テストで掴む要素には `data-testid` を付ける。
