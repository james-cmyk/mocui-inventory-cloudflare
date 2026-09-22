漠翠进销存 v3.22.6 — 全屏画布 + 紧凑胶囊导航

本次只处理底部壳层，不修改 app.js、IndexedDB、库存、销售、调借、报表、同步或 R2。

根因修正：
1. 不再用 html/body 的 100% 继承高度作为 iOS PWA 画布边界，改为 100dvh。
2. #app 明确使用 100dvh，页面滚动面铺到动态可视窗口底部。
3. 导航仍为 fixed overlay，不占正文布局高度。
4. 胶囊高度由 54px 收紧为 48px；内部按钮 42px。
5. 胶囊底距收紧，进入 Home Indicator safe-area，不再制造大块底部死区。
6. 正文保留仅够最后一条内容滚到胶囊上方的 scroll tail。

部署：覆盖 public/index.html、public/sw.js、public/ui-shell-framework-v4.10.css、public/ui-shell-framework-v4.10.js。
部署后在“更多 → 刷新应用缓存”，完全退出 PWA 后重开。
