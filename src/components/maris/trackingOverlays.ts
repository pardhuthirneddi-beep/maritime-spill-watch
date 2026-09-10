// MARIS — tracking overlays for maritime contacts (3D Intelligence).
//
// Visual principle: TRACKED OBJECT + ACQUISITION BRACKETS + IDENTIFIER.
// Every visible vessel gets four separated corner brackets plus a
// technical MMSI-first label, all anchored to the vessel's live position
// through Cesium billboard/label pixel offsets (no screen-space hacks).
//
// Performance: bracket sprites are generated once per state (tiny bounded
// set) and drawn through Cesium's batched BillboardCollection — the same
// path used by the ship silhouettes, ready for hundreds of vessels.

import type { VesselSymbolState } from "@/components/maris/vesselSymbols";

/** Bracket sprite size in device px (drawn at 2× and scaled for crispness). */
const BRACKET_PX = 44;
const RATIO = 2; // supersample factor

/** Corner-arm geometry as a fraction of the sprite size. */
const ARM = 0.3;
const INSET = 0.08;

/** Per-state bracket styling — subtle by default, prominent on focus. */
const STATE_STYLE: Record<
  VesselSymbolState,
  { color: string; alpha: number; armScale: number }
> = {
  NORMAL: { color: "#7da2b8", alpha: 0.55, armScale: 1 },
  ACTIVE: { color: "#8fb8cc", alpha: 0.7, armScale: 1 },
  SELECTED: { color: "#22d3ee", alpha: 0.95, armScale: 1.12 },
  CANDIDATE: { color: "#a78bfa", alpha: 0.9, armScale: 1.12 },
  INVESTIGATION: { color: "#fbbf24", alpha: 0.95, armScale: 1.12 },
  STALE: { color: "#475569", alpha: 0.35, armScale: 0.95 },
};

const bracketCache = new Map<VesselSymbolState, HTMLCanvasElement>();

/** Draw four separated corner arms (no connecting rectangle edges). */
function drawBracketArms(ctx: CanvasRenderingContext2D, size: number, arm: number, color: string, alpha: number) {
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 1.6 * RATIO;
  ctx.lineCap = "round";

  const inset = size * INSET;
  const len = size * ARM * arm;
  const max = size - inset;

  const corners: [number, number, number, number][] = [
    // [x0, y0, dx, dy] — arm start corner and draw direction
    [inset, inset, 1, 1], // TL
    [max, inset, -1, 1], // TR
    [inset, max, 1, -1], // BL
    [max, max, -1, -1], // BR
  ];
  for (const [x, y, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x + dx * len, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Get (and cache) the bracket sprite for a vessel state. */
export function getBracketSprite(state: VesselSymbolState): HTMLCanvasElement {
  const hit = bracketCache.get(state);
  if (hit) return hit;

  const canvas = document.createElement("canvas");
  canvas.width = BRACKET_PX * RATIO;
  canvas.height = BRACKET_PX * RATIO;
  const ctx = canvas.getContext("2d")!;
  const style = STATE_STYLE[state];
  drawBracketArms(ctx, canvas.width, 0.3, style.color, style.alpha);

  bracketCache.set(state, canvas);
  return canvas;
}

/** Display scale for the bracket billboard (bracket px on screen). */
export function bracketScale(state: VesselSymbolState): number {
  return (STATE_STYLE[state].armScale * BRACKET_PX) / (BRACKET_PX * RATIO);
}

/**
 * MMSI-primary contact identifier for one vessel.
 * Returned as two separate label specs so MMSI is typographically primary
 * (bold, state accent) and the name is a smaller secondary line — the
 * caller renders them as stacked Cesium labels sharing one position.
 */
export function buildContactLabel(
  mmsi: string,
  name: string | undefined,
  state: VesselSymbolState,
): { primary: string; primaryColor: string; secondary: string | null } {
  return {
    primary: `MMSI ${mmsi}`,
    primaryColor: STATE_STYLE[state].color,
    secondary: name && state !== "STALE" ? name : null,
  };
}
