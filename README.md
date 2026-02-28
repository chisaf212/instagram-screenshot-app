# Instagram スクリーンショットアプリ

InstagramプロフィールページをスマートフォンサイズでスクリーンショットしてZIPダウンロードできるWebアプリです。

## ローカルで動かす

```bash
npm install
npm run dev
```

ブラウザで http://localhost:3000 を開く。

## Vercelにデプロイする

### 方法A: GitHub連携（推奨）

1. このフォルダをGitHubにプッシュ
2. https://vercel.com にアクセスしてログイン
3. 「Add New Project」→ GitHubリポジトリを選択
4. そのままDeployをクリック

### 方法B: Vercel CLI

```bash
npm install -g vercel
vercel
```

## 注意

- Instagramがヘッドレスブラウザを検知してログイン画面を表示する場合があります
- Vercel Hobby プランの場合、関数の実行時間は最大60秒です
