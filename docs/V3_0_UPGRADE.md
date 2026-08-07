# v3.0 第一期升级说明

这是基于 v2.9.2 + 秦丝导入中心的累计功能补丁，不修改 D1 表结构，也不会清空现有商品、客户、销售、库存或调借数据。

## 覆盖文件
- public/index.html
- public/app.js
- public/app.css
- public/cloud.js
- public/sw.js
- public/content-workbench.js（新增）
- src/index.js

不要修改 `wrangler.jsonc`。

## GitHub 提交建议
`Add content workbench v3.0 phase 1`

Push 到 main 后，现有 Cloudflare GitHub 自动部署会自动构建。

## 部署后第一次操作
1. Safari 打开正式域名并下拉刷新一次。
2. 完全关闭桌面 PWA。
3. 重新打开。
4. 进入任一商品 → “图片 / 视频素材与发布”。
5. 先用 1 个测试商品上传 2 张图 + 1 个短视频测试。

## 当前上传限制
- 图片：单张不超过 25MB。
- 视频：单个不超过 95MB。
- 视频过大时，第一期建议先在 iPhone 相册裁短或降低导出体积；后续可再升级 R2 大文件直传/分片上传。

## 图片比例
3:4 与 1:1 版本在手机端按需生成，不额外长期占用 R2 空间。当前采用居中裁切；重要商品应检查构图后再发布。
