import type { NearbyItem } from '../../sync/apiContract';
import { HOME_RANGE_RENDERER_SCRIPT } from '../homeRangeRendererScript';
import { mapHTML } from '../mapHTML';
import { framePortraitNeighbours, neighbourOverlayPayload, PORTRAIT_MIN_SPAN_CELLS } from '../neighbourOverlay';
import { NEIGHBOUR_OVERLAY_SCRIPT, NEIGHBOUR_TINT } from '../neighbourOverlayScript';
import { portraitHTML } from '../portraitHTML';

const block = (ix0: number, iy0: number, w: number, h: number) => {
  const cells: Array<{ ix: number; iy: number }> = [];
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) cells.push({ ix: ix0 + x, iy: iy0 + y });
  return cells;
};

const item = (id: string, over: Partial<NearbyItem> = {}): NearbyItem => ({
  id,
  kind: 'bot',
  generated: true,
  archetype: 'momo',
  dogName: 'Momo',
  appearance: {},
  traitKey: 'neighbours.dog.momo.trait',
  areaLabel: 'near',
  lastActiveBucket: 'today',
  metCount: 1,
  rangeCells: block(100, 100, 5, 5),
  ...over,
});

describe('neighbourOverlayPayload', () => {
  it('maps nearby items to {id, name, cells, label} and puts the label on a Range cell nearest the centre', () => {
    const { items } = neighbourOverlayPayload([item('b1')]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'b1', name: 'Momo' });
    expect(items[0].cells).toHaveLength(25);
    expect(items[0].label).toEqual({ ix: 102, iy: 102 });
  });

  it('drops items without cells, de-duplicates and ignores non-integer cells; a ring-shaped Range keeps the label on the patch', () => {
    const ring = block(0, 0, 5, 5).filter((c) => !(c.ix >= 1 && c.ix <= 3 && c.iy >= 1 && c.iy <= 3));
    const { items } = neighbourOverlayPayload([
      item('none', { rangeCells: [] }),
      item('absent', { rangeCells: undefined }),
      item('dupes', { rangeCells: [{ ix: 1, iy: 1 }, { ix: 1, iy: 1 }, { ix: 1.5, iy: 2 }, { ix: 2, iy: 2 }] }),
      item('ring', { rangeCells: ring }),
    ]);
    expect(items.map((i) => i.id)).toEqual(['dupes', 'ring']);
    expect(items[0].cells).toEqual([{ ix: 1, iy: 1 }, { ix: 2, iy: 2 }]);
    const labelOnRing = ring.some((c) => c.ix === items[1].label.ix && c.iy === items[1].label.iy);
    expect(labelOnRing).toBe(true);
  });

  it('caps the cells per dog and never forwards a route-like extra field', () => {
    const { items } = neighbourOverlayPayload([item('big', { rangeCells: block(0, 0, 40, 40) })]);
    expect(items[0].cells).toHaveLength(600);
    expect(Object.keys(items[0]).sort()).toEqual(['cells', 'id', 'label', 'name']);
  });
});

describe('framePortraitNeighbours', () => {
  const raster = { origin: [0, 0] as [number, number], w: 20, h: 20 };
  const nb = (id: string, ix: number, iy: number) => neighbourOverlayPayload([item(id, { rangeCells: block(ix, iy, 6, 6) })]).items[0];

  it('widens the frame to hold neighbours that are close enough, nearest first', () => {
    const { frame, items } = framePortraitNeighbours(raster, [nb('far', 90, 5), nb('near', 40, 5)]);
    expect(items.map((i) => i.id)).toEqual(['near', 'far']);
    expect(frame).toEqual({ origin: [0, 0], w: 96, h: 20 });
  });

  it('leaves out a neighbour that would shrink our own Range to a speck, and returns no frame when none fit', () => {
    const { frame, items } = framePortraitNeighbours(raster, [nb('near', 40, 5), nb('veryFar', 400, 400)]);
    expect(items.map((i) => i.id)).toEqual(['near']);
    expect(frame!.w).toBeLessThanOrEqual(PORTRAIT_MIN_SPAN_CELLS);
    expect(framePortraitNeighbours(raster, [nb('veryFar', 400, 400)])).toEqual({ frame: null, items: [] });
    expect(framePortraitNeighbours(raster, [])).toEqual({ frame: null, items: [] });
  });
});

describe('neighbour overlay script (WebView side)', () => {
  const load = (L: unknown) =>
    new Function('L', `${HOME_RANGE_RENDERER_SCRIPT}\n${NEIGHBOUR_OVERLAY_SCRIPT}\nreturn { nbGeometry, nbSignHTML, hrRenderNeighbours, hrDrawNeighbourPatches, hrDrawNeighbourSigns };`)(L);

  it('is syntactically valid and uses the sky token, no new colour', () => {
    expect(() => load({})).not.toThrow();
    expect(NEIGHBOUR_TINT).toBe('#3498DB');
  });

  it('turns a cell block into one closed outline ring around it (lat/lon pairs)', () => {
    const { nbGeometry } = load({});
    const groups = nbGeometry(block(100, 100, 6, 6));
    expect(groups).toHaveLength(1);
    const outer = groups[0][0] as number[][];
    expect(outer.length).toBeGreaterThan(8);
    for (const [lat, lon] of outer) {
      expect(Number.isFinite(lat) && Number.isFinite(lon)).toBe(true);
    }
    expect(nbGeometry([])).toEqual([]);
    expect(nbGeometry([{ ix: 0, iy: 0 }, { ix: 100000, iy: 100000 }])).toEqual([]); // absurd spread is refused, not allocated
  });

  it('escapes the dog name in the sign', () => {
    const { nbSignHTML } = load({});
    expect(nbSignHTML('<b>Momo</b>')).toBe('<div class="neighbour-sign">&lt;b&gt;Momo&lt;/b&gt;</div>');
  });

  function fakeLeaflet() {
    const polygons: Array<{ latlngs: unknown; opts: Record<string, unknown> }> = [];
    const markers: Array<{ latlng: unknown; handlers: Record<string, () => void> }> = [];
    const panes: Record<string, { style: Record<string, unknown> }> = {};
    const layer = () => {
      const l = { addTo: () => l, addLayer: () => l, handlers: {} as Record<string, () => void>, on(ev: string, fn: () => void) { l.handlers[ev] = fn; return l; } };
      return l;
    };
    const L = {
      svg: () => layer(),
      layerGroup: () => layer(),
      polygon: (latlngs: unknown, opts: Record<string, unknown>) => {
        polygons.push({ latlngs, opts });
        return layer();
      },
      divIcon: (o: unknown) => o,
      marker: (latlng: unknown) => {
        const m = layer();
        markers.push({ latlng, handlers: m.handlers });
        return m;
      },
    };
    const map = {
      getPane: (n: string) => panes[n],
      createPane: (n: string) => (panes[n] = { style: {} }),
      removeLayer: jest.fn(),
    };
    return { L, map, polygons, markers, panes };
  }

  it('draws a dotted patch in the sky tint below the Range patches, a name sign per dog, and reports taps', () => {
    const env = fakeLeaflet();
    const { hrRenderNeighbours } = load(env.L);
    const tapped: string[] = [];
    const group = hrRenderNeighbours(env.map, [{ id: 'b1', name: 'Momo', cells: block(100, 100, 6, 6), label: { ix: 103, iy: 103 } }], null, (id: string) => tapped.push(id));
    expect(env.polygons).toHaveLength(1);
    expect(env.polygons[0].opts).toMatchObject({ color: '#3498DB', fillColor: '#3498DB', fillOpacity: 0.16, dashArray: '1 6', interactive: false });
    expect(env.panes.hrNeighbourPane.style.zIndex).toBeLessThan(390); // patch pane z-index: ours always on top
    expect(group.nbStats).toEqual({ patches: 1, signs: 1 });
    env.markers[0].handlers.click();
    expect(tapped).toEqual(['b1']);
    // a second call replaces the previous layer; an empty list clears
    expect(hrRenderNeighbours(env.map, [], group, () => undefined)).toBeNull();
    expect(env.map.removeLayer).toHaveBeenCalledWith(group);
  });

  it('portrait: draws patches then signs onto the canvas context through the given projection', () => {
    const calls: string[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (target, prop: string) => (prop in target ? target[prop] : (...args: unknown[]) => { calls.push(prop); return prop === 'measureText' ? { width: 30 } : args[0]; }),
      set: (target, prop: string, value) => { target[prop] = value; return true; },
    });
    const { hrDrawNeighbourPatches, hrDrawNeighbourSigns } = load({});
    const items = [{ id: 'b1', name: 'Momo', cells: block(100, 100, 6, 6), label: { ix: 103, iy: 103 } }];
    const project = (lat: number, lon: number) => ({ x: lon * 1000, y: lat * 1000 });
    hrDrawNeighbourPatches(ctx, items, project, 2);
    expect(calls).toEqual(expect.arrayContaining(['beginPath', 'fill', 'stroke']));
    expect((ctx as Record<string, unknown>).lineWidth).toBe(6); // 3 x unit
    hrDrawNeighbourSigns(ctx, items, project, 2);
    expect(calls).toContain('fillText');
  });
});

describe('HTML wiring', () => {
  it('live map: SHOW_NEIGHBOURS under the Range patches, tap posts NEIGHBOUR_TAPPED, fit can use a frame', () => {
    expect(mapHTML).toContain("type === 'SHOW_NEIGHBOURS'");
    expect(mapHTML).toContain('hrRenderNeighbours(map, nbItems, neighbourLayerGroup');
    expect(mapHTML).toContain("type: 'NEIGHBOUR_TAPPED'");
    expect(mapHTML).toContain('.neighbour-sign');
    expect(mapHTML).toContain('const { raster, fitBounds, frame, insetBottom } = payload');
    const m = mapHTML.match(/<script>([\s\S]*)<\/script>\s*<\/body>/)!;
    expect(() => new Function(m[1])).not.toThrow();
  });

  it('portrait: neighbours drawn before our patches and signs after, tile canvas uses the frame', () => {
    expect(portraitHTML).toContain('handleRenderPortrait(msg.payload.raster, msg.payload.neighbours, msg.payload.frame)');
    expect(portraitHTML).toContain('boundsForRaster(frame || raster)');
    const patches = portraitHTML.indexOf('hrDrawNeighbourPatches(ctx, neighbours');
    const ours = portraitHTML.indexOf('renderHomeRangePortrait(overlayCanvas, raster');
    const signs = portraitHTML.indexOf('hrDrawNeighbourSigns(ctx, neighbours');
    expect(patches).toBeGreaterThan(-1);
    expect(patches).toBeLessThan(ours);
    expect(signs).toBeGreaterThan(ours);
  });
});
