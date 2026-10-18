import type { PartnerPresence } from '../../sync/presenceStore';
import { framePortraitNeighbours } from '../neighbourOverlay';
import { PARTNER_TRAIL_FRAME_ID, partnerTrailFrameItem, partnerTrailPayload } from '../partnerTrail';
import { mapHTML } from '../mapHTML';
import { GAP_SPLIT_SCRIPT } from '../gapSplitScript';
import { PARTNER_TRAIL_SCRIPT } from '../partnerTrailScript';
import { portraitHTML } from '../portraitHTML';

const walk = (points: Array<[number, number]>, name = 'Alex'): PartnerPresence => ({
  playerId: 'p',
  name,
  walkId: 'w',
  startedAt: 1,
  points: points.map(([lat, lon], i) => ({ lat, lon, t: i })),
  updatedAt: 1,
  receivedAt: 1,
  ageAtReceiptMs: 0,
});

describe('partner trail payload (RN side)', () => {
  it('is {points, name}; no walk (ended or stale) clears with empty points', () => {
    expect(partnerTrailPayload(walk([[52, 13], [52.001, 13.001]]))).toEqual({ points: [{ lat: 52, lon: 13 }, { lat: 52.001, lon: 13.001 }], name: 'Alex' });
    expect(partnerTrailPayload(null)).toEqual({ points: [], name: '' });
  });

  it('drops impossible points and shortens a very long name', () => {
    const p = partnerTrailPayload(walk([[52, 13], [Number.NaN, 1]], 'A'.repeat(60)));
    expect(p.points).toHaveLength(1);
    expect(p.name).toHaveLength(24);
  });

  it('keeps the thread inside the portrait: a stand-in item whose cells span the thread, dropped when it would shrink the Range to a speck', () => {
    expect(partnerTrailFrameItem(partnerTrailPayload(null))).toBeNull();
    const own = { origin: [1000, 6000] as [number, number], w: 10, h: 10 };
    const near = partnerTrailFrameItem({ points: [{ lat: 6000.5 * 0.00018, lon: 1000.5 * 0.0003 }], name: 'C' })!;
    expect(near.id).toBe(PARTNER_TRAIL_FRAME_ID);
    expect(near.cells).toHaveLength(2);
    // a thread far from the Range cannot be framed
    const far = { ...near, cells: [{ ix: 1000, iy: 6000 }, { ix: 9000, iy: 6000 }] };
    expect(framePortraitNeighbours(own, [far]).frame).toBeNull();
    const close = { ...near, cells: [{ ix: 1000, iy: 6000 }, { ix: 1040, iy: 6030 }] };
    const framed = framePortraitNeighbours(own, [close]);
    expect(framed.frame!.w).toBeGreaterThan(own.w);
  });
});

describe('Alex\'s thread (WebView side)', () => {
  const load = () =>
    new Function('L', `${GAP_SPLIT_SCRIPT}; ${PARTNER_TRAIL_SCRIPT}; return { ptRenderLive: ptRenderLive, ptDrawPortrait: ptDrawPortrait, ptClean: ptClean };`);

  function leaflet() {
    const polylines: Array<{ pts: unknown; opts: Record<string, any>; _path: { style: Record<string, string> } }> = [];
    const markers: Array<{ at: unknown; opts: Record<string, any> }> = [];
    const L = {
      layerGroup: () => {
        const g: Record<string, any> = { addTo: () => g };
        return g;
      },
      polyline: (pts: unknown, opts: Record<string, any>) => {
        const line = { pts, opts, _path: { style: {} as Record<string, string> }, addTo: () => line };
        polylines.push(line);
        return line;
      },
      divIcon: (o: Record<string, any>) => o,
      marker: (at: unknown, opts: Record<string, any>) => {
        const m = { at, opts, addTo: () => m };
        markers.push(m);
        return m;
      },
    };
    return { L, polylines, markers, map: { removeLayer: jest.fn() } };
  }

  it('is wired into both pages and parses', () => {
    expect(mapHTML).toContain("type === 'SHOW_PARTNER_TRAIL'");
    expect(mapHTML).toContain('function ptRenderLive');
    expect(mapHTML).toContain('.partner-head');
    expect(portraitHTML).toContain("msg.type === 'SHOW_PARTNER_TRAIL'");
    expect(portraitHTML).toContain('ptDrawPortrait(ctx, partnerTrail');
    expect(() => load()).not.toThrow();
    for (const html of [mapHTML, portraitHTML]) {
      const m = html.match(/<script>([\s\S]*)<\/script>\s*<\/body>/)!;
      expect(() => new Function(m[1])).not.toThrow();
    }
  });

  it('live map: a brown path bed with the cream seam over it, a paw head at the newest point, a slow dash creep', () => {
    const env = leaflet();
    const { ptRenderLive } = load()(env.L);
    const timers: Array<() => void> = [];
    const cleared: unknown[] = [];
    const group = ptRenderLive(env.map, { points: [{ lat: 52, lon: 13 }, { lat: 52.001, lon: 13 }, { lat: 52.002, lon: 13.001 }], name: 'Alex' }, null, {
      set: (fn: () => void) => {
        timers.push(fn);
        return 7;
      },
      clear: (h: unknown) => cleared.push(h),
    });
    expect(env.polylines.map((p) => [p.opts.color, p.opts.dashArray])).toEqual([['#C9A06A', undefined], ['#FFFBF0', '7 9']]);
    expect(env.markers[0].at).toEqual([52.002, 13.001]);
    expect(env.markers[0].opts.title).toBe('Alex');
    expect(group.ptStats).toEqual({ points: 3, animated: true });
    timers[0]();
    expect(env.polylines[1]._path.style.strokeDashoffset).toBeDefined();
    // redrawing stops the old creep and removes the old group
    ptRenderLive(env.map, { points: [{ lat: 52, lon: 13 }, { lat: 52.1, lon: 13 }], name: 'Alex' }, group, { set: () => 8, clear: (h: unknown) => cleared.push(h) });
    expect(cleared).toEqual([7]);
    expect(env.map.removeLayer).toHaveBeenCalledWith(group);
  });

  it('live map: the thread is cut where a step fails the distance rule (no line across a jump)', () => {
    const env = leaflet();
    const { ptRenderLive } = load()(env.L);
    const M = 1 / 111320; // degrees of latitude per metre
    const points = [
      { lat: 52, lon: 13, t: 0 },
      { lat: 52 + 30 * M, lon: 13, t: 20_000 },
      { lat: 52 + 5000 * M, lon: 13, t: 40_000 }, // a ride
      { lat: 52 + 5030 * M, lon: 13, t: 60_000 },
    ];
    ptRenderLive(env.map, { points, name: 'Alex' }, null, null);
    expect(env.polylines[0].pts).toEqual([
      [[52, 13], [52 + 30 * M, 13]],
      [[52 + 5000 * M, 13], [52 + 5030 * M, 13]],
    ]);
  });

  it('live map: empty points clear it (and draw nothing); one point is just the paw head', () => {
    const env = leaflet();
    const { ptRenderLive } = load()(env.L);
    expect(ptRenderLive(env.map, { points: [], name: '' }, null, null)).toBeNull();
    expect(env.markers).toHaveLength(0);
    const one = ptRenderLive(env.map, { points: [{ lat: 52, lon: 13 }], name: 'Alex' }, null, null);
    expect(env.polylines).toHaveLength(0);
    expect(env.markers).toHaveLength(1);
    expect(one.ptStats.animated).toBe(false);
  });

  it('ignores garbage points instead of throwing', () => {
    const { ptClean } = load()({});
    expect(ptClean({ points: [{ lat: 1, lon: 2 }, null, { lat: 'x', lon: 2 }, { lat: Infinity, lon: 1 }, {}] })).toEqual([[1, 2]]);
    expect(ptClean(null)).toEqual([]);
  });

  it('portrait: draws the dashed thread over the bed and a paw head on the canvas', () => {
    const { ptDrawPortrait } = load()({});
    const calls: string[] = [];
    const ctx: Record<string, any> = new Proxy(
      { setLineDash: (d: number[]) => calls.push(`dash:${d.join(',')}`) },
      {
        get: (target: any, prop: string) => (prop in target ? target[prop] : (...args: unknown[]) => calls.push(`${prop}`)),
        set: (target: any, prop: string, value: unknown) => {
          if (prop === 'strokeStyle') calls.push(`stroke:${value}`);
          target[prop] = value;
          return true;
        },
      }
    );
    const project = (lat: number, lon: number) => ({ x: lon * 10, y: lat * 10 });
    ptDrawPortrait(ctx, { points: [{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }], name: 'Alex' }, project, 2);
    expect(calls).toContain('stroke:#C9A06A');
    expect(calls).toContain('stroke:#FFFBF0');
    expect(calls).toContain('dash:14,18');
    expect(calls).toContain('arc');
    calls.length = 0;
    ptDrawPortrait(ctx, { points: [], name: '' }, project, 2);
    expect(calls).toEqual([]);
  });
});
