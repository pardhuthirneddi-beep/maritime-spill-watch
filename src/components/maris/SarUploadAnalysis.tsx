// MARIS — SAR Upload Analysis Viewer
// Displays a user-uploaded SAR image with REAL detection results overlaid
// (candidates derived from the image's own pixels), and can register the
// primary candidate as a real MARIS incident in the existing store — from
// where it flows into the normal investigation pipeline.
import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Crosshair,
  Grid3x3,
  Info,
  Loader2,
  Orbit,
  RotateCcw,
  ShieldAlert,
  Upload,
  XCircle,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  runSarDetection,
  validateSarFile,
  SarValidationError,
  SAR_DETECTION_STAGES,
  type SarCandidate,
  type SarUploadAnalysis,
} from "@/data/sarDetection";
import { ensureIncidentFromDetection } from "@/data/incidentStore";
import { useIncidentStore } from "@/hooks/useIncidents";

interface SarUploadAnalysisProps {
  onBack: () => void;
  /** Shared Demo/Test mode switch rendered by SARViewer's header. */
  modeToggle?: React.ReactNode;
}

type Phase = "select" | "processing" | "result" | "error";

export default function SarUploadAnalysis({ onBack, modeToggle }: SarUploadAnalysisProps) {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [phase, setPhase] = useState<Phase>("select");
  const [fileMeta, setFileMeta] = useState<{ name: string; sizeBytes: number; width: number; height: number; type: string } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [stageIndex, setStageIndex] = useState(-1);
  const [analysis, setAnalysis] = useState<SarUploadAnalysis | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });
  const [selectedCand, setSelectedCand] = useState<SarCandidate | null>(null);
  const [incidentCreated, setIncidentCreated] = useState(false);

  const incidentStore = useIncidentStore();
  const linkedIncident = analysis
    ? incidentStore.incidents.find((i) => i.detectionId === `USR-${analysis.hash}-01`) ?? null
    : null;

  // ── File selection + validation ────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    setPhase("processing");
    setErrorMsg(null);
    setAnalysis(null);
    setStageIndex(0);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIncidentCreated(false);
    setSelectedCand(null);

    try {
      const { bitmap, meta } = await validateSarFile(file);
      setFileMeta(meta);

      // Preview: decode to an <img> for canvas drawing.
      const url = URL.createObjectURL(file);
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error("preview decode failed"));
        img.src = url;
      });
      imageRef.current = img;
      setPreviewUrl(url);

      // REAL processing — stage callbacks fire as each stage begins.
      const result = await runSarDetection(bitmap, meta, (i) => setStageIndex(i));
      setAnalysis(result);
      setPhase("result");
    } catch (err) {
      setErrorMsg(
        err instanceof SarValidationError
          ? err.message
          : "Detection failed — the image could not be processed. " +
            (err instanceof Error ? err.message : "")
      );
      setPhase("error");
    }
  }, []);

  // ── Canvas drawing: uploaded image + derived overlay ───────────
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const img = imageRef.current;
    if (!canvas || !container || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    ctx.fillStyle = "#050608";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // Fit uploaded image, centred.
    const pad = 24;
    const scale = Math.min(
      (canvas.width - pad * 2) / img.naturalWidth,
      (canvas.height - pad * 2) / img.naturalHeight
    );
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    const ox = (canvas.width - dw) / 2;
    const oy = (canvas.height - dh) / 2;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, ox, oy, dw, dh);

    const toScreenX = (px: number) => ox + (px / analysis!.analysisWidth) * dw;
    const toScreenY = (py: number) => oy + (py / analysis!.analysisHeight) * dh;

    // Coordinate grid over the image.
    if (showGrid) {
      ctx.strokeStyle = "rgba(100, 200, 255, 0.1)";
      ctx.lineWidth = 0.5;
      for (let i = 1; i < 8; i++) {
        const x = ox + (dw / 8) * i;
        const y = oy + (dh / 8) * i;
        ctx.beginPath();
        ctx.moveTo(x, oy);
        ctx.lineTo(x, oy + dh);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ox, y);
        ctx.lineTo(ox + dw, y);
        ctx.stroke();
      }
    }

    // Detection overlay — polygons derived FROM THIS IMAGE's pixels.
    if (showOverlay && analysis) {
      const drawCand = (c: SarCandidate, color: string, dash: number[]) => {
        ctx.beginPath();
        c.polygonPx.forEach(([px, py], j) => {
          const x = toScreenX(px);
          const y = toScreenY(py);
          if (j === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fillStyle = color + "33";
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = selectedCand?.id === c.id ? 2.5 : 1.5;
        ctx.setLineDash(dash);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label at centroid.
        const lx = toScreenX(c.centerPx[0]);
        const ly = toScreenY(c.centerPx[1]);
        const label = `${c.id} · ${c.confidence}%`;
        ctx.font = "bold 10px monospace";
        const tw = ctx.measureText(label).width + 10;
        ctx.fillStyle = "rgba(0,0,0,0.75)";
        ctx.fillRect(lx - tw / 2, ly - 20, tw, 15);
        ctx.fillStyle = color;
        ctx.textAlign = "center";
        ctx.fillText(label, lx, ly - 9);
        ctx.textAlign = "left";
      };

      analysis.candidates.forEach((c) => drawCand(c, "#fb923c", [6, 3]));
      analysis.screenedLookAlikes.forEach((c) => drawCand(c, "#64748b", [3, 3]));
    }

    ctx.restore();
  }, [zoom, pan, showOverlay, showGrid, analysis, selectedCand]);

  useEffect(() => {
    if (phase === "result") drawCanvas();
  }, [phase, drawCanvas]);

  // Resize
  useEffect(() => {
    const onResize = () => {
      if (phase === "result") drawCanvas();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [phase, drawCanvas]);

  // Cleanup object URL
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Pan/zoom handlers
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
  };
  const handleMouseUp = () => setIsPanning(false);
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((prev) => Math.max(0.5, Math.min(6, prev * (e.deltaY > 0 ? 0.9 : 1.1))));
  };

  // ── Create real MARIS incident from the primary candidate ──────
  const handleCreateIncident = () => {
    if (!analysis?.primary) return;
    const primary = analysis.primary;
    const { incident } = ensureIncidentFromDetection({
      detectionId: `USR-${analysis.hash}-01`,
      latitude: primary.centerGeo[0],
      longitude: primary.centerGeo[1],
      areaKm2: primary.areaKm2,
      confidence: primary.confidence,
      detectionSource: `User Uploaded SAR — ${analysis.imageMeta.name}`,
      sceneId: `USER-UPLOAD-${analysis.hash}`,
      sourceIncidentId: null,
      detectedAt: new Date().toISOString(),
    });
    setIncidentCreated(true);
    // The incident now lives in the real store — the rest of the MARIS
    // pipeline (AIS correlation → attribution → drift → report) consumes it.
    void incident;
  };

  const statusColor =
    analysis?.status === "candidate"
      ? "text-amber-400"
      : analysis?.status === "no_candidate"
        ? "text-zinc-400"
        : "text-red-400";

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
            SAR Upload Analysis
          </span>
          <div className="h-4 w-px bg-zinc-800" />
          {modeToggle}
          <div className="h-4 w-px bg-zinc-800" />
          {fileMeta && (
            <span className="text-[9px] font-mono text-zinc-600 truncate max-w-[300px]">
              {fileMeta.name} · {fileMeta.width}×{fileMeta.height} · {fileMeta.type}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {phase === "result" && analysis?.primary && !incidentCreated && !linkedIncident && (
            <button
              onClick={handleCreateIncident}
              className="flex items-center gap-1.5 rounded border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-[9px] font-medium text-amber-400 hover:bg-amber-500/20 transition-colors"
              title="Register this detection as a real MARIS incident"
            >
              <ShieldAlert className="size-3" />
              Create MARIS Incident
            </button>
          )}
          {linkedIncident && (
            <button
              onClick={() => navigate("/app")}
              className="flex items-center gap-1.5 rounded border border-emerald-500/50 bg-emerald-500/10 px-2 py-1 text-[9px] font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
              title="Continue this incident through the MARIS investigation pipeline"
            >
              <Orbit className="size-3" />
              Open Incident {linkedIncident.incidentNumber}
            </button>
          )}
          <div className="flex items-center gap-0.5 rounded border border-sky-200/10 bg-card/50">
            <button onClick={() => setZoom((p) => Math.max(0.5, p / 1.2))} className="p-1 text-zinc-500 hover:text-zinc-300">
              <ZoomOut className="size-3" />
            </button>
            <span className="px-1.5 text-[9px] font-mono text-zinc-400 min-w-[3rem] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button onClick={() => setZoom((p) => Math.min(6, p * 1.2))} className="p-1 text-zinc-500 hover:text-zinc-300">
              <ZoomIn className="size-3" />
            </button>
          </div>
          <button
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Reset view"
          >
            <RotateCcw className="size-3" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ─── LEFT SIDEBAR ──────────────────────────────────────── */}
        <aside className="w-72 border-r border-sky-200/10/60 bg-[#0a0b10] overflow-y-auto flex-shrink-0">
          {/* Upload panel */}
          <div className="p-3 border-b border-sky-200/10/60">
            <h3 className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
              SAR Image
            </h3>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded border border-sky-200/20 bg-zinc-900/40 px-2 py-2 text-[10px] font-medium text-zinc-300 hover:border-sky-200/40 hover:bg-zinc-900/60 transition-colors"
            >
              <Upload className="size-3.5 text-sky-300" />
              {fileMeta ? "Load Different Image" : "Upload SAR Image"}
            </button>
            <div className="mt-1.5 text-[8px] text-zinc-600 leading-relaxed">
              PNG · JPEG · WebP · max 30 MB. GeoTIFF/TIFF products require
              specialised preprocessing and are not accepted by the prototype detector.
            </div>
            {fileMeta && (
              <div className="mt-2 rounded border border-sky-200/10 bg-zinc-900/30 p-2 space-y-1">
                <div className="text-[9px] font-mono text-zinc-300 truncate">{fileMeta.name}</div>
                <div className="flex justify-between text-[8px] text-zinc-500">
                  <span>Dimensions</span>
                  <span className="font-mono">{fileMeta.width}×{fileMeta.height}</span>
                </div>
                <div className="flex justify-between text-[8px] text-zinc-500">
                  <span>Size</span>
                  <span className="font-mono">{(fileMeta.sizeBytes / 1048576).toFixed(2)} MB</span>
                </div>
                <div className="flex justify-between text-[8px] text-zinc-500">
                  <span>Format</span>
                  <span className="font-mono">{fileMeta.type}</span>
                </div>
              </div>
            )}
          </div>

          {/* Processing status — real stage callbacks */}
          {phase === "processing" && (
            <div className="p-3 border-b border-sky-200/10/60">
              <h3 className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                Processing
              </h3>
              <div className="space-y-1">
                {SAR_DETECTION_STAGES.map((stage, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {i < stageIndex ? (
                      <CheckCircle2 className="size-3 text-emerald-500 shrink-0" />
                    ) : i === stageIndex ? (
                      <Loader2 className="size-3 text-amber-400 animate-spin shrink-0" />
                    ) : (
                      <div className="size-3 rounded-full border border-zinc-700 shrink-0" />
                    )}
                    <span
                      className={cn(
                        "text-[9px]",
                        i < stageIndex ? "text-zinc-500" : i === stageIndex ? "text-amber-300" : "text-zinc-600"
                      )}
                    >
                      {stage}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detection result */}
          {analysis && phase === "result" && (
            <>
              <div className="p-3 border-b border-sky-200/10/60">
                <h3 className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                  Detection Result
                </h3>
                <div
                  className={cn(
                    "rounded border p-2",
                    analysis.status === "candidate"
                      ? "border-amber-500/40 bg-amber-500/5"
                      : analysis.status === "no_candidate"
                        ? "border-sky-200/10 bg-zinc-900/30"
                        : "border-red-500/30 bg-red-500/5"
                  )}
                >
                  <div className={cn("text-[10px] font-semibold", statusColor)}>
                    {analysis.status === "candidate"
                      ? "POSSIBLE OIL SLICK DETECTED"
                      : analysis.status === "no_candidate"
                        ? "NO SIGNIFICANT CANDIDATE"
                        : "IMAGE UNSUITABLE"}
                  </div>
                  <div className="mt-1 text-[8px] text-zinc-500 leading-relaxed">{analysis.message}</div>
                  {analysis.primary && (
                    <div className="mt-2 space-y-1">
                      <div className="flex justify-between text-[8px] text-zinc-500">
                        <span>Confidence</span>
                        <span className="font-mono text-amber-400">{analysis.primary.confidence}%</span>
                      </div>
                      <div className="flex justify-between text-[8px] text-zinc-500">
                        <span>Estimated Area</span>
                        <span className="font-mono">{analysis.primary.areaKm2} km²</span>
                      </div>
                      <div className="flex justify-between text-[8px] text-zinc-500">
                        <span>Length</span>
                        <span className="font-mono">{analysis.primary.lengthKm} km</span>
                      </div>
                      <div className="flex justify-between text-[8px] text-zinc-500">
                        <span>Center</span>
                        <span className="font-mono">
                          {analysis.primary.centerGeo[0].toFixed(3)}°N, {analysis.primary.centerGeo[1].toFixed(3)}°E
                        </span>
                      </div>
                      <div className="mt-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-center text-[7px] font-semibold tracking-wider text-amber-400">
                        REQUIRES VALIDATION
                      </div>
                    </div>
                  )}
                </div>
                {incidentCreated && (
                  <div className="mt-2 rounded border border-emerald-500/40 bg-emerald-500/10 p-2 text-[8px] text-emerald-300 leading-relaxed">
                    MARIS incident created — continue through AIS correlation, source
                    attribution, drift and reporting from Incident Command.
                  </div>
                )}
              </div>

              {/* Sea statistics — provenance of the detection */}
              <div className="p-3 border-b border-sky-200/10/60">
                <h3 className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                  Sea Background Statistics
                </h3>
                <div className="space-y-1">
                  <div className="flex justify-between text-[8px] text-zinc-500">
                    <span>Median backscatter</span>
                    <span className="font-mono">{analysis.seaBackground.median}</span>
                  </div>
                  <div className="flex justify-between text-[8px] text-zinc-500">
                    <span>Robust σ (MAD)</span>
                    <span className="font-mono">{analysis.seaBackground.sigma}</span>
                  </div>
                  <div className="flex justify-between text-[8px] text-zinc-500">
                    <span>Dark threshold</span>
                    <span className="font-mono">{analysis.seaBackground.threshold}</span>
                  </div>
                  <div className="flex justify-between text-[8px] text-zinc-500">
                    <span>Dark fraction</span>
                    <span className="font-mono">{(analysis.seaBackground.darkFraction * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </div>

              {/* Preprocessing log */}
              <div className="p-3 border-b border-sky-200/10/60">
                <h3 className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                  Preprocessing Log
                </h3>
                <div className="space-y-1">
                  {analysis.preprocessingNotes.map((note, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-[8px] text-zinc-600 font-mono mt-0.5 w-3 shrink-0">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="text-[9px] text-zinc-400 leading-tight">{note}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Candidates list */}
              {(analysis.candidates.length > 0 || analysis.screenedLookAlikes.length > 0) && (
                <div className="p-3 border-b border-sky-200/10/60">
                  <h3 className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                    Candidates ({analysis.candidates.length}) · Look-alikes ({analysis.screenedLookAlikes.length})
                  </h3>
                  <div className="space-y-1">
                    {[...analysis.candidates, ...analysis.screenedLookAlikes].map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setSelectedCand(c)}
                        className={cn(
                          "w-full text-left rounded border p-2 transition-colors",
                          selectedCand?.id === c.id
                            ? "border-amber-500/40 bg-amber-500/5"
                            : "border-sky-200/10/60 bg-zinc-900/20 hover:border-zinc-700"
                        )}
                      >
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[10px] font-semibold text-zinc-200">{c.id}</span>
                          <span
                            className={cn(
                              "text-[10px] font-bold",
                              c.classification === "possible_oil" ? "text-amber-400" : "text-zinc-500"
                            )}
                          >
                            {c.confidence}%
                          </span>
                        </div>
                        <div className="text-[9px] text-zinc-500 truncate">{c.label}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[8px] text-zinc-600">{c.areaKm2} km²</span>
                          <span className="text-[8px] text-zinc-600">{c.lengthKm} km</span>
                          <span
                            className={cn(
                              "text-[7px] px-1 rounded",
                              c.classification === "possible_oil"
                                ? "bg-amber-500/20 text-amber-400"
                                : "bg-zinc-800 text-zinc-500"
                            )}
                          >
                            {c.classification.replace("_", " ")}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Selected detail */}
              {selectedCand && (
                <div className="p-3 border-b border-sky-200/10/60">
                  <h3 className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                    Detection Detail
                  </h3>
                  <div className="rounded border border-sky-200/10 bg-zinc-900/30 p-2">
                    <div className="text-[10px] font-semibold text-zinc-200 mb-1">{selectedCand.label}</div>
                    <div className="space-y-0.5">
                      {selectedCand.confidenceFactors.map((f, i) => (
                        <div key={i} className="text-[8px] text-zinc-500 leading-tight">• {f}</div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Reproducibility + georef note */}
              <div className="p-3">
                <div className="rounded border border-amber-500/20 bg-amber-500/5 p-2 space-y-1.5">
                  <div className="flex items-start gap-1.5 text-[8px] text-amber-400/70">
                    <Info className="size-3 shrink-0 mt-0.5" />
                    Detection derived entirely from this image's pixels — deterministic
                    and reproducible. Content fingerprint {analysis.hash}. Re-processing the
                    same file yields the identical result.
                  </div>
                  <div className="flex items-start gap-1.5 text-[8px] text-amber-400/70">
                    <AlertTriangle className="size-3 shrink-0 mt-0.5" />
                    Uploaded images carry no georeference: image extents are mapped to the
                    MARIS operating window for demonstration. Coordinates are indicative only.
                  </div>
                </div>
              </div>
            </>
          )}
        </aside>

        {/* ─── MAIN VIEWER ────────────────────────────────────────── */}
        <main className="flex-1 relative overflow-hidden bg-[#050608]">
          {phase === "select" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="max-w-md text-center px-6">
                <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded border border-sky-200/20 bg-zinc-900/40">
                  <Upload className="size-5 text-sky-300" />
                </div>
                <h2 className="text-sm font-semibold tracking-wide text-zinc-200">
                  Upload SAR Image for Detection
                </h2>
                <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
                  MARIS will run its real detection pipeline on your image: speckle
                  suppression, sea-background estimation, dark-anomaly extraction,
                  look-alike filtering, and spill geometry. Results are derived from the
                  image content — not from demo data. If no significant slick candidate
                  exists, MARIS will say so.
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-4 rounded border border-amber-500/50 bg-amber-500/10 px-4 py-1.5 text-[10px] font-medium text-amber-400 hover:bg-amber-500/20 transition-colors"
                >
                  Upload SAR Image
                </button>
              </div>
            </div>
          )}

          {(phase === "processing" || phase === "error") && (
            <div className="absolute inset-0 flex items-center justify-center">
              {phase === "processing" ? (
                <div className="text-center">
                  <Loader2 className="mx-auto size-6 animate-spin text-amber-400" />
                  <div className="mt-3 text-[10px] font-mono text-amber-300">
                    {stageIndex >= 0 ? SAR_DETECTION_STAGES[stageIndex] : "Validating SAR image"}
                  </div>
                  <div className="mt-1 text-[8px] text-zinc-600">
                    Stage {Math.min(stageIndex + 1, SAR_DETECTION_STAGES.length)} of {SAR_DETECTION_STAGES.length} · real pixel processing, no simulation
                  </div>
                </div>
              ) : (
                <div className="max-w-md text-center px-6">
                  <XCircle className="mx-auto size-8 text-red-400" />
                  <h2 className="mt-3 text-sm font-semibold text-zinc-200">Detection Not Possible</h2>
                  <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">{errorMsg}</p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-4 rounded border border-sky-200/20 bg-zinc-900/40 px-3 py-1.5 text-[10px] text-zinc-300 hover:bg-zinc-900/60 transition-colors"
                  >
                    Try Another Image
                  </button>
                </div>
              )}
            </div>
          )}

          {phase === "result" && (
            <>
              <div
                ref={containerRef}
                className="absolute inset-0 cursor-grab active:cursor-grabbing"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
              >
                <canvas ref={canvasRef} className="w-full h-full" />
              </div>

              {/* Layer controls */}
              <div className="absolute top-3 right-3 z-10">
                <div className="rounded border border-sky-200/10/80 bg-[#0a0b10]/90 p-2 space-y-1.5">
                  <button
                    onClick={() => setShowOverlay(!showOverlay)}
                    className={cn(
                      "flex items-center gap-1.5 text-[9px] w-full px-1.5 py-0.5 rounded transition-colors",
                      showOverlay ? "text-amber-400 bg-amber-500/10" : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    <Grid3x3 className="size-2.5" />
                    Detection Overlay
                  </button>
                  <button
                    onClick={() => setShowGrid(!showGrid)}
                    className={cn(
                      "flex items-center gap-1.5 text-[9px] w-full px-1.5 py-0.5 rounded transition-colors",
                      showGrid ? "text-cyan-400 bg-cyan-500/10" : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    <Crosshair className="size-2.5" />
                    Coordinate Grid
                  </button>
                </div>
              </div>

              {/* Legend */}
              {analysis && (analysis.candidates.length > 0 || analysis.screenedLookAlikes.length > 0) && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10">
                  <div className="flex items-center gap-3 rounded border border-sky-200/10/80 bg-[#0a0b10]/90 px-3 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-0.5 bg-amber-500 border border-dashed border-amber-500" />
                      <span className="text-[8px] text-zinc-500">Possible Oil Slick</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-0.5 bg-zinc-500 border border-dashed border-zinc-500" />
                      <span className="text-[8px] text-zinc-500">Screened look-alike</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
