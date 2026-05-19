/# Maitri Dashboard — Changelog

## [2026-05-19] Standup Chart Redesign — Card Grid

### What Changed
- **Stacked-bar chart replaced with per-person card grid** — the original horizontal stacked-bar `StandupChart` was hard to scan at a glance during DSM (counts had to be estimated from segment widths, idle people blended in with busy ones, status names lived only in a legend). Replaced with a responsive CSS-grid layout: `repeat(auto-fit, minmax(280px, 1fr))` → 3 cards per row on wide screens, 2 on tablets, 1 on narrow viewports.
- **Each card surfaces the active work directly** — header row (avatar + short name + role badge), large monospace total, a 3px mini load bar scaled to the most-loaded person, and an explicit vertical list of colored status chips with exact counts. Status chips reuse `STATUS_CONFIG` colors via `pickColors`. Chips are sorted by `STANDUP_STATUS_ORDER` so Blocked is always at the top.
- **Idle cards dim instead of disappearing** — team members with zero active tasks still get a card (so nobody is skipped in DSM), rendered with `opacity: 0.55` and a centered italic "no active work" label in place of the total/bar/chips.
- **KPI strip above the grid** — five inline pills summarize the team's state: `{N} active`, `{N} blocked`, `{N} in progress`, `{N} ready for QA`, `{N} idle`. The blocked pill goes red-tinted when count > 0. `in progress` aggregates `In Progress`, `In Dev`, and `In INT` across projects.
- **Interactions preserved** — clicking a status chip on any card still calls `handleSegmentClick(status, personName)`: highlights matching rows in the table below, dims non-matching chips/rows to 35% / 30% opacity, and scrolls to that person's section. Legend pills below the grid still toggle the highlight without scrolling. "Clear filter" button works as before.

### Files Modified
- `src/App.jsx` — Added `kpis` `useMemo` (aggregates `active`/`blocked`/`inProgress`/`readyForQA`/`idle` from `personGroups`). Replaced the `{/* Chart */}` block inside `StandupView` with the new KPI strip + responsive card grid; preserved the legend block. No changes to state (`highlightedStatus`, `personRefs`, `personGroups`, `maxCount`, `presentStatuses`) or handlers (`handleSegmentClick`, `handleLegendClick`). No new dependencies.
- `docs/superpowers/specs/2026-05-04-standup-view-design.md` — Spec revised in-place: the original `StandupChart` description (six horizontal stacked-bar rows) was replaced with the new card-grid design; Edge cases and Testing sections updated to match.
- `docs/superpowers/plans/2026-05-19-standup-chart-redesign.md` — New implementation plan for this work.
- `docs/changelog.md` — This entry.

---

## [2026-05-05] Standup Fixes + SUPP Project + Light-theme Color Tuning

### What Changed
- **Sprint field now populates correctly** — issues' `sprintName` was always `null` because `mapIssue` was reading `f.sprint` (a Jira Server-era alias that doesn't exist in Jira Cloud's response). Added `findSprintArray()` helper that scans all customfields for an array of sprint-shaped objects (have `name` + `state`), making sprint detection tenant-agnostic. Switched `FIELDS` to `['*all']` so all customfields are returned for the scan to operate on. Without this fix the Standup tab's default "Active Sprints" filter dropped every issue.
- **Standup excludes Deferred by default** — new `excludeDeferred(issue)` helper applied in the Standup filter chain alongside `isActive` and `excludeUAT`. Deferred tickets only appear in Board / Reports / Attention views.
- **SUPP project added** — included in JQL (`project in (ACT, CONN, NACT, QA, SUPP)`), `PROJECT_KEYS`, `PROJECT_COLORS` (pink `#F472B6`), and the project filter buttons in the topbar and standup view.
- **Darker, more vibrant colors on light theme** — added `colorLight` field to every entry in `STATUS_CONFIG`, `PROJECT_COLORS`, and `PRIORITY_COLOR` (using Tailwind 700–800 shades). New `pickColors(cfg, dark)` helper resolves color/bg/ring at the active theme: dark theme keeps the existing palette unchanged, light theme switches to the darker variant with a 12% alpha tint background. `StatusPill`, `PriBadge`, `ProjectBadge` now take a `dark` prop; standup chart segments, legend pills, board group headers, and `IssueCard` ring/border resolve theme-aware too.

### Files Modified
- `server/jira.js` — Replaced `'sprint'` field name with `*all` + `findSprintArray()` auto-detection; added SUPP to JQL and `PROJECT_KEYS`
- `src/App.jsx` — Added `excludeDeferred` helper and applied to standup filter; added SUPP to `PROJECT_COLORS` and both project filter button arrays; added `colorLight` to STATUS_CONFIG / PROJECT_COLORS / PRIORITY_COLOR; added `pickColors` helper; threaded `dark` prop through badges and propagated to all 11 call sites; updated standup chart, legend, board group, and IssueCard to use theme-aware colors

---

## [2026-05-04] Standup Tab — Per-Person DSM View

### What Changed
- **New "Standup" tab** added to the topbar between QA Board and Reports — purpose-built for Daily Stand-up Meeting scanning
- **Stacked horizontal bar chart** — one bar per Maitri member (in `PEOPLE` order), segmented by status. Bar widths normalized to the most-loaded person so workload disparity is visible at a glance
- **Per-person sections** below the chart — collapsible, dense one-line rows showing Key, Status, Priority, Title, Deadline, Updated, SDET (when present)
- **UAT exclusion** — new `excludeUAT(issue)` helper drops any status whose name contains "UAT" (case-insensitive). Catches `Ready for UAT`, `In UAT`, `Promoted to UAT` and any future UAT-named statuses without code changes
- **Active Sprints aggregate** — new `"Active Sprints"` option in the sprint dropdown (added to all three dropdowns: dev/qa filter row, Reports view, Standup view) that includes any issue whose sprint is currently `state: active`. Useful when ACT/CONN/NACT/QA have different active sprints simultaneously
- **Auto-default** — entering Standup tab for the first time auto-sets the sprint filter to "Active Sprints" (only when sprint filter is currently "all", so it doesn't override an explicit user choice)
- **Chart→table interaction** — clicking a chart segment dims non-matching rows and scrolls to that person; clicking a legend pill dims non-matching rows; click again or click "Clear filter" to reset
- **Empty-person handling** — team members with zero active tasks still render in the chart (with empty track + "no active work" label) and as a collapsed-style header in the table — so nobody is accidentally skipped during standup
- Within-person sort order: status urgency (Blocked first), then priority (P0→P4), then most-recently-updated — most urgent task each person owns shows at the top of their section

### Files Modified
- `src/App.jsx` — Added `excludeUAT`, `filterBySprint`, and `STANDUP_STATUS_ORDER` helpers; new `StandupView` component; new `"standup"` tab; auto-default sprintFilter on standup entry; "Active Sprints" option added to all three sprint dropdowns; refactored existing sprint filtering to use shared `filterBySprint` helper
- `docs/changelog.md` — This entry
- `docs/superpowers/specs/2026-05-04-standup-view-design.md` — Design spec

---

## [2026-04-02] QA Project + Collapsible Groups + Sprint Filter + Drag-and-Drop

### What Changed
- **QA Project** added to Jira query — QA tickets (e.g., `QA-123`) now appear on dashboard
- QA project gets orange badge and dedicated project filter button
- **Collapsible status groups** — click any status group header to collapse/expand
- Chevron indicator (▸/▾) and click-to-toggle on all board groups including "Promoted / Done / Deferred"
- **Sprint filter dropdown** — filter by Current Sprint, Previous Sprint, or pick a specific sprint
- Sprint detection uses `sprintStartDate`/`sprintEndDate` per issue; supports different cadences per project
- **Drag-and-drop card reordering** — drag cards within a status group to set custom order
- Default card sort within groups changed to priority-first (P0 > P1 > ...), then by updated date
- Manual card order persisted in localStorage; "Reset order" button to revert per group
- `sprintStartDate` now exposed in issue data from backend

### Files Modified
- `server/jira.js` — Added QA to JQL projects, mapped `sprintStartDate`
- `src/App.jsx` — QA project color/filter, collapsible groups, sprint dropdown, drag-and-drop with @dnd-kit
- `package.json` — Added `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`

---

## [2026-03-12] QA Board Tab + Attention Tab + SDET Assignee Field

### What Changed
- Added tab system in topbar: **Dev Board**, **QA Board**, **Attention**
- **QA Board** filters issues where assignee OR SDET Assignee (`customfield_10058`) is Aarati/Diwas
- **Person filter** matches on both `assignee` and `sdetAssignee` — clicking Diwas shows issues where she's either
- **SDET Assignee** shown on IssueCard (purple "SDET: Name" label) and as dedicated column in table view
- **Status filter** changed from button row to dropdown, scoped to statuses available in current tab + project
- **Attention tab** moved from inline DeadlinePanel to its own tab with full IssueCard rendering
- Attention tab shows count badge, highlighted red when items exist
- Jira query: `assignee in (all team) OR "SDET Assignee" in (Aarati, Diwas)` within ACT/CONN/NACT
- `sdetAssignee` field exposed in mapped issue data

### Files Modified
- `src/App.jsx` — Tab system, person filter matches both assignee/sdetAssignee, status dropdown scoped by tab+project, SDET column in table, SDET label on cards
- `server/jira.js` — Added QA_ACCOUNT_IDS, `customfield_10058` to FIELDS, updated JQL, mapped sdetAssignee in issue data

---

## [2026-03-11] Implementation: Live Jira Backend + Frontend Update

### What Changed
- Created `server/index.js` — Express server on port 3001 with `/api/issues` and `/api/refresh` endpoints
- Created `server/jira.js` — Jira REST API client with 2-min cache, paginated fetching, comment extraction
- Rewrote `src/App.jsx` — Fetches live data from backend instead of hardcoded array
- Added 6 team members (Anjali, Sanabul, Sashank, Buddhi as Dev; Aarati, Diwas as QA)
- Added 3 projects: ACT, CONN, NACT
- Added deadline tracking: DeadlineBadge on cards + DeadlinePanel (overdue/due soon/stale)
- Added QA badge, stale ticket detection, NACT status support
- Added deadline sort option, refresh button, loading/error states
- Added `.env.example`, updated `.gitignore` with `.env`
- Added `concurrently`, `express`, `cors`, `dotenv` dependencies
- Added `npm run server` and `npm start` (runs both frontend + backend)

### Files Modified
- `src/App.jsx` — Full rewrite for live data
- `package.json` — New deps + scripts
- `.gitignore` — Added .env

### Files Created
- `server/index.js` — Express API server
- `server/jira.js` — Jira client with caching
- `.env.example` — Credential template
- `docs/changelog.md` — This file
- `docs/2026-03-11-live-jira-dashboard-design.md` — Design spec

---

## [2026-03-11] Design: Live Jira Dashboard

### What Changed
- Designed architecture for live Jira integration replacing hardcoded static data
- Expanded from 2 projects (ACT, CONN) to 3 (+ NACT)
- Expanded from 4 team members to 6 (+ Aarati Adhikari QA, Diwas Dhital QA)
- Added deadline tracking system (card highlights + summary panel)
- Added stale ticket detection (7+ days no update)

### Decisions
- Express backend proxy on :3001 to hold Jira API credentials securely
- 2-minute server-side cache to respect Jira rate limits
- `customfield_10015` confirmed as "target end date" field
- QA members (Aarati, Diwas) get visual "QA" badge
- "Ready for QA" tickets highlighted for QA team members
- NACT statuses mapped via Jira statusCategory for unified board view
- Account IDs used for reliable JQL filtering

### Context
- User requested live Jira data instead of static snapshot
- User requested QA team visibility and deadline tracking to prevent missed deadlines
- Jira instance: macrohealth.atlassian.net (cloud ID: be1745af-130b-42f2-9f9c-95a511543ed5)