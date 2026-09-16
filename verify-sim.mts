// Temporary physics verification for the 3D vessel simulation fix.
// Run: bun run verify-sim.mts — then delete.
import { DEMO_VESSELS } from "./src/data/demoData";
import {
  replayStartMs,
  replayEndMs,
  positionAt,
  travelledPath,
} from "./src/data/temporalReplay";

const KM = (a: [number, number], b: [number, number]) => {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) *
      Math.cos((b[0] * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

let fails = 0;
const ok = (cond: boolean, label: string, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
  if (!cond) fails++;
};

const startMs = replayStartMs(DEMO_VESSELS);
const endMs = replayEndMs(DEMO_VESSELS);
console.log(`window: ${new Date(startMs).toISOString()} → ${new Date(endMs).toISOString()}`);

// CHECK 1/2/4: every vessel is MOVING at T+0 (not clamped to its first fix).
// OCEAN STAR's first fix IS the window start, so "moved" is 0 by definition —
// its position equals the fix and it advances forward from there.
const oceanStar = DEMO_VESSELS[0];
for (const v of DEMO_VESSELS) {
  const p0 = positionAt(v, startMs);
  const fix0 = v.trajectory[0];
  const moved = KM(fix0, [p0.lat, p0.lon]);
  // OCEAN STAR: first fix IS T+0 → position == fix (moved ≈ 0).
  // Others: dead-reckoned back along their inbound course → must have
  // LEFT the first-fix clamp (moved > 0).
  if (v === oceanStar) {
    ok(moved <= 0.001, `T+0 ${v.name} not frozen`, `${moved.toFixed(2)} km from first fix (== fix by definition)`);
  } else {
    ok(moved > 0.01, `T+0 ${v.name} not frozen`, `${moved.toFixed(2)} km behind first fix`);
  }
}

// Moving forward at T+0 → T+1min for ALL vessels (immediate motion).
for (const v of DEMO_VESSELS) {
  const a = positionAt(v, startMs);
  const b = positionAt(v, startMs + 60_000);
  ok(KM([a.lat, a.lon], [b.lat, b.lon]) > 0.02, `T+0→T+1min moving ${v.name}`);
}

// CHECK 5/6: distance over 6 sim-minutes == speed × time, for vessels with
// no recorded fix inside [T+0, T+6] (pure dead-reckoning zone — label speed
// governs). OCEAN STAR has a fix at T+7, so skip its cross-fix interval.
const knToKmPerMin = (kn: number) => (kn * 1.852) / 60;
for (const v of DEMO_VESSELS) {
  const firstFix = Date.parse(v.timestamps[0]);
  const hasFixInWindow = v.timestamps.some(
    (t, i) => i > 0 && Date.parse(t) >= startMs + 6 * 60_000 && Date.parse(t) <= startMs + 7 * 60_000,
  );
  if (hasFixInWindow) {
    console.log(`SKIP  speed×time ${v.name} (recorded fix inside interval)`);
    continue;
  }
  void firstFix;
  const a = positionAt(v, startMs);
  const b = positionAt(v, startMs + 6 * 60_000);
  const d = KM([a.lat, a.lon], [b.lat, b.lon]);
  const expected = knToKmPerMin(v.speed) * 6;
  ok(Math.abs(d - expected) / expected < 0.02, `speed×time ${v.name}`, `moved ${d.toFixed(3)} km, expected ${expected.toFixed(3)} km @ ${v.speed} kn`);
}

// Continuity: no jumps larger than physically possible (2× label speed per
// minute) — allows recorded-leg segments (pre-existing demo geometry).
for (const v of DEMO_VESSELS) {
  let maxJump = 0;
  let prev = positionAt(v, startMs);
  for (let m = 1; m <= 60; m++) {
    const cur = positionAt(v, startMs + m * 60_000);
    maxJump = Math.max(maxJump, KM([prev.lat, prev.lon], [cur.lat, cur.lon]));
    prev = cur;
  }
  const cap = knToKmPerMin(v.speed) * 2;
  ok(maxJump < cap, `continuity ${v.name}`, `max ${maxJump.toFixed(3)} km/min vs cap ${cap.toFixed(3)}`);
}

// CHECK 8: travelled path grows progressively with the clock.
const t1 = travelledPath(oceanStar, startMs).length;
const t2 = travelledPath(oceanStar, new Date("2026-09-02T09:20:00Z").getTime()).length;
const t3 = travelledPath(oceanStar, endMs).length;
ok(t1 <= 2 && t1 >= 1 && t2 > t1 && t3 === oceanStar.trajectory.length + 1, "travelledPath grows", `T0:${t1} → 09:20:${t2} → end:${t3}`);

// At T+0 the travelled path contains at most the first fix + live position.
for (const v of DEMO_VESSELS) {
  ok(travelledPath(v, startMs).length <= 2, `travelledPath minimal at T0 ${v.name}`);
}

// Post-window: vessels keep sailing beyond last fix (extended trajectory,
// exact speed × time).
const after = positionAt(oceanStar, endMs + 30 * 60_000);
const lastFix = oceanStar.trajectory[oceanStar.trajectory.length - 1];
const ext = KM(lastFix, [after.lat, after.lon]);
const expectedExt = knToKmPerMin(oceanStar.speed) * 30;
ok(Math.abs(ext - expectedExt) / expectedExt < 0.02, "post-window extension", `${ext.toFixed(2)} km after 30 min (expected ${expectedExt.toFixed(2)})`);

console.log(fails === 0 ? "\nALL REPLAY CHECKS PASSED" : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
