# 漠翠进销存 v2.1 第二阶段：Outbox + D1 增量同步

## 这版真正替换了什么

- 不再使用 `data-safety.js` / `local-first-v2.js` 参与运行。
- 本机 IndexedDB 仍然是业务保存第一落点。
- 新增独立 IndexedDB：`mocui_sync_v2`
  - `outbox`：持久待同步操作
  - `shadow`：云端已确认状态
  - `conflicts`：多设备冲突
  - `meta`：cursor 等同步元数据
- 每次业务保存后 `CloudSync.schedule()` 会立即标记本机待同步。
- 即使来不及生成 Outbox 就强杀 App，下次启动会通过“本机 vs shadow”重新计算差异并重建 Outbox。
- 云端改为 `/api/sync/v2/*` 增量操作，不再每次上传整库。
- `opId` 在 D1 中 UNIQUE：同一个操作重复重试只会执行一次。
- 删除采用服务端 tombstone（`deleted=1`），防止其他设备把已删记录复活。
- 同一记录被另一设备更新后，本机不会 force 覆盖；进入 conflicts。
- 图片 data URL 在服务端自动移到 R2，D1 只保存 URL。
- 每 25 个增量操作自动生成一次 R2 checkpoint。

## 需要覆盖 / 新增

1. `public/index.html` 覆盖
2. `public/sw.js` 覆盖
3. `public/sync-v2.js` 新增
4. `src/index-v2.js` 新增
5. `wrangler.jsonc` 覆盖
6. `package.json` 覆盖（建议）
7. `migrations/0003_sync_v2.sql` 新增（留档；运行时也会自动建表）

不要删除：
- `src/index.js`：v2 Worker 继续把旧 API 转交给它
- `public/app.js`
- `public/cloud.js`
- `public/trade-gallery-queue.js`

`data-safety.js` 和 `local-first-v2.js` 可以留在仓库，但 index.html 已不再加载。

## 部署后先验证

A. 打开 App，顶部应出现：
- 本机已保存 · 云端已确认
- 或 本机已保存 · 等待云端

B. 测试商品
1. 新增测试商品
2. 看到保存成功后立刻杀 App
3. 重开：商品仍在
4. 联网几秒后顶部应变“云端已确认”

C. 测试离线
1. 飞行模式
2. 新增 3 条数据
3. 杀 App
4. 重开：3 条全部存在
5. 恢复网络：自动同步

D. 测试调借
1. 新增调借
2. 立刻杀 App
3. 重开：调借记录和库存变化均存在

E. 查看服务器 v2 状态（登录状态下浏览器打开）
`/api/sync/v2/status`

应返回：
- protocol: mocui-sync-v2
- cursor > 0（发生过同步后）
- operationCount
- entityCount

## 回滚

如 v2 API 部署异常：
1. 把 `wrangler.jsonc` 的 `main` 改回 `src/index.js`
2. 把上一版 `public/index.html` 恢复
3. 本机业务数据库 `mocui_inventory_db` 不需要删除

不要清理浏览器 IndexedDB。
