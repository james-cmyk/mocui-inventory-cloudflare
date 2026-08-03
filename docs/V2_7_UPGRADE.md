# v2.7 手机升级说明

## 上传覆盖文件

- `public/index.html`
- `public/app.css`
- `public/app.js`
- `public/cloud.js`
- `public/sw.js`

不修改 `wrangler.jsonc`、D1、R2 或后端数据库结构。

## GitHub 提交说明

`Fix PWA startup performance v2.7`

## 部署后第一次打开

因为 Service Worker 本身需要更新，首次部署后可能仍使用一次旧启动逻辑。请：

1. 用 Safari 打开正式域名并刷新一次。
2. 完全关闭桌面上的“漠翠进销存”。
3. 再从桌面图标打开。

从第二次启动开始，应立即看到漠翠启动骨架；验证通过后先显示本机数据，顶部短暂提示后台同步。
