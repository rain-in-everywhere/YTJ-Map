# computer-networking-demo

计算机网络课程大作业 — 基于 Cloudflare Workers 的 Serverless 网站。

## 技术栈

- **运行时**: Cloudflare Workers + Workers Assets
- **前端**: 纯 HTML/CSS/JS（零框架、零构建）
- **部署**: `wrangler deploy`
- **域名**: https://lyra4.icu

## 项目结构

```
src/index.js          — Worker 入口（API 路由 + Assets fallback）
public/               — 静态资源
  ├── index.html      — 首页
  ├── networking/     — 技术栈（含数据包解析 + 4 个演示）
  └── assets/         — CSS/JS
wrangler.toml
```

## 构建和部署

```bash
npm run dev           # wrangler dev → localhost:8787
npm run deploy        # wrangler deploy → Cloudflare
```

## API 端点

| 路径 | 说明 |
|------|------|
| `/api/hello` | Serverless 请求响应演示 |
| `/api/dns-lookup?domain=...&type=...` | DNS-over-HTTPS 加密查询 |
| `/api/cache-demo?strategy=...&count=...` | HTTP 缓存策略（6 种） |
| `/api/geo` | 边缘节点/网络信息 |
| `/api/packet-inspect` | 自暴露：IP→TCP→TLS→HTTP 全层解析 |
