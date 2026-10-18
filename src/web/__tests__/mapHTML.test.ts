import { mapHTML } from '../mapHTML';
import { portraitHTML } from '../portraitHTML';

describe('live map HTML', () => {
  it('uses the HOT tile style', () => {
    expect(mapHTML).toContain('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png');
    expect(mapHTML).toContain('tiles © HOT / OSM France');
  });

  it('applies the pastel filter on the tile images themselves, not the pane', () => {
    expect(mapHTML).toMatch(/img\.leaflet-tile\s*\{\s*filter:\s*saturate\(0\.2\)/);
    expect(mapHTML).not.toMatch(/\.leaflet-tile-pane\s*\{\s*filter/);
  });

  it('mounts the tint in the tile pane and reports theme status to the Debug Log', () => {
    expect(mapHTML).toContain("map.getPane('tilePane')");
    expect(mapHTML).toContain('MAP_THEME_APPLIED');
    expect(mapHTML).toContain('map-paper'); // linen weave above tiles, below patches
  });

  it('draws the Trampelpfad (dirt bed + paw stamps), doghouse and clouds', () => {
    expect(mapHTML).toContain("color: '#C9A06A', weight: 7, opacity: 0.55");
    expect(mapHTML).toContain("color: '#8B6F47', weight: 3");
    expect(mapHTML).toContain("dashArray: '2 10'");
    expect(mapHTML).toContain('doghouseMarker');
    expect(mapHTML).toContain('map-cloud');
  });

  it('keeps the portrait tile host check consistent with HOT', () => {
    expect(portraitHTML).toContain('tile.openstreetmap.fr');
  });

  it('inline script is syntactically valid', () => {
    const m = mapHTML.match(/<script>([\s\S]*)<\/script>\s*<\/body>/)!;
    expect(() => new Function(m[1])).not.toThrow();
  });

  it('draws the Range fill as SVG polygons by default (canvas path kept behind HR_LIVE_FILL_MODE) and logs RANGE_RENDERED', () => {
    expect(mapHTML).toContain("var HR_LIVE_FILL_MODE = 'svg'");
    expect(mapHTML).toContain('function hrAddSvgFillPolygons');
    expect(mapHTML).toContain('L.svg()');
    expect(mapHTML).toContain('L.polygon(latlngs');
    expect(mapHTML).toContain('hrUsePatternFills(svgRenderer');
    // canvas fallback still present
    expect(mapHTML).toContain('function hrCreateCanvasFillLayer');
    expect(mapHTML).toContain('hrCreateCanvasFillLayer(canvas, L.latLngBounds(');
    const handler = mapHTML.slice(mapHTML.indexOf("type === 'SHOW_HOME_RANGE'"));
    expect(handler.indexOf('renderHomeRangeToMap(')).toBeGreaterThan(-1);
    expect(handler).toContain("reportToRN('RANGE_RENDERED'");
    expect(handler).toContain('polygons: stats ? stats.polygons : 0');
    expect(handler).toContain('mode,');
  });

  it('paints felt patches: pattern defs once, stitched cream seams, flat-colour fallback', () => {
    for (const id of ['hr-felt', 'hr-felt-fresh', 'hr-felt-wild']) expect(mapHTML).toContain(`<pattern id="${id}"`);
    expect(mapHTML).toContain("var HR_SEAM_HEX = '#FFFBF0'");
    expect(mapHTML).toContain("var HR_SEAM_DASH = '4 4'");
    expect(mapHTML).toContain("pattern: 'hr-felt-fresh', flat: '#4FBF6B', seam: 4");
    expect(mapHTML).toContain("url(#' + patches[i].hrBand.pattern + ')");
    expect(mapHTML).toContain('patterns: false'); // stats report whether patterns took effect
  });

  it('SHOW_CORNERS renders named wood signs at grid cells and escapes the name', () => {
    expect(mapHTML).toContain("type === 'SHOW_CORNERS'");
    expect(mapHTML).toContain('hrCellCenterLatLng(c.ix, c.iy)');
    expect(mapHTML).toContain('.corner-sign');
    expect(mapHTML).toContain('#E9C98E');
    expect(mapHTML).toContain('&lt;');
  });

  it('uses the coral pin for Somewhere Wild', () => {
    expect(mapHTML).toContain(encodeURIComponent('#F2786E'));
  });
});
