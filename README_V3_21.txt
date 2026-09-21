漠翠进销存 v3.21.0 — 主导航框架底层冻结

这不是普通 UI 补丁，而是把 iPhone 主壳层正式独立成“框架层”。

为什么 v3.20.3 看起来没有变化：
- 旧工程同时存在 app.css / ui-shell-stable / v3.19 / v3.20.x 多套 Dock 规则。
- iPhone Home Screen PWA 的 CSS viewport 高度还可能短于实际物理屏幕。
- 单纯 bottom:0 仍然可能只贴到 WebKit 认为的 viewport 底部，而不是截图中的物理屏幕底部。

v4 框架处理：
1. iPhone 主屏 PWA 使用 screen.height 作为稳定壳层高度，不再让 visualViewport/innerHeight 的瞬时值决定 Dock 位置。
2. #app 固定为完整屏幕框架。
3. topbar / #main / bottom-nav 固定为三段式：
   顶栏（自适应） + 主滚动区（flex:1） + 78px 五栏 Dock。
4. Dock 不再用 position:fixed 模拟；它是框架的最后一行，因此永远在 #app 最底部。
5. 几何属性由 ui-shell-framework-v4.js 用 inline !important 锁定。
   后续 UI 版本只能改颜色、圆角、字体、图标、阴影、卡片等外观，不能把导航位置改走。
6. UI MutationObserver / pageshow / orientationchange 会重新校验框架。
7. MocuiShellFramework.verify() 可直接检测 Dock 是否与 app 底部对齐。
8. ui-shell-guard 升级：Dock 偏离底部超过 3px 会直接报“界面稳定基线异常”。
9. Service Worker 的页面导航改为 network-first。
   以后部署新框架/新 index.html 不会再先拿旧缓存页面再等下一次刷新。
10. 新框架文件加入 Service Worker CORE 缓存，离线仍可用。

以后版本约束：
- ui-shell-framework-v4.css / js 作为最后加载的框架层。
- 新 UI CSS 必须加载在它之前。
- 新 UI 不允许修改 #app/topbar/#main/bottom-nav 的 position/height/flex/inset/overflow 框架属性。
- 如未来确实要改主导航结构，单独升级 Shell Framework 版本并做 iPhone 真机回归。

数据安全：
- 不修改 DB_VERSION。
- 不修改 IndexedDB 正式业务数据。
- 不修改销售/库存/调借/配饰/报表计算。
- 不修改 CloudSync/R2/Outbox。
