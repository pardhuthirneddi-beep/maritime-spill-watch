# Plan 02 — Remove shadow utilities from maris panels (repo rule: "AVOID SHADOWS")

## Goal
Remove every `shadow-*` elevation utility from the nine rendered maris panels on the Incident Command workspace, honoring the repository's explicit design rule in README.md ("AVOID SHADOWS. Avoid adding any shadows to components. stick with a thin border without the shadow."). All affected panels already carry the thin border the rule names as the elevation device, so no replacement elevation is added by this plan.

## Context for the executor
- Product: MARIS (Vite + React + Tailwind v4). Surface: `src/pages/Dashboard.tsx` workspace chrome.
- Binding rule: README.md "Styling and Theming" section, verbatim: "AVOID SHADOWS. Avoid adding any shadows to components. stick with a thin border without the shadow."
- All nine panels already render `rounded border border-sky-200/10 …` — the documented elevation device — so removal is purely subtractive with no visual-collapse risk.
- Out of scope (do NOT touch): `filter: drop-shadow(...)` SVG glow styles inside MapView vessel glyphs, spill beacons, and Globe3DView canvas internals — those are canvas rendering styles, not component box shadows, and sit outside this rule's proven scope. Focus-ring shadows from shadcn/ui primitives are also out of scope (none were found in the traced path).

## Exact edits (old → new, all in `src/`)

### src/components/maris/IncidentWorkflow.tsx
1. Line 62: delete ` shadow-lg shadow-black/40` from the status-bar className. (If Plan 01 is applied first, this line already reads `nav-panel`; just ensure the two shadow classes are gone.)

### src/components/maris/Header.tsx
2. Line 173: delete ` shadow-xl shadow-black/50` from the notifications dropdown className.

### src/components/maris/InvestigationProgressOverlay.tsx
3. Line 67: delete ` shadow-lg shadow-black/40`
4. Line 91: delete ` shadow-lg shadow-black/40`
5. Line 128: delete ` shadow-lg shadow-black/40`

### src/components/maris/NotificationRail.tsx
6. Line 53: delete ` shadow-lg shadow-black/40`

### src/components/maris/IncidentAlertOverlay.tsx
7. Line 54: delete ` shadow-xl shadow-black/50`

### src/pages/Dashboard.tsx
8. Line 485: delete ` shadow-lg shadow-black/40` (map status chip)
9. Line 569: delete ` shadow-lg shadow-black/40` (3D view button strip)

If Plan 01 is executed first, the same nine lines will have `nav-panel` already in place — still delete exactly the two shadow classes listed. If Plan 02 is executed first, delete only the shadow classes and leave the hardcoded surface classes for Plan 01. The plans are order-independent.

## Verification
1. `bun tsc -b --noEmit` passes.
2. `grep -rn "shadow-lg\|shadow-xl" src/components/maris/IncidentWorkflow.tsx src/components/maris/InvestigationProgressOverlay.tsx src/components/maris/NotificationRail.tsx src/components/maris/Header.tsx src/components/maris/IncidentAlertOverlay.tsx src/pages/Dashboard.tsx` returns nothing.
3. Exemptions (documented, not defects): `Globe3DView.tsx` panel shadow was never cited in the finding evidence and sits on the separate 3D Intelligence surface — do not edit it under this plan. `drop-shadow` SVG filters inside MapView/Globe3DView canvas rendering are out of scope.
4. Visual: floating panels still read elevated via `backdrop-blur` + thin border + `nav-panel` inner light; no layout shift.
