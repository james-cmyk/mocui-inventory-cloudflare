# v2.4 手机升级说明

## 升级前先做一次备份

进入：

`更多 → 数据与设置 → 导出完整 JSON 备份`

把文件保存到 iCloud Drive。升级本身不会清空数据，但正式库存系统每次升级前都应保留独立备份。

## GitHub 上传

1. 下载并解压 `mocui-inventory-stability-v2.4-patch.zip`。
2. 打开当前 GitHub 仓库。
3. 点击 **Add file → Upload files**。
4. 上传解压目录里的全部内容，保持目录结构：

```text
public/app.css
public/app.js
public/cloud.js
public/index.html
public/sw.js
src/index.js
CHANGELOG_STABILITY.md
docs/V2_4_UPGRADE.md
docs/TEST_REPORT_V2_4.md
```

5. 不要上传 ZIP 文件本身。
6. 不要删除或覆盖 `wrangler.jsonc`。
7. Commit message：

```text
Upgrade inventory stability v2.4
```

8. 选择 **Commit directly to the main branch**，提交后等待 Cloudflare 自动部署成功。

## iPhone 更新

部署成功后：

1. 完全关闭桌面上的“漠翠进销存”。
2. 用 Safari 打开正式域名并刷新一次。
3. 再从桌面图标打开。
4. 若顶部出现“发现新版本”，点击 **立即更新**。

## 升级后检查

按以下顺序检查：

1. 登录正常，原有商品、销售和借调数据仍在。
2. 打开商品详情，左上角出现返回按钮。
3. 新增商品输入几个字后退出，再次新增时草稿仍在。
4. 新增借调页面可填写预计归还日期，退出后可恢复草稿。
5. `更多 → 库存体检` 能显示检查结果。
6. `更多 → 操作日志` 能打开。
7. `更多 → 数据与设置 → 登录设备` 能看到当前 iPhone。

## 库存体检的使用原则

发现异常时不要直接点修复：

- 实物库存与商品页库存一致：可以选择“补齐流水”。
- 实物库存与商品页库存不一致：进入“库存盘点”，按实际数量调整。
- 出现孤立流水：先导出完整备份，不要自行删除数据。
