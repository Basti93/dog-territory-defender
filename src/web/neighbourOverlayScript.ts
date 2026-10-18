// WebView-side Nachbarhund layer (multiplayer-sync Decision 23, slice M3). Plain ES5 string, injected into
// mapHTML.ts and portraitHTML.ts AFTER HOME_RANGE_RENDERER_SCRIPT: it reuses that script's blur, marching squares,
// ring chaining and lat/lon helpers (hrBlurField, hrMarchingSquaresSegments, hrChainRings, hrRingsWithHoles,
// hrLocalToLatLon, hrCellCenterLatLng), so a neighbour's patch has exactly the same soft edge as ours.
//
// Look: a dotted outline plus a faint wash in the sky token (tokens.blue, no new colour), drawn BELOW our patches
// (pane z 380 < patch pane 390), so overlap is soft and our colours are never touched. The small wood-sign name
// label sits on the Range cell nearest its centre; tapping it posts NEIGHBOUR_TAPPED to React Native. The
// paw-robot "simulated" badge lives on the profile card only (not on the map).

import { tokens } from '../ui/tokens';
import { MATERIAL } from './mapTheme';

export const NEIGHBOUR_TINT = tokens.blue;
export const NEIGHBOUR_FILL_ALPHA = 0.16;
export const NEIGHBOUR_SEAM_ALPHA = 0.9;
export const NEIGHBOUR_SEAM_DASH = '1 6';

export const NEIGHBOUR_OVERLAY_SCRIPT = `
// ---- Nachbarhunde layer (neighbourOverlayScript.ts) ----
var NB_TINT_HEX = ${JSON.stringify(NEIGHBOUR_TINT)};
var NB_FILL_ALPHA = ${NEIGHBOUR_FILL_ALPHA};
var NB_SEAM_ALPHA = ${NEIGHBOUR_SEAM_ALPHA};
var NB_SEAM_DASH = ${JSON.stringify(NEIGHBOUR_SEAM_DASH)};
var NB_SEAM_WEIGHT = 3;
var NB_PAD_CELLS = 2;
// A bad payload must not allocate a huge field.
var NB_MAX_FIELD_CELLS = 40000;
var NB_WOOD = ${JSON.stringify({ face: MATERIAL.woodSign, edge: MATERIAL.woodEdge, bottom: MATERIAL.woodBottom, ink: tokens.text })};

/** Soft outline rings of one neighbour's cells as [[outer, hole...], ...], each ring [[lat, lon], ...]. [] when unusable. */
function nbGeometry(cells) {
  if (!cells || !cells.length) return [];
  var minIx = Infinity, maxIx = -Infinity, minIy = Infinity, maxIy = -Infinity, i;
  for (i = 0; i < cells.length; i++) {
    var c = cells[i];
    if (!c || typeof c.ix !== 'number' || typeof c.iy !== 'number' || !isFinite(c.ix) || !isFinite(c.iy)) continue;
    if (c.ix < minIx) minIx = c.ix;
    if (c.ix > maxIx) maxIx = c.ix;
    if (c.iy < minIy) minIy = c.iy;
    if (c.iy > maxIy) maxIy = c.iy;
  }
  if (minIx === Infinity) return [];
  minIx -= NB_PAD_CELLS; minIy -= NB_PAD_CELLS;
  var w = maxIx - minIx + 1 + NB_PAD_CELLS;
  var h = maxIy - minIy + 1 + NB_PAD_CELLS;
  if (w * h > NB_MAX_FIELD_CELLS) return [];
  var occ = new Float32Array(w * h);
  for (i = 0; i < cells.length; i++) {
    var cell = cells[i];
    if (!cell || typeof cell.ix !== 'number' || typeof cell.iy !== 'number') continue;
    occ[(cell.iy - minIy) * w + (cell.ix - minIx)] = 1;
  }
  var blurred = hrBlurField(occ, w, h, HR_BLUR_SIGMA_CELLS);
  var groups = hrRingsWithHoles(hrChainRings(hrMarchingSquaresSegments(blurred, w, h, HR_CONTOUR_THRESHOLD)));
  return groups.map(function (group) {
    return group.map(function (ring) {
      return ring.map(function (pt) { return hrLocalToLatLon(pt[0], pt[1], minIx, minIy); });
    });
  });
}

function nbEscape(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** divIcon inner HTML of a neighbour's name sign. The name is text from the server, so it is HTML-escaped. */
function nbSignHTML(name) {
  return '<div class="neighbour-sign">' + nbEscape(name) + '</div>';
}

/**
 * Live map: one dotted soft patch per neighbour (own SVG pane under the Range patches) plus a tappable name sign.
 * onTap(id) is called on a sign tap. Returns the layer group (pass it back in as previousGroup), null when empty.
 */
function hrRenderNeighbours(map, items, previousGroup, onTap) {
  if (previousGroup) map.removeLayer(previousGroup);
  if (!items || !items.length) return null;
  var pane = map.getPane('hrNeighbourPane') || map.createPane('hrNeighbourPane');
  pane.style.zIndex = 380;
  var renderer = L.svg({ pane: 'hrNeighbourPane' });
  var group = L.layerGroup();
  group.addLayer(renderer);
  var patches = 0;
  var signs = 0;
  items.forEach(function (item) {
    nbGeometry(item.cells).forEach(function (latlngs) {
      L.polygon(latlngs, {
        renderer: renderer, stroke: true, color: NB_TINT_HEX, weight: NB_SEAM_WEIGHT, opacity: NB_SEAM_ALPHA,
        dashArray: NB_SEAM_DASH, lineCap: 'round', lineJoin: 'round',
        fill: true, fillColor: NB_TINT_HEX, fillOpacity: NB_FILL_ALPHA, interactive: false, smoothFactor: 1
      }).addTo(group);
      patches++;
    });
    if (item.label && item.name) {
      var marker = L.marker(hrCellCenterLatLng(item.label.ix, item.label.iy), {
        icon: L.divIcon({ className: 'neighbour-marker', html: nbSignHTML(item.name), iconSize: [0, 0] }),
        keyboard: false
      }).addTo(group);
      marker.on('click', function () { if (onTap) onTap(item.id); });
      signs++;
    }
  });
  group.addTo(map);
  group.nbStats = { patches: patches, signs: signs };
  return group;
}

/**
 * Portrait canvas: the same patches drawn onto ctx. project(lat, lon) -> { x, y } in canvas pixels.
 * unit = canvas pixels per on-screen point (canvas width / displayed width, at least 1) so stitches stay readable
 * after the image is scaled down. Call BEFORE drawing our own patches so ours sit on top.
 */
function hrDrawNeighbourPatches(ctx, items, project, unit) {
  var u = unit && unit > 1 ? unit : 1;
  (items || []).forEach(function (item) {
    nbGeometry(item.cells).forEach(function (group) {
      ctx.save();
      ctx.beginPath();
      group.forEach(function (ring) {
        ring.forEach(function (p, i) {
          var pt = project(p[0], p[1]);
          if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
        });
        ctx.closePath();
      });
      ctx.globalAlpha = NB_FILL_ALPHA;
      ctx.fillStyle = NB_TINT_HEX;
      try { ctx.fill('evenodd'); } catch (err) { ctx.fill(); }
      ctx.globalAlpha = NB_SEAM_ALPHA;
      ctx.strokeStyle = NB_TINT_HEX;
      ctx.lineWidth = NB_SEAM_WEIGHT * u;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (ctx.setLineDash) ctx.setLineDash([u, 6 * u]);
      ctx.stroke();
      ctx.restore();
    });
  });
}

/** Portrait canvas: the name signs, drawn AFTER everything else (they are tiny and sit on the patch). */
function hrDrawNeighbourSigns(ctx, items, project, unit) {
  var u = unit && unit > 1 ? unit : 1;
  (items || []).forEach(function (item) {
    if (!item.label || !item.name) return;
    var ll = hrCellCenterLatLng(item.label.ix, item.label.iy);
    var pt = project(ll[0], ll[1]);
    ctx.save();
    ctx.font = '600 ' + Math.round(12 * u) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var w = ctx.measureText(item.name).width + 16 * u;
    var h = 20 * u;
    var x = pt.x - w / 2;
    var y = pt.y - h / 2;
    ctx.fillStyle = NB_WOOD.bottom;
    ctx.fillRect(x, y + 2 * u, w, h);
    ctx.fillStyle = NB_WOOD.edge;
    ctx.fillRect(x - u, y - u, w + 2 * u, h + 2 * u);
    ctx.fillStyle = NB_WOOD.face;
    ctx.fillRect(x + u, y + u, w - 2 * u, h - 2 * u);
    ctx.fillStyle = NB_WOOD.ink;
    ctx.fillText(item.name, pt.x, pt.y + u);
    ctx.restore();
  });
}
`;
