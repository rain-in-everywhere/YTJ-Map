const fs = require('fs');
const path = require('path');

const raw = fs.readFileSync(
  'data/full.geojson',
  'utf8'
);
const fc = JSON.parse(raw);

// 分类规则
const categories = {
  buildings: f => f.properties?.building,
  roads:     f => f.properties?.highway,
  water:     f => (f.properties?.natural === 'water' || f.properties?.waterway || f.properties?.water)
                   && f.geometry?.type !== 'LineString' && f.geometry?.type !== 'MultiLineString',
  waterway:  f => (f.properties?.natural === 'water' || f.properties?.waterway || f.properties?.water)
                   && (f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString'),
  landuse:   f => f.properties?.landuse || f.properties?.leisure || f.properties?.natural,
  pois:      f => f.properties?.name && f.geometry?.type === 'Point',
};

const result = {};
for (const [name, pred] of Object.entries(categories)) {
  result[name] = { type: 'FeatureCollection', features: [] };
}

for (const f of fc.features) {
  let matched = false;
  for (const [name, pred] of Object.entries(categories)) {
    if (pred(f)) {
      result[name].features.push(f);
      matched = true;
    }
  }
  // 没匹配的按 geometry 拆分
  if (!matched) {
    const t = f.geometry?.type;
    if (t === 'LineString' || t === 'MultiLineString') {
      if (!result['misc-line']) result['misc-line'] = { type: 'FeatureCollection', features: [] };
      result['misc-line'].features.push(f);
    } else if (t === 'Point' || t === 'MultiPoint') {
      if (!result['misc-point']) result['misc-point'] = { type: 'FeatureCollection', features: [] };
      result['misc-point'].features.push(f);
    } else {
      if (!result.misc) result.misc = { type: 'FeatureCollection', features: [] };
      result.misc.features.push(f);
    }
  }
}

const outDir = 'data/geojson';
fs.mkdirSync(outDir, { recursive: true });

for (const [name, fc] of Object.entries(result)) {
  if (fc.features.length === 0) continue;
  const outPath = path.join(outDir, `${name}.geojson`);
  fs.writeFileSync(outPath, JSON.stringify(fc));
  console.log(`${name}: ${fc.features.length} features → ${outPath}`);
}

console.log('\nDone. Total features:', fc.features.length);
