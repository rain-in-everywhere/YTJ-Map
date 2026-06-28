# computer-networking-demo

计算机网络课程大作业 — 基于 Cloudflare Workers 的 Serverless 网站。

## 技术栈

- **运行时**: Cloudflare Workers + Workers Assets
- **前端**: 纯 HTML/CSS/JS（零框架、零构建）
- **部署**: `wrangler deploy`

## 项目结构

```
src/index.js          — Worker 入口（API 路由 + Assets fallback）
public/               — 静态资源（HTML/CSS/JS/图片）
  ├── index.html      — 首页
  ├── blog.html       — 博客列表
  ├── blog/           — 博客文章
  ├── networking/     — 计网知识演示页面
  └── assets/         — CSS/JS/图片
wrangler.toml         — Cloudflare Workers 配置
```

## 构建和部署

```bash
# 本地开发
npm run dev           # 等价于 wrangler dev，启动 localhost:8787

# 部署到 Cloudflare
npm run deploy        # 等价于 wrangler deploy
```

## API 端点

| 路径 | 说明 |
|------|------|
| `/api/hello` | Hello World，演示 Serverless 请求/响应 |
| `/api/dns-lookup?domain=...&type=...` | DNS-over-HTTPS 加密查询 |
| `/api/cache-demo?strategy=...&count=...` | HTTP 缓存策略演示（6 种） |
| `/api/geo` | 边缘节点/网络信息（request.cf） |

## 域名

- Workers.dev: `https://computer-networking-demo.2453889.workers.dev`
- 自定义域: `https://lyra4.icu`（通过 `[[routes]]` 绑定）
