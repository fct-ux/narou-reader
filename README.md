# なろうReader v0.3.1 Spark版

Firebaseの **Spark（無料）プランの静的 Hosting** で動かす個人用リーダーです。

## 構成
- Firebase Hosting: `public/` の静的ファイルだけを配信
- 本文取得: Google Apps Script の `UrlFetchApp` を利用
- 読書履歴・表示設定・読書位置: ブラウザの `localStorage`
- Firebase Functions / Cloud Run / App Hosting: 使用しません

## 主な機能
- 小説家になろうの各話URLから本文表示
- 横書き / 縦書き切替
- 文字サイズ・行間・本文幅・紙/白/黒テーマ
- 前話 / 次話
- 読書位置保存
- 最近読んだ話
- Web Speech APIによる読み上げ
- PWA用manifest

## Apps Script の準備
1. https://script.google.com/ で「新しいプロジェクト」を作成
2. `apps-script/Code.gs` の内容を `Code.gs` に貼り付ける
3. 必要ならプロジェクト設定から `appsscript.json` を表示し、同梱の内容に合わせる
4. 「デプロイ」→「新しいデプロイ」→種類「ウェブアプリ」
5. 実行ユーザー: 自分
6. アクセスできるユーザー: 全員（匿名ユーザーを含む選択肢がある場合はそれ）
7. 発行された `/exec` で終わるURLをコピー
8. Apps Script のウェブアプリURLは `public/app.js` に設定済みです（個人利用用）

このApps Scriptは `ncode.syosetu.com` の各話URLだけを受け付けます。

## Firebase Hosting
`firebase.json` の public は `public` を指定済みです。
Sparkのまま静的Hostingとしてデプロイしてください。
