// MARIS — deep-space starfield for the 3D Intelligence view.
//
// Strategy (two complementary layers, zero Three.js, zero new deps):
//
// 1. SKYBOX — Cesium's bundled Tycho-2 star catalog cubemap
//    (Assets/Textures/SkyBox/tycho2t3_80_*.jpg — real astronomical data,
//    served locally from /cesium/ by the existing static-copy pipeline).
//    Gives the photographic Milky-Way backdrop with correct magnitudes.
//
// 2. POINT STARS — a deterministic (seeded) field of ~1,100 faint point
//    primitives across three shells far beyond the Moon's orbit. Fills in
//    the sparse small stars between the Tycho catalog's brighter entries,
//    adds subtle depth variation, and costs one draw call per shell —
//    negligible on integrated graphics.
//
// Everything renders strictly behind Earth (real geometry at real distance,
// no disableDepthTest tricks), so the globe, ocean and intelligence layers
// occlude stars exactly as physics demands. Deterministic seed → the same
// sky every session.

import * as Cesium from "cesium";

/** Radius of each star shell, in meters (~5–9× lunar distance). */
const SHELL_RADII = [1.6e9, 2.4e9, 3.4e9];
/** Stars per shell — tuned so space feels populated, never a wall of dots. */
const STARS_PER_SHELL = [520, 380, 240];

/**
 * mulberry32 — tiny deterministic PRNG (32-bit). Same seed → same universe,
 * every session, every reload.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build one shell of stars with uniform distribution on the sphere
 * (Marsaglia method — no pole clustering).
 */
function buildShell(
  scene: Cesium.Scene,
  radius: number,
  count: number,
  rand: () => number,
  brightnessScale: number,
): Cesium.PointPrimitiveCollection {
  // TRANSLUCENT blending: most stars have alpha < 1 (natural brightness
  // spread) — opaque blending would ignore alpha and make every star equal.
  const collection = new Cesium.PointPrimitiveCollection({
    blendOption: Cesium.BlendOption.TRANSLUCENT,
  });
  for (let i = 0; i < count; i++) {
    // Uniform point on unit sphere
    const u = rand() * 2 - 1;
    const theta = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const dir = new Cesium.Cartesian3(s * Math.cos(theta), s * Math.sin(theta), u);

    // Natural brightness distribution: many faint, few bright (power law).
    const mag = Math.pow(rand(), 2.2); // 0..1, biased faint
    const base = 0.25 + 0.75 * mag;

    // Restrained stellar palette — white through warm/cool subtle tints.
    // (Avoids rainbow/neon; matches the Tycho cubemap's muted tones.)
    const tint = rand();
    const color =
      tint < 0.62
        ? new Cesium.Color(1, 1, 1, base) // white (class A/F dominant)
        : tint < 0.84
          ? new Cesium.Color(1, 0.94, 0.82, base) // warm (G/K)
          : new Cesium.Color(0.82, 0.9, 1, base); // cool (B)

    collection.add({
      position: Cesium.Cartesian3.multiplyByScalar(
        dir,
        radius * (0.92 + 0.16 * rand()), // slight intra-shell depth jitter
        new Cesium.Cartesian3(),
      ),
      pixelSize: (0.7 + 1.1 * mag) * brightnessScale,
      color,
    });
  }
  scene.primitives.add(collection);
  return collection;
}

/** The shells installed for the current viewer — disposed on teardown.
 * Tracked explicitly so dispose removes ONLY our own collections (never a
 * foreign PointPrimitiveCollection) and never double-removes. */
let installedShells: Cesium.PointPrimitiveCollection[] = [];

/**
 * Install the deep-space environment. Called once at viewer creation.
 * Returns nothing — the collections live for the viewer's lifetime.
 */
export function installStarfield(scene: Cesium.Scene): void {
  const rand = mulberry32(0x4d41524953); // "MARIS" — fixed demo universe
  installedShells = [];
  for (let s = 0; s < SHELL_RADII.length; s++) {
    installedShells.push(
      buildShell(scene, SHELL_RADII[s], STARS_PER_SHELL[s], rand, 1 - s * 0.22),
    );
  }
}

/**
 * Dispose the procedural shells (viewer teardown). Guards per shell: if
 * the owning viewer's context was already destroyed mid-teardown, the
 * remaining cleanup continues instead of throwing during unmount.
 */
export function disposeStarfield(scene: Cesium.Scene): void {
  for (const p of installedShells) {
    try {
      scene.primitives.remove(p);
    } catch {
      // Context already torn down — nothing left to release for this shell.
    }
  }
  installedShells = [];
}
