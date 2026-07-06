# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

同济大学交互式地图 — 基于 Cloudflare Workers + Workers Assets 的 Serverless 网站，部署在 https://lyra4.icu。

数据源为 OSM（`YTJ-Map/map.osm`），经 `osmium` → `split.js` → `tippecanoe` 生成 PMTiles。

## 技术栈

- **运行时**: Cloudflare Workers v4（`wrangler@^4.105.0`），兼容日期 `2026-06-28`
- **前端**: 纯 HTML/CSS/JS，零框架、零构建步骤
- **地图**: MapLibre GL v4 + PMTiles v3（矢量瓦片协议，从 R2 加载）
- **存储**: Cloudflare R2（bucket `ytj-map`，binding 名 `TILES`）
- **静态资源**: Workers Assets（`public/` 目录，binding 名 `ASSETS`）
- **数据工具**: osmium, tippecanoe v2, tile-join（在 `YTJ-Map/` 目录操作）

## 构建和部署

```bash
npm run dev           # wrangler dev → 本地开发服务器
npm run deploy        # wrangler deploy → 部署到 Cloudflare
```

**部署注意**：`npm run deploy` 只推送 Worker 代码 + Assets，PMTiles 需单独推送：
```bash
npx wrangler r2 object put ytj-map/tongji.pmtiles --file=./tongji.pmtiles --remote
```

## 数据构建流程

当 OSM 源数据更新后，在 `YTJ-Map/` 目录执行：

```bash
# 1. OSM → GeoJSON
osmium export map.osm -o full.geojson

# 2. 按分类 + geometry 拆分
node split.js

# 3. 生成 custom.geojson
node gen-custom.js

# 4. 生成 PMTiles (9 图层)
tippecanoe -o tongji.pmtiles -z14 -Z0 --no-feature-limit --no-tile-size-limit --force \
  -L buildings:geojson/buildings.geojson \
  -L roads:geojson/roads.geojson \
  -L water:geojson/water.geojson \
  -L waterway:geojson/waterway.geojson \
  -L pois:geojson/pois.geojson \
  -L landuse:geojson/landuse.geojson \
  -L misc:geojson/misc.geojson \
  -L misc-line:geojson/misc-line.geojson \
  -L misc-point:geojson/misc-point.geojson

# 5. 复制到 severless 项目
cp tongji.pmtiles ../severless/
```

关键点：**必须用 `-L name:file` 语法**，`--layer=name file` 会把所有图层合并成一个。

## 架构

```
请求 → Worker (src/index.js)
        ├── /tiles/*               → R2 读取（PMTiles 瓦片，含 Range 请求支持）
        ├── /api/custom-data       → R2 读取 data/custom.geojson
        ├── POST /api/submit       → R2 写入 submissions/{id}.json + 更新索引
        ├── GET /api/submissions   → 列出所有 pending submissions
        ├── GET /api/submissions/:id → 获取单个提交详情（含 features）
        ├── POST /api/submissions/:id → apply/reject 审核操作（合并到 custom.geojson）
        └── 其他路径               → env.ASSETS.fetch() 回退到 public/ 静态文件

### PMTiles 图层（9 个 source-layer）

| 图层 | Geometry | 渲染类型 | 内容 |
|------|----------|----------|------|
| `buildings` | Polygon | fill-extrusion (3D) | 建筑物 |
| `roads` | LineString | line | 道路 |
| `water` | Polygon | fill | 湖泊、池塘 |
| `waterway` | LineString | line | 河流、溪流、水渠 |
| `landuse` | Polygon | fill | 绿地、土地利用 |
| `pois` | Point | circle | 兴趣点 |
| `misc` | Polygon | fill | 行政边界 |
| `misc-line` | LineString | line | 地铁、公交线路 |
| `misc-point` | Point | circle | 地铁出入口等 |
```

### R2 数据结构

所有数据存储在 R2 bucket `ytj-map` 中，通过 `env.TILES` binding 访问：

- `tongji.pmtiles` — 同济大学矢量瓦片（约 1MB，本地副本 `tongji.pmtiles` 仅作参考）
- `data/custom.geojson` — 主 GeoJSON 数据集（用户编辑的最终合并结果）
- `submissions/{timestamp}.json` — 每个编辑提交的完整内容（features + 状态 + 元数据）
- `submissions/index.json` — 提交索引（id → 摘要映射，用于快速列表）

### 前端页面

| 文件 | 功能 |
|------|------|
| `public/index.html` | 地图主页，加载 `tj-map.js` 渲染 MapLibre GL 地图 |
| `public/editor.html` | OSM 要素 Tags 编辑器，点击要素 → 编辑 tags → 提交到审核队列 |
| `public/admin.html` | 审核管理面板，查看 pending submissions → apply（合并到主库）或 reject |

### 前端 JS 模块

- `public/assets/js/tj-map.js` — 地图初始化模块，`TJMap.init(opts)` 创建 MapLibre GL 实例，配置 PMTiles 协议和图层样式（绿地/水域/道路分级/3D 建筑/POI）
- `editor.html` 内联 JS（IIFE 挂载到 `window.E`）— 要素点击交互、高亮、Tags 读写、本地 localStorage 缓存 edits、提交到 `/api/submit`
- `admin.html` 内联 JS（IIFE 挂载到 `window.Admin`）— 加载 pending submissions 列表、预览、apply/reject 操作

### 编辑工作流

1. 用户在 `editor.html` 点击地图要素 → 编辑 tags → 点击"提交推送"
2. POST `/api/submit` → 写入 `submissions/{id}.json`（status: "pending"）+ 更新 `submissions/index.json`
3. 管理员在 `admin.html` 审核 → POST `/api/submissions/{id}` with action:
   - `apply`: 读取当前 `data/custom.geojson`，按 feature id 合并 submission features，写回 R2
   - `reject`: 仅更新 submission 状态为 "rejected"

提交是无用户认证的（user 字段硬编码为 "editor"），依赖管理员手动审核。

### wrangler.toml 关键配置

- Worker 名称: `ytj-map`
- 域名路由: `lyra4.icu/*`
- Assets binding: `ASSETS` → `public/` 目录
- R2 binding: `TILES` → bucket `ytj-map`

## 注意事项

- `tongji.pmtiles` 文件在本地（约 1MB），但实际运行时通过 Worker 从 R2 读取。本地文件仅作离线参考，**不要提交到 git**（已在 `.gitignore` 之外，需确认 git 状态）
- 前端所有 JS 是 IIFE 模式，变量名短（`E`, `RO`, `T`, `e`），注意不要意外引入命名冲突
- 没有认证机制，admin.html 页面是公开可访问的
