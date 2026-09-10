// MARIS — professional maritime vessel symbolization (3D Intelligence).
//
// Top-down vessel silhouettes rendered as canvas sprites drawn by Cesium's
// BillboardCollection (batched, GPU-friendly — ready for hundreds of
// vessels). Each symbol communicates hull form, bow direction and vessel
// class, rotating with the vessel's actual course over ground.
//
// Data integrity: classes are mapped from the existing AIS `vesselType`
// strings; states come from the existing selection + attribution system.
// No invented data.

// ─── TYPES ───────────────────────────────────────────────────────────

export type ShipClass =
  | "TANKER"
  | "CARGO"
  | "CONTAINER"
  | "PASSENGER"
  | "FISHING"
  | "TUG"
  | "UNKNOWN";

export type VesselSymbolState =
  | "NORMAL"
  | "ACTIVE"
  | "SELECTED"
  | "CANDIDATE"
  | "INVESTIGATION"
  | "STALE";

/** Map free-text AIS vessel types onto the supported symbol classes. */
export function classifyVessel(vesselType: string | undefined): ShipClass {
  const t = (vesselType ?? "").toLowerCase();
  if (t.includes("tank")) return "TANKER";
  if (t.includes("container")) return "CONTAINER";
  if (t.includes("cargo") || t.includes("bulk")) return "CARGO";
  if (t.includes("passenger") || t.includes("ferry") || t.includes("cruise"))
    return "PASSENGER";
  if (t.includes("fish") || t.includes("trawl")) return "FISHING";
  if (t.includes("tug")) return "TUG";
  return "UNKNOWN";
}

// ─── STATE COLORS (MARIS palette — restrained, semantic) ─────────────
// normal: slate-blue traffic · selected: cyan focus · candidate: violet
// (matches the source-connection corridor) · investigation: amber
// (matches evidence) · stale: dim grey.

const STATE_COLOR: Record<VesselSymbolState, string> = {
  NORMAL: "#7da2b8",
  ACTIVE: "#8fb8cc",
  SELECTED: "#22d3ee",
  CANDIDATE: "#a78bfa",
  INVESTIGATION: "#fbbf24",
  STALE: "#475569",
};

/** Outline color behind the hull — keeps symbols legible over bright sea. */
const OUTLINE = "rgba(4, 8, 14, 0.85)";

// ─── SYMBOL GEOMETRY ─────────────────────────────────────────────────
// All silhouettes are drawn bow-up (north = 0°) on a square canvas and
// rotated at render time via the billboard's aligned-axis rotation.

const CANVAS = 64;

type Ctx = CanvasRenderingContext2D;

function hullPath(ctx: Ctx, cx: number, bowY: number, sternY: number, halfW: number) {
  // Pointed bow, parallel midbody, rounded stern — standard top-down hull.
  const shoulder = bowY + (sternY - bowY) * 0.28;
  ctx.beginPath();
  ctx.moveTo(cx, bowY);
  ctx.quadraticCurveTo(cx + halfW * 0.9, shoulder, cx + halfW, shoulder + (sternY - shoulder) * 0.55);
  ctx.lineTo(cx + halfW, sternY - halfW * 0.4);
  ctx.quadraticCurveTo(cx + halfW, sternY, cx + halfW * 0.55, sternY);
  ctx.lineTo(cx - halfW * 0.55, sternY);
  ctx.quadraticCurveTo(cx - halfW, sternY, cx - halfW, sternY - halfW * 0.4);
  ctx.lineTo(cx - halfW, shoulder + (sternY - shoulder) * 0.55);
  ctx.quadraticCurveTo(cx - halfW * 0.9, shoulder, cx, bowY);
  ctx.closePath();
}

function drawBase(ctx: Ctx, color: string) {
  ctx.lineJoin = "round";
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fill();
}

/** Class-specific deck details — subtle, technical, no cartoon elements. */
function drawDeckDetails(ctx: Ctx, cls: ShipClass, cx: number, bowY: number, sternY: number, halfW: number) {
  ctx.strokeStyle = OUTLINE;
  ctx.fillStyle = OUTLINE;

  switch (cls) {
    case "TANKER": {
      // Transverse pipeline manifolds midship + longitudinal centerline.
      const my = bowY + (sternY - bowY) * 0.52;
      for (const off of [-halfW * 0.42, 0, halfW * 0.42]) {
        ctx.beginPath();
        ctx.moveTo(cx + off - 2.2, my - 5);
        ctx.lineTo(cx + off - 2.2, my + 5);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(cx, my - 8);
      ctx.lineTo(cx, sternY - 7);
      ctx.lineWidth = 1;
      ctx.stroke();
      // Aft superstructure block.
      ctx.fillRect(cx - halfW * 0.62, sternY - 9, halfW * 1.24, 6);
      break;
    }
    case "CONTAINER": {
      // Hatch grid: two rows of small squares along the deck.
      const rows = 4;
      for (let i = 0; i < rows; i++) {
        const y = bowY + (sternY - bowY) * (0.3 + 0.13 * i);
        ctx.fillRect(cx - halfW * 0.6, y, halfW * 0.45, 3.4);
        ctx.fillRect(cx + halfW * 0.15, y, halfW * 0.45, 3.4);
      }
      // Aft superstructure.
      ctx.fillRect(cx - halfW * 0.62, sternY - 9, halfW * 1.24, 6);
      break;
    }
    case "CARGO": {
      // Three hatch covers, deck cranes as short diagonal ticks.
      for (let i = 0; i < 3; i++) {
        const y = bowY + (sternY - bowY) * (0.32 + 0.16 * i);
        ctx.fillRect(cx - halfW * 0.55, y, halfW * 1.1, 3.8);
        ctx.beginPath();
        ctx.moveTo(cx - halfW * 0.78, y - 2);
        ctx.lineTo(cx - halfW * 0.95, y + 2);
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + halfW * 0.78, y - 2);
        ctx.lineTo(cx + halfW * 0.95, y + 2);
        ctx.stroke();
      }
      ctx.fillRect(cx - halfW * 0.62, sternY - 9, halfW * 1.24, 6);
      break;
    }
    case "PASSENGER": {
      // Long white-ship superstructure spanning most of the hull.
      ctx.fillRect(cx - halfW * 0.72, bowY + (sternY - bowY) * 0.3, halfW * 1.44, (sternY - bowY) * 0.5);
      // Funnel mark.
      ctx.fillRect(cx - 1.6, bowY + (sternY - bowY) * 0.42, 3.2, 5);
      break;
    }
    case "FISHING": {
      // Stern gantry (A-frame) + small deck house forward.
      ctx.beginPath();
      ctx.moveTo(cx - halfW * 0.7, sternY - 2);
      ctx.lineTo(cx, sternY - 6);
      ctx.lineTo(cx + halfW * 0.7, sternY - 2);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillRect(cx - halfW * 0.5, bowY + (sternY - bowY) * 0.38, halfW, 5);
      break;
    }
    case "TUG": {
      // Compact hull, heavy deck house, tow hook aft.
      ctx.fillRect(cx - halfW * 0.66, bowY + (sternY - bowY) * 0.3, halfW * 1.32, (sternY - bowY) * 0.4);
      ctx.beginPath();
      ctx.arc(cx, sternY - 4, 1.8, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    default:
      // UNKNOWN: clean hull + plain block, no class-specific details.
      ctx.fillRect(cx - halfW * 0.5, bowY + (sternY - bowY) * 0.42, halfW, 6);
      break;
  }
}

/** Canvas size per class — hull proportions differ, symbol box is shared. */
const CLASS_PROPORTIONS: Record<ShipClass, { bow: number; stern: number; halfW: number }> = {
  TANKER: { bow: 7, stern: 57, halfW: 8.5 }, // long, full-bodied
  CONTAINER: { bow: 6, stern: 58, halfW: 9 },
  CARGO: { bow: 9, stern: 55, halfW: 9.5 },
  PASSENGER: { bow: 12, stern: 52, halfW: 11 }, // shorter, wider
  FISHING: { bow: 16, stern: 48, halfW: 9 }, // short
  TUG: { bow: 20, stern: 46, halfW: 11 }, // very short, wide
  UNKNOWN: { bow: 11, stern: 53, halfW: 9.5 },
};

// ─── SPRITE CACHE ────────────────────────────────────────────────────
// class × state → canvas. Bounded (7 classes × 6 states); built lazily.

const spriteCache = new Map<string, HTMLCanvasElement>();

export function getVesselSymbol(cls: ShipClass, state: VesselSymbolState): HTMLCanvasElement {
  const key = `${cls}:${state}`;
  const hit = spriteCache.get(key);
  if (hit) return hit;

  const canvas = document.createElement("canvas");
  canvas.width = CANVAS;
  canvas.height = CANVAS;
  const ctx = canvas.getContext("2d")!;
  const { bow, stern, halfW } = CLASS_PROPORTIONS[cls];
  const cx = CANVAS / 2;

  hullPath(ctx, cx, bow, stern, halfW);
  drawBase(ctx, STATE_COLOR[state]);
  hullPath(ctx, cx, bow, stern, halfW); // re-path for detail clipping
  drawDeckDetails(ctx, cls, cx, bow, stern, halfW);

  spriteCache.set(key, canvas);
  return canvas;
}

/** Resolve heading: course-over-ground from the replay frame first, then
 *  AIS heading, then neutral. Per the data-integrity contract. */
export function resolveHeadingDeg(
  frameHeadingDeg: number | undefined,
  aisHeading: number | undefined,
): number {
  if (typeof frameHeadingDeg === "number" && Number.isFinite(frameHeadingDeg)) {
    return frameHeadingDeg;
  }
  if (typeof aisHeading === "number" && Number.isFinite(aisHeading)) {
    return aisHeading;
  }
  return 0;
}
