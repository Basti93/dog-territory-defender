// WebView-side "Alex's thread" (M4 "Alex im Hof"): a household partner's walk in progress, drawn as a stitched
// thread that has not been sewn into the Range yet. Plain ES5 string, injected into mapHTML.ts (live map) and
// portraitHTML.ts (the Viertel portrait capture). The bridge message is SHOW_PARTNER_TRAIL { points: [{ lat, lon }], name };
// empty `points` clears it. Never shows distance, time or "since when" (game-master).
//
// Look: a worn-path bed in the Trampelpfad brown (material.pathBrown) with the cream seam (material.yarn) running over it
// as a dashed thread whose dash offset creeps forward slowly on the live map, and a small paw head, in the warm token
// so it is never mistaken for our own green paw, at the newest point. The portrait is a still capture, so the thread
// there is still too.

import { tokens } from '../ui/tokens';
import { MATERIAL } from './mapTheme';

export const PARTNER_TRAIL_BED = { color: MATERIAL.pathBed, weight: 8, opacity: 0.95 } as const;
export const PARTNER_TRAIL_SEAM = { color: MATERIAL.yarn, weight: 3, dashArray: '7 9' } as const;
export const PARTNER_HEAD_TINT = tokens.warm;
/** Dash offset speed on the live map, px per second (a slow creep). */
export const PARTNER_TRAIL_CREEP_PX_PER_S = 6;

const svgUrl = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

// Cream disc, warm ring, warm paw (one pad, four toes).
const PARTNER_HEAD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="${tokens.white}" stroke="${PARTNER_HEAD_TINT}" stroke-width="4"/><g fill="${PARTNER_HEAD_TINT}"><ellipse cx="20" cy="25" rx="6.5" ry="5"/><ellipse cx="12.5" cy="19" rx="2.6" ry="3.4"/><ellipse cx="17.5" cy="14" rx="2.6" ry="3.4"/><ellipse cx="22.5" cy="14" rx="2.6" ry="3.4"/><ellipse cx="27.5" cy="19" rx="2.6" ry="3.4"/></g></svg>`;

/** CSS for the live-map head marker (inside mapHTML's <style>). */
export const PARTNER_TRAIL_CSS = `
    .partner-head { width: 100%; height: 100%; background: url("${svgUrl(PARTNER_HEAD_SVG)}") center / contain no-repeat; filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.3)); }`;

export const PARTNER_TRAIL_SCRIPT = `
// ---- Alex's thread (partnerTrailScript.ts) ----
var PT_BED = ${JSON.stringify(PARTNER_TRAIL_BED)};
var PT_SEAM = ${JSON.stringify(PARTNER_TRAIL_SEAM)};
var PT_HEAD_TINT = ${JSON.stringify(PARTNER_HEAD_TINT)};
var PT_HEAD_CREAM = ${JSON.stringify(tokens.white)};
var PT_CREEP_PX_PER_S = ${PARTNER_TRAIL_CREEP_PX_PER_S};
var PT_MAX_POINTS = 400;

/** [[lat, lon], ...] from the payload; drops anything that is not a finite coordinate. */
function ptClean(trail) {
  var list = (trail && trail.points) || [];
  var out = [];
  for (var i = 0; i < list.length && out.length < PT_MAX_POINTS; i++) {
    var p = list[i];
    if (p && typeof p.lat === 'number' && typeof p.lon === 'number' && isFinite(p.lat) && isFinite(p.lon)) out.push([p.lat, p.lon]);
  }
  return out;
}

/**
 * Live map: draws (or redraws) the thread. Returns the layer group (pass it back in as previousGroup) or null when
 * there is nothing to show. timers = { set(fn, ms), clear(handle) } drives the slow dash creep.
 */
function ptRenderLive(map, trail, previousGroup, timers) {
  if (previousGroup) {
    if (previousGroup.ptStop) previousGroup.ptStop();
    map.removeLayer(previousGroup);
  }
  var pts = ptClean(trail);
  if (pts.length === 0) return null;
  var group = L.layerGroup();
  var seam = null;
  if (pts.length > 1) {
    L.polyline(pts, { color: PT_BED.color, weight: PT_BED.weight, opacity: PT_BED.opacity, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(group);
    seam = L.polyline(pts, { color: PT_SEAM.color, weight: PT_SEAM.weight, opacity: 1, dashArray: PT_SEAM.dashArray, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(group);
  }
  var name = (trail && trail.name) || '';
  L.marker(pts[pts.length - 1], {
    icon: L.divIcon({ className: 'partner-marker', html: '<div class="partner-head"></div>', iconSize: [30, 30] }),
    interactive: false,
    keyboard: false,
    title: name
  }).addTo(group);
  group.addTo(map);
  var handle = null;
  if (seam && timers) {
    var t0 = Date.now();
    handle = timers.set(function () {
      var el = seam._path;
      if (el && el.style) el.style.strokeDashoffset = String(-(((Date.now() - t0) / 1000) * PT_CREEP_PX_PER_S));
    }, 100);
  }
  group.ptStop = function () { if (handle !== null && timers) timers.clear(handle); handle = null; };
  group.ptStats = { points: pts.length, animated: handle !== null };
  return group;
}

/**
 * Portrait canvas: the same thread, still. project(lat, lon) -> { x, y } in canvas pixels; unit = canvas pixels per
 * on-screen point (at least 1). Drawn after our own patches so the thread lies on top of the cloth.
 */
function ptDrawPortrait(ctx, trail, project, unit) {
  var pts = ptClean(trail);
  if (pts.length === 0) return;
  var u = unit && unit > 1 ? unit : 1;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (pts.length > 1) {
    ctx.beginPath();
    pts.forEach(function (p, i) {
      var pt = project(p[0], p[1]);
      if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
    });
    ctx.globalAlpha = PT_BED.opacity;
    ctx.strokeStyle = PT_BED.color;
    ctx.lineWidth = PT_BED.weight * u;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = PT_SEAM.color;
    ctx.lineWidth = PT_SEAM.weight * u;
    if (ctx.setLineDash) ctx.setLineDash([7 * u, 9 * u]);
    ctx.stroke();
    if (ctx.setLineDash) ctx.setLineDash([]);
  }
  var head = project(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  var r = 11 * u;
  ctx.beginPath();
  ctx.arc(head.x, head.y, r, 0, Math.PI * 2);
  ctx.fillStyle = PT_HEAD_CREAM;
  ctx.fill();
  ctx.lineWidth = 2.5 * u;
  ctx.strokeStyle = PT_HEAD_TINT;
  ctx.stroke();
  ctx.fillStyle = PT_HEAD_TINT;
  function blob(dx, dy, rx, ry) {
    ctx.beginPath();
    if (ctx.ellipse) ctx.ellipse(head.x + dx * r, head.y + dy * r, rx * r, ry * r, 0, 0, Math.PI * 2); else ctx.arc(head.x + dx * r, head.y + dy * r, rx * r, 0, Math.PI * 2);
    ctx.fill();
  }
  blob(0, 0.3, 0.38, 0.3);
  blob(-0.45, -0.1, 0.16, 0.2);
  blob(-0.15, -0.45, 0.16, 0.2);
  blob(0.15, -0.45, 0.16, 0.2);
  blob(0.45, -0.1, 0.16, 0.2);
  ctx.restore();
}
`;
