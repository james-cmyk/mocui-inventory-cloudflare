# 漠翠进销存 v3.11.0 安全动线版

基线：v3.10.3-test-trade-gallery。

## 本次目标

1. **过手差价转正式功能**：只调整名称、入口和说明，原 `savePassDeal` 交易逻辑保持逐字不变。
2. **调货货源库安全试用**：用同行名称、货源时间、价格、图片和备注管理同行调货图；允许“暂时不知道来源”，进入待确认队列。
3. **整体操作动线优化**：首页按高频业务重排；“更多”按业务场景分组，减少找功能的层级。
4. **数据安全优先**：不改数据库版本、不改 store 列表、不改正式销售/商品/调借/盘点/库存调整/库存校验/撤销恢复等核心交易函数。

## 调货货源库变化

- 原账本继续使用 `tradeGalleryLedgerV1`，旧图无需迁移。
- 新增常用同行名称目录 `tradeGalleryDealersV1`，仍写入已有 `settings` store，不新增数据库表/Store。
- 同行名称可先不填：勾选“暂时不知道来源”后保存，系统标为“待确认来源”。
- 首页显示待补来源数量。
- 详情中可补同行名称，整批同步来源；同时保留货源时间和实际上传时间。
- 删除改为**软归档**；R2 原图不做硬删除，可恢复为“在用”。
- 不自动把 OCR/图片中文字写入同行名或价格，避免识别错误污染账目。后续如增加 OCR，只应作为候选提示，由人工确认。
- 暂不提供“一键调入正式库存”：该动作会跨越正式库存写入边界，本版为降低风险刻意不做。

## 首页与更多页动线

首页优先显示：
- 销售开单
- 新增商品
- 新增调借
- 过手差价
- 调货货源库
- 外部同行货
- 库存盘点
- 内容工作台

“更多”分为：
- 同行与临时货
- 日常业务管理
- 内容与数据导入
- 安全与维护

## 保护区（本版未改交易逻辑）

以下核心函数与 v3.10.3 基线做了逐段哈希比对，内容一致：
- `coreHandlerStatus`
- `saveSale`
- `openProductForm`
- `openLoanForm`
- `openLoanSaleForm`
- `openLoanReturnForm`
- `renderStocktake`
- `adjustStock`
- `validateStock`
- `cancelSale`
- `restoreSale`
- `savePassDeal`
- `saveExternalGood`
- `openExternalSale`
- `openExternalTransfer`
- `externalBackToStore`
- `externalReturnToOwner`

数据库关键常量也保持：
- `DB_NAME = 'mocui_inventory_db'`
- `DB_VERSION = 2`
- `STORES` 列表不变
- `CORE_STOCK_MOVE_TYPES` 不变

## 覆盖文件

仅覆盖：
- `public/app.js`
- `public/sw.js`

**不要修改** `wrangler.jsonc`、D1 表结构、R2 配置、`cloud.js`、稳定 UI shell 或其他业务文件。

## 上线前安全步骤

1. 在当前正式版先执行一次完整数据导出/备份，并确认备份文件可打开。
2. 保留当前 v3.10.3 的 `public/app.js`、`public/sw.js` 作为回滚副本。
3. 仅替换本包的两个 public 文件。
4. 部署后 Safari 打开正式域名并下拉刷新；完全关闭主屏幕 PWA 后重新打开。
5. **先做非核心验证**：打开调货货源库，上传 1 张测试图；选择“暂时不知道来源”；再补同行名；归档并恢复。
6. **再做只读验证**：检查商品数量、库存总数、销售单、调借单、盘点页的历史数据是否与部署前一致。
7. 最后用 1 个明确的测试场景验证过手差价，不要先用正式高金额业务试。

## 回滚

如页面异常，立即停止新增/编辑操作，并把 `public/app.js`、`public/sw.js` 恢复为 v3.10.3 版本。数据库结构没有迁移，因此无需执行数据库回滚。
