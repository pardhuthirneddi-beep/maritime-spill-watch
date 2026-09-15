# Plan 01 — Unify maris panel surfaces with the design system

## Goal
Replace the four competing hardcoded maris panel-surface recipes (`bg-zinc-950`, `bg-zinc-900/50`, `bg-[#070d16]/9x`, `bg-[#050a12]`) with the repository's documented surface owners — the `nav-panel` utility and the `--card`/`--sidebar`/`--background` token utilities — so every panel on the Incident Command workspace reads from the navy theme instead of neutral grey.

## Context for the executor
- Product: MARIS (maritime oil-spill intelligence, Vite + React + Tailwind v4 + shadcn/ui). Surface: the 2D chart Incident Command workspace rendered by `src/pages/Dashboard.tsx` (Header, Sidebar, RightPanel, AnalystPanel, SARViewer, IncidentWorkflow, InvestigationProgressOverlay, NotificationRail, IncidentAlertOverlay).
- Design system lives in `src/index.css`: oklch tokens under `.dark` (the app root is `<html class="dark">` in `index.html`), plus navy command-center utilities `.nav-panel`, `.nav-grid`, `.nav-frame`, `.nav-braid` defined later in the same file.
- README.md "Styling and Theming" is binding guidance: avoid hardcoded colors, implement themes through the system, "Always follow a set theme style".
- The executor has no conversation context. All exact strings to find and replace are listed below; apply them verbatim.

## Design decisions being applied
1. **Floating overlays over the map** (IncidentWorkflow bar, InvestigationProgressOverlay panels, NotificationRail cards, Header notifications dropdown, Dashboard status chips, IncidentAlertOverlay) → `nav-panel` (documented owner: "Elevated panel with subtle inner light"). Keep their existing `rounded`, padding, positioning, and `backdrop-blur-sm` (blur is part of the elevated-panel look; shadows are removed by Plan 02 and NOT re-added here).
2. **Flat, full-height rails** (RightPanel aside, its collapse strip, Sidebar) → `bg-sidebar` with the existing `border-sky-200/10` rail borders retained (`--sidebar` is the token for sidebar surfaces).
3. **Inset tiles inside panels** (the 28 `rounded border border-sky-200/10 bg-zinc-900/50` tiles and 4 `bg-zinc-800/50` sub-rows) → `bg-card/50` for tiles, `bg-card/30` for sub-rows; borders unchanged (`border-sky-200/10` stays — vetted as matching the system's blue-family border hue).
4. **Root stage** (`Dashboard.tsx` `bg-[#050a12]`, its `bg-[#050a12]/70` loading scrim, Header bar, Sidebar rail) → `bg-background`; scrim becomes `bg-background/70`.
5. Text/icon utilities (`text-zinc-*`, status color maps) are explicitly OUT of scope — only surface/background classes change.

## Exact edits (old → new, all in `src/`)

### src/pages/Dashboard.tsx
1. `bg-[#050a12] text-zinc-100` → `bg-background text-zinc-100` (root stage div, line ~356)
2. `bg-[#050a12]/70 backdrop-blur-sm` → `bg-background/70 backdrop-blur-sm` (loading scrim, line ~435)
3. `border border-sky-200/10 bg-[#070d16]/90 px-3 py-1.5 shadow-lg shadow-black/40 backdrop-blur-sm` → `border border-sky-200/10 nav-panel px-3 py-1.5 backdrop-blur-sm` (map status chip, line ~485)
4. `border border-sky-200/15 bg-[#070d16]/90 px-2.5 py-1.5 text-[8px]` → `border border-sky-200/15 bg-card/50 px-2.5 py-1.5 text-[8px]` (map legend chip, line ~505)
5. `border border-sky-200/10 bg-[#070d16]/95 px-2.5 py-1.5 shadow-lg shadow-black/40 backdrop-blur-sm` → `border border-sky-200/10 nav-panel px-2.5 py-1.5 backdrop-blur-sm` (3D button strip, line ~569)

### src/components/maris/Header.tsx
6. `border-b border-sky-200/10 bg-[#050a12] px-4` → `border-b border-sky-200/10 bg-background px-4` (header bar, line 34)
7. `w-72 rounded border border-sky-200/10 bg-[#070d16]/97 shadow-xl shadow-black/50 backdrop-blur-sm` → `w-72 rounded border border-sky-200/10 nav-panel backdrop-blur-sm` (notifications dropdown, line 173)

### src/components/maris/Sidebar.tsx
8. `border-r border-sky-200/10 bg-[#050a12] transition-all duration-200` → `border-r border-sky-200/10 bg-sidebar transition-all duration-200` (rail, line 84)

### src/components/maris/RightPanel.tsx
9. `border-l border-sky-200/10 bg-zinc-950 text-zinc-500 hover:text-zinc-300` → `border-l border-sky-200/10 bg-sidebar text-zinc-500 hover:text-zinc-300` (collapse strip, line 101)
10. `border-l border-sky-200/10 bg-zinc-950` → `border-l border-sky-200/10 bg-sidebar` (aside root, line 109)
11. Replace ALL 20 occurrences of `rounded border border-sky-200/10 bg-zinc-900/50` → `rounded border border-sky-200/10 bg-card/50` (lines 405, 431, 457, 461, 468, 475, 573, 703, 718, 755, 805, 827, 862, 980, 1000, 1020, 1098, 1122, 1140, 1174 — use replace-all on the exact substring)
12. Replace BOTH occurrences of `justify-between rounded bg-zinc-800/50 px-2 py-1` → `justify-between rounded bg-card/30 px-2 py-1` (lines 729, 766)

### src/components/maris/AnalystPanel.tsx
13. `rounded border border-sky-200/10 bg-zinc-900/50 p-3` → `rounded border border-sky-200/10 bg-card/50 p-3` (line 187)
14. `? "border-sky-200/10 bg-zinc-900/50"` → `? "border-sky-200/10 bg-card/50"` (line 232)
15. `resize-none rounded border border-sky-200/10 bg-zinc-900/50 px-2.5 py-2` → `resize-none rounded border border-sky-200/10 bg-card/50 px-2.5 py-2` (textarea, line 317)
16. `cursor-not-allowed border-zinc-700 bg-zinc-800/50 text-zinc-600` → `cursor-not-allowed border-zinc-700 bg-card/30 text-zinc-600` (disabled send button, line 326)

### src/components/maris/SARViewer.tsx
17. `gap-0.5 rounded border border-sky-200/10 bg-zinc-900/50` → `gap-0.5 rounded border border-sky-200/10 bg-card/50` (toolbar, line 386)

### src/components/maris/IncidentWorkflow.tsx
18. `pointer-events-auto rounded border border-sky-200/10 bg-[#070d16]/95 shadow-lg shadow-black/40 backdrop-blur-sm` → `pointer-events-auto rounded border border-sky-200/10 nav-panel backdrop-blur-sm` (status bar, line 62)
19. `rounded border border-sky-200/10 bg-zinc-900/50 p-3 text-[10px] text-zinc-600` → `rounded border border-sky-200/10 bg-card/50 p-3 text-[10px] text-zinc-600` (line 240)
20. `rounded border border-sky-200/10 bg-zinc-900/50 p-3` → `rounded border border-sky-200/10 bg-card/50 p-3` (line 251)

### src/components/maris/InvestigationProgressOverlay.tsx
21. Line 67: `flex items-center gap-2 rounded border border-sky-200/10 bg-[#070d16]/95 px-2.5 py-1.5 shadow-lg shadow-black/40 backdrop-blur-sm` → `flex items-center gap-2 rounded border border-sky-200/10 nav-panel px-2.5 py-1.5 backdrop-blur-sm`
22. Line 91: `flex w-56 items-center gap-2 rounded border border-sky-200/10 bg-[#070d16]/95 px-2.5 py-1.5 shadow-lg shadow-black/40 backdrop-blur-sm` → `flex w-56 items-center gap-2 rounded border border-sky-200/10 nav-panel px-2.5 py-1.5 backdrop-blur-sm`
23. Line 128: `w-60 max-w-[calc(100vw-6rem)] rounded border border-sky-200/10 bg-[#070d16]/95 shadow-lg shadow-black/40 backdrop-blur-sm` → `w-60 max-w-[calc(100vw-6rem)] rounded border border-sky-200/10 nav-panel backdrop-blur-sm`

### src/components/maris/NotificationRail.tsx
24. `pointer-events-auto rounded border border-sky-200/10 bg-[#070d16]/95 shadow-lg shadow-black/40 backdrop-blur-sm` → `pointer-events-auto rounded border border-sky-200/10 nav-panel backdrop-blur-sm` (line 53)

### src/components/maris/IncidentAlertOverlay.tsx
25. `rounded border border-amber-500/40 bg-[#070d16]/97 shadow-xl shadow-black/50 backdrop-blur-sm` → `rounded border border-amber-500/40 nav-panel backdrop-blur-sm` (line 54 — the amber alert border is a deliberate alert state, keep it)

## Out of scope (do not touch)
- Text colors, status color maps, MapView/Globe3DView canvas styles, `.dark` token values in index.css, Landing page, auth pages, any border hue, any radius, any shadow-removal beyond the lines shared with Plan 02.
- `shadow-*` classes on lines 62/67/91/128/53/173/54/485/569 are removed by THIS plan only where the surface becomes `nav-panel` (nav-panel provides elevation); every other `shadow-*` instance in scope belongs to Plan 02.

## Verification
1. `bun tsc -b --noEmit` passes.
2. `grep -rn "bg-zinc-900/50\|bg-zinc-800/50\|bg-zinc-950\|bg-\[#070d16\]\|bg-\[#050a12\]" src/components/maris/RightPanel.tsx src/components/maris/AnalystPanel.tsx src/components/maris/SARViewer.tsx src/components/maris/IncidentWorkflow.tsx src/components/maris/InvestigationProgressOverlay.tsx src/components/maris/NotificationRail.tsx src/components/maris/Header.tsx src/components/maris/Sidebar.tsx src/components/maris/IncidentAlertOverlay.tsx src/pages/Dashboard.tsx` returns nothing.
3. Exemptions (documented, not defects): `RightPanel.tsx` LOW-status color map (~line 1171) is out of scope per this plan; `Globe3DView.tsx` and `IncidentCommand.tsx` were never cited in the finding evidence and are outside the audited surface — do not edit them under this plan.
4. Visual: dashboard panels now read navy (blue-tinted) instead of neutral grey; map overlays show the subtle inner-light gradient of `nav-panel`; rails match; no layout shifts.

## Documentation updates for the executor (accepted change to record)
- README.md needs no edit (guidance already states the rule this plan enforces).
