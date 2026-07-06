# 同济大学地图 (Tongji Map)

基于 Cloudflare Workers + MapLibre GL 的交互式地图，数据来自 OpenStreetMap，瓦片由 PMTiles 提供。

## 技术栈

- **前端**: 纯 HTML/CSS/JS（零框架），MapLibre GL v4 + PMTiles v3
- **后端**: Cloudflare Workers
- **存储**: Cloudflare R2（矢量瓦片 + GeoJSON 数据）
- **部署**: Wrangler v4

## 项目结构

```
severless/                  # 前端 + Worker 部署项目
  public/                   # 静态资源 (Workers Assets)
    index.html              # 地图主页
    editor.html             # OSM Tags 编辑器
    admin.html              # 提交审核管理
    assets/
      js/tj-map.js          # 地图初始化模块
      data/custom.geojson   # 用户编辑数据（主库）
  src/index.js              # Worker 入口（API + R2 代理）
  tongji.pmtiles            # PMTiles 瓦片（本地参考）
  wrangler.toml

YTJ-Map/                    # 数据生成项目
  map.osm                   # OSM 源数据
  full.geojson              # OSM → GeoJSON 全量转换
  split.js                  # 按分类 + geometry 拆分 GeoJSON
  gen-custom.js             # 生成 custom.geojson
  geojson/                  # 拆分后的分类 GeoJSON
```

## 开发

```bash
npm run dev           # 本地开发服务器 (localhost:8787)
npm run deploy        # 部署到 Cloudflare
```

## 数据构建流程

当 OSM 源数据 (`YTJ-Map/map.osm`) 更新后，按以下步骤重新生成：

### 1. OSM → GeoJSON

使用 `osmium` 将 OSM PBF/XML 转为 GeoJSON：

```bash
osmium export map.osm -o full.geojson
```

### 2. 拆分 GeoJSON

按分类标签 + geometry 类型拆分为独立文件：

```bash
cd YTJ-Map
node split.js
```

输出：`geojson/buildings.geojson`, `roads.geojson`, `water.geojson`, `waterway.geojson`, `landuse.geojson`, `pois.geojson`, `misc.geojson`, `misc-line.geojson`, `misc-point.geojson`

拆分规则（按优先级）：
| 分类 | 匹配条件 | Geometry |
|------|----------|----------|
| buildings | `building=*` | Polygon |
| roads | `highway=*` | LineString |
| water | `natural=water` / `waterway=*` / `water=*` | Polygon |
| waterway | 同上 | LineString |
| landuse | `landuse=*` / `leisure=*` / `natural=*` | 全部 |
| pois | `name=*` | Point |
| misc | 未匹配的 | Polygon |
| misc-line | 未匹配的 | LineString |
| misc-point | 未匹配的 | Point |

### 3. 生成 custom.geojson

合并各分类 GeoJSON，附加 `_layer` 和 `_geom_type` 元数据：

```bash
node gen-custom.js
```

输出写入 `severless/public/assets/data/custom.geojson`

### 4. 生成 PMTiles

```bash
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
```

将生成的 `tongji.pmtiles` 复制到 `severless/` 目录。

### 5. 部署

```bash
cd severless
npx wrangler r2 object put ytj-map/tongji.pmtiles --file=./tongji.pmtiles --remote
npm run deploy
```

## API 端点

| 路径 | 方法 | 说明 |
|------|------|------|
| `/tiles/*` | GET | R2 代理 — PMTiles 瓦片请求 |
| `/api/custom-data` | GET | 获取主库 GeoJSON |
| `/api/submit` | POST | 提交编辑（feature → 待审核） |
| `/api/submissions` | GET | 列出待审核提交 |
| `/api/submissions/:id` | GET | 获取单个提交详情（含 features） |
| `/api/submissions/:id` | POST | 审核操作（`apply` / `reject`） |

## 编辑与审核流程

1. 用户在 `editor.html` 点击地图要素 → 编辑 OSM tags → 提交
2. 提交写入 R2 `submissions/{id}.json`（status: pending）
3. 管理员在 `admin.html` 审核 → apply（合并到 `custom.geojson`）或 reject
