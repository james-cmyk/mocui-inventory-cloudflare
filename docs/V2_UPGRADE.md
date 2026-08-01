# V2 登录升级操作

1. 在 GitHub 仓库点击 `Add file → Upload files`。
2. 上传本补丁解压后的全部内容。
3. 允许覆盖：
   - `src/index.js`
   - `public/cloud.js`
   - `public/sw.js`
   - `FIRST_LOGIN.txt`
   - `CHANGELOG.md`
4. Commit message 填：`Upgrade login to V2`。
5. 提交到 `main`，等待 Cloudflare 自动构建成功。
6. 打开 workers.dev 地址并刷新一次。
7. 首次页面直接设置管理密码，不再输入初始化码。

## 注意

- 不要覆盖或修改 `wrangler.jsonc`，其中已经保存你的 D1 Database ID 和 R2 bucket 名称。
- 如果仍显示旧的初始化码页面：关闭该网页，再重新打开；仍未更新时清除该站点缓存或在 Safari 中刷新两次。
- 本补丁不会删除商品、销售、借调或云端备份数据。
