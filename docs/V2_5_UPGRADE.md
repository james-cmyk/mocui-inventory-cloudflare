# v2.5 升级说明

本补丁主要优化底部导航体验，不涉及数据结构变更。

## 替换文件
- public/index.html
- public/app.css
- public/app.js

## 升级步骤
1. 备份当前仓库。
2. 用本补丁中的同名文件覆盖线上仓库文件。
3. 提交到 GitHub main 分支。
4. Cloudflare 自动重新部署。
5. iPhone 如仍显示旧界面，请下拉刷新一次；若是 PWA，关闭后重开。

## 结果
升级后底部导航为：概况 / 商品 / 调借 / 报表 / 更多。
