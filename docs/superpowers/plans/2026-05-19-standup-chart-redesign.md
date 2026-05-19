# Standup Chart Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stacked-bar `StandupChart` in `src/App.jsx` with a responsive per-person card grid plus a KPI summary strip, per `docs/superpowers/specs/2026-05-04-standup-view-design.md` (revision 2026-05-19).

**Architecture:** Single-file change in `src/App.jsx`. The chart block inside `StandupView` (lines ~656-712) is replaced. A new `kpis` `useMemo` is added next to the existing `personGroups`/`maxCount`/`presentStatuses` memos. All existing state (`highlightedStatus`, `personRefs`, `collapsed`), handlers (`handleSegmentClick`, `handleLegendClick`), and the `StandupTable` block below are unchanged. The chart's segment-click handler is reused verbatim for status-chip clicks (just rename mentally — the function still applies). No new files, no new dependencies, no backend changes.

**Tech Stack:** React 19 (function components + hooks), inline-style CSS (project convention), Vite 7. No automated test suite — verification is manual against the running dev server.

---

## File Structure

Only one file is modified:

- **Modify:** `src/App.jsx` — replace the chart block in `StandupView` (~lines 656-712); add a new `kpis` `useMemo` near line 580.
- **Modify:** `docs/changelog.md` — append a dated entry under the existing changelog convention.

No new files. No deletions. The `StandupTable` block and all surrounding filter/state logic are untouched.

---

## Task 1: Add `kpis` memo for the summary strip

**Files:**
- Modify: `src/App.jsx` (insert after the existing `presentStatuses` `useMemo` near line 597)

- [ ] **Step 1: Locate the insertion point**

In `src/App.jsx`, find the end of the `presentStatuses` `useMemo` block. It ends around line 597 with `}, [personGroups]);`. The next executable line is `const toggleCollapse = (name) => setCollapsed(...)` near line 599.

The new memo goes between those two — after `presentStatuses` ends, before `toggleCollapse`.

- [ ] **Step 2: Insert the `kpis` memo**

Add this block immediately after the `presentStatuses` `useMemo` closing line:

```jsx
  const kpis = useMemo(() => {
    let total = 0, blocked = 0, inProgress = 0, readyForQA = 0;
    for (const g of personGroups) {
      total += g.total;
      for (const seg of g.segments) {
        if (seg.status === "Blocked") blocked += seg.count;
        else if (seg.status === "In Progress" || seg.status === "In Dev" || seg.status === "In INT") inProgress += seg.count;
        else if (seg.status === "Ready for QA") readyForQA += seg.count;
      }
    }
    const idle = personGroups.filter(g => g.total === 0).length;
    return { total, blocked, inProgress, readyForQA, idle };
  }, [personGroups]);
```

Note on `inProgress` aggregation: the spec's KPI strip says "in progress" — we combine `In Progress`, `In Dev`, and `In INT` (NACT's equivalents) so the metric is consistent across projects. The status-chip rows in each card still show them as separate chips.

- [ ] **Step 3: Verify the file still parses**

Run: `npm run dev` (or check the existing dev server tab if it's running)
Expected: Vite reloads with no syntax errors. The standup view renders identically to before (the new memo is unused yet).

If Vite reports an error, the most likely cause is a missing comma or brace — re-check the inserted block matches exactly.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat(standup): add kpis memo for upcoming summary strip"
```

---

## Task 2: Replace the chart block with the new card grid

**Files:**
- Modify: `src/App.jsx` — replace the entire `{/* Chart */}` block (currently lines 657-712 — verify exact line numbers in your editor before deleting; the surrounding code may have shifted by a few lines after Task 1).

- [ ] **Step 1: Identify the block to replace**

In `src/App.jsx`, find the comment line `{/* Chart */}`. The block to replace starts with that comment and ends with the closing `</div>` of the chart container — the one immediately before the comment `{/* Per-person sections */}`. The block has this rough shape:

```jsx
      {/* Chart */}
      <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 800, ... }}>Workload by person</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {personGroups.map(g => { ... bar rows ... })}
        </div>
        {presentStatuses.length > 0 && (
          <div ...>{/* legend */}</div>
        )}
      </div>
```

You are replacing everything from `{/* Chart */}` through the matching `</div>` of the outermost chart container.

- [ ] **Step 2: Replace the block**

Paste this in place of the entire block from Step 1:

```jsx
      {/* Chart */}
      <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
        {/* KPI strip */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: txt2, marginRight: 4 }}>Workload</div>
          <span style={{ fontSize: 12, fontWeight: 700, color: txt, padding: "3px 10px", borderRadius: 20, background: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,60,0.05)" }}>{kpis.total} active</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: kpis.blocked > 0 ? (pickColors(STATUS_CONFIG["Blocked"], dark).color) : txt2, padding: "3px 10px", borderRadius: 20, background: kpis.blocked > 0 ? pickColors(STATUS_CONFIG["Blocked"], dark).bg : (dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,60,0.03)") }}>{kpis.blocked} blocked</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: txt, padding: "3px 10px", borderRadius: 20, background: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,60,0.03)" }}>{kpis.inProgress} in progress</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: txt, padding: "3px 10px", borderRadius: 20, background: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,60,0.03)" }}>{kpis.readyForQA} ready for QA</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: txt2, padding: "3px 10px", borderRadius: 20, background: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,60,0.03)" }}>{kpis.idle} idle</span>
        </div>

        {/* Card grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          {personGroups.map(g => {
            const isIdle = g.total === 0;
            const loadPct = isIdle ? 0 : (g.total / maxCount) * 100;
            return (
              <div key={g.name} style={{ background: dark ? "rgba(255,255,255,0.025)" : "rgba(0,0,60,0.02)", border: `1px solid ${bdr}`, borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                {/* Card header */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Avatar name={g.name} size={28} />
                  <div style={{ fontSize: 13, fontWeight: 800, color: isIdle ? txt3 : txt }}>{PEOPLE[g.name].short}</div>
                  <RoleBadge role={PEOPLE[g.name].role} />
                </div>

                {isIdle ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 88, fontSize: 12, color: txt3, fontStyle: "italic", opacity: 0.55 }}>no active work</div>
                ) : (
                  <>
                    {/* Total + mini load bar */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div style={{ fontSize: 32, fontWeight: 800, fontFamily: "monospace", color: txt, lineHeight: 1 }}>{g.total}</div>
                      <div style={{ width: "100%", height: 3, background: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,60,0.06)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ width: loadPct + "%", height: "100%", background: "#4F8EF7", borderRadius: 2, transition: "width 0.2s" }} />
                      </div>
                    </div>

                    {/* Status chips */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                      {g.segments.map(seg => {
                        const cfg = pickColors(STATUS_CONFIG[seg.status] ?? { color: "#94A3B8", colorLight: "#475569", bg: "rgba(148,163,184,0.1)", ring: "#94A3B8" }, dark);
                        const isDimmed = highlightedStatus && highlightedStatus !== seg.status;
                        return (
                          <button
                            key={seg.status}
                            type="button"
                            title={`${seg.status}: ${seg.count}`}
                            onClick={() => handleSegmentClick(seg.status, g.name)}
                            style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", borderRadius: 6, background: cfg.bg, border: "1px solid transparent", cursor: "pointer", opacity: isDimmed ? 0.35 : 1, transition: "opacity 0.15s", fontFamily: "inherit", textAlign: "left", width: "100%" }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
                            <span style={{ flex: 1, fontSize: 11.5, fontWeight: 700, color: cfg.color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{seg.status}</span>
                            <span style={{ fontSize: 12, fontWeight: 800, fontFamily: "monospace", color: cfg.color }}>{seg.count}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        {presentStatuses.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${bdr}`, alignItems: "center" }}>
            {presentStatuses.map(s => {
              const cfg = pickColors(STATUS_CONFIG[s] ?? { color: "#94A3B8", colorLight: "#475569", bg: "rgba(148,163,184,0.1)", ring: "#94A3B8" }, dark);
              const isSelected = highlightedStatus === s;
              const isDimmed = highlightedStatus && !isSelected;
              return (
                <button key={s} onClick={() => handleLegendClick(s)} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 20, background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 700, letterSpacing: "0.03em", border: `1px solid ${isSelected ? cfg.color : cfg.ring + "33"}`, cursor: "pointer", opacity: isDimmed ? 0.4 : 1, transition: "all 0.15s", fontFamily: "inherit" }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.color }} />
                  {s}
                </button>
              );
            })}
            {highlightedStatus && (
              <button onClick={() => setHighlightedStatus(null)} style={{ padding: "3px 9px", borderRadius: 20, background: "transparent", color: txt2, fontSize: 11, fontWeight: 700, border: `1px solid ${bdr}`, cursor: "pointer", fontFamily: "inherit" }}>Clear filter</button>
            )}
          </div>
        )}
      </div>
```

Notes on what changed vs. the original block:
- `Workload by person` heading is replaced by the inline KPI strip.
- The single-row-per-person stacked bars are gone; the grid replaces them.
- Each former bar segment is now a status chip in a card.
- `handleSegmentClick` is reused as-is (the chip click is semantically identical to the old segment click).
- `presentStatuses`, `handleLegendClick`, and the legend block at the bottom are unchanged.

- [ ] **Step 3: Smoke-test the dev server**

Run: `npm start` (if not already running) and open `http://localhost:5173`.

Expected: the app boots without console errors, login flow works, and switching to the Standup tab now shows the new card grid in place of the stacked bars.

If you see "Cannot read properties of undefined (reading 'short')" or similar, the most likely cause is `PEOPLE[g.name]` returning undefined — check that `personGroups` still keys off `Object.keys(PEOPLE)`.

- [ ] **Step 4: Visual verification — active state**

In a sprint with active work, confirm for each non-idle card:
- Avatar + short name + role badge appear in the header row.
- The large total number is centered and matches the sum of chip counts below.
- The thin blue load bar's width is proportional to the busiest person (the busiest person's bar should fill the full width).
- Status chips appear with Blocked first (if present), then In Progress family, In Review, Ready for QA, Ready for Promotion, Req Done, Ready for Development, New — in that order.
- Each chip dot color matches the status color used elsewhere in the app (cross-check by switching to Board view).
- Chip counts sum to the card's total.

- [ ] **Step 5: Visual verification — idle state**

Find or temporarily create an idle person (e.g., filter to a project where one team member has no tickets):
- Card header (avatar/name/role) still appears.
- Body shows the muted italic "no active work" centered, at opacity 0.55.
- No total, no bar, no chips.

- [ ] **Step 6: Interaction verification — chip click**

Click a status chip on any card:
- Page scrolls smoothly to that person's section in the table below.
- All non-matching chips across every card dim to ~35% opacity.
- All non-matching rows in the table dim to ~30% opacity.
- The legend pill for that status appears selected (its border becomes the status color).
- Clicking the same chip again clears the highlight; everything returns to full opacity.
- Clicking a different chip switches the highlight to the new status without needing to clear first.

- [ ] **Step 7: Interaction verification — legend click**

Click a legend pill at the bottom of the chart:
- Highlight is applied to chips and table rows identically to a chip click.
- The page does NOT scroll (legend clicks are a no-scroll filter).
- The "Clear filter" button appears next to the legend; clicking it clears the highlight.

- [ ] **Step 8: Visual verification — KPI strip**

The KPI strip at the top of the chart container shows five pills: `N active`, `N blocked`, `N in progress`, `N ready for QA`, `N idle`.
- `N active` equals the sum of all card totals.
- `N blocked` equals the total count of Blocked chips across all cards. When `> 0`, this pill is red-tinted; when `0`, it uses the neutral pill color.
- `N in progress` aggregates `In Progress + In Dev + In INT` chips across all cards.
- `N ready for QA` equals the total Ready for QA chips across all cards.
- `N idle` equals the number of cards in the idle state.

- [ ] **Step 9: Responsive verification**

Resize the browser window:
- ≥ ~880px wide: 3 cards per row.
- ~560-880px: 2 cards per row.
- < ~560px: 1 card per row.
- Cards never overflow their column; chips wrap their text gracefully if a status name is unusually long.

(The breakpoints are approximate — they emerge from `repeat(auto-fit, minmax(280px, 1fr))` plus the page's outer container width.)

- [ ] **Step 10: Dark mode verification**

Toggle dark mode (existing app toggle). Confirm:
- Card backgrounds remain visible against the page background.
- Chip background tints adapt (the `pickColors(..., dark)` call handles this).
- The load bar's `#4F8EF7` accent is still legible.
- KPI strip pills have enough contrast in both modes.

- [ ] **Step 11: Cross-filter verification**

With the new chart in place:
- Change the Project filter (`All / ACT / CONN / NACT / QA / SUPP`) — cards and KPIs recompute.
- Change the Sprint filter — cards and KPIs recompute.
- Change the Date filter — cards and KPIs recompute.
- Switch between Dev Board and QA Board tabs — the standup view's audience (all 6 vs. just the two QAs) updates correctly.

- [ ] **Step 12: Commit**

```bash
git add src/App.jsx
git commit -m "feat(standup): redesign chart as per-person card grid

Replaces the horizontal stacked-bar chart with a responsive grid of
per-person cards. Each card shows the active total, a mini relative-load
bar, and explicit colored status chips with counts. Idle people get a
dimmed card with 'no active work'. A KPI summary strip at the top
surfaces team-wide blocked/in-progress/ready-for-QA/idle counts.

Refs docs/superpowers/specs/2026-05-04-standup-view-design.md (revision
2026-05-19)."
```

---

## Task 3: Update the changelog

**Files:**
- Modify: `docs/changelog.md`

- [ ] **Step 1: Read the current changelog format**

Open `docs/changelog.md`. Read the most recent entries to match the project's existing format (date heading, bullet list, etc.).

- [ ] **Step 2: Append a new entry**

Add a new dated entry at the top of the changelog (or in whatever position the project's existing format dictates — date-descending is the common convention; match what you see):

```markdown
## 2026-05-19

- **Standup view**: redesigned the chart from a horizontal stacked-bar layout to a responsive per-person card grid. Each card now shows the active total, a mini relative-load bar, and explicit colored status chips with exact counts. Idle people get a dimmed "no active work" card. A KPI summary strip (active / blocked / in progress / ready for QA / idle) sits above the grid. All existing interactions (click a chip to highlight rows in the table below, click a legend pill to filter) are preserved. (Spec: `docs/superpowers/specs/2026-05-04-standup-view-design.md`)
```

If the changelog uses a different format (e.g., emoji prefixes, category headers), adapt the wording to match — but keep the technical content the same.

- [ ] **Step 3: Commit**

```bash
git add docs/changelog.md
git commit -m "docs: log standup chart redesign in changelog"
```

---

## Final verification

After all three tasks are committed:

- [ ] **Step 1: `git log` sanity check**

Run: `git log --oneline -5`

Expected: three new commits at the top of the log:
1. `docs: log standup chart redesign in changelog`
2. `feat(standup): redesign chart as per-person card grid`
3. `feat(standup): add kpis memo for upcoming summary strip`

- [ ] **Step 2: One final manual pass**

Reload the app one more time, switch to the Standup view, confirm:
- The chart renders the new card grid.
- KPI strip shows correct totals.
- Idle people are dimmed.
- Clicking chips highlights and scrolls correctly.
- Resize works.
- Dark mode works.

If anything regressed, fix in a new commit (do not amend).
