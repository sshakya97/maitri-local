# Maitri Dashboard — Feature Batch: QA Project, Collapsible Groups, Sprint Filter, Drag-and-Drop

**Date:** 2026-04-02
**Status:** Draft

---

## Feature A: QA Project Tickets

### Problem
QA automation tickets live in the `QA` Jira project (e.g., `QA-123`). The current JQL only queries `ACT`, `CONN`, `NACT`, so Aarati and Diwas's QA work is invisible on the dashboard.

### Changes

**`server/jira.js`**
- Add `QA` to the JQL project list: `project in (ACT, CONN, NACT, QA)`
- Add `sprint.startDate` to the fields list (needed for Feature C)

**`src/App.jsx`**
- Add `QA` to `PROJECT_COLORS` with a distinct color (e.g., warm orange `#FB923C`)
- Add `"QA"` to the project filter buttons: `["All","ACT","CONN","NACT","QA"]`
- No other frontend changes needed — QA Board tab already filters by QA assignees, and cards/table already render any project

### Impact
QA project issues assigned to team members will appear on both Dev Board and QA Board tabs, filtered and displayed the same as ACT/CONN/NACT issues.

---

## Feature B: Collapsible Status Groups

### Problem
On the board view, status groups always show all cards. When many statuses have many tickets, the board gets long and hard to scan.

### Changes

**`src/App.jsx`**
- Add state: `const [collapsedGroups, setCollapsedGroups] = useState(new Set())`
- Make the status group header clickable to toggle collapse
- When collapsed: show only the header bar (status name + count + chevron indicator)
- When expanded: show header + all cards (current behavior)
- Default: all groups expanded
- Also apply to the "Promoted / Done / Deferred" non-active section at the bottom
- Visual indicator: chevron `▸` when collapsed, `▾` when expanded, placed on the right side of the header

### Interaction
- Click anywhere on the status group header to toggle
- Collapse state resets on page refresh (no persistence needed)

---

## Feature C: Sprint Filter Dropdown

### Problem
No way to filter by sprint. Users want to see current sprint work vs. past sprint work. Different projects have different sprint cadences.

### Data Requirements

**`server/jira.js`**
- The `sprint` field from Jira already provides `name` and `endDate`
- Also need `startDate` — currently not mapped. Add `sprintStartDate` to `mapIssue()`:
  ```
  sprintStartDate: sprint?.startDate || null
  ```

**`src/App.jsx`**

### Sprint Detection
- **Current sprint**: a sprint where `sprintStartDate <= today <= sprintEndDate`
- Since projects have different sprint schedules, "Current Sprint" means "the issue's own sprint is currently active"
- Issues with no sprint data are shown in all sprint filter modes except when a specific sprint name is selected

### UI: Dropdown in Filter Bar
- Placed after the Status filter, before Sort
- Options:
  1. **"All Sprints"** (default) — no sprint filtering
  2. **"Current Sprint"** — only issues whose sprint is currently active
  3. **"Previous Sprint"** — issues whose sprint has ended (endDate < today) and is the most recent completed sprint per project
  4. Individual sprint names extracted from the issue data, sorted by end date descending
- Label: `SPRINT` (matching existing filter label style)

### Filtering Logic
```
if (sprintFilter === "current") {
  list = list.filter(i => i.sprintStartDate && i.sprintEndDate &&
    new Date(i.sprintStartDate) <= now && now <= new Date(i.sprintEndDate));
} else if (sprintFilter === "previous") {
  // For each project, find the most recently ended sprint
  // Filter to issues in those sprints
} else if (sprintFilter !== "all") {
  list = list.filter(i => i.sprintName === sprintFilter);
}
```

Issues with no sprint are hidden when a specific sprint is selected, but shown under "All Sprints".

---

## Feature D: Drag-and-Drop Card Reordering

### Problem
Cards within status groups have a fixed sort order. Users want to manually reorder cards to reflect personal priorities or focus.

### Default Card Order
Within each status group, cards are sorted by:
1. Priority (P0 first, then P1, P2, P3, P4, Unprioritized)
2. Then by updated date (most recent first) as tiebreaker

This replaces the current global sort for board view, which sorts all cards together before grouping.

### Drag-and-Drop

**Library:** `@dnd-kit/core` + `@dnd-kit/sortable`
- Lightweight (~10KB gzipped), React-first, good accessibility
- No heavy dependencies

**Behavior:**
- Drag cards within the same status group to reorder
- No cross-group dragging (that would imply status changes)
- Visual feedback: dragged card is semi-transparent, drop target indicated by a gap
- On drop: card order updates immediately

**Persistence:**
- Custom card order saved to `localStorage` keyed by status group
- Format: `maitri-card-order-{status}` -> array of issue keys
- On data refresh: merge — known keys keep their manual order, new keys append at their default-sorted position, removed keys are pruned
- A small "Reset order" button in each status group header to clear manual ordering

### Integration with Filters
- When person/project/status filters change, the visible cards change but manual order is preserved for cards that remain visible
- Sort buttons in the filter bar apply to list/table view only; board view always uses per-group ordering (default priority + manual override)

---

## Files Modified

| File | Changes |
|------|---------|
| `server/jira.js` | Add `QA` to JQL projects, map `sprintStartDate` |
| `src/App.jsx` | QA project color/filter, collapsible groups, sprint dropdown, drag-and-drop, default card ordering |
| `package.json` | Add `@dnd-kit/core`, `@dnd-kit/sortable` |

---

## Out of Scope
- Cross-group drag (would need Jira status transition API)
- Sprint creation/management
- Persisting collapse state across refreshes
- QA project custom statuses (will use existing status mapping; add new statuses if discovered)
