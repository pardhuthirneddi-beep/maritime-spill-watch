// MARIS — Investigation Report Generator
// Generates PDF and JSON evidence records

import { jsPDF } from "jspdf";
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

interface ReportData {
  incident: OilSpillIncident;
  vessels: AisVessel[];
  attributions: VesselAttribution[];
  anomalies: BehaviorAnomaly[];
  environmental: EnvironmentalConditions;
  drift: OilDriftResult | null;
  hyperspectral: HyperspectralResult | null;
  timeline: TimelineEvent[];
}

const DISCLAIMER =
  "Automated analytical result generated for decision support. Not a legal determination of responsibility. " +
  "All vessel attributions are probabilistic estimates requiring field verification. " +
  "This report was generated using demonstration data.";

export function generateJsonReport(data: ReportData): string {
  const report = {
    reportType: "maris Investigation Report",
    generatedAt: new Date().toISOString(),
    disclaimer: DISCLAIMER,
    incident: data.incident,
    satelliteAnalysis: {
      mode: data.incident.detectionMode.toUpperCase(),
      confidence: data.incident.confidence,
      polygon: data.incident.polygon,
      detectionTime: data.incident.detectedAt,
    },
    aisVesselCorrelation: data.vessels.map((v) => ({
      name: v.name,
      mmsi: v.mmsi,
      imo: v.imo,
      vesselType: v.vesselType,
      position: { lat: v.lat, lon: v.lon },
      speed: v.speed,
      heading: v.heading,
    })),
    sourceAttribution: data.attributions.map((a) => ({
      rank: a.rank,
      vessel: a.vesselName,
      overallScore: a.overallScore,
      factors: a.factors,
      reasons: a.reasons,
    })),
    behaviorAnomalies: data.anomalies.map((a) => ({
      vessel: a.vesselName,
      anomalyLevel: a.anomalyLevel,
      evidence: a.evidence,
    })),
    environmentalConditions: data.environmental,
    driftAnalysis: data.drift,
    hyperspectralAnalysis: data.hyperspectral,
    investigationTimeline: data.timeline,
    methodology: {
      detection: "SAR-based dark-spot detection with contextual filtering",
      attribution:
        "Multi-factor scoring engine (distance, trajectory, temporal, heading, drift, behaviour)",
      drift:
        "Analytical drift model using wind and current vectors (demonstration mode)",
      hyperspectral:
        "Spectral classification using synthetic hyperspectral cube (experimental)",
    },
    limitations: [
      "All data in this report is demonstration/synthetic data",
      "Detection results require validation with calibrated satellite data",
      "Source attribution is probabilistic, not deterministic",
      "Drift predictions are based on demonstration environmental conditions",
      "Hyperspectral thickness estimates are experimental and require field validation",
      "This is a prototype system — not operational software",
    ],
  };

  return JSON.stringify(report, null, 2);
}

export function generatePdfReport(data: ReportData): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  const margin = 15;
  const contentW = pageW - 2 * margin;
  let y = margin;

  // Header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("maris", margin, y);
  y += 7;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("Maritime Oil Spill Intelligence & Source Attribution System", margin, y);
  y += 4;
  doc.text("Investigation Report — Prototype / Demonstration", margin, y);
  y += 10;

  // Separator
  doc.setDrawColor(180, 180, 180);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  // Incident Summary
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("INCIDENT SUMMARY", margin, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const fields: [string, string][] = [
    ["Incident ID", data.incident.incidentNumber],
    ["Status", data.incident.status.toUpperCase()],
    ["Label", data.incident.label],
    ["Detection Mode", data.incident.detectionMode.toUpperCase()],
    ["Detection Time", data.incident.detectedAt],
    [
      "Coordinates",
      `${data.incident.coordinates[0].toFixed(4)}°N, ${data.incident.coordinates[1].toFixed(4)}°E`,
    ],
    ["Spill Area", `${data.incident.polygon.areaKm2} km²`],
    ["Spill Length", `${data.incident.polygon.lengthKm} km`],
    ["Confidence", `${data.incident.confidence.score}%`],
    ["Sea State", data.incident.seaState],
  ];

  for (const [label, value] of fields) {
    doc.setFont("helvetica", "bold");
    doc.text(label + ":", margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, margin + 50, y);
    y += 6;
  }
  y += 4;

  // Confidence Factors
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Detection Confidence Factors", margin, y);
  y += 6;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  for (const factor of data.incident.confidence.factors) {
    doc.text("• " + factor, margin + 2, y);
    y += 5;
  }
  y += 6;

  // Source Attribution
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("SOURCE ATTRIBUTION RANKING", margin, y);
  y += 8;

  for (const attr of data.attributions) {
    if (y > 260) {
      doc.addPage();
      y = margin;
    }
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`#${attr.rank}  ${attr.vesselName} — Score: ${attr.overallScore}/100`, margin, y);
    y += 6;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    for (const reason of attr.reasons) {
      doc.text("   " + reason, margin, y);
      y += 4;
    }
    y += 4;
  }

  // Behaviour Anomalies
  if (y > 220) {
    doc.addPage();
    y = margin;
  }
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("VESSEL BEHAVIOUR ANALYSIS", margin, y);
  y += 8;

  for (const anomaly of data.anomalies) {
    if (y > 260) {
      doc.addPage();
      y = margin;
    }
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`${anomaly.vesselName} — Anomaly: ${anomaly.anomalyLevel}`, margin, y);
    y += 5;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    for (const e of anomaly.evidence) {
      doc.text("   • " + e, margin, y);
      y += 4;
    }
    y += 3;
  }

  // Environmental
  if (y > 230) {
    doc.addPage();
    y = margin;
  }
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("ENVIRONMENTAL CONDITIONS", margin, y);
  y += 8;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const envFields: [string, string][] = [
    ["Wind", `${data.environmental.windSpeed} kn from ${data.environmental.windDirectionLabel}`],
    [
      "Current",
      `${data.environmental.currentSpeed} kn from ${data.environmental.currentDirectionLabel}`,
    ],
    ["Wave Height", `${data.environmental.waveHeight} m`],
    ["Sea Surface Temp", `${data.environmental.seaSurfaceTemp}°C`],
  ];

  for (const [l, v] of envFields) {
    doc.text(l + ": " + v, margin, y);
    y += 5;
  }
  y += 6;

  // Hyperspectral
  if (data.hyperspectral) {
    if (y > 230) {
      doc.addPage();
      y = margin;
    }
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("OIL THICKNESS ANALYSIS (HYPERSPECTRAL)", margin, y);
    y += 8;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Estimated Class: ${data.hyperspectral.estimatedClass}`, margin, y);
    y += 5;
    doc.text(`Confidence: ${data.hyperspectral.confidence}%`, margin, y);
    y += 5;
    doc.text(`Uncertainty: ${data.hyperspectral.uncertainty}`, margin, y);
    y += 5;
    doc.text(`Mode: ${data.hyperspectral.mode.toUpperCase()}`, margin, y);
    y += 5;
    doc.text(data.hyperspectral.disclaimer, margin, y);
    y += 10;
  }

  // Timeline
  if (y > 220) {
    doc.addPage();
    y = margin;
  }
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("INVESTIGATION TIMELINE", margin, y);
  y += 8;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  for (const event of data.timeline) {
    if (y > 270) {
      doc.addPage();
      y = margin;
    }
    doc.setFont("helvetica", "bold");
    doc.text(event.time, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(event.event, margin + 18, y);
    y += 4.5;
  }
  y += 6;

  // Limitations
  if (y > 220) {
    doc.addPage();
    y = margin;
  }
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("METHODOLOGY & LIMITATIONS", margin, y);
  y += 8;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  const methodology: Record<string, string> = {
    detection: "SAR-based dark-spot detection with contextual filtering",
    attribution: "Multi-factor scoring engine (distance, trajectory, temporal, heading, drift, behaviour)",
    drift: "Analytical drift model using wind and current vectors (demonstration mode)",
    hyperspectral: "Spectral classification using synthetic hyperspectral cube (experimental)",
  };
  for (const lim of Object.entries(methodology)) {
    doc.text(`${lim[0]}: ${lim[1]}`, margin, y);
    y += 4.5;
  }
  y += 3;
  for (const lim of [
    "All data in this report is demonstration/synthetic data",
    "Detection results require validation with calibrated satellite data",
    "Source attribution is probabilistic, not deterministic",
    "Drift predictions based on demonstration environmental conditions",
    "Hyperspectral thickness estimates are experimental",
    "This is a prototype system — not operational software",
  ]) {
    doc.text("• " + lim, margin, y);
    y += 4.5;
  }

  // Disclaimer footer
  y += 6;
  if (y > 260) {
    doc.addPage();
    y = margin;
  }
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text(DISCLAIMER, margin, y, { maxWidth: contentW });

  return doc;
}
