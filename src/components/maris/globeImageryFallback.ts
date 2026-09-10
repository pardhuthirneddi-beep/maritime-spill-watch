// MARIS — ocean-aware imagery fallback for the 3D globe.
//
// ROOT CAUSE (verified empirically, 2026-09): the public Esri World Imagery
// endpoint has no satellite pixels over open ocean above zoom level 13. For
// any tile at level >= 14 whose quadtree cell is pure open ocean, the server
// returns a FIXED 2,521-byte JPEG placeholder that renders the words
// "Map data not available" — identical bytes worldwide
// (sha256 9eafd300d61393184a4abc1d458564cfd1cd9b6f9c4e9c74687045c0a0e5b858).
//
// FIX: wrap the stock UrlTemplateImageryProvider. Levels <= 13 are streamed
// straight through (real imagery everywhere, land and sea). At higher levels
// the tile bytes are fetched directly and fingerprinted; Esri's placeholder
// is replaced by a bilinear upsample of the nearest REAL ancestor tile, so
// close-zoom stays geographically coherent instead of showing a broken state.
// Coastlines, islands and shallow water keep their real Esri pixels at every
// level, and the existing Earth appearance is untouched.

import * as Cesium from "cesium";

/** Exact byte signature of Esri's "Map data not available" placeholder. */
const PLACEHOLDER_SHA256 =
  "9eafd300d61393184a4abc1d458564cfd1cd9b6f9c4e9c74687045c0a0e5b858";

/** Esri serves no real ocean imagery above this level; deeper tiles upsample. */
const MAX_REAL_LEVEL = 13;

const TILE_SIZE = 256;

/** urlKey -> resolved ancestor canvas (only real imagery is cached). */
const ancestorCache = new Map<string, HTMLCanvasElement>();
/** urlKey -> in-flight ancestor fetch, so concurrent tiles share work. */
const pendingAncestors = new Map<string, Promise<HTMLCanvasElement | null>>();
/** urlKey -> classification result, avoids re-hashing identical downloads. */
const classification = new Map<string, "real" | "placeholder">();

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function canvasFromBitmap(bitmap: ImageBitmap): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.drawImage(bitmap, 0, 0, TILE_SIZE, TILE_SIZE);
  bitmap.close();
  return canvas;
}

/**
 * Deterministically marks quadtree cells that Esri has already told us are
 * open-ocean placeholders, so deep-zoom children skip straight to synthesis
 * even if the network goes flaky. Anchored at the deepest real level.
 */
const knownOceanCells = new Set<string>();

function markAncestryPlaceholder(x: number, y: number, level: number): void {
  for (let z = MAX_REAL_LEVEL; z < level; z++) {
    const shift = level - z;
    knownOceanCells.add(`${z}/${x >> shift}/${y >> shift}`);
  }
}

function isKnownPlaceholderCell(x: number, y: number, level: number): boolean {
  if (level <= MAX_REAL_LEVEL) return false;
  for (let z = MAX_REAL_LEVEL; z < level; z++) {
    const shift = level - z;
    if (knownOceanCells.has(`${z}/${x >> shift}/${y >> shift}`)) return true;
  }
  return false;
}

/**
 * Fetch, classify and decode a single tile URL.
 * Returns null when the tile is Esri's ocean placeholder (caller synthesizes).
 */
async function fetchRealTile(
  url: string,
  x: number,
  y: number,
  level: number,
): Promise<ImageBitmap | null> {
  const known = classification.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`tile ${res.status}`);
  const buffer = await res.arrayBuffer();
  const cls =
    known ??
    (buffer.byteLength === 2521 && (await sha256Hex(buffer)) === PLACEHOLDER_SHA256
      ? "placeholder"
      : "real");
  classification.set(url, cls);
  if (cls === "placeholder") {
    markAncestryPlaceholder(x, y, level);
    return null;
  }
  return createImageBitmap(new Blob([buffer], { type: "image/jpeg" }));
}

/**
 * Resolve the nearest real ancestor tile for a placeholder cell.
 * Walks up the quadtree until real imagery is found (level 13 is real
 * everywhere on the planet), caching canvases so sibling placeholders reuse
 * one network fetch.
 */
async function loadAncestorCanvas(
  x: number,
  y: number,
  level: number,
  buildUrl: (x: number, y: number, level: number) => string,
): Promise<HTMLCanvasElement | null> {
  for (let z = Math.min(level, MAX_REAL_LEVEL); z >= 2; z--) {
    const shift = level - z;
    const ax = x >> shift;
    const ay = y >> shift;
    const aKey = `${z}/${ax}/${ay}`;
    const cached = ancestorCache.get(aKey);
    if (cached) return cached;

    let pending = pendingAncestors.get(aKey);
    if (!pending) {
      pending = fetchRealTile(buildUrl(ax, ay, z), ax, ay, z)
        .then((tile) => (tile ? canvasFromBitmap(tile) : null))
        .catch(() => null)
        .finally(() => pendingAncestors.delete(aKey));
      pendingAncestors.set(aKey, pending);
    }
    const canvas = await pending;
    if (canvas) {
      ancestorCache.set(aKey, canvas);
      return canvas;
    }
  }
  return null;
}

/**
 * Upsample the ancestor canvas into the requested sub-tile, preserving
 * exact geographic alignment within the ancestor's quadtree cell.
 */
function upsampleAncestor(
  ancestor: HTMLCanvasElement,
  x: number,
  y: number,
  level: number,
): HTMLCanvasElement {
  const z = Math.min(level, MAX_REAL_LEVEL);
  const scale = 1 << (level - z);
  const ax = x >> (level - z);
  const ay = y >> (level - z);
  const subX = x - (ax << (level - z));
  const subY = y - (ay << (level - z));

  const out = document.createElement("canvas");
  out.width = TILE_SIZE;
  out.height = TILE_SIZE;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    ancestor,
    (subX * TILE_SIZE) / scale,
    (subY * TILE_SIZE) / scale,
    TILE_SIZE / scale,
    TILE_SIZE / scale,
    0,
    0,
    TILE_SIZE,
    TILE_SIZE,
  );
  return out;
}

/**
 * Build the globe's Esri World Imagery provider with transparent close-zoom
 * ocean fallback. The visual style of real tiles is completely unchanged.
 */
export function createMarisImageryProvider(): Cesium.UrlTemplateImageryProvider {
  const template =
    "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

  const provider = new Cesium.UrlTemplateImageryProvider({
    url: template,
    maximumLevel: 18,
  });

  const buildUrl = (x: number, y: number, level: number) =>
    template
      .replace("{z}", String(level))
      .replace("{y}", String(y))
      .replace("{x}", String(x));

  const stockRequestImage = provider.requestImage.bind(provider);

  provider.requestImage = (
    x: number,
    y: number,
    level: number,
    request?: Cesium.Request,
  ): Promise<Cesium.ImageryTypes> => {
    // Low levels are real imagery everywhere — stream them untouched.
    if (level <= MAX_REAL_LEVEL) {
      return stockRequestImage(x, y, level, request) as Promise<Cesium.ImageryTypes>;
    }

    return (async () => {
      // Placeholder? Resolve BEFORE any network attempt can fail: Esri's
      // tiling is deterministic, so a known-placeholder ancestor cell means
      // this tile is ocean too — synthesize it without touching the network.
      if (isKnownPlaceholderCell(x, y, level)) {
        const ancestor = await loadAncestorCanvas(x, y, level, buildUrl);
        if (ancestor) return upsampleAncestor(ancestor, x, y, level);
      }

      let tile: ImageBitmap | null;
      try {
        tile = await fetchRealTile(buildUrl(x, y, level), x, y, level);
      } catch {
        // Network failure: throw so Cesium keeps rendering the parent-level
        // imagery for this tile — geographically coherent for land AND sea,
        // and never a broken/blank state. Errors are swallowed by the
        // errorEvent listener below (no console spam).
        throw new Error("tile fetch failed");
      }
      if (tile) return tile;

      // Esri placeholder → synthesize from the nearest real ancestor.
      const ancestor = await loadAncestorCanvas(x, y, level, buildUrl);
      if (!ancestor) throw new Error("no real ancestor imagery");
      return upsampleAncestor(ancestor, x, y, level);
    })();
  };

  // Keep the console clean when a stock-level request hiccups.
  provider.errorEvent.addEventListener(() => {});

  return provider;
}
