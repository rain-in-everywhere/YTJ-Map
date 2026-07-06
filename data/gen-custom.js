var fs = require('fs');

var inDir = 'data/geojson/';
var outPath = 'public/assets/data/custom.geojson';

var custom = { type: 'FeatureCollection', features: [] };
var seen = {};

var layers = ['buildings', 'roads', 'water', 'waterway', 'pois', 'landuse', 'misc', 'misc-line', 'misc-point'];

layers.forEach(function (name) {
  var fc = JSON.parse(fs.readFileSync(inDir + name + '.geojson', 'utf8'));
  fc.features.forEach(function (f) {
    var id = String(f.id);
    if (seen[id]) return;
    seen[id] = true;

    // 保留所有原始 OSM tags + 新增自定义字段
    var props = JSON.parse(JSON.stringify(f.properties));
    props._layer = name;
    props._geom_type = f.geometry ? f.geometry.type : '';

    custom.features.push({
      type: 'Feature',
      id: id,
      properties: props,
      geometry: f.geometry
    });
  });
});

fs.mkdirSync('public/assets/data/', { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(custom, null, 2));
console.log('custom.geojson: ' + custom.features.length + ' features');
