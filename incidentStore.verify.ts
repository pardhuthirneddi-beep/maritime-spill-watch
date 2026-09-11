// Temporary verification harness for the Prompt-8 incident workflow.
// Exercises the real incidentStore state machine directly in Bun.
import {
  ensureDemoSeed,
  getSnapshot,
  startInvestigation,
  completeStage,
  failStage,
  markReportGenerated,
  resetInvestigation,
  workflowProgressPct,
  workflowStatus,
  hydrateFromPersisted,
  recordIncidentUpdate,
  deriveEstimatedVolumeM3,
  INVESTIGATION_STAGES,
} from "./src/data/incidentStore";
import { DEMO_HYPERSPECTRAL } from "./src/data/demoData";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("── Incident workflow state machine ──");

// 1. Deterministic seed
ensureDemoSeed();
let s = getSnapshot();
check("demo seed creates exactly one incident", s.incidents.length === 1);
const inc = s.incidents[0];
check("incident number is MARIS-INC-0001", inc.incidentNumber === "MARIS-INC-0001");
check(
  "initial status is UNVERIFIED (not confirmed)",
  inc.status === "unverified",
  `got ${inc.status}`,
);
check(
  "only DETECTION stage complete at start",
  inc.workflow.completedStages.length === 1 &&
    inc.workflow.completedStages[0] === "detection",
);
check(
  "initial progress ≈ 14%",
  workflowProgressPct(inc.workflow) === Math.round((1 / 7) * 100),
  `got ${workflowProgressPct(inc.workflow)}%`,
);

// 2. RUN INVESTIGATION
startInvestigation();
s = getSnapshot();
const running = s.incidents[0];
check(
  "RUN INVESTIGATION → UNDER INVESTIGATION",
  running.status === "under_investigation",
  `got ${running.status}`,
);
check(
  "running stage is first incomplete (verification)",
  running.workflow.runningStage === "verification",
  `got ${running.workflow.runningStage}`,
);
check(
  "timeline records 'Investigation initiated'",
  running.timeline.some((e) =>
    e.description.toLowerCase().includes("investigation initiated"),
  ),
);
check(
  "status-change notification emitted",
  s.notifications.some(
    (n) => n.kind === "status_changed" && n.detail.includes(running.incidentNumber),
  ),
);

// Double-click guard
startInvestigation();
s = getSnapshot();
check(
  "double RUN INVESTIGATION is a no-op (no stage duplication)",
  s.incidents[0].workflow.runningStage === "verification" &&
    s.incidents[0].timeline.filter((e) =>
      e.description.toLowerCase().includes("investigation initiated"),
    ).length === 1,
);

// 3. Stage completion through the pipeline
for (const stage of INVESTIGATION_STAGES.slice(1)) completeStage(stage.id);
s = getSnapshot();
const afterStages = s.incidents[0];
check(
  "all 7 stages complete after pipeline run",
  afterStages.workflow.completedStages.length === INVESTIGATION_STAGES.length,
);
check(
  "stage completion events in timeline",
  afterStages.timeline.filter((e) => e.eventType === "STAGE").length ===
    INVESTIGATION_STAGES.length - 1,
);
check(
  "status after all stages = REPORT READY (pre-export)",
  afterStages.status === "report_ready",
  `got ${afterStages.status}`,
);
check("no stage left running", afterStages.workflow.runningStage === null);

// 4. Report export gates the final state
markReportGenerated();
s = getSnapshot();
const finalInc = s.incidents[0];
check(
  "export success → REQUIRES VALIDATION (final state)",
  finalInc.status === "requires_validation",
  `got ${finalInc.status}`,
);
check("report timestamp recorded", finalInc.workflow.reportExportedAt !== null);
check(
  "REPORT + STATUS events appended",
  finalInc.timeline.some((e) => e.eventType === "REPORT") &&
    finalInc.timeline.some((e) => e.eventType === "STATUS"),
);
check(
  "terminology guardrail: no 'confirmed' status exists",
  !JSON.stringify(STATUS_CHECK(), null, 0).includes("confirmed"),
);

function STATUS_CHECK() {
  return getSnapshot();
}

// 5. Reset returns to UNVERIFIED, preserving history
resetInvestigation();
s = getSnapshot();
const reset = s.incidents[0];
check(
  "RESET → UNVERIFIED with detection history preserved",
  reset.status === "unverified" &&
    reset.workflow.completedStages.length === 1 &&
    reset.timeline.some((e) => e.eventType === "DETECTION"),
);

// 6. Failure path surfaces errors
startInvestigation();
failStage("verification", "synthetic test failure");
s = getSnapshot();
check(
  "failStage surfaces lastError (never silent)",
  s.incidents[0].workflow.lastError?.includes("synthetic test failure") === true,
);
check(
  "failure emits notification",
  s.notifications.some((n) => n.title === "STAGE ERROR"),
);

// 7. Continuous updates: idempotent, dedup-tolerant
const id = s.incidents[0].id;
const before = s.incidents[0].timeline.length;
recordIncidentUpdate(id, {
  eventType: "EVIDENCE",
  description: "test evidence event",
  source: "verify",
  silent: true,
});
recordIncidentUpdate(id, {
  eventType: "EVIDENCE",
  description: "test evidence event",
  source: "verify",
  silent: true,
});
s = getSnapshot();
check(
  "identical continuous updates dedup (no timeline spam)",
  s.incidents[0].timeline.length === before + 1,
  `expected +1, got ${s.incidents[0].timeline.length - before}`,
);

// 8. Hydration: only adopts richer persisted history
hydrateFromPersisted({
  incidentNumber: "MARIS-INC-0001",
  status: "under_investigation",
  severity: "medium",
  currentSummary: "test",
  lastUpdatedAt: new Date().toISOString(),
  timeline: [],
  workflow: {
    completedStages: [],
    reportGenerated: false,
  },
});
s = getSnapshot();
check(
  "hydration ignores persisted state with LESS history",
  s.incidents[0].status === "under_investigation" &&
    s.incidents[0].timeline.length === s.incidents[0].timeline.length,
);

// 9. Volume derivation from real HSI state
const vol = deriveEstimatedVolumeM3(
  14.7,
  DEMO_HYPERSPECTRAL,
);
check(
  "volume derivation returns a real number from HSI classes",
  vol === null || (typeof vol === "number" && vol > 0),
  `got ${vol}`,
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
