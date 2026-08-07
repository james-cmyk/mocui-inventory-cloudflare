# v3.1 升级说明

本期是 v3.0.1 之后的第二期，新增代理素材中心。

## 上传/覆盖文件
- src/index.js
- public/content-workbench.js
- public/app.css
- public/sw.js
- public/share.html（新）
- public/share.css（新）
- public/share.js（新）

不修改 `wrangler.jsonc`。D1 会在首次请求时自动创建 `share_links` 表，不会清空已有数据。

## 测试流程
1. 打开任意商品 → 图片/视频素材与发布。
2. 确保至少有一张自有 R2 原图或一个原视频。
3. 点击“生成代理素材分享链接”。
4. 选择价格显示、有效期、是否允许下载，生成链接。
5. 用无登录状态的 Safari/微信打开链接，确认只能看到公开素材与文案。
6. 点击保存/分享，确认文案被复制。
7. 返回管理端撤销链接，再测试公开页应立即失效。
