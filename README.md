# Sekigae — 研究室 席決めアプリ

研究室（特に **複数の研究室が部屋を共有する複合研究室**）の席替えを、ブラウザだけで完結して行うアプリです。
サーバーもログインも不要で、データはすべてお使いのブラウザ内に保存されます。

> English summary: a client-only seat planner for (multi-)labs. Draw rooms, build the roster, compose rules with
> sentence-like blocks, arrange seats with presets / seeded shuffle, fine-tune by drag & drop, and export to XLSX / PPTX.
> Works offline as a PWA. UI in Japanese and English.

## 主な機能

| ステップ | できること |
|---|---|
| ① 部屋 | セルベースで複数の部屋を作成（L 字も可）。席・入口・障害物を配置、机テンプレート、奥行きヒートマップ |
| ② 名簿 | 氏名・研究室・性別・役職/学年（教員〜B3、**社会人ドクター 社D1〜3** を別枠）。Excel/CSV/貼り付け取込、昨年度の席、年度更新ウィザード |
| ③ ルール | 文章になるブロックを組み立てる自作エディタ。人・席の条件は「かつ / または / でない」、ルール同士は「いずれか / すべて / もし〜なら」。複合研究室向けブロックとテンプレート |
| ④ 席配置 | プリセット（研究室ミックス・奥ほど上級生 など）、シード付きシャッフル、ドラッグで微調整、ロック、違反のライブ表示、配置案の比較 |
| ⑤ 出力 | XLSX（座席表・名簿）と PPTX（部屋ごと、編集可能な図形） |

そのほか: ダーク / ライト / 自動テーマ、日本語 / English、初回オンボーディングとガイドツアー、Undo/Redo、複数プロジェクト、JSON バックアップ、PWA（オフライン）。

## プライバシー

- 入力したデータは **この端末のブラウザ（localStorage）にのみ** 保存されます。外部への送信・アナリティクスは一切ありません。
- ブラウザのデータを消去すると失われます。定期的に「JSON で書き出す」でバックアップしてください。

## 動作環境

- デスクトップの最新版 Chrome / Edge / Firefox / Safari（編集）
- スマートフォン（閲覧のみ）

## 開発

必要なもの: Node.js 22 以上、pnpm 10。

```bash
pnpm install
pnpm dev          # 開発サーバー
pnpm build        # 型チェック + 本番ビルド（dist/、PWA を含む）
pnpm preview      # ビルド結果の確認
pnpm exec vp check   # フォーマット・lint・型チェック（--fix で自動修正）
pnpm test         # 単体テスト
pnpm e2e          # E2E テスト（事前に pnpm build）
```

ツールチェーンは [Vite+](https://viteplus.dev/)（`vp`）、UI は React 19 + Tailwind CSS v4 + shadcn/ui です。
ディレクトリ構成と規約は [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)、設計は [docs/DESIGN.md](docs/DESIGN.md) を参照してください。

## 配布

`pnpm build` で生成される `dist/` は静的ファイルのみです。任意の静的 Web サーバー（学内サーバー等）に置くか、
GitHub Actions の CI が保存する `dist` アーティファクトを利用してください。相対パスでビルドしているため、サブディレクトリにも配置できます。
