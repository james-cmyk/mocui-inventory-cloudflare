# 漠翠进销存 Cloudflare V2.1

- 修复 Cloudflare Workers PBKDF2 迭代次数超过运行时上限导致首次设置密码返回 500。
- 密码派生迭代次数从 210000 调整为 100000。
- 首次设置密码时增加独立错误记录，便于在 Observability 中定位异常。
- 不修改 `wrangler.jsonc`、D1 数据库绑定、R2 存储桶或现有业务数据。
