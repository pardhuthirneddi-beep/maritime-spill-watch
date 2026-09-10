// maris — Scientific SAR Imagery Viewer
// A dedicated remote-sensing workstation for viewing and analysing SAR data
import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  Orbit,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Info,
  Crosshair,
  Grid3x3,
  Layers,
  ArrowLeft,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEMO_SAR_SCENE,
  DEMO_SAR_DETECTIONS,
  DEMO_SAR_ANALYSIS,
  DEMO_INCIDENT,
} from "@/data/demoData";
import { ensureIncidentFromDetection } from "@/data/incidentStore";
import { useIncidentStore } from "@/hooks/useIncidents";
import type { SarScene, SarDetectionRegion, SarAnalysisResult, LatLon } from "@/data/types";

interface SarViewerProps {
  onBack: () => void;
}

// ─── SAR IMAGE GENERATOR ────────────────────────────────────────────
// Creates a procedural SAR-like image on canvas for demonstration

function generateSarImage(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  detections: SarDetectionRegion[]
) {
  // Base ocean texture — dark SAR look
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      // Base ocean noise
      const noise = Math.random() * 40 + 60;
      // Slight gradient for sea texture
      const gradient = Math.sin(x * 0.02 + y * 0.01) * 15;
      const speckle = (Math.random() - 0.5) * 20;

      let val = noise + gradient + speckle;

      // Add darker regions for oil slick areas (mapped from polygon coords)
      if (detections.length > 0) {
        const det = detections[0];
        const nx = (x / width) * (det.polygon[2][1] - det.polygon[0][1]) + det.polygon[0][1];
        const ny = (y / height) * (det.polygon[2][0] - det.polygon[0][0]) + det.polygon[0][0];

        // Check proximity to spill center
        const dx = nx - det.center[1];
        const dy = ny - det.center[0];
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Create elongated dark region
        const angle = Math.atan2(dy, dx);
        const elongation = 2.5;
        const elongDist = Math.sqrt(
          (dx * Math.cos(angle)) ** 2 + ((dy * Math.sin(angle)) / elongation) ** 2
        );

        if (elongDist < 0.04 && Math.abs(angle - 0.4) < 0.8) {
          val = Math.max(15, val - 50 - Math.random() * 20);
        }
      }

      // Add some wave patterns
      const wave = Math.sin(x * 0.15 + y * 0.08) * 5;
      val += wave;

      const clamped = Math.max(0, Math.min(255, Math.round(val)));
      data[idx] = clamped;
      data[idx + 1] = clamped;
      data[idx + 2] = clamped + 2;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  // Add grid lines
  ctx.strokeStyle = "rgba(100, 200, 255, 0.08)";
  ctx.lineWidth = 0.5;
  for (let x = 0; x < width; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Add coordinate labels on edges
  ctx.fillStyle = "rgba(100, 200, 255, 0.3)";
  ctx.font = "7px monospace";
  ctx.fillText("12.25°N", 4, 12);
  ctx.fillText("11.85°N", 4, height - 4);
  ctx.fillText("86.72°E", width - 48, height - 4);
  ctx.fillText("87.22°E", width - 48, 12);
}

function drawDetectionOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  detections: SarDetectionRegion[],
  opacity: number
) {
  if (opacity <= 0) return;

  ctx.globalAlpha = opacity;

  detections.forEach((det, i) => {
    if (det.classification !== "possible_oil") return;

    const colors = ["#fb923c", "#f97316", "#ea580c"];
    const color = colors[i % colors.length];

    // Draw polygon
    ctx.beginPath();
    det.polygon.forEach((p, j) => {
      const x = ((p[1] - 86.72) / (87.22 - 86.72)) * width;
      const y = ((p[0] - 11.85) / (12.25 - 11.85)) * height;
      if (j === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = color + "40";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label
    const lx = ((det.center[1] - 86.72) / (87.22 - 86.72)) * width;
    const ly = ((det.center[0] - 11.85) / (12.25 - 11.85)) * height;

    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(lx - 60, ly - 18, 120, 22);
    ctx.fillStyle = color;
    ctx.font = "bold 9px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`CONFIDENCE: ${det.confidence}%`, lx, ly - 5);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "8px sans-serif";
    ctx.fillText(det.label, lx, ly + 1);
    ctx.textAlign = "left";
  });

  // Draw low-wind region
  detections.forEach((det) => {
    if (det.classification !== "low_wind") return;

    ctx.beginPath();
    det.polygon.forEach((p, j) => {
      const x = ((p[1] - 86.72) / (87.22 - 86.72)) * width;
      const y = ((p[0] - 11.85) / (12.25 - 11.85)) * height;
      if (j === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    const lx = ((det.center[1] - 86.72) / (87.22 - 86.72)) * width;
    const ly = ((det.center[0] - 11.85) / (12.25 - 11.85)) * height;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(lx - 50, ly - 6, 100, 12);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "8px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Low-wind zone", lx, ly + 3);
    ctx.textAlign = "left";
  });

  ctx.globalAlpha = 1;
}

// ─── MAIN SAR VIEWER COMPONENT ─────────────────────────────────────

export default function SarViewer({ onBack }: SarViewerProps) {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [overlayOpacity, setOverlayOpacity] = useState(0.7);
  const [showGrid, setShowGrid] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedDetection, setSelectedDetection] = useState<SarDetectionRegion | null>(null);
  const [mouseCoords, setMouseCoords] = useState<string>("—");

  const scene: SarScene = DEMO_SAR_SCENE;
  const detections: SarDetectionRegion[] = DEMO_SAR_DETECTIONS;
  const analysis: SarAnalysisResult = DEMO_SAR_ANALYSIS;

  // SAR → Incident pipeline: the primary possible-oil detection registers
  // with the centralized incident store. Deduplication guarantees the same
  // observation maps to the EXISTING incident (never a duplicate).
  useEffect(() => {
    const primary = detections.find((d) => d.classification === "possible_oil");
    if (!primary) return;
    ensureIncidentFromDetection({
      detectionId: primary.id,
      latitude: primary.center[0],
      longitude: primary.center[1],
      areaKm2: primary.areaKm2,
      confidence: primary.confidence,
      detectionSource: `${scene.satellite} SAR`,
      sceneId: scene.sceneId,
      sourceIncidentId: DEMO_INCIDENT.id,
      detectedAt: scene.acquisitionTime,
    });
  }, [detections, scene]);

  // Linked incident state (centralized store).
  const incidentStore = useIncidentStore();
  const linkedIncident =
    incidentStore.incidents.find(
      (i) => i.detectionId === detections[0]?.id,
    ) ?? null;

  // Draw the SAR image
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    generateSarImage(ctx, canvas.width, canvas.height, detections);

    if (showOverlay) {
      drawDetectionOverlay(ctx, canvas.width, canvas.height, detections, overlayOpacity);
    }

    if (showGrid) {
      ctx.strokeStyle = "rgba(100, 200, 255, 0.12)";
      ctx.lineWidth = 0.3;
      for (let x = 0; x < canvas.width; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 64) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    }

    ctx.restore();
  }, [zoom, pan, showOverlay, overlayOpacity, showGrid, detections]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      drawCanvas();
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [drawCanvas]);

  // Mouse handlers for pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsPanning(true);
      setLastMouse({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan((prev) => ({
        x: prev.x + (e.clientX - lastMouse.x),
        y: prev.y + (e.clientY - lastMouse.y),
      }));
      setLastMouse({ x: e.clientX, y: e.clientY });
    }

    // Update coordinate display
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left - pan.x) / zoom;
      const y = (e.clientY - rect.top - pan.y) / zoom;
      const lon = (x / canvas.width) * (87.22 - 86.72) + 86.72;
      const lat = (y / canvas.height) * (12.25 - 11.85) + 11.85;
      setMouseCoords(`${lat.toFixed(4)}°N  ${lon.toFixed(4)}°E`);
    }
  };

  const handleMouseUp = () => setIsPanning(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((prev) => Math.max(0.5, Math.min(5, prev * delta)));
  };

  const handleZoomIn = () => setZoom((prev) => Math.min(5, prev * 1.2));
  const handleZoomOut = () => setZoom((prev) => Math.max(0.5, prev / 1.2));
  const handleResetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  return (
    <div className="fixed inset-0 flex flex-col bg-[#08090c] text-zinc-100 overflow-hidden">
      {/* ─── TOP BAR ─────────────────────────────────────────────── */}
      <header className="flex h-10 items-center justify-between border-b border-sky-200/10/60 bg-[#0a0b10] px-4 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ArrowLeft className="size-3" />
            Back
          </button>
          <div className="h-4 w-px bg-zinc-800" />
          <span className="text-[10px] font-semibold tracking-[0.15em] text-zinc-300 uppercase">
            SAR Imagery Analysis
          </span>
          <div className="h-4 w-px bg-zinc-800" />
          <span className="text-[9px] font-mono text-zinc-600">
            {scene.sceneId.substring(0, 30)}…
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Open in 3D — bridges SAR detection to the spatial investigation view */}
          <button
            onClick={() => navigate("/3d-intelligence")}
            className="flex items-center gap-1.5 rounded border border-orange-500/50 bg-orange-500/10 px-2 py-1 text-[9px] font-medium text-orange-400 hover:bg-orange-500/20 transition-colors"
            title="Open this detection in the 3D Intelligence environment"
          >
            <Orbit className="size-3" />
            Open in 3D
          </button>
          {/* Zoom controls */}
          <div className="flex items-center gap-0.5 rounded border border-sky-200/10 bg-zinc-900/50">
            <button onClick={handleZoomOut} className="p-1 text-zinc-500 hover:text-zinc-300">
              <ZoomOut className="size-3" />
            </button>
            <span className="px-1.5 text-[9px] font-mono text-zinc-400 min-w-[3rem] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button onClick={handleZoomIn} className="p-1 text-zinc-500 hover:text-zinc-300">
              <ZoomIn className="size-3" />
            </button>
          </div>

          <button
            onClick={handleResetView}
            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Reset view"
          >
            <RotateCcw className="size-3" />
          </button>

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {isFullscreen ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ─── LEFT SIDEBAR — SCENE METADATA ────────────────────── */}
        <aside className="w-72 border-r border-sky-200/10/60 bg-[#0a0b10] overflow-y-auto flex-shrink-0">
          {/* Scene Info */}
          <div className="p-3 border-b border-sky-200/10/60">
            <h3 className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              Scene Metadata
            </h3>
            <div className="space-y-1.5">
              <MetaRow label="Satellite" value={scene.satellite} />
              <MetaRow label="Scene ID" value={scene.sceneId.substring(0, 28) + "…"} mono />
              <MetaRow label="Acquisition" value={new Date(scene.acquisitionTime).toLocaleString("en-GB", { hour12: false })} />
              <MetaRow label="Polarization" value={scene.polarization} />
              <MetaRow label="Resolution" value={`${scene.resolution} ${scene.resolutionUnit}`} />
              <MetaRow label="Mode" value={scene.mode} />
              <MetaRow label="Orbit" value={scene.orbit} />
              <MetaRow label="Processing" value={scene.processingLevel} />
              <MetaRow label="Processed" value={new Date(scene.processingDate).toLocaleString("en-GB", { hour12: false })} />
            </div>
          </div>

          {/* Detection Summary */}
          <div className="p-3 border-b border-sky-200/10/60">
            <h3 className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              Detection Summary
            </h3>
            <div className="space-y-1.5">
              <MetaRow label="Candidates" value={`${detections.length} identified`} />
              <MetaRow label="Primary" value={`${detections[0]?.confidence || 0}% confidence`} color="text-orange-400" />
              <MetaRow label="Area" value={`${detections[0]?.areaKm2 || 0} km²`} />
              <MetaRow label="Length" value={`${detections[0]?.lengthKm || 0} km`} />
              <MetaRow label="Processing" value={`${analysis.processingTime}s`} />
            </div>
          </div>

          {/* Analysis Pipeline */}
          <div className="p-3 border-b border-sky-200/10/60">
            <h3 className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              Processing Pipeline
            </h3>
            <div className="space-y-1">
              {analysis.preprocessingSteps.map((step, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[8px] text-zinc-600 font-mono mt-0.5 w-3 shrink-0">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[9px] text-zinc-400 leading-tight">{step}</span>
                </div>
              ))}
            </div>
          </div>

          {/* False Positive Screening */}
          <div className="p-3 border-b border-sky-200/10/60">
            <h3 className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              False Positive Screening
            </h3>
            <div className="space-y-1">
              {analysis.falsePositiveScreening.map((item, i) => (
                <div key={i} className="text-[9px] text-zinc-500 flex items-start gap-1.5">
                  <span className="text-zinc-600">•</span>
                  {item}
                </div>
              ))}
            </div>
          </div>

          {/* Selected Detection Detail */}
          {selectedDetection && (
            <div className="p-3 border-b border-sky-200/10/60">
              <h3 className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                Detection Detail
              </h3>
              <div className="rounded border border-sky-200/10 bg-zinc-900/30 p-2">
                <div className="text-[10px] font-semibold text-zinc-200 mb-1">
                  {selectedDetection.label}
                </div>
                <div className="space-y-1">
                  <MetaRow label="Classification" value={selectedDetection.classification.replace("_", " ")} />
                  <MetaRow label="Confidence" value={`${selectedDetection.confidence}%`} color="text-orange-400" />
                  <MetaRow label="Area" value={`${selectedDetection.areaKm2} km²`} />
                  <MetaRow label="Length" value={`${selectedDetection.lengthKm} km`} />
                  <MetaRow label="Center" value={`${selectedDetection.center[0].toFixed(4)}°N, ${selectedDetection.center[1].toFixed(4)}°E`} mono />
                </div>
                <div className="mt-2 space-y-0.5">
                  {selectedDetection.confidenceFactors.map((f, i) => (
                    <div key={i} className="text-[8px] text-zinc-500">• {f}</div>
                  ))}
                </div>
                {selectedDetection.classification === "possible_oil" && (
                  <button
                    onClick={() => navigate("/3d-intelligence")}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded border border-orange-500/50 bg-orange-500/10 px-2 py-1.5 text-[9px] font-medium text-orange-400 hover:bg-orange-500/20 transition-colors"
                  >
                    <Orbit className="size-3" />
                    Open in 3D
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Demo Badge */}
          <div className="p-3">
            <div className="rounded border border-amber-500/20 bg-amber-500/5 p-2">
              <div className="flex items-center gap-1.5 text-[8px] text-amber-400/70">
                <Info className="size-3 shrink-0" />
                Demonstration data — synthetic SAR imagery and detection results.
                Not derived from live Sentinel-1 feeds.
              </div>
            </div>
          </div>
        </aside>

        {/* ─── MAIN IMAGE AREA ────────────────────────────────────── */}
        <main className="flex-1 relative overflow-hidden bg-[#050608]">
          {/* Canvas */}
          <div
            ref={containerRef}
            className="absolute inset-0 cursor-grab active:cursor-grabbing"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          >
            <canvas
              ref={canvasRef}
              className="w-full h-full"
              style={{ imageRendering: "pixelated" }}
            />
          </div>

          {/* Coordinate readout */}
          <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded border border-sky-200/10/80 bg-[#0a0b10]/90 px-2 py-1">
              <Crosshair className="size-2.5 text-zinc-600" />
              <span className="text-[9px] font-mono text-zinc-400">{mouseCoords}</span>
            </div>
          </div>

          {/* Image info overlay */}
          <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
            <div className="rounded border border-sky-200/10/80 bg-[#0a0b10]/90 px-2 py-1">
              <span className="text-[8px] text-zinc-500">
                {scene.satellite} · {scene.polarization} · {scene.resolution}m · {scene.imageWidth}×{scene.imageHeight}
              </span>
            </div>
          </div>

          {/* Scale bar */}
          <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5">
            <div className="flex items-center gap-0.5 rounded border border-sky-200/10/80 bg-[#0a0b10]/90 px-2 py-1">
              <div className="w-12 h-px bg-zinc-400" />
              <span className="text-[8px] font-mono text-zinc-500">
                {Math.round(10 / zoom * 5)} km
              </span>
            </div>
          </div>

          {/* Layer controls overlay */}
          <div className="absolute top-3 right-3 z-10">
            <div className="rounded border border-sky-200/10/80 bg-[#0a0b10]/90 p-2 space-y-1.5">
              <button
                onClick={() => setShowOverlay(!showOverlay)}
                className={cn(
                  "flex items-center gap-1.5 text-[9px] w-full px-1.5 py-0.5 rounded transition-colors",
                  showOverlay ? "text-orange-400 bg-orange-500/10" : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                {showOverlay ? <Eye className="size-2.5" /> : <EyeOff className="size-2.5" />}
                Detection Overlay
              </button>
              <button
                onClick={() => setShowGrid(!showGrid)}
                className={cn(
                  "flex items-center gap-1.5 text-[9px] w-full px-1.5 py-0.5 rounded transition-colors",
                  showGrid ? "text-cyan-400 bg-cyan-500/10" : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                <Grid3x3 className="size-2.5" />
                Coordinate Grid
              </button>
              {showOverlay && (
                <div className="px-1.5 pt-1">
                  <div className="text-[8px] text-zinc-600 mb-1">Opacity</div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={overlayOpacity * 100}
                    onChange={(e) => setOverlayOpacity(Number(e.target.value) / 100)}
                    className="w-full h-1 accent-orange-500"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Detection legend */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10">
            <div className="flex items-center gap-3 rounded border border-sky-200/10/80 bg-[#0a0b10]/90 px-3 py-1.5">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 bg-orange-500 border border-dashed border-orange-500" />
                <span className="text-[8px] text-zinc-500">Possible Oil Slick</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 bg-zinc-500 border border-dashed border-zinc-500" />
                <span className="text-[8px] text-zinc-500">Low-wind / Natural</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-zinc-700" />
                <span className="text-[8px] text-zinc-500">Speckle noise</span>
              </div>
            </div>
          </div>
        </main>

        {/* ─── RIGHT PANEL — DETECTION LIST ──────────────────────── */}
        <aside className="w-64 border-l border-sky-200/10/60 bg-[#0a0b10] overflow-y-auto flex-shrink-0">
          <div className="p-3 border-b border-sky-200/10/60">
            <h3 className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider">
              Detected Candidates
            </h3>
          </div>

          <div className="p-2 space-y-1">
            {detections.map((det) => (
              <button
                key={det.id}
                onClick={() => setSelectedDetection(det)}
                className={cn(
                  "w-full text-left rounded border p-2 transition-colors",
                  selectedDetection?.id === det.id
                    ? "border-orange-500/40 bg-orange-500/5"
                    : "border-sky-200/10/60 bg-zinc-900/20 hover:border-zinc-700"
                )}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] font-semibold text-zinc-200">
                    {det.id}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-bold",
                      det.classification === "possible_oil" ? "text-orange-400" : "text-zinc-500"
                    )}
                  >
                    {det.confidence}%
                  </span>
                </div>
                <div className="text-[9px] text-zinc-500 truncate">{det.label}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[8px] text-zinc-600">{det.areaKm2} km²</span>
                  <span className="text-[8px] text-zinc-600">{det.lengthKm} km</span>
                  <span className={cn(
                    "text-[7px] px-1 rounded",
                    det.classification === "possible_oil"
                      ? "bg-orange-500/20 text-orange-400"
                      : "bg-zinc-800 text-zinc-500"
                  )}>
                    {det.classification.replace("_", " ")}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Confidence factors for primary */}
          <div className="p-3 border-t border-sky-200/10/60">
            <h3 className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              Confidence Factors
            </h3>
            <div className="space-y-1.5">
              {DEMO_INCIDENT.confidence.factors.map((f, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <div className="mt-1 w-1 h-1 rounded-full bg-orange-500 shrink-0" />
                  <span className="text-[9px] text-zinc-400 leading-tight">{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Coordinates */}
          <div className="p-3 border-t border-sky-200/10/60">
            <h3 className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              Geographic Bounds
            </h3>
            <div className="space-y-1">
              <MetaRow label="NW" value={`${scene.boundingBox[0][0].toFixed(2)}°N, ${scene.boundingBox[0][1].toFixed(2)}°E`} mono />
              <MetaRow label="SE" value={`${scene.boundingBox[1][0].toFixed(2)}°N, ${scene.boundingBox[1][1].toFixed(2)}°E`} mono />
              <MetaRow label="Center" value={`${scene.geographicCenter[0].toFixed(4)}°N, ${scene.geographicCenter[1].toFixed(4)}°E`} mono />
            </div>
          </div>

          {/* Data source */}
          <div className="p-3 border-t border-sky-200/10/60">
            <div className="text-[8px] text-zinc-600 leading-relaxed">
              {scene.dataSource}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ─── HELPER COMPONENTS ─────────────────────────────────────────────

function MetaRow({
  label,
  value,
  color,
  mono,
}: {
  label: string;
  value: string;
  color?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[9px] text-zinc-600 shrink-0">{label}</span>
      <span className={cn("text-[9px] text-zinc-400 truncate", mono && "font-mono", color)}>
        {value}
      </span>
    </div>
  );
}
