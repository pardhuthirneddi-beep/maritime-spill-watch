// MARIS — 3D Intelligence types
// Types for the Cesium-based spatial investigation environment.
// All data flows from the shared demo models — no separate datasets.

/** 3D scene layer ids (globe_* prefix distinguishes from 2D MapLayers). */
export type Globe3dLayerId =
  | "globe_vessels"
  | "globe_tracks"
  | "globe_spill"
  | "globe_satellite"
  | "globe_boundaries"
  | "globe_grid"
  | "globe_detection_zones"
  | "globe_correlation";

export interface Globe3dLayer {
  id: Globe3dLayerId;
  label: string;
  enabled: boolean;
}

/** Interpolated vessel state at an arbitrary replay time. */
export interface TemporalPosition {
  lat: number;
  lon: number;
  headingDeg: number;
  speedKn: number;
  /** Vessel is inside the investigation area at this time. */
  inArea: boolean;
  /** Index into the source trajectory (last fix at or before t). */
  fixIndex: number;
}

/** A single timestamped evidence/mark event in the replay. */
export interface EvidenceEvent {
  id: string;
  time: string; // ISO
  lat: number;
  lon: number;
  label: string;
  detail: string;
  category: "vessel" | "detection" | "analysis";
  vesselId?: string;
}

export interface ReplayFrame {
  timeMs: number;
  positions: Record<string, TemporalPosition>; // by mmsi
  visibleEvents: EvidenceEvent[];
}

/** What the user has clicked in the 3D scene. */
export type SceneSelection =
  | { kind: "spill" }
  | { kind: "vessel"; mmsi: string }
  | { kind: "event"; eventId: string }
  | null;
