# v3.2 测试记录

已完成以下静态/脚本测试：

- `content-workbench.js` Node 语法检查通过。
- `app.js` / `cloud.js` / `sw.js` / `src/index.js` Node 语法检查通过。
- 小红书标签分析函数可加载并可针对“俄料白玉手镯 / 白度 / 细度 / 怎么选”等文本输出相关标签。
- 已确认代码中移除 `wechatVideo`、`标记已发` 和旧的 `cropFileFromMedia`。
- Service Worker 缓存版本已升级为 v3.2。
- Worker APP_VERSION 已升级为 3.2.0。

未在真实 iPhone + 微信 / 小红书 App 环境中执行跨 App 分享验收；该项需要部署后用 1 件真实商品测试系统分享面板行为。
