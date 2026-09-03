// MARIS — Maritime Oil Spill Intelligence & Source Attribution System
// Core type definitions

export type LatLon = [number, number];

export interface SpillPolygon {
  coordinates: LatLon[];
  areaKm2: number;
  lengthKm: number;
  center: LatLon;
}

export interface DetectionConfidence {
  score: number;
  factors: string[];
}

export interface OilSpillIncident {
  id: string;
  incidentNumber: string;
  status: "detected" | "confirmed" | "false_positive" | "under_investigation";
  label: string;
  polygon: SpillPolygon;
  confidence: DetectionConfidence;
  detectedAt: string;
  detectionMode: "sar" | "optical" | "hyperspectral";
  coordinates: LatLon;
  waterDepth: number;
  seaState: string;
}

export interface AisVessel {
  mmsi: string;
  name: string;
  imo: string;
  vesselType: string;
  flag: string;
  lat: number;
  lon: number;
  speed: number;
  heading: number;
  course: number;
  destination: string;
  lastSeen: string;
  trajectory: LatLon[];
  timestamps: string[];
}

export interface AttributionFactor {
  label: string;
  weight: number;
  score: number;
  description: string;
}

export interface VesselAttribution {
  vesselId: string;
  vesselName: string;
  overallScore: number;
  factors: AttributionFactor[];
  reasons: string[];
  rank: number;
}

export interface BehaviorAnomaly {
  vesselId: string;
  vesselName: string;
  anomalyLevel: "LOW" | "MEDIUM" | "HIGH";
  evidence: string[];
  speedChange?: string;
  courseDeviation?: string;
  loitering?: string;
  routeDeviation?: string;
}

export interface EnvironmentalConditions {
  windSpeed: number;
  windDirection: number;
  windDirectionLabel: string;
  currentSpeed: number;
  currentDirection: number;
  currentDirectionLabel: string;
  waveHeight: number;
  waveDirection: number;
  seaSurfaceTemp: number;
  timestamp: string;
}

export interface DriftPoint {
  time: string;
  center: LatLon;
  polygon: LatLon[];
  confidence: number;
}

export interface OilDriftResult {
  forward: DriftPoint[];
  backtrack: DriftPoint[];
  mode: "demonstration";
}

export interface ThicknessClass {
  label: string;
  range: string;
  color: string;
  percentage: number;
}

export interface SpectralSignature {
  wavelength: number;
  intensity: number;
  oilAbsorption: number;
}

export interface HyperspectralResult {
  estimatedClass: string;
  confidence: number;
  uncertainty: string;
  thicknessClasses: ThicknessClass[];
  spectralSignatures: SpectralSignature[];
  mode: "demonstration";
  disclaimer: string;
}

export interface TimelineEvent {
  time: string;
  event: string;
  category: "vessel" | "detection" | "analysis" | "report";
}

export interface InvestigationState {
  incident: OilSpillIncident | null;
  vessels: AisVessel[];
  attributions: VesselAttribution[];
  selectedVessel: AisVessel | null;
  behaviorAnomalies: BehaviorAnomaly[];
  environmental: EnvironmentalConditions;
  driftResult: OilDriftResult | null;
  hyperspectral: HyperspectralResult | null;
  timeline: TimelineEvent[];
  isAnalyzing: boolean;
  analysisStep: string;
  analysisProgress: number;
}

export type LayerId =
  | "sar"
  | "optical"
  | "spill"
  | "vessels"
  | "tracks"
  | "wind"
  | "currents"
  | "driftForward"
  | "driftBacktrack"
  | "thickness"
  | "impactZone";

export interface MapLayer {
  id: LayerId;
  label: string;
  enabled: boolean;
  category: "satellite" | "analysis" | "environment";
}

export type PanelView =
  | "overview"
  | "vessel"
  | "attribution"
  | "drift"
  | "thickness"
  | "timeline"
  | "report"
  | "satellite";
