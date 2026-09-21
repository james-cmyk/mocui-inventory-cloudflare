漠翠进销存 v3.21.1 — iPhone 底部导航消失紧急修复

根因已经定位：
v3.21.0 把设备物理屏幕高度直接当成网页 CSS 高度。iPhone 主屏 PWA 中这两个高度并不等价，
因此 #app 被撑到可视区域下面，作为最后一行的五栏导航也一起被推到屏幕外。

本版：
- 删除 v3.21.0 的物理屏幕高度计算。
- #app 改用 position:fixed + inset:0 + 100dvh，直接以当前 PWA 可视 viewport 为边界。
- 顶栏 / 主滚动区 / 78px 底栏仍保持三段式。
- 底栏重新成为 #app 最后一行，白色导航背景直接贴当前 viewport 最底部。
- Home Indicator 安全区只在 78px 底栏内部处理。
- 校验逻辑改为比较 bottom-nav.bottom 与 documentElement.clientHeight。
- 键盘打开时底栏高度归零，不遮输入。

数据安全：
不改 DB_VERSION / IndexedDB / 销售 / 库存 / 调借 / 配饰 / 报表 / CloudSync / R2 / Outbox。
