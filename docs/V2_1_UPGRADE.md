# V2.1 升级方法

1. 解压补丁。
2. 在 GitHub 仓库点击 `Add file → Upload files`。
3. 上传补丁中的 `src/index.js`、`CHANGELOG.md` 和 `docs/V2_1_UPGRADE.md`。
4. Commit message 填写 `Fix password setup PBKDF2 limit`。
5. 提交到 `main`，等待 Cloudflare 自动部署成功。
6. 重新打开 workers.dev 地址，再次设置管理密码。

本补丁不会覆盖 `wrangler.jsonc`，不会删除 D1、R2 或已有数据。
