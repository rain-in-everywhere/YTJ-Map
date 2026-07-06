var TJMap = (function () {
  'use strict';

  function init(opts) {
    opts = opts || {};
    var container = opts.container || 'map';
    var center = opts.center || [121.5012, 31.2825];
    var zoom = opts.zoom || 15.5;

    var mapOpts = {
      container: container,
      center: center,
      zoom: zoom,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {},
        layers: []
      }
    };
    if (opts.maxBounds) mapOpts.maxBounds = opts.maxBounds;
    var map = new maplibregl.Map(mapOpts);

    map.on('load', function () {
      try {
        var protocol = new pmtiles.Protocol();
        maplibregl.addProtocol('pmtiles', protocol.tile);
      } catch (e) {
        console.warn('pmtiles.Protocol failed:', e);
      }

      map.addSource('tongji', {
        type: 'vector',
        url: 'pmtiles://' + location.origin + '/tiles/tongji.pmtiles'
      });

      // 杂项（底图层：行政边界等 Polygon）
      map.addLayer({
        id: 'misc-fill', type: 'fill', source: 'tongji', 'source-layer': 'misc',
        paint: { 'fill-color': '#e8e0d8', 'fill-opacity': 0.25 }
      });
      // 杂项线（地铁/公交线路等 LineString）
      map.addLayer({
        id: 'misc-line', type: 'line', source: 'tongji', 'source-layer': 'misc-line',
        paint: {
          'line-color': ['match', ['get', 'route'], 'subway', '#009FDF', 'bus', '#C1A7E2', '#b0bec5'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 14, 1.5, 18, 4]
        }
      });
      // 杂项点
      map.addLayer({
        id: 'misc-point', type: 'circle', source: 'tongji', 'source-layer': 'misc-point',
        paint: { 'circle-radius': 2.5, 'circle-color': '#90a4ae', 'circle-stroke-color': '#fff', 'circle-stroke-width': 0.5 }
      });

      // 绿地
      map.addLayer({
        id: 'landuse-fill', type: 'fill', source: 'tongji', 'source-layer': 'landuse',
        paint: { 'fill-color': '#c8e6c9', 'fill-opacity': 0.4 }
      });

      // 水域
      map.addLayer({
        id: 'water-fill', type: 'fill', source: 'tongji', 'source-layer': 'water',
        paint: { 'fill-color': '#90caf9', 'fill-opacity': 0.5 }
      });

      // 水系线（河流/溪流/运河）
      map.addLayer({
        id: 'water-line', type: 'line', source: 'tongji', 'source-layer': 'waterway',
        paint: {
          'line-color': '#90caf9',
          'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.8, 18, 3]
        }
      });

      // 主干道
      map.addLayer({
        id: 'road-major', type: 'line', source: 'tongji', 'source-layer': 'roads',
        filter: ['in', ['get', 'highway'],
          ['literal', ['primary','secondary','tertiary','motorway','trunk']]
        ],
        paint: { 'line-color': '#ffb74d', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 2, 18, 6] }
      });

      // 次要道路
      map.addLayer({
        id: 'road-minor', type: 'line', source: 'tongji', 'source-layer': 'roads',
        filter: ['in', ['get', 'highway'],
          ['literal', ['residential','unclassified','service','footway','path','pedestrian','steps','cycleway','living_street']]
        ],
        paint: { 'line-color': '#cfd8dc', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.8, 18, 3] }
      });

      // 3D 建筑
      map.addLayer({
        id: 'buildings-3d', type: 'fill-extrusion', source: 'tongji', 'source-layer': 'buildings',
        paint: {
          'fill-extrusion-color': [
            'match', ['get', 'building'],
            'university', '#1565c0',
            'dormitory', '#ef9a9a',
            'apartments', '#ef9a9a',
            'library', '#ff8f00',
            'school', '#2e7d32',
            'hospital', '#c62828',
            'retail', '#7b1fa2',
            'office', '#546e7a',
            '#bdbdbd'
          ],
          'fill-extrusion-height': [
            '*',
            ['case', ['has', 'building:levels'], ['to-number', ['get', 'building:levels']], 2],
            3.5
          ],
          'fill-extrusion-opacity': 0.85
        }
      });

      // POI 圆点
      map.addLayer({
        id: 'pois-dot', type: 'circle', source: 'tongji', 'source-layer': 'pois',
        paint: {
          'circle-radius': 4,
          'circle-color': '#e53935',
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1.5
        }
      });

      // ── 文字标注 ──
      var labelBase = {
        type: 'symbol', source: 'tongji',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-anchor': 'center'
        },
        paint: {
          'text-color': '#333',
          'text-halo-color': '#fff',
          'text-halo-width': 1.2
        }
      };

      // 建筑名称
      map.addLayer(Object.assign({}, labelBase, {
        id: 'buildings-label', 'source-layer': 'buildings',
        layout: Object.assign({}, labelBase.layout, { 'text-size': 12 }),
        minzoom: 16
      }));

      // 道路名称
      map.addLayer(Object.assign({}, labelBase, {
        id: 'roads-label', 'source-layer': 'roads',
        layout: Object.assign({}, labelBase.layout, {
          'text-field': ['get', 'name'],
          'symbol-placement': 'line',
          'text-size': 10
        }),
        paint: Object.assign({}, labelBase.paint, { 'text-color': '#666' }),
        minzoom: 15
      }));

      // POI 名称
      map.addLayer(Object.assign({}, labelBase, {
        id: 'pois-label', 'source-layer': 'pois',
        layout: Object.assign({}, labelBase.layout, {
          'text-offset': [0, 1.4],
          'text-size': 10
        }),
        minzoom: 14
      }));

      // 水体名称
      map.addLayer(Object.assign({}, labelBase, {
        id: 'water-label', 'source-layer': 'water',
        layout: Object.assign({}, labelBase.layout, { 'text-size': 11 }),
        paint: Object.assign({}, labelBase.paint, { 'text-color': '#1565c0' }),
        minzoom: 13
      }));

      // 绿地/区域名称
      map.addLayer(Object.assign({}, labelBase, {
        id: 'landuse-label', 'source-layer': 'landuse',
        layout: Object.assign({}, labelBase.layout, { 'text-size': 11 }),
        paint: Object.assign({}, labelBase.paint, { 'text-color': '#2e7d32' }),
        minzoom: 14
      }));

      // 地铁/公交线路名称
      map.addLayer(Object.assign({}, labelBase, {
        id: 'misc-line-label', 'source-layer': 'misc-line',
        layout: Object.assign({}, labelBase.layout, {
          'symbol-placement': 'line',
          'text-size': 9
        }),
        paint: Object.assign({}, labelBase.paint, { 'text-color': '#546e7a' }),
        minzoom: 13
      }));
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    return map;
  }

  return { init: init };
})();
