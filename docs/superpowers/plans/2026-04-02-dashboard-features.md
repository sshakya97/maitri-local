# Dashboard Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add QA project tickets, collapsible status groups, sprint filter dropdown, and drag-and-drop card reordering to the Maitri dashboard.

**Architecture:** Backend adds QA project to JQL and exposes sprint start dates. Frontend adds collapse state, sprint filter, and `@dnd-kit` for drag-and-drop within status groups. Card order persisted in localStorage.

**Tech Stack:** React 19, Express, @dnd-kit/core + @dnd-kit/sortable, localStorage

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `server/jira.js` | Modify | Add QA project to JQL, map `sprintStartDate` |
| `src/App.jsx` | Modify | All 4 frontend features |
| `package.json` | Modify | Add @dnd-kit dependencies |
| `docs/changelog.md` | Modify | Document changes |

---

### Task 1: Add QA Project to Backend

**Files:**
- Modify: `server/jira.js:55-59` (JQL function)
- Modify: `server/jira.js:84-108` (mapIssue function)

- [ ] **Step 1: Update JQL to include QA project**

In `server/jira.js`, update the `buildJQL()` function:

```js
function buildJQL() {
  const allIds = TEAM_ACCOUNT_IDS.map(id => `"${id}"`).join(', ');
  const qaIds = QA_ACCOUNT_IDS.map(id => `"${id}"`).join(', ');
  return `project in (ACT, CONN, NACT, QA) AND (assignee in (${allIds}) OR "SDET Assignee" in (${qaIds})) ORDER BY updated DESC`;
}
```

The only change is `project in (ACT, CONN, NACT)` → `project in (ACT, CONN, NACT, QA)`.

- [ ] **Step 2: Add sprintStartDate to mapIssue**

In `server/jira.js`, inside `mapIssue()`, add `sprintStartDate` after the existing `sprintEndDate` line:

```js
function mapIssue(raw) {
  const f = raw.fields;
  const sprint = f.sprint;
  const commentInfo = extractComment(f.comment);

  return {
    project: f.project?.key || raw.key.split('-')[0],
    key: raw.key,
    summary: f.summary,
    status: f.status?.name || 'Unknown',
    statusCategory: f.status?.statusCategory?.key || 'undefined',
    assignee: f.assignee?.displayName || 'Unassigned',
    assigneeAccountId: f.assignee?.accountId || '',
    sdetAssignee: f.customfield_10058?.displayName || null,
    sdetAssigneeAccountId: f.customfield_10058?.accountId || null,
    priority: f.priority?.name || 'Unprioritized',
    issuetype: f.issuetype?.name || '',
    updated: f.updated,
    duedate: f.duedate || null,
    targetEndDate: f.customfield_10015 || null,
    sprintName: sprint?.name || null,
    sprintStartDate: sprint?.startDate || null,
    sprintEndDate: sprint?.endDate || null,
    ...commentInfo,
  };
}
```

- [ ] **Step 3: Verify backend serves QA project data**

Run: `npm run server`

Then in another terminal: `curl http://localhost:3001/api/issues | node -e "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>{const issues=JSON.parse(Buffer.concat(d));const qa=issues.filter(i=>i.project==='QA');console.log('QA issues:',qa.length);if(qa[0])console.log('Sample:',qa[0].key,qa[0].summary)})"`

Expected: QA issues count > 0, sample QA ticket key like `QA-xxx`.

- [ ] **Step 4: Commit**

```bash
git add server/jira.js
git commit -m "feat: add QA project to Jira query and map sprintStartDate"
```

---

### Task 2: Add QA Project to Frontend

**Files:**
- Modify: `src/App.jsx:41-45` (PROJECT_COLORS)
- Modify: `src/App.jsx:507` (project filter buttons)

- [ ] **Step 1: Add QA to PROJECT_COLORS**

In `src/App.jsx`, add a QA entry to `PROJECT_COLORS`:

```js
const PROJECT_COLORS = {
  ACT:  { bg: "rgba(79,142,247,0.15)",  color: "#4F8EF7" },
  CONN: { bg: "rgba(167,139,250,0.15)", color: "#A78BFA" },
  NACT: { bg: "rgba(52,211,153,0.15)",  color: "#34D399" },
  QA:   { bg: "rgba(251,146,60,0.15)",  color: "#FB923C" },
};
```

- [ ] **Step 2: Add QA to project filter buttons**

In `src/App.jsx`, find the project filter line:

```js
{["All","ACT","CONN","NACT"].map(p => <Btn key={p} active={proj === p} onClick={() => setProj(p)}>{p}</Btn>)}
```

Change to:

```js
{["All","ACT","CONN","NACT","QA"].map(p => <Btn key={p} active={proj === p} onClick={() => setProj(p)}>{p}</Btn>)}
```

- [ ] **Step 3: Verify QA tickets appear on dashboard**

Run: `npm start`

Open `http://localhost:5173`. Click the "QA" project filter button — should show only QA project tickets. QA Board tab should also show QA project tickets for Aarati/Diwas. QA tickets should have an orange project badge.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add QA project color and filter to frontend"
```

---

### Task 3: Collapsible Status Groups

**Files:**
- Modify: `src/App.jsx:256-264` (App state)
- Modify: `src/App.jsx:526-557` (board view rendering)

- [ ] **Step 1: Add collapsed state**

In `src/App.jsx`, inside the `App()` function, add after the existing `expanded` state:

```js
const [collapsedGroups, setCollapsedGroups] = useState(new Set());
```

Add a toggle helper after the existing `toggle` function:

```js
const toggleGroup = status => setCollapsedGroups(prev => {
  const n = new Set(prev); n.has(status) ? n.delete(status) : n.add(status); return n;
});
```

- [ ] **Step 2: Update board view status group rendering**

In `src/App.jsx`, find the board view section where `boardGroups.map` renders each group. Replace the group rendering block:

```jsx
{boardGroups.map(group => {
  const cfg = STATUS_CONFIG[group.status] ?? STATUS_CONFIG["New"];
  const isCollapsed = collapsedGroups.has(group.status);
  return (
    <div key={group.status} style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, overflow: "hidden" }}>
      <div onClick={() => toggleGroup(group.status)} style={{ padding: "10px 14px", borderBottom: isCollapsed ? "none" : `1px solid ${bdr}`, display: "flex", alignItems: "center", gap: 8, background: cfg.bg, cursor: "pointer", userSelect: "none" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.color }} />
        <span style={{ fontSize: 12, fontWeight: 800, color: cfg.color, letterSpacing: "0.03em" }}>{group.status}</span>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 700, color: cfg.color, background: cfg.bg, padding: "1px 7px", borderRadius: 10, border: `1px solid ${cfg.color}30` }}>{group.issues.length}</span>
          <span style={{ fontSize: 10, color: cfg.color }}>{isCollapsed ? "▸" : "▾"}</span>
        </span>
      </div>
      {!isCollapsed && (
        <div style={{ padding: 10 }}>
          {group.issues.map(issue => <IssueCard key={issue.key} issue={issue} expanded={expanded.has(issue.key)} onToggle={() => toggle(issue.key)} dark={dark} />)}
        </div>
      )}
    </div>
  );
})}
```

- [ ] **Step 3: Update non-active section to be collapsible**

Find the "Promoted / Done / Deferred" section. Replace it with:

```jsx
{filtered.filter(i => !isActive(i)).length > 0 && (
  <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, overflow: "hidden" }}>
    <div onClick={() => toggleGroup("__done__")} style={{ padding: "10px 16px", borderBottom: collapsedGroups.has("__done__") ? "none" : `1px solid ${bdr}`, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
      <span style={{ fontSize: 12, fontWeight: 800, color: txt2 }}>Promoted / Done / Deferred</span>
      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 11, color: txt2, fontFamily: "monospace" }}>{filtered.filter(i => !isActive(i)).length}</span>
        <span style={{ fontSize: 10, color: txt2 }}>{collapsedGroups.has("__done__") ? "▸" : "▾"}</span>
      </span>
    </div>
    {!collapsedGroups.has("__done__") && (
      <div style={{ padding: 10, maxHeight: 340, overflowY: "auto" }}>
        {filtered.filter(i => !isActive(i)).map(issue => <IssueCard key={issue.key} issue={issue} expanded={expanded.has(issue.key)} onToggle={() => toggle(issue.key)} dark={dark} />)}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 4: Verify collapse/expand works**

Run: `npm start`

On the board view, click a status group header — it should collapse to show only the header with count and `▸`. Click again — it should expand with `▾` and show all cards. Test the "Promoted / Done / Deferred" section too.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add collapsible status groups in board view"
```

---

### Task 4: Sprint Filter Dropdown

**Files:**
- Modify: `src/App.jsx:256-264` (App state)
- Modify: `src/App.jsx:299-319` (filtered memo)
- Modify: `src/App.jsx:341-346` (availableStatuses memo — add sprint list)
- Modify: `src/App.jsx:505-522` (filter bar)

- [ ] **Step 1: Add sprint filter state and sprint list memo**

In `src/App.jsx`, add state after the existing `sortBy` state:

```js
const [sprintFilter, setSprintFilter] = useState("all");
```

Add a memo to compute available sprints (place after `availableStatuses` memo):

```js
const availableSprints = useMemo(() => {
  const now = new Date();
  const sprintMap = new Map();
  for (const issue of issues) {
    if (issue.sprintName && issue.sprintEndDate) {
      if (!sprintMap.has(issue.sprintName)) {
        sprintMap.set(issue.sprintName, {
          name: issue.sprintName,
          startDate: issue.sprintStartDate,
          endDate: issue.sprintEndDate,
          isCurrent: issue.sprintStartDate && issue.sprintEndDate &&
            new Date(issue.sprintStartDate) <= now && now <= new Date(issue.sprintEndDate),
        });
      }
    }
  }
  return [...sprintMap.values()].sort((a, b) => new Date(b.endDate) - new Date(a.endDate));
}, [issues]);
```

- [ ] **Step 2: Add sprint filtering to the filtered memo**

In `src/App.jsx`, in the `filtered` useMemo, add sprint filtering after the status filter and before the sort. Also add `sprintFilter` to the dependency array:

```js
const filtered = useMemo(() => {
  let list = issues;
  const now = new Date();
  if (tab === "qa") list = list.filter(i => QA_ASSIGNEES.has(i.assignee) || QA_ASSIGNEES.has(i.sdetAssignee));
  if (person !== "All") list = list.filter(i => i.assignee === person || i.sdetAssignee === person);
  if (proj   !== "All") list = list.filter(i => i.project === proj);
  if (statusFilter === "Active") list = list.filter(i => isActive(i));
  else if (statusFilter !== "All") list = list.filter(i => i.status === statusFilter);

  // Sprint filter
  if (sprintFilter === "current") {
    list = list.filter(i => i.sprintStartDate && i.sprintEndDate &&
      new Date(i.sprintStartDate) <= now && now <= new Date(i.sprintEndDate));
  } else if (sprintFilter === "previous") {
    const prevSprints = new Set();
    const projectSprints = {};
    for (const s of availableSprints) {
      if (!s.isCurrent && new Date(s.endDate) < now) {
        const proj = issues.find(i => i.sprintName === s.name)?.project;
        if (proj && !projectSprints[proj]) {
          projectSprints[proj] = s.name;
          prevSprints.add(s.name);
        }
      }
    }
    list = list.filter(i => prevSprints.has(i.sprintName));
  } else if (sprintFilter !== "all") {
    list = list.filter(i => i.sprintName === sprintFilter);
  }

  return [...list].sort((a, b) => {
    if (sortBy === "updated")  return new Date(b.updated) - new Date(a.updated);
    if (sortBy === "priority") return ["P0","P1","P2","P3","P4","Unprioritized"].indexOf(a.priority) - ["P0","P1","P2","P3","P4","Unprioritized"].indexOf(b.priority);
    if (sortBy === "status")   return (a.status||"").localeCompare(b.status||"");
    if (sortBy === "deadline") {
      const da = getDeadline(a), db = getDeadline(b);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return new Date(da) - new Date(db);
    }
    return 0;
  });
}, [issues, person, proj, statusFilter, sortBy, tab, sprintFilter, availableSprints]);
```

- [ ] **Step 3: Add sprint dropdown to filter bar**

In `src/App.jsx`, in the filter bar, add the sprint dropdown after the status dropdown and before the sort divider. Find the `<div style={{ width: 1, height: 18, background: bdr }} />` between status and sort, and add the sprint filter before it:

```jsx
<div style={{ width: 1, height: 18, background: bdr }} />
<span style={{ fontSize: 10, color: txt2, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>Sprint</span>
<select
  value={sprintFilter}
  onChange={e => setSprintFilter(e.target.value)}
  style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${sprintFilter !== "all" ? "#4F8EF7" : bdr}`, background: sprintFilter !== "all" ? "#4F8EF7" : (dark ? "#181D2C" : "#fff"), color: sprintFilter !== "all" ? "#fff" : txt2, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", appearance: "auto", minWidth: 140 }}
>
  <option value="all">All Sprints</option>
  <option value="current">Current Sprint</option>
  <option value="previous">Previous Sprint</option>
  {availableSprints.map(s => (
    <option key={s.name} value={s.name}>{s.name}{s.isCurrent ? " (current)" : ""}</option>
  ))}
</select>
<div style={{ width: 1, height: 18, background: bdr }} />
```

- [ ] **Step 4: Verify sprint filter works**

Run: `npm start`

Open the dashboard. The sprint dropdown should appear in the filter bar. Select "Current Sprint" — should show only issues in currently active sprints. Select a specific sprint name — should show only those issues. "All Sprints" shows everything.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add sprint filter dropdown with current/previous/specific sprint options"
```

---

### Task 5: Install @dnd-kit Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install @dnd-kit packages**

Run:
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Expected: packages added to `dependencies` in `package.json`.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @dnd-kit dependencies for drag-and-drop"
```

---

### Task 6: Drag-and-Drop Card Reordering

**Files:**
- Modify: `src/App.jsx:1` (imports)
- Modify: `src/App.jsx:150-192` (IssueCard — wrap with sortable)
- Modify: `src/App.jsx:348-361` (boardGroups memo — default sort by priority)
- Modify: `src/App.jsx:526-557` (board view — add DnD context)

- [ ] **Step 1: Add dnd-kit imports**

At the top of `src/App.jsx`, add after the React import:

```js
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
```

- [ ] **Step 2: Create SortableIssueCard wrapper**

Add this component after the `IssueCard` component (after line ~192):

```jsx
function SortableIssueCard({ issue, expanded, onToggle, dark }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: issue.key });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative",
    zIndex: isDragging ? 10 : "auto",
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <IssueCard issue={issue} expanded={expanded} onToggle={onToggle} dark={dark} />
    </div>
  );
}
```

- [ ] **Step 3: Add card order state and localStorage persistence**

Inside the `App()` function, add after the `collapsedGroups` state:

```js
const [cardOrder, setCardOrder] = useState(() => {
  try {
    const saved = localStorage.getItem("maitri-card-order");
    return saved ? JSON.parse(saved) : {};
  } catch { return {}; }
});
```

Add an effect to persist card order:

```js
useEffect(() => {
  localStorage.setItem("maitri-card-order", JSON.stringify(cardOrder));
}, [cardOrder]);
```

- [ ] **Step 4: Update boardGroups memo to sort by priority by default and apply manual order**

Replace the existing `boardGroups` useMemo with:

```js
const boardGroups = useMemo(() => {
  const activeFiltered = filtered.filter(isActive);
  const statusGroups = {};
  const priorityOrder = ["P0","P1","P2","P3","P4","Unprioritized"];
  for (const issue of activeFiltered) {
    if (!statusGroups[issue.status]) statusGroups[issue.status] = [];
    statusGroups[issue.status].push(issue);
  }
  // Sort within each group: manual order first, then priority, then updated
  for (const status of Object.keys(statusGroups)) {
    const manual = cardOrder[status] || [];
    statusGroups[status].sort((a, b) => {
      const ai = manual.indexOf(a.key);
      const bi = manual.indexOf(b.key);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      const pa = priorityOrder.indexOf(a.priority);
      const pb = priorityOrder.indexOf(b.priority);
      if (pa !== pb) return pa - pb;
      return new Date(b.updated) - new Date(a.updated);
    });
  }
  return Object.entries(statusGroups)
    .map(([status, issues]) => ({ status, issues }))
    .sort((a, b) => {
      const order = ["Blocked","In Progress","In Dev","In INT","In Review","Ready for QA","Ready for Promotion","Req Done","Ready for Development","New"];
      return (order.indexOf(a.status) === -1 ? 99 : order.indexOf(a.status)) - (order.indexOf(b.status) === -1 ? 99 : order.indexOf(b.status));
    });
}, [filtered, cardOrder]);
```

Add `cardOrder` to the dependency array.

- [ ] **Step 5: Add DnD sensors and handler**

Inside `App()`, add after the `toggleGroup` helper:

```js
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
);

const handleDragEnd = useCallback((event, status) => {
  const { active, over } = event;
  if (!over || active.id === over.id) return;
  setCardOrder(prev => {
    const group = boardGroups.find(g => g.status === status);
    if (!group) return prev;
    const keys = group.issues.map(i => i.key);
    const oldIndex = keys.indexOf(active.id);
    const newIndex = keys.indexOf(over.id);
    if (oldIndex === -1 || newIndex === -1) return prev;
    const newKeys = [...keys];
    newKeys.splice(oldIndex, 1);
    newKeys.splice(newIndex, 0, active.id);
    return { ...prev, [status]: newKeys };
  });
}, [boardGroups]);
```

- [ ] **Step 6: Wrap board groups with DnD context**

Replace the board view group rendering (the content inside `{boardGroups.map(group => { ... })}`) with:

```jsx
{boardGroups.map(group => {
  const cfg = STATUS_CONFIG[group.status] ?? STATUS_CONFIG["New"];
  const isCollapsed = collapsedGroups.has(group.status);
  const hasManualOrder = cardOrder[group.status]?.length > 0;
  return (
    <div key={group.status} style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, overflow: "hidden" }}>
      <div onClick={() => toggleGroup(group.status)} style={{ padding: "10px 14px", borderBottom: isCollapsed ? "none" : `1px solid ${bdr}`, display: "flex", alignItems: "center", gap: 8, background: cfg.bg, cursor: "pointer", userSelect: "none" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.color }} />
        <span style={{ fontSize: 12, fontWeight: 800, color: cfg.color, letterSpacing: "0.03em" }}>{group.status}</span>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          {hasManualOrder && (
            <button onClick={e => { e.stopPropagation(); setCardOrder(prev => { const n = { ...prev }; delete n[group.status]; return n; }); }} style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, border: `1px solid ${cfg.color}30`, background: "transparent", color: cfg.color, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Reset order</button>
          )}
          <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 700, color: cfg.color, background: cfg.bg, padding: "1px 7px", borderRadius: 10, border: `1px solid ${cfg.color}30` }}>{group.issues.length}</span>
          <span style={{ fontSize: 10, color: cfg.color }}>{isCollapsed ? "▸" : "▾"}</span>
        </span>
      </div>
      {!isCollapsed && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={e => handleDragEnd(e, group.status)}>
          <SortableContext items={group.issues.map(i => i.key)} strategy={verticalListSortingStrategy}>
            <div style={{ padding: 10 }}>
              {group.issues.map(issue => <SortableIssueCard key={issue.key} issue={issue} expanded={expanded.has(issue.key)} onToggle={() => toggle(issue.key)} dark={dark} />)}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
})}
```

- [ ] **Step 7: Verify drag-and-drop works**

Run: `npm start`

On the board view:
1. Drag a card within a status group — it should reorder
2. Refresh the page — order should persist
3. Click "Reset order" button on a group header — should revert to default priority sorting
4. Dragging should NOT work across groups

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx package.json package-lock.json
git commit -m "feat: add drag-and-drop card reordering with localStorage persistence"
```

---

### Task 7: Update Changelog

**Files:**
- Modify: `docs/changelog.md`

- [ ] **Step 1: Add changelog entry**

Prepend the following entry at the top of `docs/changelog.md` (after the `#` heading):

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/changelog.md
git commit -m "docs: update changelog for 2026-04-02 feature batch"
```
