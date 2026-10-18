import { mapHTML } from '../mapHTML';
import { portraitHTML } from '../portraitHTML';

describe('live map HTML', () => {
  it('uses the HOT tile style', () => {
    expect(mapHTML).toContain('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png');
    expect(mapHTML).toContain('tiles © HOT / OSM France');
  });

  it('applies the pastel filter on the tile images themselves, not the pane', () => {
    expect(mapHTML).toMatch(/img\.leaflet-tile\s*\{\s*filter:\s*saturate\(0\.8\)/);
    expect(mapHTML).not.toMatch(/\.leaflet-tile-pane\s*\{\s*filter/);
  });

  it('mounts the tint in the tile pane and reports theme status to the Debug Log', () => {
    expect(mapHTML).toContain("map.getPane('tilePane')");
    expect(mapHTML).toContain('MAP_THEME_APPLIED');
  });

  it('draws paw-dot trail, doghouse and clouds', () => {
    expect(mapHTML).toContain("dashArray: '0 14'");
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

  it('draws the Range fill via a canvas layer on SHOW_HOME_RANGE and logs RANGE_RENDERED', () => {
    expect(mapHTML).toContain('function hrCreateCanvasFillLayer');
    expect(mapHTML).toContain('hrCreateCanvasFillLayer(canvas, L.latLngBounds(');
    const handler = mapHTML.slice(mapHTML.indexOf("type === 'SHOW_HOME_RANGE'"));
    expect(handler.indexOf('renderHomeRangeToMap(')).toBeGreaterThan(-1);
    expect(handler).toContain("reportToRN('RANGE_RENDERED'");
    expect(handler).toContain('drawnPixels');
  });
});
