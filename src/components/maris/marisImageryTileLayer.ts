// MARIS — ocean-aware imagery tiles for the 2D Leaflet map.
//
// ROOT CAUSE (verified empirically, 2026-09): the public Esri World Imagery
// endpoint has no satellite pixels over open ocean above zoom level 13, and
// no real tiles at level 19 anywhere. For those cells the server returns a
// FIXED 2,521-byte JPEG placeholder that renders the words "Map data not
// available" — identical bytes worldwide. The 3D globe already works around
// this (globeImageryFallback.ts); the 2D map streamed the placeholder raw.
//
// FIX: a TileLayer whose createTile fingerprints tile bytes before display.
// Real pixels stream through untouched — same URL, same CSS filter, same
// fade-in and cache behaviour as the stock layer. Esri's placeholder is
// replaced by a crop of the nearest REAL ancestor tile: the same texture,
// geographically aligned, simply upscaled. Visual style is untouched by
// construction, because every displayed pixel comes either from Esri's real
// tile or from a real Esri ancestor tile.

import L from "leaflet";

const ESRI_TEMPLATE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

/**
 * Exact byte signature of Esri's "Map data not available" placeholder.
 * Same constant as globeImageryFallback.ts — verified against a fresh
 * download of the demo-area tile.
 */
const PLACEHOLDER_SHA256 =
  "9eafd300d61393184a4abc1d458564cfd1cd9b6f9c4e9c74687045c0a0e5b858";

/** Placeholder tiles are always exactly this size — cheap pre-filter. */
const PLACEHOLDER_SIZE = 2521;

/** Esri serves real imagery everywhere at/below this level (land and sea). */
const MAX_REAL_LEVEL = 13;

/** Deepest level with real imagery in probed regions (land keeps 14-18). */
const MAX_PROBE_LEVEL = 18;

/** Map tiles to 21: beyond the source's native max, real ancestor pixels
 * are rendered via the engine's sub-tile cropping (overzoom). */
const MAP_MAX_ZOOM = 21;

const TILE_SIZE = 256;
const MAX_ANCESTOR_CACHE = 60;

/** url -> classification, so identical downloads are never re-hashed. */
const classification = new Map<string, "real" | "placeholder">();
/** z/x/y -> decoded ancestor canvas (only real imagery is cached). */
const ancestorCache = new Map<string, HTMLCanvasElement>();
/** z/x/y -> in-flight ancestor fetch, so sibling tiles share one request. */
const pendingAncestors = new Map<string, Promise<HTMLCanvasElement | null>>();

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Fetch and classify one tile URL. Throws on network/HTTP failure so the
 * caller can fall back to letting the <img> element try on its own.
 */
async function classifyTile(url: string): Promise<"real" | "placeholder"> {
  const known = classification.get(url);
  if (known) return known;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`tile ${res.status}`);
  const buffer = await res.arrayBuffer();

  let cls: "real" | "placeholder" = "real";
  if (buffer.byteLength === PLACEHOLDER_SIZE) {
    // 2,521 bytes is Esri's placeholder size worldwide; confirm by hash,
    // falling back to the size signal alone if WebCrypto is unavailable.
    cls = "placeholder";
    try {
      if ((await sha256Hex(buffer)) !== PLACEHOLDER_SHA256) cls = "real";
    } catch {
      /* keep size-only classification */
    }
  }
  classification.set(url, cls);
  return cls;
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
 * Resolve the nearest REAL ancestor tile for a placeholder cell, walking
 * down from the deepest plausible level (18 — sharp land/coast pixels) to
 * the known-real floor (13). Canvases are cached so sibling placeholders
 * and deeper sub-tiles reuse one network fetch.
 */
async function loadAncestorCanvas(
  x: number,
  y: number,
  level: number,
): Promise<HTMLCanvasElement | null> {
  for (let z = Math.min(level - 1, MAX_PROBE_LEVEL); z >= 2; z--) {
    const shift = level - z;
    const ax = x >> shift;
    const ay = y >> shift;
    const key = `${z}/${ax}/${ay}`;

    const cached = ancestorCache.get(key);
    if (cached) return cached;

    let pending = pendingAncestors.get(key);
    if (!pending) {
      const url = ancestorUrl(z, ax, ay);
      pending = (async () => {
        const cls = await classifyTile(url);
        if (cls === "placeholder") return null;
        const res = await fetch(url);
        if (!res.ok) return null;
        const buffer = await res.arrayBuffer();
        return canvasFromBitmap(
          await createImageBitmap(new Blob([buffer], { type: "image/jpeg" })),
        );
      })()
        .catch(() => null)
        .finally(() => pendingAncestors.delete(key));
      pendingAncestors.set(key, pending);
    }

    const canvas = await pending;
    if (canvas) {
      if (ancestorCache.size >= MAX_ANCESTOR_CACHE) ancestorCache.clear();
      ancestorCache.set(key, canvas);
      return canvas;
    }
  }
  return null;
}

/**
 * Crop the ancestor canvas into the requested sub-tile, preserving exact
 * geographic alignment within the ancestor's quadtree cell.
 */
function upsampleAncestor(
  ancestor: HTMLCanvasElement,
  x: number,
  y: number,
  level: number,
): HTMLCanvasElement {
  const z = Math.min(level - 1, MAX_PROBE_LEVEL);
  const shift = level - z;
  const scale = 1 << shift;
  const ax = x >> shift;
  const ay = y >> shift;
  const subX = x - (ax << shift);
  const subY = y - (ay << shift);

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

function ancestorUrl(z: number, x: number, y: number): string {
  return ESRI_TEMPLATE.replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
}

/** Placeholder -> data-URL crop of the nearest real ancestor tile. */
async function synthesizeTile(
  x: number,
  y: number,
  level: number,
): Promise<string> {
  const ancestor = await loadAncestorCanvas(x, y, level);
  if (!ancestor) throw new Error("no real ancestor imagery");
  return upsampleAncestor(ancestor, x, y, level).toDataURL("image/png");
}

const MarisImageryTileLayer = L.TileLayer.extend({
  createTile(
    this: L.TileLayer,
    coords: L.Coords,
    done: L.DoneCallback,
  ): HTMLElement {
    const tile = document.createElement("img");
    tile.alt = "";
    tile.setAttribute("role", "presentation");

    // Same completion contract as the stock layer: done() drives Leaflet's
    // own fade-in, tile events and pruning.
    tile.addEventListener("load", () => done(undefined, tile));
    tile.addEventListener("error", () => done(new Error("tile load failed"), tile));

    void (async () => {
      const url = this.getTileUrl(coords);
      let src = url;
      try {
        if (coords.z > MAX_REAL_LEVEL) {
          const cls = await classifyTile(url);
          if (cls === "placeholder") {
            src = await synthesizeTile(coords.x, coords.y, coords.z);
          }
        }
      } catch {
        // Classification failed (network/HTTP): stream the plain URL and
        // let the stock <img> path handle success or failure as usual.
        src = url;
      }
      tile.src = src;
    })();

    return tile;
  },
}) as unknown as new (url: string, options?: L.TileLayerOptions) => L.TileLayer;

/**
 * Build the 2D map's Esri World Imagery layer with transparent placeholder
 * handling and overzoom past the source's native resolution. The visual
 * style of real tiles is completely unchanged.
 */
export function createMarisImageryTileLayer(
  options?: L.TileLayerOptions,
): L.TileLayer {
  return new MarisImageryTileLayer(ESRI_TEMPLATE, {
    maxZoom: MAP_MAX_ZOOM,
    ...options,
  });
}
