// MARIS — land/water mask for DEMO AIS geographic validation.
//
// Source: the NaturalEarthII raster already bundled with Cesium and served
// locally from /cesium/Assets/Textures/NaturalEarthII (EPSG:4326 TMS,
// level 2 = 2048×1024 ≈ 0.176°/px ≈ 19 km/px). No new dependencies —
// this is the same geographic dataset the globe's offline base layer uses.
//
// The mask is built ONCE at fleet-generation time (not per frame) and used
// to validate vessel routes: candidate positions that sample as land are
// rejected and regenerated deterministically, so no simulated vessel ever
// sits on — or routes across — a continent or large island.

// TMS level-2 grid: 8 columns × 4 rows of 256px tiles = 2048×1024 total.
const TILE_SIZE = 256;
const GRID_X = 8;
const GRID_Y = 4;
const MASK_W = TILE_SIZE * GRID_X; // 2048
const MASK_H = TILE_SIZE * GRID_Y; // 1024

/** Coarse boolean water mask: true = ocean (dark blue pixels). */
let waterMask: Uint8Array | null = null;
let loading: Promise<void> | null = null;

function tileUrl(col: number, row: number): string {
  const base =
    (window as unknown as Record<string, unknown>).CESIUM_BASE_URL as string ||
    "/cesium/";
  return `${base}Assets/Textures/NaturalEarthII/2/${col}/${row}.jpg`;
}

/**
 * Decode one tile and write land/water classification into the mask.
 * NaturalEarthII ocean is a uniform dark blue; land is green/brown/tan —
 * a luminance + channel test separates them robustly.
 */
function decodeTile(ctx: CanvasRenderingContext2D, col: number, row: number): void {
  const img = new Image();
  img.src = tileUrl(col, row);
  // decode() resolves when the image data is available.
  return img
    .decode()
    .then(() => {
      ctx.drawImage(img, col * TILE_SIZE, row * TILE_SIZE);
      const data = ctx.getImageData(
        col * TILE_SIZE,
        row * TILE_SIZE,
        TILE_SIZE,
        TILE_SIZE,
      ).data;
      const ox = col * TILE_SIZE;
      const oy = row * TILE_SIZE;
      for (let y = 0; y < TILE_SIZE; y++) {
        for (let x = 0; x < TILE_SIZE; x++) {
          const i = (y * TILE_SIZE + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          // NE2 ocean: dark navy (b significantly highest, low luminance).
          const isWater =
            b > 60 && b > r + 18 && b >= g && r < 120;
          waterMask![(oy + y) * MASK_W + (ox + x)] = isWater ? 1 : 0;
        }
      }
    })
    .catch(() => {
      // Decode failure: mark this tile as water (fail-open — better a rare
      // offshore-bound demo vessel than a fleet that never spawns).
      const ox = col * TILE_SIZE;
      const oy = row * TILE_SIZE;
      for (let y = 0; y < TILE_SIZE; y++) {
        for (let x = 0; x < TILE_SIZE; x++) {
          waterMask![(oy + y) * MASK_W + (ox + x)] = 1;
        }
      }
    });
}

/**
 * Build the water mask once. Subsequent calls return the same promise.
 * Resolves when every tile has been classified.
 */
export function ensureWaterMask(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    waterMask = new Uint8Array(MASK_W * MASK_H);
    const canvas = document.createElement("canvas");
    canvas.width = MASK_W;
    canvas.height = MASK_H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    await Promise.all(
      Array.from({ length: GRID_X * GRID_Y }, (_, i) =>
        decodeTile(ctx, i % GRID_X, Math.floor(i / GRID_X)),
      ),
    );
  })();
  return loading;
}

/** True once the mask is ready for synchronous isWater queries. */
export function waterMaskReady(): boolean {
  return waterMask !== null;
}

/**
 * Land/water test at lat/lon. Returns true when over ocean/sea.
 * Falls back to "water" (fail-open) before the mask finishes loading.
 * Layout verified against the raster: tiles are 45° cells (8×4), the
 * canvas mosaic is drawn TOP-DOWN (row 0 = northernmost), matching the
 * ((90−lat)/180·H) mapping below.
 */
export function isWater(lat: number, lon: number): boolean {
  if (!waterMask) return true;
  const x = Math.floor(((lon + 180) / 360) * MASK_W);
  const y = Math.floor(((90 - lat) / 180) * MASK_H);
  const px = Math.min(MASK_W - 1, Math.max(0, x));
  const py = Math.min(MASK_H - 1, Math.max(0, y));
  return waterMask[py * MASK_W + px] === 1;
}

/**
 * Land/water test with a coastal tolerance: samples the point AND a ring
 * around it so vessel symbols (a few px wide at close zoom) never visually
 * overlap shoreline pixels. `tolKm` is the sampling radius in kilometers.
 */
export function isWaterWithTolerance(lat: number, lon: number, tolKm: number): boolean {
  if (!waterMask) return true;
  if (!isWater(lat, lon)) return false;
  // Sample 8 points around the ring (deg conversion: 1° lat ≈ 111 km).
  const dLat = tolKm / 111;
  const dLon = tolKm / (111 * Math.max(0.15, Math.cos((lat * Math.PI) / 180)));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    if (
      !isWater(lat + dLat * Math.cos(a), lon + dLon * Math.sin(a))
    ) {
      return false;
    }
  }
  return true;
}
