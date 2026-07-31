# 只用手机部署到 Cloudflare Pages

建议使用独立子域名：`stock.mocuiyu.com`，不要覆盖主站 `mocuiyu.com`。

## 方法：Cloudflare Pages 直接上传

1. 在 iPhone“文件”中保存 `mocui-inventory-v1.4.zip`。
2. 用 Safari 登录 Cloudflare 控制台。
3. 进入 **Workers & Pages**。
4. 选择创建应用，再选择 **Pages / Direct Upload（直接上传）**。
5. 项目名称填写：`mocui-inventory`。
6. 上传 ZIP 文件并部署。
7. 部署成功后先打开 Cloudflare 提供的 `pages.dev` 地址测试。
8. 进入项目的 **Custom domains**，添加 `stock.mocuiyu.com`。
9. 用 Safari 打开 `https://stock.mocuiyu.com`，点击分享按钮，选择“添加到主屏幕”。

## 使用前必须做

- 先新增 1 个测试商品。
- 开一张测试销售单，确认库存减少。
- 撤销该销售单，确认库存恢复。
- 新增一张调借单并归还，确认库存反向恢复。
- 在“更多 → 数据与设置”导出一次完整备份。

## 更新版本

后续升级时仍上传新的部署包。只要继续使用同一个域名，浏览器本地业务数据通常会继续保留；升级前仍应先导出 JSON 备份。
