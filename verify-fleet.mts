// Temporary physics verification for the background fleet; deleted after run.
import {
  EPOCH_MS,
  getFleet,
  prepareFleet,
  positionAt,
} from "./src/components/maris/trafficSim";
const pos = (v: Parameters<typeof positionAt>[0], t: number) => positionAt(v, t, EPOCH_MS);

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

await prepareFleet();
const fleet = getFleet();
console.log("fleet size:", fleet.length);

let fails = 0;
const ok = (cond: boolean, label: string, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
  if (!cond) fails++;
};

// 6 sim-hours at 1x — the longest realistic continuous session.
const H6 = 6 * 3600_000;

// 1. Continuity: max per-minute displacement never exceeds physical cap
//    (ferry top speed 24 kn → ~0.89 km/min; use 1.2 km/min as generous cap).
let maxJumpAny = 0;
let jumper = "";
for (const v of fleet) {
  let prev = pos(v, EPOCH_MS);
  for (let m = 1; m <= 360; m++) {
    const cur = pos(v, EPOCH_MS + m * 60_000);
    const d = KM([prev.lat, prev.lon], [cur.lat, cur.lon]);
    if (d > maxJumpAny) {
      maxJumpAny = d;
      jumper = `${v.mmsi} ${v.vesselType} @${m}min`;
    }
    prev = cur;
  }
}
ok(maxJumpAny < 1.2, "no teleport/jumps fleet-wide", `max ${maxJumpAny.toFixed(3)} km/min (${jumper})`);

// 2. No wrap: a vessel that passes its route end must NOT jump back to the
//    route start. Test the fleet's longest-run vessel past 30 sim-hours.
let wrapFound = false;
for (const v of fleet) {
  if (v.anchorAtMs !== null) continue;
  let prev = pos(v, EPOCH_MS);
  for (let m = 1; m <= 30 * 60; m++) {
    const cur = pos(v, EPOCH_MS + m * 60_000);
    if (KM([prev.lat, prev.lon], [cur.lat, cur.lon]) > 2.0) {
      wrapFound = true;
      console.log(`   wrap suspect: ${v.mmsi} @${m}min`);
      break;
    }
    prev = cur;
  }
  if (wrapFound) break;
}
ok(!wrapFound, "no route-wrap teleport over 30 sim-hours");

// 3. Extension: after route end the vessel continues on final bearing at the
//    same speed — verify against a known fast vessel's speed × time.
const mover = fleet.find((v) => v.anchorAtMs === null && v.speedMs > 5 && v.speedMs < 8);
if (mover) {
  const pastEnd = EPOCH_MS + 40 * 3600_000;
  const p1 = pos(mover, pastEnd);
  const p2 = pos(mover, pastEnd + 30 * 60_000);
  const d = KM([p1.lat, p1.lon], [p2.lat, p2.lon]);
  const expected = ((mover.speedMs * 1800) / 1000);
  ok(Math.abs(d - expected) / expected < 0.05, "post-route extension at constant speed", `${d.toFixed(2)} km / 30min vs expected ${expected.toFixed(2)}`);
} else {
  console.log("SKIP  post-route extension (no mid-speed mover found)");
}

// 4. Anchored vessels stay put (no wrap through the anchor point).
const anchored = fleet.find((v) => v.anchorAtMs !== null);
if (anchored) {
  const pA = pos(anchored, EPOCH_MS + 100 * 3600_000);
  const pB = pos(anchored, EPOCH_MS + 106 * 3600_000);
  ok(KM([pA.lat, pA.lon], [pB.lat, pB.lon]) < 0.01, "anchored vessel clamped", `${KM([pA.lat, pA.lon], [pB.lat, pB.lon]).toFixed(4)} km over 6 h`);
} else {
  console.log("SKIP  anchored clamp (no anchored vessels this seed)");
}

console.log(fails === 0 ? "\nALL FLEET CHECKS PASSED" : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
