import { mapHTML, STITCH_PATCH_JS } from '../mapHTML';
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

  describe('STITCH_PATCH (Heimkehr: the seam runs)', () => {
    const load = () => new Function('L', `${STITCH_PATCH_JS}; return hrStitchPatch;`);
    const makeEnv = () => {
      const added: unknown[] = [];
      const layer = { addTo: () => layer };
      const L = {
        layerGroup: () => layer,
        polyline: (seg: unknown, opts: { color: string }) => {
          added.push({ seg, color: opts.color });
          return { addTo: () => undefined };
        },
      };
      return { L, added, map: { removeLayer: jest.fn() } };
    };

    it('is wired into the live map message handler', () => {
      expect(mapHTML).toContain("type === 'STITCH_PATCH'");
      expect(mapHTML).toContain('function hrStitchPatch');
    });

    it('animates only the fresh patches dash offset over 1.2 s, ending at 0', () => {
      const env = makeEnv();
      const fresh = { hrBand: { name: 'fresh' }, _path: { style: { strokeDashoffset: '' } } };
      const usual = { hrBand: { name: 'usual' }, _path: { style: { strokeDashoffset: '' } } };
      let time = 0;
      const frames: Array<() => void> = [];
      const stitch = load()(env.L);
      const count = stitch(env.map, [usual, fresh], [], () => time, (fn: () => void) => frames.push(fn));
      expect(count).toBe(1);
      expect(Number(fresh._path.style.strokeDashoffset)).toBe(40);
      expect(usual._path.style.strokeDashoffset).toBe('');
      time = 600;
      frames.shift()!();
      expect(Number(fresh._path.style.strokeDashoffset)).toBeCloseTo(20);
      time = 1200;
      frames.shift()!();
      expect(Number(fresh._path.style.strokeDashoffset)).toBe(0);
      expect(frames).toHaveLength(0);
    });

    it('draws the new-ground segments in coral', () => {
      const env = makeEnv();
      const stitch = load()(env.L);
      stitch(env.map, [], [[[1, 2], [3, 4]]], () => 0, () => undefined);
      expect(env.added).toEqual([{ seg: [[1, 2], [3, 4]], color: '#F2786E' }]);
    });
  });
});
