# v3.11.0 静态安全测试报告

日期：2026-08-16
基线：mocui-inventory-v3.10.3-test-trade-gallery

## 1. JavaScript 语法

- `public/app.js`：`node --check` 通过
- `public/sw.js`：`node --check` 通过

## 2. 数据结构保护

对比基线：
- `DB_NAME`：一致
- `DB_VERSION`：一致（2）
- `STORES`：一致
- `CORE_STOCK_MOVE_TYPES`：一致
- 本补丁没有 D1 schema migration 文件

## 3. 核心交易函数冻结比对

以下函数在基线与 v3.11.0 中内容完全一致：

| 函数 | SHA-256 前12位 |
|---|---|
| coreHandlerStatus | 20f528df39fc |
| saveSale | 0c5f5cfa0e62 |
| openProductForm | bbb162548c9a |
| openLoanForm | 00095c95fc92 |
| openLoanSaleForm | 54b10d8d941f |
| openLoanReturnForm | 9dcd3b40a276 |
| renderStocktake | 0dc22851f854 |
| adjustStock | 7f71113d6250 |
| validateStock | bcd7fc0256ce |
| cancelSale | ac069ce4eeb2 |
| restoreSale | 1ad6e1e5c737 |
| savePassDeal | b76ece737aee |
| saveExternalGood | 57ec33817245 |
| openExternalSale | 079a2983316b |
| openExternalTransfer | 2cc8a9a12a09 |
| externalBackToStore | c7cbc090a8c0 |
| externalReturnToOwner | 3389e9a7bd33 |

## 4. 调货货源库写入隔离扫描

对以下写函数扫描：
- `commitTradeGalleryBatch`
- `saveTradeGalleryItemEdit`
- `deleteTradeGalleryItem`（现为软归档）
- `restoreTradeGalleryItem`

未发现：
- `adjustStock(...)`
- 写 `products`
- 写 `sales`
- 写 `loans`
- 写 `stocktakes`
- 写 `stockMoves`

图库数据继续写入已有 `settings` store；图片上传继续使用现有 R2 媒体上传接口。

## 5. 防误删

- 图库“删除”改为归档状态，不删除 R2 原图。
- 可从“已归档”恢复。
- 常用同行名称从目录移除时，不修改历史图片和历史来源。

## 6. 兼容性

- 继续读取 `tradeGalleryLedgerV1`，旧批次无 `sourcePending` / `status` 字段时按正常来源、在用状态兼容。
- 新增同行目录是 `settings` 中的新记录，不要求 DB version 升级。
- Service Worker 仅更新缓存版本号以避免旧 JS 被 PWA 缓存继续使用。

## 7. 尚需线上环境验证

静态检查不能替代真实 Cloudflare 环境验证。部署后必须验证：
- R2 实际图片上传
- 手机/PWA 缓存刷新
- 多设备 D1 同步
- 网络中断/重试场景
- 真实 iPhone 相册 HEIC/HEIF 上传

在上述验证完成前，“调货货源库”保持“试用”标识；“过手差价”的核心逻辑未改，因此仅将其 UI 标识转正式。
