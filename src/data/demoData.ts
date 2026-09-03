// MARIS — Complete demonstration scenario data
// Fictional incident for prototype demonstration

import type {
  OilSpillIncident,
  AisVessel,
  VesselAttribution,
  BehaviorAnomaly,
  EnvironmentalConditions,
  OilDriftResult,
  HyperspectralResult,
  TimelineEvent,
} from "./types";

// ─── INCIDENT ───────────────────────────────────────────────────────

export const DEMO_INCIDENT: OilSpillIncident = {
  id: "INC-2026-00421",
  incidentNumber: "MS-2026-00421",
  status: "detected",
  label: "Possible Oil Spill",
  polygon: {
    coordinates: [
      [12.852, 80.235],
      [12.858, 80.244],
      [12.854, 80.255],
      [12.847, 80.258],
      [12.841, 80.250],
      [12.838, 80.240],
      [12.844, 80.233],
      [12.852, 80.235],
    ],
    areaKm2: 14.7,
    lengthKm: 8.2,
    center: [12.8471, 80.2418],
  },
  confidence: {
    score: 91,
    factors: [
      "Low backscatter anomaly in SAR image consistent with oil dampening",
      "Elongated shape aligned with prevailing current direction",
      "No natural phenomena or low-wind zones identified in vicinity",
      "Vessel activity detected in probable source corridor",
      "Sea surface temperature within oil-detection operational range",
    ],
  },
  detectedAt: "2026-09-02T09:42:00Z",
  detectionMode: "sar",
  coordinates: [12.8471, 80.2418],
  waterDepth: 42,
  seaState: "Sea State 3 — moderate",
};

// ─── AIS VESSELS ────────────────────────────────────────────────────

export const DEMO_VESSELS: AisVessel[] = [
  {
    mmsi: "419000782",
    name: "MV OCEAN STAR",
    imo: "9876543",
    vesselType: "Crude Oil Tanker",
    flag: "India",
    lat: 12.862,
    lon: 80.248,
    speed: 4.1,
    heading: 248,
    course: 245,
    destination: "Chennai Port",
    lastSeen: "2026-09-02T09:50:00Z",
    trajectory: [
      [12.889, 80.298],
      [12.882, 80.285],
      [12.876, 80.275],
      [12.871, 80.265],
      [12.866, 80.256],
      [12.862, 80.248],
    ],
    timestamps: [
      "2026-09-02T09:05:00Z",
      "2026-09-02T09:12:00Z",
      "2026-09-02T09:22:00Z",
      "2026-09-02T09:30:00Z",
      "2026-09-02T09:38:00Z",
      "2026-09-02T09:50:00Z",
    ],
  },
  {
    mmsi: "419001234",
    name: "MT PACIFIC DAWN",
    imo: "9876100",
    vesselType: "Product Tanker",
    flag: "India",
    lat: 12.831,
    lon: 80.262,
    speed: 11.8,
    heading: 190,
    course: 188,
    destination: "Ennore Port",
    lastSeen: "2026-09-02T09:50:00Z",
    trajectory: [
      [12.860, 80.268],
      [12.852, 80.267],
      [12.843, 80.266],
      [12.837, 80.264],
      [12.831, 80.262],
    ],
    timestamps: [
      "2026-09-02T09:10:00Z",
      "2026-09-02T09:20:00Z",
      "2026-09-02T09:30:00Z",
      "2026-09-02T09:42:00Z",
      "2026-09-02T09:50:00Z",
    ],
  },
  {
    mmsi: "419009876",
    name: "FV SEA HORIZON",
    imo: "9876200",
    vesselType: "Fishing Vessel",
    flag: "India",
    lat: 12.855,
    lon: 80.228,
    speed: 3.2,
    heading: 312,
    course: 310,
    destination: "Kasimedu Fishing Harbour",
    lastSeen: "2026-09-02T09:50:00Z",
    trajectory: [
      [12.848, 80.236],
      [12.850, 80.234],
      [12.852, 80.231],
      [12.853, 80.229],
      [12.855, 80.228],
    ],
    timestamps: [
      "2026-09-02T09:15:00Z",
      "2026-09-02T09:25:00Z",
      "2026-09-02T09:35:00Z",
      "2026-09-02T09:42:00Z",
      "2026-09-02T09:50:00Z",
    ],
  },
  {
    mmsi: "419005555",
    name: "MV CORAL BREEZE",
    imo: "9876300",
    vesselType: "General Cargo",
    flag: "India",
    lat: 12.872,
    lon: 80.218,
    speed: 12.4,
    heading: 42,
    course: 40,
    destination: "Visakhapatnam",
    lastSeen: "2026-09-02T09:50:00Z",
    trajectory: [
      [12.858, 80.232],
      [12.862, 80.228],
      [12.866, 80.224],
      [12.869, 80.220],
      [12.872, 80.218],
    ],
    timestamps: [
      "2026-09-02T09:15:00Z",
      "2026-09-02T09:25:00Z",
      "2026-09-02T09:35:00Z",
      "2026-09-02T09:42:00Z",
      "2026-09-02T09:50:00Z",
    ],
  },
  {
    mmsi: "419003333",
    name: "MT NORTHERN STAR",
    imo: "9876400",
    vesselType: "Crude Oil Tanker",
    flag: "India",
    lat: 12.820,
    lon: 80.200,
    speed: 8.6,
    heading: 155,
    course: 152,
    destination: "Paradip Port",
    lastSeen: "2026-09-02T09:50:00Z",
    trajectory: [
      [12.835, 80.218],
      [12.831, 80.214],
      [12.827, 80.210],
      [12.823, 80.205],
      [12.820, 80.200],
    ],
    timestamps: [
      "2026-09-02T09:15:00Z",
      "2026-09-02T09:25:00Z",
      "2026-09-02T09:35:00Z",
      "2026-09-02T09:42:00Z",
      "2026-09-02T09:50:00Z",
    ],
  },
];

// ─── SOURCE ATTRIBUTION ─────────────────────────────────────────────

export const DEMO_ATTRIBUTIONS: VesselAttribution[] = [
  {
    vesselId: "419000782",
    vesselName: "MV OCEAN STAR",
    overallScore: 87,
    rank: 1,
    factors: [
      {
        label: "Distance from probable source",
        weight: 0.25,
        score: 82,
        description:
          "Vessel position 4.2 km from estimated spill origin — within high-confidence source zone",
      },
      {
        label: "Trajectory consistency",
        weight: 0.2,
        score: 95,
        description:
          "Vessel trajectory directly intersects probable source region along the spill axis",
      },
      {
        label: "Temporal consistency",
        weight: 0.2,
        score: 91,
        description:
          "Vessel passed source area 38 minutes before satellite acquisition",
      },
      {
        label: "Heading consistency",
        weight: 0.1,
        score: 78,
        description:
          "Vessel heading (248°) aligns with spill geometry orientation (245°)",
      },
      {
        label: "Drift/backtrack consistency",
        weight: 0.15,
        score: 88,
        description:
          "Backtracked drift path intersects vessel trajectory with high temporal overlap",
      },
      {
        label: "AIS behaviour evidence",
        weight: 0.1,
        score: 85,
        description:
          "Vessel exhibited unusual speed reduction (14.2 kn → 4.1 kn) near source area",
      },
    ],
    reasons: [
      "✓ Trajectory intersects probable source region",
      "✓ Vessel passed source area 38 minutes before detection",
      "✓ Heading consistent with spill geometry (248° vs 245°)",
      "✓ Backtracked drift intersects vessel trajectory",
      "✓ Distance from estimated origin: 4.2 km",
      "✓ Unusual speed reduction near source area",
      "⚠ Requires field/investigative confirmation",
    ],
  },
  {
    vesselId: "419001234",
    vesselName: "MT PACIFIC DAWN",
    overallScore: 41,
    rank: 2,
    factors: [
      {
        label: "Distance from probable source",
        weight: 0.25,
        score: 45,
        description: "Vessel 6.8 km from origin — outside primary source zone",
      },
      {
        label: "Trajectory consistency",
        weight: 0.2,
        score: 30,
        description:
          "Trajectory does not intersect source region; vessel heading away from spill",
      },
      {
        label: "Temporal consistency",
        weight: 0.2,
        score: 55,
        description: "Vessel was in the area at the relevant time",
      },
      {
        label: "Heading consistency",
        weight: 0.1,
        score: 18,
        description:
          "Heading (190°) inconsistent with spill geometry orientation",
      },
      {
        label: "Drift/backtrack consistency",
        weight: 0.15,
        score: 35,
        description: "Minimal overlap with backtracked drift path",
      },
      {
        label: "AIS behaviour evidence",
        weight: 0.1,
        score: 52,
        description: "Normal transit behaviour — no anomalies detected",
      },
    ],
    reasons: [
      "✗ Heading inconsistent with spill orientation",
      "✗ Trajectory does not pass through source region",
      "✓ Was in area during detection window",
      "✓ Speed and behaviour normal for transit",
    ],
  },
  {
    vesselId: "419009876",
    vesselName: "FV SEA HORIZON",
    overallScore: 34,
    rank: 3,
    factors: [
      {
        label: "Distance from probable source",
        weight: 0.25,
        score: 70,
        description: "Relatively close — 3.1 km from origin",
      },
      {
        label: "Trajectory consistency",
        weight: 0.2,
        score: 15,
        description:
          "Fishing vessel trajectory does not align with spill axis",
      },
      {
        label: "Temporal consistency",
        weight: 0.2,
        score: 60,
        description: "Present in area during detection window",
      },
      {
        label: "Heading consistency",
        weight: 0.1,
        score: 12,
        description: "Heading (312°) entirely inconsistent with spill orientation",
      },
      {
        label: "Drift/backtrack consistency",
        weight: 0.15,
        score: 20,
        description: "Fishing vessel pattern not relevant to spill origin",
      },
      {
        label: "AIS behaviour evidence",
        weight: 0.1,
        score: 45,
        description: "Typical fishing vessel behaviour — low speed, local area",
      },
    ],
    reasons: [
      "✗ Small fishing vessel — low likelihood of significant spill",
      "✗ Heading entirely inconsistent with spill geometry",
      "✓ Was relatively close to origin",
      "✓ Present during relevant time window",
    ],
  },
  {
    vesselId: "419005555",
    vesselName: "MV CORAL BREEZE",
    overallScore: 28,
    rank: 4,
    factors: [
      {
        label: "Distance from probable source",
        weight: 0.25,
        score: 55,
        description: "4.9 km from origin — moderate distance",
      },
      {
        label: "Trajectory consistency",
        weight: 0.2,
        score: 10,
        description: "Vessel heading away from spill; trajectory diverges",
      },
      {
        label: "Temporal consistency",
        weight: 0.2,
        score: 40,
        description: "Was in area but transiting through",
      },
      {
        label: "Heading consistency",
        weight: 0.1,
        score: 8,
        description: "Heading (42°) completely inconsistent with spill",
      },
      {
        label: "Drift/backtrack consistency",
        weight: 0.15,
        score: 15,
        description: "No meaningful overlap with drift model",
      },
      {
        label: "AIS behaviour evidence",
        weight: 0.1,
        score: 60,
        description: "Normal cargo vessel transit — steady speed and heading",
      },
    ],
    reasons: [
      "✗ Heading (42°) completely opposes spill direction",
      "✗ Steady transit — no behavioural anomalies",
      "✓ Was in the broader area",
    ],
  },
  {
    vesselId: "419003333",
    vesselName: "MT NORTHERN STAR",
    overallScore: 22,
    rank: 5,
    factors: [
      {
        label: "Distance from probable source",
        weight: 0.25,
        score: 25,
        description: "5.4 km from origin — outside source zone",
      },
      {
        label: "Trajectory consistency",
        weight: 0.2,
        score: 8,
        description: "Trajectory diverges from source region",
      },
      {
        label: "Temporal consistency",
        weight: 0.2,
        score: 35,
        description: "Present in wider area at detection time",
      },
      {
        label: "Heading consistency",
        weight: 0.1,
        score: 22,
        description: "Heading (155°) inconsistent with spill orientation",
      },
      {
        label: "Drift/backtrack consistency",
        weight: 0.15,
        score: 18,
        description: "Minimal drift overlap",
      },
      {
        label: "AIS behaviour evidence",
        weight: 0.1,
        score: 30,
        description: "Normal tanker transit — consistent speed",
      },
    ],
    reasons: [
      "✗ Lowest proximity to estimated origin",
      "✗ No trajectory alignment with spill",
      "✓ Normal tanker operations",
    ],
  },
];

// ─── BEHAVIOR ANOMALIES ─────────────────────────────────────────────

export const DEMO_ANOMALIES: BehaviorAnomaly[] = [
  {
    vesselId: "419000782",
    vesselName: "MV OCEAN STAR",
    anomalyLevel: "HIGH",
    evidence: [
      "Speed changed from 14.2 kn → 4.1 kn over 21 minutes",
      "Course deviation: 31° from planned route",
      "Entered probable source corridor at reduced speed",
      "Extended low-speed duration inconsistent with normal transit",
    ],
    speedChange: "14.2 kn → 4.1 kn (21 min)",
    courseDeviation: "31° from planned route",
    loitering: "21 minutes in source corridor",
    routeDeviation: "31° deviation from standard shipping lane",
  },
  {
    vesselId: "419001234",
    vesselName: "MT PACIFIC DAWN",
    anomalyLevel: "LOW",
    evidence: [
      "Consistent speed throughout transit",
      "Normal heading for destination (Ennore Port)",
      "No significant course deviations",
    ],
  },
  {
    vesselId: "419009876",
    vesselName: "FV SEA HORIZON",
    anomalyLevel: "LOW",
    evidence: [
      "Typical fishing vessel speed and movement pattern",
      "Operating within normal fishing grounds",
      "No unusual behaviour detected",
    ],
  },
  {
    vesselId: "419005555",
    vesselName: "MV CORAL BREEZE",
    anomalyLevel: "LOW",
    evidence: [
      "Steady transit at 12.4 kn",
      "Normal cargo vessel routing to Visakhapatnam",
      "No behavioural anomalies",
    ],
  },
  {
    vesselId: "419003333",
    vesselName: "MT NORTHERN STAR",
    anomalyLevel: "LOW",
    evidence: [
      "Consistent transit speed",
      "Standard tanker routing",
      "No anomalies detected",
    ],
  },
];

// ─── ENVIRONMENTAL CONDITIONS ───────────────────────────────────────

export const DEMO_ENVIRONMENTAL: EnvironmentalConditions = {
  windSpeed: 12.3,
  windDirection: 225,
  windDirectionLabel: "SW",
  currentSpeed: 0.8,
  currentDirection: 240,
  currentDirectionLabel: "WSW",
  waveHeight: 1.2,
  waveDirection: 235,
  seaSurfaceTemp: 28.4,
  timestamp: "2026-09-02T09:42:00Z",
};

// ─── DRIFT MODEL ────────────────────────────────────────────────────

export const DEMO_DRIFT: OilDriftResult = {
  mode: "demonstration",
  forward: [
    {
      time: "T+0h (09:42 UTC)",
      center: [12.8471, 80.2418],
      polygon: DEMO_INCIDENT.polygon.coordinates,
      confidence: 100,
    },
    {
      time: "T+6h (15:42 UTC)",
      center: [12.840, 80.228],
      polygon: [
        [12.845, 80.215],
        [12.852, 80.225],
        [12.848, 80.238],
        [12.840, 80.242],
        [12.833, 80.234],
        [12.830, 80.223],
        [12.837, 80.213],
        [12.845, 80.215],
      ],
      confidence: 85,
    },
    {
      time: "T+12h (21:42 UTC)",
      center: [12.832, 80.214],
      polygon: [
        [12.838, 80.198],
        [12.847, 80.210],
        [12.842, 80.226],
        [12.833, 80.232],
        [12.824, 80.222],
        [12.819, 80.207],
        [12.825, 80.195],
        [12.838, 80.198],
      ],
      confidence: 65,
    },
    {
      time: "T+24h (09:42 UTC +1)",
      center: [12.818, 80.188],
      polygon: [
        [12.825, 80.168],
        [12.836, 80.183],
        [12.830, 80.205],
        [12.818, 80.215],
        [12.805, 80.200],
        [12.798, 80.182],
        [12.810, 80.165],
        [12.825, 80.168],
      ],
      confidence: 42,
    },
    {
      time: "T+48h (09:42 UTC +2)",
      center: [12.795, 80.155],
      polygon: [
        [12.805, 80.128],
        [12.820, 80.148],
        [12.812, 80.178],
        [12.795, 80.192],
        [12.778, 80.170],
        [12.770, 80.145],
        [12.785, 80.125],
        [12.805, 80.128],
      ],
      confidence: 22,
    },
  ],
  backtrack: [
    {
      time: "T−0h (09:42 UTC)",
      center: [12.8471, 80.2418],
      polygon: DEMO_INCIDENT.polygon.coordinates,
      confidence: 100,
    },
    {
      time: "T−1h (08:42 UTC)",
      center: [12.853, 80.252],
      polygon: [
        [12.858, 80.242],
        [12.863, 80.250],
        [12.859, 80.261],
        [12.852, 80.265],
        [12.845, 80.257],
        [12.842, 80.247],
        [12.848, 80.240],
        [12.858, 80.242],
      ],
      confidence: 78,
    },
    {
      time: "T−2h (07:42 UTC)",
      center: [12.860, 80.262],
      polygon: [
        [12.865, 80.252],
        [12.870, 80.260],
        [12.866, 80.272],
        [12.858, 80.276],
        [12.850, 80.268],
        [12.848, 80.258],
        [12.854, 80.250],
        [12.865, 80.252],
      ],
      confidence: 52,
    },
  ],
};

// ─── HYPERSPECTRAL ANALYSIS ─────────────────────────────────────────

export const DEMO_HYPERSPECTRAL: HyperspectralResult = {
  mode: "demonstration",
  estimatedClass: "Thick",
  confidence: 78,
  uncertainty: "± one thickness class",
  disclaimer:
    "Experimental estimate — requires calibrated hyperspectral measurements and field validation.",
  thicknessClasses: [
    { label: "Thin Sheen", range: "0.1–1 µm", color: "#94a3b8", percentage: 8 },
    { label: "Moderate", range: "1–10 µm", color: "#64748b", percentage: 22 },
    { label: "Thick", range: "10–100 µm", color: "#334155", percentage: 52 },
    { label: "Very Thick", range: ">100 µm", color: "#1e293b", percentage: 18 },
  ],
  spectralSignatures: Array.from({ length: 50 }, (_, i) => {
    const wl = 400 + i * 16;
    const base = Math.sin((wl - 400) / 200) * 0.3 + 0.5;
    return {
      wavelength: wl,
      intensity: base + Math.random() * 0.1,
      oilAbsorption:
        wl > 1600 && wl < 1800
          ? 0.7 + Math.random() * 0.2
          : wl > 2100 && wl < 2400
            ? 0.5 + Math.random() * 0.15
            : 0.1 + Math.random() * 0.1,
    };
  }),
};

// ─── INVESTIGATION TIMELINE ─────────────────────────────────────────

export const DEMO_TIMELINE: TimelineEvent[] = [
  { time: "09:05", event: "Vessel MV OCEAN STAR entered investigation area", category: "vessel" },
  { time: "09:12", event: "MV OCEAN STAR speed reduced from 14.2 kn", category: "vessel" },
  { time: "09:17", event: "Vessel course deviation of 31° detected", category: "vessel" },
  { time: "09:42", event: "Sentinel-1 SAR satellite acquisition", category: "detection" },
  { time: "09:48", event: "Possible oil slick detected — confidence 91%", category: "detection" },
  { time: "09:49", event: "Spill polygon generated — 14.7 km², 8.2 km length", category: "analysis" },
  { time: "09:50", event: "AIS vessel correlation completed — 5 candidates identified", category: "analysis" },
  { time: "09:52", event: "Drift backtracking completed — probable origin identified", category: "analysis" },
  { time: "09:54", event: "Forward drift prediction computed (T+6h to T+48h)", category: "analysis" },
  { time: "09:56", event: "Vessel source attribution ranking completed", category: "analysis" },
  { time: "10:00", event: "AIS behaviour anomaly analysis completed", category: "analysis" },
  { time: "10:02", event: "Hyperspectral thickness analysis completed", category: "analysis" },
  { time: "10:04", event: "Vessel behaviour anomaly indicators compiled", category: "analysis" },
  { time: "10:05", event: "Investigation report generated", category: "report" },
];
