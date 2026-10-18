import { mapHTML, mapHTMLEmbedded, STITCH_PATCH_JS } from '../mapHTML';
import { MAP_NOTES_JS } from '../mapTheme';
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

  it('embedded band filters the tile layer, not each tile (no seam lines at fractional zoom); full map keeps per-tile', () => {
    expect(mapHTMLEmbedded).toMatch(/\.leaflet-layer\s*\{\s*filter:\s*saturate\(0\.2\)/);
    expect(mapHTMLEmbedded).toMatch(/img\.leaflet-tile\s*\{\s*filter:\s*none/);
    expect(mapHTML).not.toMatch(/\.leaflet-layer\s*\{\s*filter/);
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

  it('SHOW_CORNERS signs are tappable on the full map only and report the corner id', () => {
    expect(mapHTML).toContain("type: 'CORNER_TAPPED', id: c.id");
    expect(mapHTML).toContain('interactive: !EMBEDDED');
    expect(mapHTMLEmbedded).toContain('const EMBEDDED = true');
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

  describe('embedded Viertel (EMBEDDED init flag)', () => {
    it('bakes the flag in: off for the full map, on for the scene band', () => {
      expect(mapHTML).toContain('const EMBEDDED = false;');
      expect(mapHTMLEmbedded).toContain('const EMBEDDED = true;');
    });

    it('disables every way to move the map when embedded', () => {
      for (const option of ['zoomControl: false', 'dragging: false', 'touchZoom: false', 'scrollWheelZoom: false', 'doubleClickZoom: false', 'boxZoom: false', 'keyboard: false', 'tap: false']) {
        expect(mapHTMLEmbedded).toContain(option);
      }
      // the full map keeps the plain, interactive options (the embedded branch is chosen at runtime by the flag)
      expect(mapHTML).toContain(": { attributionControl: false }).setView([0, 0], 2)");
    });

    it('fits our Range with room for the signs, never above street level, and keeps the clouds still', () => {
      expect(mapHTMLEmbedded).toContain('maxZoom: 17, paddingTopLeft: [20, 76], paddingBottomRight: [20, padBottom]');
      expect(mapHTMLEmbedded).toContain('if (map.getZoom() < 15)'); // never zoomed out further than 15
      expect(mapHTMLEmbedded).toContain("el.style.animation = 'none'");
    });

    it('handles SET_VIEW for an empty Range', () => {
      expect(mapHTMLEmbedded).toContain("type === 'SET_VIEW'");
      expect(mapHTMLEmbedded).toContain('payload.zoom || 16');
    });

    it('inline script is syntactically valid', () => {
      const m = mapHTMLEmbedded.match(/<script>([\s\S]*)<\/script>\s*<\/body>/)!;
      expect(() => new Function(m[1])).not.toThrow();
    });
  });

  describe('SHOW_NOTES (handwritten notes)', () => {
    const load = () => new Function('L', `${MAP_NOTES_JS}; return { mapNoteHTML, renderMapNotes };`);
    const makeEnv = () => {
      const markers: Array<{ latlng: number[]; html: string }> = [];
      const group = { addTo: () => group };
      const L = {
        layerGroup: () => group,
        divIcon: (o: { html: string }) => o,
        marker: (latlng: number[], o: { icon: { html: string } }) => {
          markers.push({ latlng, html: o.icon.html });
          return { addTo: () => undefined };
        },
      };
      return { L, markers, map: { removeLayer: jest.fn() } };
    };

    it('is wired into the message handler and styled with an embedded Caveat font', () => {
      expect(mapHTML).toContain("type === 'SHOW_NOTES'");
      expect(mapHTML).toContain("font-family: 'Caveat'");
      expect(mapHTML).toContain('url(data:font/ttf;base64,');
      expect(mapHTML).toContain('cursive'); // fallback
    });

    it('draws one note per entry at its position, escapes the text and clears the previous group', () => {
      const env = makeEnv();
      const { renderMapNotes } = load()(env.L);
      const previous = {};
      const group = renderMapNotes(env.map, [{ text: 'heute <b>genäht</b>', lat: 1, lon: 2, anchor: 'below' }, { text: 'Platz', lat: 3, lon: 4, kind: 'chalk' }, { text: 'bad', lat: 'x', lon: 5 }], previous);
      expect(group).not.toBeNull();
      expect(env.map.removeLayer).toHaveBeenCalledWith(previous);
      expect(env.markers).toHaveLength(2);
      expect(env.markers[0].latlng).toEqual([1, 2]);
      expect(env.markers[0].html).toBe('<div class="map-note map-note-below">heute &lt;b&gt;genäht&lt;/b&gt;</div>');
      expect(env.markers[1].html).toBe('<div class="map-note map-note-center map-note-chalk">Platz</div>');
    });

    it('filterMapNotes hides notes outside the visible map and shows the ones inside', () => {
      const { filterMapNotes } = new Function(`${MAP_NOTES_JS}; return { filterMapNotes };`)();
      const els = [{ style: { visibility: '' } }, { style: { visibility: '' } }];
      const layers = [{ ll: 1, el: els[0] }, { ll: 9, el: els[1] }];
      const group = { eachLayer: (fn: (m: unknown) => void) => layers.forEach((l) => fn({ getElement: () => l.el, getLatLng: () => l.ll })) };
      filterMapNotes({ getBounds: () => ({ contains: (ll: number) => ll < 5 }) }, group);
      expect(els.map((e) => e.style.visibility)).toEqual(['', 'hidden']);
      expect(() => filterMapNotes({}, null)).not.toThrow();
    });

    it('an empty list clears and returns null', () => {
      const env = makeEnv();
      const { renderMapNotes } = load()(env.L);
      expect(renderMapNotes(env.map, [], {})).toBeNull();
      expect(env.map.removeLayer).toHaveBeenCalled();
    });
  });
});
