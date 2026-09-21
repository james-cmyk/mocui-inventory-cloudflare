漠翠进销存 v3.18.0 — 稳定性与数据安全收口

本版不增加业务功能，专门做安全收口：

1. 启动健康检查
- 验证正式 mocui_inventory_db 能否打开。
- 验证 9 个正式 store 是否存在、可读。
- 发现问题只报告，不自动修改/清理正式账本。

2. 派生缓存自愈
- analytics / large-list 缓存异常时允许重建。
- 只处理可重建性能缓存，绝不删除正式数据库。

3. 本机应急快照
- 启动后额外保存最多 3 份 localStorage 应急快照。
- 这是云同步/JSON备份之外的附加保护，不替代正式备份。
- 快照失败不会影响业务保存。

4. 数据引用检查
- 可抽查最近 200 笔销售：重复销售ID、负数量、商品引用不存在。
- 只诊断，不自动“修复”正式销售记录。

5. PWA 更新保护
- Service Worker 新版本安装完成后显示“新版本已就绪 · 点此刷新”。
- 不在用户操作过程中强制刷新页面。

6. 设置/更多页增加“数据安全检查”入口
- 可手动运行检查和创建本机应急快照。

保持不变：
- mocui_inventory_db DB_VERSION=2
- 不改 saveSale/cancelSale/restoreSale/adjustStock
- 不做正式数据 migration/delete/clear
- R2 原图、缩略图、CloudSync 协议不变
