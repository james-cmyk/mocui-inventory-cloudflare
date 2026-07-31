# Cloudflare 首次部署

## 1. 创建资源

```bash
npm install
npx wrangler login
npx wrangler d1 create mocui-inventory-db
npx wrangler r2 bucket create mocui-inventory-storage
```

把 `d1 create` 返回的 `database_id` 填入 `wrangler.jsonc`。

## 2. 设置登录密钥

```bash
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET
```

`ADMIN_PASSWORD` 是进入系统的管理密码；`SESSION_SECRET` 应使用随机长字符串，不能提交到 GitHub。

## 3. 初始化并部署

```bash
npm run db:migrate:remote
npm run deploy
```

## 4. 连接 GitHub 自动部署

Cloudflare Dashboard → Workers & Pages → Create application → Import a repository → 选择 `james-cmyk/mocui-inventory-cloudflare`。

Worker 名称必须与 `wrangler.jsonc` 的 `name` 一致：`mocui-inventory-cloudflare`。

默认部署命令：`npx wrangler deploy`。生产分支选 `main`。

## 5. 自定义域名

Worker → Settings → Domains & Routes → Add Custom Domain：`stock.mocuiyu.com`。
