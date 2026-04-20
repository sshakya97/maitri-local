/# Maitri Dashboard — Changelog

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