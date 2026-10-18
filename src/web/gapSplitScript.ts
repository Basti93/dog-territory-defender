// WebView-side twin of geometry.ts's stepCountsAsDistance / splitAtGaps (the distance rule, docs/specs/walk-lifecycle.md
// "Distance rule"). Plain ES5 string, injected into mapHTML.ts (live trail) and portraitHTML.ts, ahead of
// partnerTrailScript.ts, which calls gapSplit. src/web/__tests__/gapSplitScript.test.ts evaluates this string and checks it
// against the TypeScript helper on the same inputs, so the two cannot drift apart. Change both together.
//
// gapSplit(points) takes [{ latitude, longitude, timestamp }] and returns runs (arrays of the SAME point objects), cut
// wherever a step fails the rule, so no line is ever drawn across a jump, ride or long gap.

import {
  DROPOUT_BRIDGE_MAX_M,
  DROPOUT_BRIDGE_MAX_S,
  DROPOUT_BRIDGE_MAX_SPEED_MS,
  MAX_SEGMENT_M,
  MAX_SEGMENT_SPEED_MS,
} from '../utils/grid';

export const GAP_SPLIT_SCRIPT = `
// ---- distance rule / trail gaps (gapSplitScript.ts) ----
var GAP_MAX_STEP_M = ${MAX_SEGMENT_M};
var GAP_MAX_SPEED_MS = ${MAX_SEGMENT_SPEED_MS};
var GAP_BRIDGE_MAX_M = ${DROPOUT_BRIDGE_MAX_M};
var GAP_BRIDGE_MAX_S = ${DROPOUT_BRIDGE_MAX_S};
var GAP_BRIDGE_MAX_SPEED_MS = ${DROPOUT_BRIDGE_MAX_SPEED_MS};

function gapMetres(lat1, lon1, lat2, lon2) {
  var R = 6371e3;
  var p1 = (lat1 * Math.PI) / 180;
  var p2 = (lat2 * Math.PI) / 180;
  var dp = ((lat2 - lat1) * Math.PI) / 180;
  var dl = ((lon2 - lon1) * Math.PI) / 180;
  var a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function gapStepCounts(a, b) {
  var d = gapMetres(a.latitude, a.longitude, b.latitude, b.longitude);
  var dt = (b.timestamp - a.timestamp) / 1000;
  if (!(dt > 0)) return d <= GAP_MAX_STEP_M;
  if (d <= GAP_MAX_STEP_M) return d / dt <= GAP_MAX_SPEED_MS;
  return d <= GAP_BRIDGE_MAX_M && dt <= GAP_BRIDGE_MAX_S && d / dt <= GAP_BRIDGE_MAX_SPEED_MS;
}

function gapSplit(points) {
  var runs = [];
  var run = [];
  for (var i = 0; i < points.length; i++) {
    if (i > 0 && !gapStepCounts(points[i - 1], points[i])) {
      runs.push(run);
      run = [];
    }
    run.push(points[i]);
  }
  if (run.length > 0) runs.push(run);
  return runs;
}
`;
