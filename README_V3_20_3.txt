漠翠进销存 v3.20.3 — iPhone 底部导航栏最终定位修复

本轮只修一个问题：
五栏底部导航在 iPhone PWA 中整体上移，导航下面留下大块白色空白。

修复方式：
1. bottom-nav 从 flex 文档流改为 fixed + bottom:0。
2. 底栏真实高度 = 64px 操作区 + iPhone safe-area-inset-bottom。
3. Home Indicator 安全区只计算一次。
4. #main 自动预留与底栏完全一致的空间，最后一条商品/调借/报表不会被遮挡。
5. 键盘弹出时完全隐藏 fixed Dock，继续释放输入空间。
6. 不改顶部栏，不改目前已经正常的概况/商品/调借/报表/更多布局。

数据安全：
- 纯 CSS 修复。
- 不修改 app.js 业务逻辑。
- 不修改 DB_VERSION / IndexedDB。
- 不修改销售、库存、调借、配饰、报表计算。
- 不修改 CloudSync / R2 / Outbox。
