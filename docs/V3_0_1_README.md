# v3.0.1 白屏热修复

## 修复原因
v2.4 的 UI 精简层使用 MutationObserver 监听整个主页面。
部分页面精简时会修改文字/节点，而这些修改又会再次触发同一个 Observer，
形成连续 requestAnimationFrame + DOM 重绘。

在 iPhone PWA 中反复切换：首页 → 商品 → 调借 → 报表 → 更多，
第二轮以后更容易出现 WebKit 主线程被持续占用，表现为整页白屏或假死。

## 修复
- UI 优化执行期间临时 disconnect MutationObserver
- 优化完成后再恢复观察
- 同一帧只允许一次 UI 优化任务
- 新文件名 ui-refine-v2.4.1.js，避免 iPhone 继续使用旧缓存
- Service Worker 缓存升级到 v3.0.1

## 不修改
- 商品、库存、销售、调借数据
- sync-v3 同步内核
- D1 / R2
- 销售配饰成本逻辑

部署后建议：
1. 覆盖 public/index.html 和 public/sw.js
2. 新增 public/ui-refine-v2.4.1.js
3. 重新打开 PWA；如仍显示旧界面，完全关闭一次再打开
