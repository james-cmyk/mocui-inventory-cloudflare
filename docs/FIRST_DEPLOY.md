# Cloudflare 第一次部署

GitHub 已连接到 Cloudflare Worker 后，提交到 `main` 会自动创建新构建。

## Build 设置

- Build command：留空。
- Deploy command：`npx wrangler deploy`
- Root directory：`/`（仓库根目录）。
- Production branch：`main`。

## 自动创建云资源

最终版 `wrangler.jsonc` 已声明：

- D1 binding：`DB`
- R2 binding：`STORAGE`

没有写死账户 ID。首次部署时，Wrangler 会在你的 Cloudflare 账户中自动创建并绑定所需资源。

## 首次打开

部署成功后：

1. 点击 Cloudflare 提供的 `workers.dev` 地址。
2. 页面显示“首次初始化”。
3. 打开项目根目录 `FIRST_LOGIN.txt`。
4. 输入一次性初始化码。
5. 设置至少 10 位的管理密码。
6. 初始化完成后该一次性初始化码立即失效。

## 自定义域名

系统测试正常后，可以在 Worker 的 `Settings / Domains & Routes` 添加：

```text
stock.mocuiyu.com
```

## 构建失败时

不要反复点击旧构建的重试。先打开失败构建日志，截图最下面第一段红色错误。常见原因：

- GitHub 上传没有覆盖 `wrangler.jsonc`。
- `src/index.js` 未上传。
- Cloudflare 账户未启用 R2（控制台会提示确认 R2 条款）。
