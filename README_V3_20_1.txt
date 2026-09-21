漠翠进销存 v3.20.1 — iPhone 实机问题紧急修正版

根据 5 张真机截图修复：

1. 顶部标题发虚/重影
原因：v3.19 又把冻结壳层 topbar 改成 sticky，并叠加 backdrop-filter。
修复：恢复 ui-shell-stable 的 relative header，iOS 上关闭 header/dock backdrop-filter。

2. 报表首屏严重错位
现象：顶部大空白、日期按钮下移、“正式销售概况”和第一排 KPI 被遮挡。
原因：#main 本身就是独立滚动容器，但 v3.20 sticky 又按“顶部栏+安全区”计算 top。
修复：报表日期按钮恢复正常文档流；商品/调借 sticky 工具栏改为 #main 内 top:0。

3. 更多页出现双图标
原因：v3.1.7 卡片已有“客/单/盘/流/货/设”图标底座，ui-icons.js 又插入一枚 PNG。
修复：more-core-v317 卡片只保留原有单图标。

4. 底部导航过高/安全区重复
原因：v3.19 与 ui-shell-stable 同时计算 dock 高度/安全区。
修复：恢复冻结的 78px Dock，不再二次叠加 safe-area。

5. 键盘隐藏 Dock 实际未生效
原因：ui-shell-stable 的 transform:none!important 压住了 v3.19 translateY。
修复：键盘打开时直接把 Dock flex 高度压到 0，释放真实可视空间。

6. 页面切换滚动位置
修复：五个主导航切换时 #main.scrollTop 重置为 0，避免上一页滚动位置污染下一页。

数据安全：
- 纯 CSS + UI 状态修复。
- 不改 DB_VERSION。
- 不改销售、库存、调借、配饰、统计、CloudSync、R2。
- 不修改任何正式业务记录。
