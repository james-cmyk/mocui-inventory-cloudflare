# 漠翠进销存：应用内更新与缓存修复

覆盖文件：
- public/pwa.js

新增：
- 更多 → 应用与更新
  - 检查更新
  - 刷新应用缓存

重要：
- “刷新应用缓存”只删除 Cache Storage 中 mocui-* 缓存。
- 不删除 IndexedDB。
- 不删除商品、销售、调借。
- 不删除本机待同步 Outbox。
- 不清 localStorage。
- 离线时禁止刷新缓存。
- 每次启动都会重新检查 registration.waiting，因此错过“立即更新”后，下次打开仍能重新提示。
