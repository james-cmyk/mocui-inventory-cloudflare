# 漠翠进销存 Cloudflare 版

一体化 Cloudflare Worker 项目：

- Worker Static Assets：手机和电脑共用的网页端
- Worker API：登录和同步接口
- D1：会话与数据版本元信息
- R2：完整业务快照、商品和借调图片数据
- GitHub/Workers Builds：推送到 main 后自动部署

## 当前阶段

已将 v1.4 的商品、库存、销售、借调、多次归还、借调售出、合同凭证与报表完整保留，并加入账号登录和跨设备云同步。为了优先确保原业务逻辑不丢失，第一阶段采用“IndexedDB 本机缓存 + R2 完整快照 + D1 版本控制”。后续会逐模块迁移到规范化 D1 表和独立 R2 图片对象。

## 本地运行

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

详见 `docs/CLOUDFLARE_SETUP.md`。
