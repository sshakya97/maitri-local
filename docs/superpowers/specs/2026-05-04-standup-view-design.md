# Standup View — Design Spec

**Date:** 2026-05-04 (revised 2026-05-19)
**Status:** Approved
**Author:** brainstormed with Claude

## Revision 2026-05-19 — Chart redesign

The original `StandupChart` (six horizontal stacked-bar rows) shipped but didn't read well at a glance during DSM. Counts had to be estimated from segment widths, idle people blended in with busy ones, and status names lived only in a legend below.

**Replaced with a responsive per-person card grid.** Each card shows the person's avatar, total active count, a mini relative-load bar, and explicit colored status chips with counts. Idle people get a dimmed card with "no active work" text. A KPI strip at the top of the chart container summarizes the team's state. Full design is in the "StandupChart (revised)" section below; the original stacked-bar version is preserved in git history.

**Scope of this revision:** chart block only (`StandupChart` rendering within `StandupView`, `src/App.jsx:656-712`). The table below, filters, sprint default, KPI math, and existing state (`highlightedStatus`, `personRefs`, `personGroups`, `maxCount`, `presentStatuses`) are unchanged. No backend changes, no new dependencies.

## Problem

In every Daily Stand-up Meeting (DSM), Sashank scans the dashboard to see what each Maitri team member is currently working on. The existing Board and Reports views surface too much (everything across many statuses, including UAT-stage tickets that the dev/QA team is no longer actively driving) and aren't grouped per-person, forcing manual filtering and assignee scanning every morning.

## Goal

A focused per-person view, optimized for DSM scanning, that answers in one glance: "what is each Maitri team member actively working on in the current sprint, and what state is that work in?"

## Non-goals

- Replacing the Board or Reports views.
- Backend changes (no new endpoints, no new fields, no new Jira queries).
- Chart library dependencies (Recharts, Chart.js, etc.) — the chart is simple enough to build with `<div>` widths.
- Cross-team visibility — Maitri members only (already enforced by the existing JQL).
- Editable cells, drag-and-drop, or bulk actions in the table.

## Filter logic

The Standup view derives from the existing `issues` array in `App.jsx` and applies the following chain in order:

1. **Audience** — if `tab === "qa"`, restrict to issues where `assignee` is in `QA_ASSIGNEES` (Aarati, Diwas). Same rule the rest of the app uses.
2. **Project** — respect the existing `proj` filter from the topbar.
3. **Sprint** — see "Sprint default" below. Default to a new "Active Sprints" aggregate.
4. **Active by category** — keep `statusCategory in ("indeterminate", "new")`. Re-uses the existing `isActive(issue)` helper. Auto-excludes anything Jira marks as `done` (Promoted, Done, Deferred).
5. **NEW: UAT exclusion** — drop any issue where `issue.status.toLowerCase().includes("uat")`. Catches `Ready for UAT`, `In UAT`, `Promoted to UAT`, and any future UAT-named statuses without code changes. Implemented as a new helper `excludeUAT(issue)`.
6. **Group by primary `assignee`** — not `sdetAssignee`. DSM is about who is *driving* the work. SDET assignment is not used for grouping; if present on an issue, the SDET name appears as a small inline tag at the right edge of the row (`SDET: Diwas`), styled like the existing IssueCard's SDET label.
7. **All 6 Maitri members appear** — even if their filtered count is zero, so nobody gets accidentally skipped during DSM.

## Sprint default

**Problem:** the existing sprint dropdown options are `"all"` and individual sprint names. There is no aggregate option for "any sprint currently in flight." DSM cares about *current* work across all four projects (ACT, CONN, NACT, QA), which can have independently scheduled active sprints.

**Solution:** add one new dropdown option, `"Active Sprints"`, that includes any issue whose `sprintName` matches any sprint with `state === "active"` in `availableSprints`. Make this the **default** selection when the user first switches into Standup view. Board and Reports views are unchanged — their default remains `"all"`.

When the user manually picks a specific sprint or `"All"` from the dropdown while in Standup view, that selection is honored and persists across view switches (same state pattern as today).

## Components

Two new components, both rendered when `view === "standup"`:

### StandupChart (revised 2026-05-19)

Responsive grid of six per-person cards. CSS Grid with `repeat(auto-fit, minmax(280px, 1fr))` → 3 columns on wide screens, 2 on tablets, 1 on narrow viewports.

```
┌──────────────────────────────────────────────────────────────────┐
│ Daily Stand-up · Monday, May 19                                  │
│ 14 active · 2 blocked · 5 in progress · 3 ready QA · 1 idle      │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ [A] Anjali  Dev  │ │ [S] Sashank Dev  │ │ [S] Sanabul Dev  │
│        6         │ │        2         │ │        3         │
│ ━━━━━━━━━━━━━━   │ │ ━━━━━            │ │ ━━━━━━━          │
│ ● Blocked      3 │ │ ● In Progress  1 │ │ ● In Progress  3 │
│ ● In Progress  2 │ │ ● In Review    1 │ │                  │
│ ● Ready for QA 1 │ │                  │ │                  │
└──────────────────┘ └──────────────────┘ └──────────────────┘
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ [B] Buddhi  Dev  │ │ [A] Aarati  QA   │ │ [D] Diwas   QA   │
│  (dimmed card)   │ │        7         │ │        4         │
│  no active work  │ │ ━━━━━━━━━━━━━━━  │ │ ━━━━━━━━         │
│                  │ │ ● Ready for QA 5 │ │ ● Ready for QA 4 │
│                  │ │ ● In Review    2 │ │                  │
└──────────────────┘ └──────────────────┘ └──────────────────┘

  [● Blocked 2] [● In Progress 5] [● Ready for QA 3] …    ← legend
```

**Card order:** fixed `Object.keys(PEOPLE)` order — devs first, then QAs. Stable position day to day for muscle memory.

**KPI strip (top of chart container):**
- Inline pills, computed from `personGroups`. Format: `{N} active · {N} blocked · {N} in progress · {N} ready for QA · {N} idle`.
- `idle` count = `personGroups.filter(g => g.total === 0).length`.
- The blocked pill is red-tinted (reusing the Blocked status color); the rest are neutral. Zero counts are still shown so the layout is stable across days.

**Card (active, total > 0):**
- Header row: `Avatar` (size 28) + short name (`PEOPLE[name].short`, ~14px bold) + `RoleBadge`.
- Total number: large (~32px), monospace, bold, centered.
- Mini relative-load bar: 3px-tall horizontal bar with width `(g.total / maxCount) * 100%`. Color: `#4F8EF7` (brand accent) in light mode, a slightly desaturated variant in dark. Same `maxCount` calculation as the current chart.
- Status chip list: one row per status the person currently has. Sort order matches `STANDUP_STATUS_ORDER` (Blocked first), with any unknown statuses appended (same fallback logic as today).
  - Each chip row: `● {statusName}      {count}`.
  - `●` dot uses `STATUS_CONFIG[status].color` (via `pickColors`, dark-mode aware), 6px diameter.
  - Status name uses the status-tinted text color (`pickColors(...).color`).
  - Count is right-aligned, monospace, bold.
  - Statuses not in `STATUS_CONFIG` fall back to grey, mirroring `StatusPill`.

**Card (idle, total = 0):**
- Same header.
- Card content (everything below the header) rendered at `opacity: 0.55`.
- Centered "no active work" italic muted text in place of total/bar/chips.
- Card is not clickable; chip interaction is N/A (there are no chips).

**Blocked emphasis:** the Blocked chip's red dot and red status text are sufficient — no additional card-level border or animation. (User decision: avoid noise.)

**Interactions (preserved from original spec):**
- Click a status chip on any card → `setHighlightedStatus(status)` and scroll to that person's section in the table below (`personRefs.current[name].scrollIntoView`). Click the same chip again to clear.
- When `highlightedStatus` is set: non-matching chips on all cards dim to `opacity: 0.35`; matching chips stay full-opacity; idle cards stay dimmed regardless. Non-matching rows in the table dim to ~30% (unchanged).
- Legend pills below the grid behave as today: click toggles `highlightedStatus` without scrolling. Same dimming applies to chips and table rows.

**Hover:** native `title` attr on each chip showing `{statusName}: {count}` for accessibility. No tooltip library.

**State:** `highlightedStatus`, `personRefs`, `maxCount`, `personGroups`, and `presentStatuses` (used by the legend) are all unchanged from the current implementation. Only the rendering of the chart block changes.

### StandupTable

Rendered below `StandupChart`. Grouped by person, each group is a collapsible section reusing the existing `collapsedGroups` Set and chevron toggle pattern from the Board view.

**Section header:** `▾ [Avatar] {name} ({count} active)`. Click the header to toggle. All sections expanded by default.

**Row format** — one line per task, dense for fast scanning:

```
ACT-123  [Blocked] [P0]  API rate limit causing failed bookings    2d overdue   12h ago   SDET: Diwas
```

Columns inline, left to right: `Key | StatusPill | PriBadge | Title (truncated with ellipsis) | DeadlineBadge | relTime(updated) | SDET tag (only when sdetAssignee is present)`. Click the row → opens the issue in Jira via the existing `JIRA_BASE + key` pattern. Hover reveals full title via native `title` attr. When `highlightedStatus` is set and the row's status doesn't match, the row renders at ~30% opacity (no layout shift, just visual dimming).

**Within-section sort:** by status urgency (same order as the chart segments — Blocked first), then by priority (P0 → P4 → Unprioritized), then by `updated` descending. The most urgent task each person owns is at the top of their section.

**Empty section:** if a person has zero active tasks, the section header still renders showing `(0 active)`, the body shows `No active work` muted text. The section is collapsed by default in this case.

## Reused primitives

No new visual primitives. The view composes existing components:

- `Avatar`, `StatusPill`, `PriBadge`, `DeadlineBadge`, `ProjectBadge`
- Helpers: `relTime`, `getDeadline`, `deadlineInfo`, `isActive`, `STATUS_CONFIG`, `PRIORITY_COLOR`, `PEOPLE`, `QA_ASSIGNEES`, `JIRA_BASE`

## Interaction with existing filters

| Filter           | Behaviour in Standup view                                                       |
|------------------|----------------------------------------------------------------------------------|
| `tab` (dev/qa)   | dev = all 6 members; qa = only Aarati + Diwas. Attention tab N/A in standup.     |
| `proj`           | Honored — scopes the chart and table to issues in the selected project.          |
| `person`         | Honored — but pinning to one person makes the chart degenerate (one bar). Useful for scoping the table when a single person needs deep review. |
| `statusFilter`   | Ignored in Standup view — Standup has its own implicit filter (active + not UAT). |
| `sortBy`         | Ignored — Standup uses its own per-person sort.                                  |
| `sprintFilter`   | Honored — defaults to new "Active Sprints" aggregate; user can override.         |
| `dateFilter`     | Honored — applies to chart and table identically.                                |

## Implementation surface

Single file change: `src/App.jsx`. Following the project's established single-file pattern.

Additions:
- New view-toggle button in the existing view switcher (`board / reports / standup`).
- New component `StandupChart` (~80 lines).
- New component `StandupTable` (~80 lines).
- Helper `excludeUAT(issue)` — single line, exported alongside `isActive`.
- New `sprintFilter` value `"active"` plus aggregate logic in the existing sprint memo.
- A small `highlightedStatus` state (`null | string`) for chart→table interaction.
- New rendering branch under `view === "standup"` in the main `App` return.

No changes to:
- `server/index.js`, `server/jira.js` — backend untouched.
- `package.json` — no new dependencies.
- `src/Login.jsx` — auth flow untouched.

Documentation:
- `docs/changelog.md` — append a new dated entry following the project's existing changelog format.

## Edge cases

- **No active sprint anywhere** — chart renders all six cards in the idle state. Empty-state copy: `No active sprint detected. Pick a sprint from the dropdown.` This shouldn't happen in practice but degrades gracefully if it does.
- **Issue assigned to non-Maitri member** — already filtered out by the existing JQL on the backend. Defensive: only keys present in `PEOPLE` are rendered as cards; anything else is dropped silently.
- **Issue with no assignee** — backend maps it to `"Unassigned"`. Standup view drops these (DSM is per-person; unassigned tickets are a backlog concern, not a DSM concern).
- **Status not in `STATUS_CONFIG`** — grey fallback in both chart and table, mirroring `StatusPill`.

## Testing

The project has no automated test suite. Manual verification on the running app:

- Switch to Standup view, confirm default sprint is "Active Sprints" and the chart renders one card per Maitri member.
- Confirm the KPI strip at the top shows correct totals for `active`, `blocked`, `in progress`, `ready for QA`, and `idle`.
- Confirm UAT-named statuses are absent (cross-check by switching to Reports view and looking for them).
- Confirm Blocked tickets show as red-dot chips at the top of each card's chip list.
- Click a status chip on any card, confirm the table scrolls to that person, the matching status group is highlighted, and non-matching chips dim across all cards.
- Click a legend pill, confirm it highlights without scrolling.
- Toggle dev/qa tab, confirm the chart re-renders with appropriate audience.
- Pick a specific sprint from the dropdown, confirm the chart updates.
- Verify a person with zero active tasks renders a dimmed card with the "no active work" muted text.
- Resize the browser narrow → confirm the grid collapses from 3 columns to 2 to 1 cleanly.

## Out of scope (possible follow-ups)

- Snapshot/export of the standup view (e.g., copy a markdown summary to clipboard for paste into Slack).
- Sprint burndown trend over time.
- Highlighting issues that haven't been touched since the last DSM (e.g., > 24h without a status change or comment).
- Per-person notes ("what they said in standup yesterday") — would need persistence beyond `localStorage`.
