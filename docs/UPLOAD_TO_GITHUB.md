# 上传到现有 GitHub 仓库

目标仓库：`james-cmyk/mocui-inventory-cloudflare`

## 操作

1. 下载并双击解压 `mocui-inventory-cloudflare-final-v1.0.zip`。
2. 打开解压后的文件夹。
3. GitHub 仓库首页点击 `Add file`。
4. 点击 `Upload files`。
5. 把解压文件夹里面的全部内容拖入上传区域：

```text
.github
src
public
docs
README.md
FIRST_LOGIN.txt
package.json
wrangler.jsonc
.gitignore
```

6. 等待文件全部上传完成。
7. Commit message 填写：

```text
Release Mocui Inventory Final 1.0
```

8. 选择 `Commit directly to the main branch`。
9. 点击 `Commit changes`。

## 注意

- 上传解压后的内容，不是上传 ZIP 文件本身。
- `.github` 和 `.gitignore` 在 Mac 中可能隐藏；Finder 按 `Command + Shift + .` 显示隐藏文件。
- 仓库里旧的 `src/index.ts`、`tsconfig.json`、`migrations` 即使暂时保留也不会影响部署；最终版入口由 `wrangler.jsonc` 指向 `src/index.js`。
