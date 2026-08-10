# v3.6 静态测试记录

已完成：

- `src/index.js`：Node 语法检查通过。
- `public/app.js`：Node 语法检查通过。
- `public/content-workbench.js`：Node 语法检查通过。
- `public/sw.js`：Node 语法检查通过。
- Shortcut task API 路由、D1 schema、临时 R2 key 白名单静态检查通过。
- 工作台、商品素材页均切换到 iOS 快捷指令优先，非 iOS 保留 v3.5 fallback。

仍需真机验证：

- iOS 26 「快捷指令」动作名称在中文系统中的具体显示文字。
- 第一次运行时域名/照片权限授权。
- 大视频在当前网络下的实际下载耗时。
- 「打开App → 微信」在当前微信版本中的跳转体验。
