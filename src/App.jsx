import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Login from "./Login.jsx";
import * as XLSX from "xlsx";

const JIRA_BASE = "https://macrohealth.atlassian.net/browse/";
const API_BASE = "http://localhost:3001";

function authHeaders(creds) {
  return { "x-jira-email": creds.email, "x-jira-token": creds.token };
}

const PEOPLE = {
  "Anjali Prajapati":          { short: "Anjali",  color: "#E85D8A", initials: "AP", role: "Dev" },
  "Sanabul Uddin":             { short: "Sanabul", color: "#4F8EF7", initials: "SU", role: "Dev" },
  "Sashank Shakya - Maitri":   { short: "Sashank", color: "#F7A24F", initials: "SS", role: "Dev" },
  "buddhi.sagar.poudel.ext":   { short: "Buddhi",  color: "#4FC9A4", initials: "BS", role: "Dev" },
  "Aarati Adhikari":           { short: "Aarati",  color: "#C084FC", initials: "AA", role: "QA" },
  "Diwas Dhital - Maitri":    { short: "Diwas",   color: "#38BDF8", initials: "DD", role: "QA" },
};

const STATUS_CONFIG = {
  "In Progress":          { color: "#4F8EF7", colorLight: "#1D4ED8", bg: "rgba(79,142,247,0.12)",  ring: "#4F8EF7" },
  "Blocked":              { color: "#F74F4F", colorLight: "#B91C1C", bg: "rgba(247,79,79,0.12)",   ring: "#F74F4F" },
  "Ready for QA":         { color: "#A78BFA", colorLight: "#6D28D9", bg: "rgba(167,139,250,0.12)", ring: "#A78BFA" },
  "Ready for Promotion":  { color: "#F7C94F", colorLight: "#B45309", bg: "rgba(247,201,79,0.12)",  ring: "#F7C94F" },
  "Ready for Development":{ color: "#7DD3FC", colorLight: "#0369A1", bg: "rgba(125,211,252,0.12)", ring: "#7DD3FC" },
  "In Review":            { color: "#FB923C", colorLight: "#C2410C", bg: "rgba(251,146,60,0.12)",  ring: "#FB923C" },
  "New":                  { color: "#94A3B8", colorLight: "#475569", bg: "rgba(148,163,184,0.12)", ring: "#94A3B8" },
  "Promoted":             { color: "#34D399", colorLight: "#047857", bg: "rgba(52,211,153,0.1)",   ring: "#34D399" },
  "Done":                 { color: "#64748B", colorLight: "#334155", bg: "rgba(100,116,139,0.1)",  ring: "#64748B" },
  "Deferred":             { color: "#94A3B8", colorLight: "#475569", bg: "rgba(148,163,184,0.08)", ring: "#94A3B8" },
  // NACT-specific statuses
  "In INT":               { color: "#4F8EF7", colorLight: "#1D4ED8", bg: "rgba(79,142,247,0.12)",  ring: "#4F8EF7" },
  "In Dev":               { color: "#38BDF8", colorLight: "#0369A1", bg: "rgba(56,189,248,0.12)",  ring: "#38BDF8" },
  "Req Done":             { color: "#F7C94F", colorLight: "#B45309", bg: "rgba(247,201,79,0.12)",  ring: "#F7C94F" },
};

const PRIORITY_COLOR = {
  P0: { color: "#F74F4F", colorLight: "#B91C1C" },
  P1: { color: "#F7A24F", colorLight: "#C2410C" },
  P2: { color: "#F7C94F", colorLight: "#A16207" },
  P3: { color: "#A78BFA", colorLight: "#6D28D9" },
  P4: { color: "#94A3B8", colorLight: "#475569" },
  Unprioritized: { color: "#64748B", colorLight: "#334155" },
};

const ACTIVE_CATEGORIES = new Set(["indeterminate", "new"]);

const QA_ASSIGNEES = new Set(["Aarati Adhikari", "Diwas Dhital - Maitri"]);

const PROJECT_COLORS = {
  ACT:  { bg: "rgba(79,142,247,0.15)",  color: "#4F8EF7", colorLight: "#1D4ED8" },
  CONN: { bg: "rgba(167,139,250,0.15)", color: "#A78BFA", colorLight: "#6D28D9" },
  NACT: { bg: "rgba(52,211,153,0.15)",  color: "#34D399", colorLight: "#047857" },
  QA:   { bg: "rgba(251,146,60,0.15)",  color: "#FB923C", colorLight: "#C2410C" },
  SUPP: { bg: "rgba(244,114,182,0.15)", color: "#F472B6", colorLight: "#BE185D" },
};

// Resolve a color config to {color, bg, ring} for the active theme.
// In light theme, derive bg/ring from `colorLight` so the chip is more vibrant on a white background.
function pickColors(cfg, dark) {
  if (dark || !cfg?.colorLight) {
    return { color: cfg?.color, bg: cfg?.bg, ring: cfg?.ring ?? cfg?.color };
  }
  const c = cfg.colorLight;
  return { color: c, bg: c + "1F", ring: c };
}

// ─── helpers ────────────────────────────────────────────────────
function relTime(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso);
  const m = Math.floor(diff / 60000);
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  const d = Math.floor(h / 24);
  if (d < 30) return d + "d ago";
  return Math.floor(d / 30) + "mo ago";
}

function getDeadline(issue) {
  const dates = [issue.duedate, issue.targetEndDate, issue.sprintEndDate].filter(Boolean);
  if (dates.length === 0) return null;
  return dates.reduce((earliest, d) => (d < earliest ? d : earliest));
}

function deadlineInfo(issue) {
  const deadline = getDeadline(issue);
  if (!deadline) return null;
  const diff = new Date(deadline) - new Date();
  const days = Math.ceil(diff / 86400000);
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, color: "#F74F4F", urgency: 0 };
  if (days <= 3) return { label: `${days}d left`, color: "#F7C94F", urgency: 1 };
  if (days <= 7) return { label: `${days}d left`, color: "#34D399", urgency: 2 };
  return { label: `${days}d left`, color: "#64748B", urgency: 3 };
}

function isStale(issue) {
  if (!issue.updated) return false;
  const daysSinceUpdate = (Date.now() - new Date(issue.updated)) / 86400000;
  return daysSinceUpdate > 7;
}

function isActive(issue) {
  return ACTIVE_CATEGORIES.has(issue.statusCategory);
}

function excludeUAT(issue) {
  return !issue.status?.toLowerCase().includes("uat");
}

function excludeDeferred(issue) {
  return issue.status !== "Deferred";
}

function filterBySprint(list, sprintFilter, availableSprints) {
  if (sprintFilter === "all") return list;
  if (sprintFilter === "active") {
    const activeNames = new Set(availableSprints.filter(s => s.state === "active").map(s => s.name));
    return list.filter(i => i.sprintName && activeNames.has(i.sprintName));
  }
  return list.filter(i => i.sprintName === sprintFilter);
}

// ─── mini components ────────────────────────────────────────────
function Avatar({ name, size = 28 }) {
  const p = PEOPLE[name];
  const bg = p?.color ?? "#64748B";
  const initials = p?.initials ?? name.slice(0, 2).toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.38, fontWeight: 800, color: "#fff", flexShrink: 0, letterSpacing: "-0.02em", userSelect: "none" }}>
      {initials}
    </div>
  );
}

function RoleBadge({ role }) {
  if (role !== "QA") return null;
  return (
    <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 5px", borderRadius: 4, background: "rgba(192,132,252,0.15)", color: "#C084FC", letterSpacing: "0.08em", marginLeft: 4 }}>QA</span>
  );
}

function StatusPill({ status, dark = true }) {
  const raw = STATUS_CONFIG[status] ?? { color: "#94A3B8", colorLight: "#475569", bg: "rgba(148,163,184,0.1)", ring: "#94A3B8" };
  const cfg = pickColors(raw, dark);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 20, background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 700, letterSpacing: "0.03em", border: `1px solid ${cfg.ring}33`, whiteSpace: "nowrap" }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
      {status}
    </span>
  );
}

function PriBadge({ priority, dark = true }) {
  const raw = PRIORITY_COLOR[priority] ?? { color: "#94A3B8", colorLight: "#475569" };
  const color = dark ? raw.color : raw.colorLight;
  return (
    <span style={{ padding: "2px 7px", borderRadius: 4, background: color + "18", color, fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", border: `1px solid ${color}30` }}>
      {priority}
    </span>
  );
}

function DeadlineBadge({ issue }) {
  const info = deadlineInfo(issue);
  if (!info) return null;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: info.color + "18", color: info.color, border: `1px solid ${info.color}30` }}>
      {info.label}
    </span>
  );
}

function StaleBadge() {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "rgba(251,146,60,0.15)", color: "#FB923C", border: "1px solid rgba(251,146,60,0.3)" }}>
      Stale
    </span>
  );
}

function ProjectBadge({ project, dark = true }) {
  const raw = PROJECT_COLORS[project] ?? PROJECT_COLORS.ACT;
  const pc = pickColors(raw, dark);
  return (
    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: pc.bg, color: pc.color, fontWeight: 700 }}>{project}</span>
  );
}

function IssueCard({ issue, expanded, onToggle, dark }) {
  const cfg = pickColors(STATUS_CONFIG[issue.status] ?? STATUS_CONFIG["New"], dark);
  const stale = isActive(issue) && isStale(issue);
  return (
    <div onClick={onToggle} style={{ background: expanded ? (dark ? "rgba(255,255,255,0.06)" : "#F0F4FF") : (dark ? "rgba(255,255,255,0.025)" : "#FAFBFF"), border: `1px solid ${isActive(issue) ? cfg.ring + "50" : (dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,60,0.07)")}`, borderLeft: `3px solid ${cfg.ring}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer", transition: "all 0.15s", marginBottom: 6 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <Avatar name={issue.assignee} size={26} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 5 }}>
            <a href={JIRA_BASE + issue.key} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 11, fontWeight: 700, color: "#4F8EF7", fontFamily: "monospace", textDecoration: "none" }}>{issue.key}</a>
            <ProjectBadge project={issue.project} dark={dark} />
            <StatusPill status={issue.status} dark={dark} />
            <PriBadge priority={issue.priority} dark={dark} />
            <DeadlineBadge issue={issue} />
            {stale && <StaleBadge />}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: dark ? "#E2E8F0" : "#0F172A", lineHeight: 1.4, marginBottom: 4 }}>{issue.summary}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: dark ? "#64748B" : "#94A3B8", flexWrap: "wrap" }}>
            <span>{PEOPLE[issue.assignee]?.short ?? issue.assignee}</span>
            {issue.sdetAssignee && <><span>·</span><span style={{ color: "#C084FC" }}>SDET: {PEOPLE[issue.sdetAssignee]?.short ?? issue.sdetAssignee}</span></>}
            <span>·</span>
            <span>{issue.issuetype}</span><span>·</span>
            <span>Updated {relTime(issue.updated)}</span>
            {issue.comment_count > 0 && <><span>·</span><span>💬 {issue.comment_count}</span></>}
            {issue.sprintName && <><span>·</span><span>🏃 {issue.sprintName}</span></>}
          </div>
        </div>
        <span style={{ fontSize: 12, color: dark ? "#475569" : "#CBD5E1", marginTop: 2 }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && issue.last_comment_text && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,60,0.07)"}` }}>
          <div style={{ background: dark ? "rgba(255,255,255,0.04)" : "#F1F5FF", border: `1px solid ${dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,60,0.07)"}`, borderRadius: 8, padding: "8px 12px" }}>
            <div style={{ fontSize: 11, color: dark ? "#94A3B8" : "#94A3B8", marginBottom: 4 }}>
              <span style={{ fontWeight: 700, color: dark ? "#CBD5E1" : "#4A5280" }}>{issue.last_comment_author}</span>
              <span> · {relTime(issue.last_comment_date)}</span>
            </div>
            <div style={{ fontSize: 12.5, color: dark ? "#CBD5E1" : "#334155", lineHeight: 1.55 }}>{issue.last_comment_text}</div>
          </div>
        </div>
      )}
    </div>
  );
}

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

function formatSeconds(s) {
  if (!s) return "";
  const h = Math.round(s / 3600);
  return h + "h";
}

function effortDisplay(issue) {
  if (issue.storyPoints != null) return String(issue.storyPoints) + " SP";
  if (issue.timeOriginalEstimate) {
    let text = formatSeconds(issue.timeOriginalEstimate);
    if (issue.timeSpent) text += " / " + formatSeconds(issue.timeSpent) + " logged";
    return text;
  }
  return "—";
}

// ─── editable cell ──────────────────────────────────────────────
function EditableCell({ issueKey, field, dark }) {
  const storageKey = `maitri-${field}-${issueKey}`;
  const [value, setValue] = useState(() => localStorage.getItem(storageKey) || "");
  const [editing, setEditing] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const save = () => {
    setEditing(false);
    localStorage.setItem(storageKey, value);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") { setValue(localStorage.getItem(storageKey) || ""); setEditing(false); } }}
        style={{ width: "100%", padding: "4px 6px", fontSize: 12, border: "1px solid #4F8EF7", borderRadius: 4, background: dark ? "#181D2C" : "#fff", color: dark ? "#E2E8F0" : "#0F172A", outline: "none", fontFamily: "inherit" }}
      />
    );
  }

  return (
    <div
      onClick={e => { e.stopPropagation(); setEditing(true); }}
      style={{ minHeight: 20, padding: "2px 4px", borderRadius: 4, cursor: "text", fontSize: 12, color: value ? (dark ? "#E2E8F0" : "#0F172A") : (dark ? "#334155" : "#94A3B8"), fontStyle: value ? "normal" : "italic", border: "1px solid transparent", transition: "border 0.15s" }}
      onMouseEnter={e => e.currentTarget.style.borderColor = dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,60,0.1)"}
      onMouseLeave={e => e.currentTarget.style.borderColor = "transparent"}
    >
      {value || "Click to edit"}
    </div>
  );
}

// ─── reports view ───────────────────────────────────────────────
function ReportsView({ issues, dark, sprintFilter, setSprintFilter, availableSprints, dateFilter, setDateFilter, availableDueDates }) {
  const bg2 = dark ? "#111520" : "#FFFFFF";
  const bg3 = dark ? "#181D2C" : "#EBEef8";
  const bdr = dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,60,0.07)";
  const txt = dark ? "#E2E8F0" : "#0F172A";
  const txt2 = dark ? "#64748B" : "#4A5280";
  const txt3 = dark ? "#334155" : "#94A3B8";

  const activeIssues = useMemo(() => {
    const now = new Date();
    let list = issues.filter(i => ACTIVE_CATEGORIES.has(i.statusCategory));
    list = filterBySprint(list, sprintFilter, availableSprints);
    // Date filter — match if either duedate or targetEndDate satisfies
    if (dateFilter === "overdue") {
      list = list.filter(i => { const dates = [i.duedate, i.targetEndDate].filter(Boolean); return dates.some(d => new Date(d) < now); });
    } else if (dateFilter === "this_week") {
      const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
      list = list.filter(i => { const dates = [i.duedate, i.targetEndDate].filter(Boolean); return dates.some(d => new Date(d) >= now && new Date(d) <= weekEnd); });
    } else if (dateFilter === "next_week") {
      const thisWeekEnd = new Date(now); thisWeekEnd.setDate(thisWeekEnd.getDate() + (7 - thisWeekEnd.getDay()));
      const nextWeekEnd = new Date(thisWeekEnd); nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);
      list = list.filter(i => { const dates = [i.duedate, i.targetEndDate].filter(Boolean); return dates.some(d => new Date(d) > thisWeekEnd && new Date(d) <= nextWeekEnd); });
    } else if (dateFilter === "no_date") {
      list = list.filter(i => !i.duedate && !i.targetEndDate);
    } else if (dateFilter !== "all") {
      list = list.filter(i => { const dates = [i.duedate, i.targetEndDate].filter(Boolean); return dates.some(d => d.slice(0, 10) === dateFilter); });
    }
    return list;
  }, [issues, sprintFilter, availableSprints, dateFilter]);

  const currentSprint = useMemo(() => {
    if (sprintFilter && sprintFilter !== "all" && sprintFilter !== "current" && sprintFilter !== "previous") {
      return availableSprints.find(s => s.name === sprintFilter);
    }
    return availableSprints.find(s => s.isCurrent);
  }, [sprintFilter, availableSprints]);

  const sprintLabel = currentSprint
    ? `${currentSprint.name} | ${new Date(currentSprint.startDate).toLocaleDateString("en-US", { month: "long", day: "numeric" })} - ${new Date(currentSprint.endDate).toLocaleDateString("en-US", { month: "long", day: "numeric" })}`
    : "All Sprints";

  const getRowData = (issue, idx) => ({
    "S.N.": idx + 1,
    "Project": issue.project,
    "Task ID": issue.key,
    "Task Title": issue.summary,
    "Status": issue.status,
    "Target Date": issue.targetEndDate || issue.duedate || "",
    "Story Point / Effort": effortDisplay(issue),
    "Blockers?": localStorage.getItem(`maitri-blockers-${issue.key}`) || "",
    "Assigned To": PEOPLE[issue.assignee]?.short ?? issue.assignee,
    "SDET Assignee": issue.sdetAssignee ? (PEOPLE[issue.sdetAssignee]?.short ?? issue.sdetAssignee) : "",
    "Remarks": localStorage.getItem(`maitri-remarks-${issue.key}`) || "",
  });

  const downloadCSV = () => {
    const rows = activeIssues.map((issue, idx) => getRowData(issue, idx));
    const headers = Object.keys(rows[0] || {});
    const csv = [headers.join(","), ...rows.map(r => headers.map(h => `"${String(r[h]).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `maitri-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadExcel = () => {
    const rows = activeIssues.map((issue, idx) => getRowData(issue, idx));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sprint Report");

    // Auto-width columns
    const colWidths = Object.keys(rows[0] || {}).map(key => ({
      wch: Math.max(key.length, ...rows.map(r => String(r[key]).length)) + 2,
    }));
    ws["!cols"] = colWidths;

    XLSX.writeFile(wb, `maitri-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const COLUMNS = ["S.N.", "Project", "Task ID", "Task Title", "Status", "Target Date", "Story Point / Effort", "Blockers?", "Assigned To", "SDET Assignee", "Remarks"];

  return (
    <div>
      {/* Sprint header + download buttons */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: txt }}>{sprintLabel}</div>
            <div style={{ fontSize: 12, color: txt2, marginTop: 2 }}>{activeIssues.length} active tasks</div>
          </div>
          <select
            value={sprintFilter}
            onChange={e => setSprintFilter(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 7, border: `1px solid ${sprintFilter !== "all" ? "#4F8EF7" : bdr}`, background: sprintFilter !== "all" ? "#4F8EF7" : (dark ? "#181D2C" : "#fff"), color: sprintFilter !== "all" ? "#fff" : txt2, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", appearance: "auto", minWidth: 140 }}
          >
            <option value="all">All Sprints</option>
            <option value="active">Active Sprints</option>
            {["active","future","closed"].map(state => {
              const group = availableSprints.filter(s => s.state === state);
              return group.length > 0 ? (
                <optgroup key={state} label={state === "active" ? "Active" : state === "future" ? "Future" : "Recent Closed"}>
                  {group.map(s => (
                    <option key={s.id || s.name} value={s.name}>{s.name} [{s.project}]</option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </select>
          <select
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 7, border: `1px solid ${dateFilter !== "all" ? "#4F8EF7" : bdr}`, background: dateFilter !== "all" ? "#4F8EF7" : (dark ? "#181D2C" : "#fff"), color: dateFilter !== "all" ? "#fff" : txt2, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", appearance: "auto", minWidth: 130 }}
          >
            <option value="all">All Dates</option>
            <option value="overdue">Overdue</option>
            <option value="this_week">Due This Week</option>
            <option value="next_week">Due Next Week</option>
            <option value="no_date">No Date Set</option>
            {availableDueDates.map(d => (
              <option key={d.date} value={d.date}>{d.date} ({d.count})</option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={downloadCSV} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${bdr}`, background: "transparent", color: txt2, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
            ⬇ CSV
          </button>
          <button onClick={downloadExcel} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #34D39950", background: "rgba(52,211,153,0.1)", color: "#34D399", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
            ⬇ Excel
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: bg3 }}>
                {COLUMNS.map(h => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: txt2, borderBottom: `2px solid ${bdr}`, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeIssues.map((issue, idx) => {
                const targetDate = issue.targetEndDate || issue.duedate;
                const isPast = targetDate && new Date(targetDate) < new Date();
                return (
                  <tr key={issue.key} style={{ borderBottom: `1px solid ${bdr}` }}
                    onMouseEnter={e => e.currentTarget.style.background = dark ? "rgba(255,255,255,0.03)" : "#F8FAFF"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "8px 12px", fontSize: 12, color: txt2, fontFamily: "monospace", textAlign: "center" }}>{idx + 1}</td>
                    <td style={{ padding: "8px 12px" }}><ProjectBadge project={issue.project} dark={dark} /></td>
                    <td style={{ padding: "8px 12px" }}>
                      <a href={JIRA_BASE + issue.key} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: "#4F8EF7", fontFamily: "monospace", textDecoration: "none" }}>{issue.key}</a>
                    </td>
                    <td style={{ padding: "8px 12px", maxWidth: 300 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, color: txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{issue.summary}</div>
                    </td>
                    <td style={{ padding: "8px 12px" }}><StatusPill status={issue.status} dark={dark} /></td>
                    <td style={{ padding: "8px 12px", fontSize: 12, fontFamily: "monospace", color: isPast ? "#F74F4F" : txt2, fontWeight: isPast ? 700 : 400, whiteSpace: "nowrap" }}>
                      {targetDate ? new Date(targetDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                    </td>
                    <td style={{ padding: "8px 12px", fontSize: 12, color: txt2, whiteSpace: "nowrap" }}>{effortDisplay(issue)}</td>
                    <td style={{ padding: "8px 12px", minWidth: 120 }}>
                      <EditableCell issueKey={issue.key} field="blockers" dark={dark} />
                    </td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Avatar name={issue.assignee} size={20} />
                        <span style={{ fontSize: 12, color: txt2 }}>{PEOPLE[issue.assignee]?.short ?? issue.assignee}</span>
                      </div>
                    </td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                      {issue.sdetAssignee ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Avatar name={issue.sdetAssignee} size={20} />
                          <span style={{ fontSize: 12, color: "#C084FC" }}>{PEOPLE[issue.sdetAssignee]?.short ?? issue.sdetAssignee}</span>
                        </div>
                      ) : <span style={{ fontSize: 11, color: txt3 }}>—</span>}
                    </td>
                    <td style={{ padding: "8px 12px", minWidth: 150 }}>
                      <EditableCell issueKey={issue.key} field="remarks" dark={dark} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── standup view ───────────────────────────────────────────────
const STANDUP_STATUS_ORDER = ["Blocked","In Progress","In Dev","In INT","In Review","Ready for QA","Ready for Promotion","Req Done","Ready for Development","New"];

function StandupView({ issues, dark, sprintFilter, setSprintFilter, availableSprints, dateFilter, setDateFilter, availableDueDates, proj, setProj }) {
  const bg2 = dark ? "#111520" : "#FFFFFF";
  const bdr = dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,60,0.07)";
  const txt = dark ? "#E2E8F0" : "#0F172A";
  const txt2 = dark ? "#64748B" : "#4A5280";
  const txt3 = dark ? "#334155" : "#94A3B8";

  const [highlightedStatus, setHighlightedStatus] = useState(null);
  const [collapsed, setCollapsed] = useState(new Set());
  const personRefs = useRef({});

  const standupIssues = useMemo(() => {
    let list = issues.filter(i => isActive(i) && excludeUAT(i) && excludeDeferred(i));
    if (proj !== "All") list = list.filter(i => i.project === proj);
    list = filterBySprint(list, sprintFilter, availableSprints);

    const now = new Date();
    if (dateFilter === "overdue") {
      list = list.filter(i => { const dates = [i.duedate, i.targetEndDate].filter(Boolean); return dates.some(d => new Date(d) < now); });
    } else if (dateFilter === "this_week") {
      const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
      list = list.filter(i => { const dates = [i.duedate, i.targetEndDate].filter(Boolean); return dates.some(d => new Date(d) >= now && new Date(d) <= weekEnd); });
    } else if (dateFilter === "next_week") {
      const thisWeekEnd = new Date(now); thisWeekEnd.setDate(thisWeekEnd.getDate() + (7 - thisWeekEnd.getDay()));
      const nextWeekEnd = new Date(thisWeekEnd); nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);
      list = list.filter(i => { const dates = [i.duedate, i.targetEndDate].filter(Boolean); return dates.some(d => new Date(d) > thisWeekEnd && new Date(d) <= nextWeekEnd); });
    } else if (dateFilter === "no_date") {
      list = list.filter(i => !i.duedate && !i.targetEndDate);
    } else if (dateFilter !== "all") {
      list = list.filter(i => { const dates = [i.duedate, i.targetEndDate].filter(Boolean); return dates.some(d => d.slice(0, 10) === dateFilter); });
    }
    return list;
  }, [issues, sprintFilter, availableSprints, dateFilter, proj]);

  const personGroups = useMemo(() => {
    const priorityOrder = ["P0","P1","P2","P3","P4","Unprioritized"];
    return Object.keys(PEOPLE).map(name => {
      const tasks = standupIssues.filter(i => i.assignee === name);
      tasks.sort((a, b) => {
        const sa = STANDUP_STATUS_ORDER.indexOf(a.status);
        const sb = STANDUP_STATUS_ORDER.indexOf(b.status);
        const sax = sa === -1 ? 99 : sa;
        const sbx = sb === -1 ? 99 : sb;
        if (sax !== sbx) return sax - sbx;
        const pa = priorityOrder.indexOf(a.priority);
        const pb = priorityOrder.indexOf(b.priority);
        if (pa !== pb) return pa - pb;
        return new Date(b.updated) - new Date(a.updated);
      });
      const byStatus = {};
      for (const t of tasks) {
        if (!byStatus[t.status]) byStatus[t.status] = 0;
        byStatus[t.status]++;
      }
      const segments = [];
      for (const s of STANDUP_STATUS_ORDER) {
        if (byStatus[s]) segments.push({ status: s, count: byStatus[s] });
      }
      for (const s of Object.keys(byStatus)) {
        if (!STANDUP_STATUS_ORDER.includes(s)) segments.push({ status: s, count: byStatus[s] });
      }
      return { name, tasks, segments, total: tasks.length };
    });
  }, [standupIssues]);

  const maxCount = Math.max(1, ...personGroups.map(g => g.total));

  const presentStatuses = useMemo(() => {
    const seen = new Set();
    const ordered = [];
    for (const s of STANDUP_STATUS_ORDER) {
      if (personGroups.some(g => g.segments.find(seg => seg.status === s))) {
        seen.add(s); ordered.push(s);
      }
    }
    for (const g of personGroups) {
      for (const seg of g.segments) {
        if (!seen.has(seg.status)) { seen.add(seg.status); ordered.push(seg.status); }
      }
    }
    return ordered;
  }, [personGroups]);

  const kpis = useMemo(() => {
    let active = 0, blocked = 0, inProgress = 0, readyForQA = 0;
    for (const g of personGroups) {
      active += g.total;
      for (const seg of g.segments) {
        if (seg.status === "Blocked") blocked += seg.count;
        else if (seg.status === "In Progress" || seg.status === "In Dev" || seg.status === "In INT") inProgress += seg.count;
        else if (seg.status === "Ready for QA") readyForQA += seg.count;
      }
    }
    const idle = personGroups.filter(g => g.total === 0).length;
    return { active, blocked, inProgress, readyForQA, idle };
  }, [personGroups]);

  const toggleCollapse = (name) => setCollapsed(prev => {
    const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n;
  });

  const handleSegmentClick = (status, personName) => {
    if (highlightedStatus === status) {
      setHighlightedStatus(null);
    } else {
      setHighlightedStatus(status);
      const ref = personRefs.current[personName];
      if (ref) ref.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleLegendClick = (status) => {
    setHighlightedStatus(prev => prev === status ? null : status);
  };

  const todayStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const peopleWithWork = personGroups.filter(g => g.total > 0).length;

  return (
    <div>
      {/* Header + filters */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: txt }}>Daily Stand-up · {todayStr}</div>
          <div style={{ fontSize: 12, color: txt2, marginTop: 2 }}>{standupIssues.length} active tasks · {peopleWithWork}/{personGroups.length} people with work</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: txt2, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>Project</span>
          {["All","ACT","CONN","NACT","QA","SUPP"].map(p => (
            <button key={p} onClick={() => setProj(p)} style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${proj === p ? "#4F8EF7" : bdr}`, background: proj === p ? "#4F8EF7" : "transparent", color: proj === p ? "#fff" : txt2, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>{p}</button>
          ))}
          <select value={sprintFilter} onChange={e => setSprintFilter(e.target.value)} style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${sprintFilter !== "all" ? "#4F8EF7" : bdr}`, background: sprintFilter !== "all" ? "#4F8EF7" : (dark ? "#181D2C" : "#fff"), color: sprintFilter !== "all" ? "#fff" : txt2, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", appearance: "auto", minWidth: 160 }}>
            <option value="all">All Sprints</option>
            <option value="active">Active Sprints</option>
            {["active","future","closed"].map(state => {
              const group = availableSprints.filter(s => s.state === state);
              return group.length > 0 ? (
                <optgroup key={state} label={state === "active" ? "Active" : state === "future" ? "Future" : "Recent Closed"}>
                  {group.map(s => <option key={s.id || s.name} value={s.name}>{s.name} [{s.project}]</option>)}
                </optgroup>
              ) : null;
            })}
          </select>
          <select value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${dateFilter !== "all" ? "#4F8EF7" : bdr}`, background: dateFilter !== "all" ? "#4F8EF7" : (dark ? "#181D2C" : "#fff"), color: dateFilter !== "all" ? "#fff" : txt2, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", appearance: "auto", minWidth: 130 }}>
            <option value="all">All Dates</option>
            <option value="overdue">Overdue</option>
            <option value="this_week">Due This Week</option>
            <option value="next_week">Due Next Week</option>
            <option value="no_date">No Date Set</option>
            {availableDueDates.map(d => <option key={d.date} value={d.date}>{d.date} ({d.count})</option>)}
          </select>
        </div>
      </div>

      {/* Chart */}
      <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
        {/* KPI strip */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: txt2, marginRight: 4 }}>Workload</div>
          <span style={{ fontSize: 12, fontWeight: 700, color: txt, padding: "3px 10px", borderRadius: 20, background: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,60,0.05)" }}>{kpis.active} active</span>
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

      {/* Per-person sections */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {personGroups.map(g => {
          const isOpen = g.total > 0 && !collapsed.has(g.name);
          return (
            <div key={g.name} ref={el => { personRefs.current[g.name] = el; }} style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, overflow: "hidden", scrollMarginTop: 80 }}>
              <div onClick={() => g.total > 0 && toggleCollapse(g.name)} style={{ padding: "10px 14px", borderBottom: isOpen ? `1px solid ${bdr}` : "none", display: "flex", alignItems: "center", gap: 10, cursor: g.total > 0 ? "pointer" : "default", userSelect: "none", background: g.total === 0 ? (dark ? "rgba(255,255,255,0.02)" : "rgba(0,0,60,0.02)") : "transparent" }}>
                <Avatar name={g.name} size={28} />
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: g.total === 0 ? txt3 : txt }}>{PEOPLE[g.name].short}</div>
                  <RoleBadge role={PEOPLE[g.name].role} />
                </div>
                <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 700, color: g.total === 0 ? txt3 : txt2, padding: "2px 8px", borderRadius: 10, border: `1px solid ${bdr}` }}>{g.total} active</span>
                {g.total > 0 && <span style={{ fontSize: 10, color: txt2 }}>{collapsed.has(g.name) ? "▸" : "▾"}</span>}
                {g.total === 0 && <span style={{ fontSize: 11, color: txt3, fontStyle: "italic" }}>No active work</span>}
              </div>
              {isOpen && (
                <div>
                  {g.tasks.map(t => {
                    const isDimmed = highlightedStatus && t.status !== highlightedStatus;
                    return (
                      <div key={t.key} onClick={() => window.open(JIRA_BASE + t.key, "_blank")} title={t.summary} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${bdr}`, cursor: "pointer", opacity: isDimmed ? 0.3 : 1, transition: "opacity 0.15s" }}
                        onMouseEnter={e => { if (!isDimmed) e.currentTarget.style.background = dark ? "rgba(255,255,255,0.03)" : "#F8FAFF"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                        <a href={JIRA_BASE + t.key} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 11.5, fontWeight: 700, color: "#4F8EF7", fontFamily: "monospace", textDecoration: "none", flexShrink: 0, minWidth: 70 }}>{t.key}</a>
                        <ProjectBadge project={t.project} dark={dark} />
                        <StatusPill status={t.status} dark={dark} />
                        <PriBadge priority={t.priority} dark={dark} />
                        <div style={{ flex: 1, fontSize: 12.5, color: txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 100 }}>{t.summary}</div>
                        <DeadlineBadge issue={t} />
                        <span style={{ fontSize: 10.5, color: txt3, fontFamily: "monospace", whiteSpace: "nowrap" }}>{relTime(t.updated)}</span>
                        {t.sdetAssignee && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(192,132,252,0.15)", color: "#C084FC", fontWeight: 700, whiteSpace: "nowrap" }}>SDET: {PEOPLE[t.sdetAssignee]?.short ?? t.sdetAssignee}</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── deadline panel ─────────────────────────────────────────────
function DeadlinePanel({ issues, dark }) {
  const bg2 = dark ? "#111520" : "#FFFFFF";
  const bdr = dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,60,0.07)";
  const txt2 = dark ? "#64748B" : "#4A5280";

  const activeIssues = issues.filter(isActive);
  const overdue = activeIssues.filter(i => { const d = deadlineInfo(i); return d && d.urgency === 0; });
  const dueSoon = activeIssues.filter(i => { const d = deadlineInfo(i); return d && (d.urgency === 1 || d.urgency === 2); });
  const stale = activeIssues.filter(i => isStale(i) && !overdue.includes(i));

  const total = overdue.length + dueSoon.length + stale.length;
  if (total === 0) return null;

  return (
    <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: "14px 18px", marginBottom: 22 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: txt2, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
        ⚠ Attention ({total})
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {overdue.length > 0 && (
          <div style={{ flex: "1 1 280px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#F74F4F", marginBottom: 6 }}>Overdue ({overdue.length})</div>
            {overdue.map(i => (
              <div key={i.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12 }}>
                <a href={JIRA_BASE + i.key} target="_blank" rel="noreferrer" style={{ fontFamily: "monospace", fontWeight: 700, color: "#4F8EF7", textDecoration: "none", fontSize: 11 }}>{i.key}</a>
                <span style={{ color: dark ? "#E2E8F0" : "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{i.summary}</span>
                <span style={{ color: "#F74F4F", fontWeight: 700, fontSize: 10, marginLeft: "auto", whiteSpace: "nowrap" }}>{deadlineInfo(i)?.label}</span>
              </div>
            ))}
          </div>
        )}
        {dueSoon.length > 0 && (
          <div style={{ flex: "1 1 280px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#F7C94F", marginBottom: 6 }}>Due Soon ({dueSoon.length})</div>
            {dueSoon.map(i => (
              <div key={i.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12 }}>
                <a href={JIRA_BASE + i.key} target="_blank" rel="noreferrer" style={{ fontFamily: "monospace", fontWeight: 700, color: "#4F8EF7", textDecoration: "none", fontSize: 11 }}>{i.key}</a>
                <span style={{ color: dark ? "#E2E8F0" : "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{i.summary}</span>
                <span style={{ color: "#F7C94F", fontWeight: 700, fontSize: 10, marginLeft: "auto", whiteSpace: "nowrap" }}>{deadlineInfo(i)?.label}</span>
              </div>
            ))}
          </div>
        )}
        {stale.length > 0 && (
          <div style={{ flex: "1 1 280px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#FB923C", marginBottom: 6 }}>Stale — No Update 7+ Days ({stale.length})</div>
            {stale.map(i => (
              <div key={i.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12 }}>
                <a href={JIRA_BASE + i.key} target="_blank" rel="noreferrer" style={{ fontFamily: "monospace", fontWeight: 700, color: "#4F8EF7", textDecoration: "none", fontSize: 11 }}>{i.key}</a>
                <span style={{ color: dark ? "#E2E8F0" : "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{i.summary}</span>
                <span style={{ color: "#FB923C", fontWeight: 700, fontSize: 10, marginLeft: "auto", whiteSpace: "nowrap" }}>Updated {relTime(i.updated)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── main app ────────────────────────────────────────────────────
export default function App() {
  const [credentials, setCredentials] = useState(() => {
    try {
      const saved = localStorage.getItem("maitri-credentials");
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const [dark, setDark] = useState(true);
  const [person, setPerson] = useState("All");
  const [proj, setProj] = useState("All");
  const [statusFilter, setStatusFilter] = useState("Active");
  const [sortBy, setSortBy] = useState("updated");
  const [sprintFilter, setSprintFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [view, setView] = useState("board");
  const [tab, setTab] = useState("dev");
  const [expanded, setExpanded] = useState(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  const [cardOrder, setCardOrder] = useState(() => {
    try {
      const saved = localStorage.getItem("maitri-card-order");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [issues, setIssues] = useState([]);
  const [jiraSprints, setJiraSprints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  const handleLogin = (creds) => {
    localStorage.setItem("maitri-credentials", JSON.stringify({ email: creds.email, token: creds.token }));
    setCredentials({ email: creds.email, token: creds.token });
  };

  const handleLogout = () => {
    localStorage.removeItem("maitri-credentials");
    setCredentials(null);
    setIssues([]);
    setJiraSprints([]);
  };

  const fetchIssues = useCallback(async (force = false) => {
    if (!credentials) return;
    setLoading(true);
    setError(null);
    try {
      const url = force ? `${API_BASE}/api/refresh` : `${API_BASE}/api/issues`;
      const res = await fetch(url, { method: force ? 'POST' : 'GET', headers: authHeaders(credentials) });
      if (res.status === 401) { handleLogout(); return; }
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      setIssues(data);
      setLastFetch(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [credentials]);

  useEffect(() => { fetchIssues(); }, [fetchIssues]);

  useEffect(() => {
    if (!credentials) return;
    fetch(`${API_BASE}/api/sprints`, { headers: authHeaders(credentials) })
      .then(r => r.ok ? r.json() : [])
      .then(data => setJiraSprints(data))
      .catch(() => {});
  }, [credentials]);

  useEffect(() => {
    localStorage.setItem("maitri-card-order", JSON.stringify(cardOrder));
  }, [cardOrder]);

  // Default Standup tab to Active Sprints (only if user hasn't already picked something specific)
  useEffect(() => {
    if (tab === "standup" && sprintFilter === "all") setSprintFilter("active");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const bg   = dark ? "#0B0D14" : "#F1F4FB";
  const bg2  = dark ? "#111520" : "#FFFFFF";
  const bg3  = dark ? "#181D2C" : "#EBEef8";
  const bdr  = dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,60,0.07)";
  const txt  = dark ? "#E2E8F0" : "#0F172A";
  const txt2 = dark ? "#64748B" : "#4A5280";
  const txt3 = dark ? "#334155" : "#94A3B8";

  const toggle = key => setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleGroup = status => setCollapsedGroups(prev => {
    const n = new Set(prev); n.has(status) ? n.delete(status) : n.add(status); return n;
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const availableSprints = useMemo(() => {
    if (jiraSprints.length > 0) {
      const active = jiraSprints.filter(s => s.state === "active");
      const future = jiraSprints.filter(s => s.state === "future");
      const closed = jiraSprints.filter(s => s.state === "closed").slice(0, 10);
      return [...active, ...future, ...closed].map(s => ({
        id: s.id,
        name: s.name,
        startDate: s.startDate,
        endDate: s.endDate,
        state: s.state,
        project: s.project,
        isCurrent: s.state === "active",
      }));
    }
    // Fallback: derive from issues
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
  }, [issues, jiraSprints]);

  // Collect unique due dates for the date filter
  const availableDueDates = useMemo(() => {
    const dateSet = new Map();
    const seen = new Set();
    for (const issue of issues) {
      const dates = [issue.duedate, issue.targetEndDate].filter(Boolean);
      const key = issue.key;
      for (const d of dates) {
        const dateStr = d.slice(0, 10);
        const dedup = `${key}:${dateStr}`;
        if (seen.has(dedup)) continue;
        seen.add(dedup);
        if (!dateSet.has(dateStr)) {
          dateSet.set(dateStr, { date: dateStr, count: 1 });
        } else {
          dateSet.get(dateStr).count++;
        }
      }
    }
    return [...dateSet.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [issues]);

  const filtered = useMemo(() => {
    let list = issues;
    const now = new Date();
    if (tab === "qa") list = list.filter(i => QA_ASSIGNEES.has(i.assignee) || QA_ASSIGNEES.has(i.sdetAssignee));
    if (person !== "All") list = list.filter(i => i.assignee === person || i.sdetAssignee === person);
    if (proj   !== "All") list = list.filter(i => i.project === proj);
    if (statusFilter === "Active") list = list.filter(i => isActive(i));
    else if (statusFilter !== "All") list = list.filter(i => i.status === statusFilter);

    // Sprint filter
    list = filterBySprint(list, sprintFilter, availableSprints);

    // Date filter (due date / target date) — match if either field satisfies
    if (dateFilter === "overdue") {
      list = list.filter(i => {
        const dates = [i.duedate, i.targetEndDate].filter(Boolean);
        return dates.some(d => new Date(d) < now);
      });
    } else if (dateFilter === "this_week") {
      const weekEnd = new Date(now);
      weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
      list = list.filter(i => {
        const dates = [i.duedate, i.targetEndDate].filter(Boolean);
        return dates.some(d => new Date(d) >= now && new Date(d) <= weekEnd);
      });
    } else if (dateFilter === "next_week") {
      const thisWeekEnd = new Date(now);
      thisWeekEnd.setDate(thisWeekEnd.getDate() + (7 - thisWeekEnd.getDay()));
      const nextWeekEnd = new Date(thisWeekEnd);
      nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);
      list = list.filter(i => {
        const dates = [i.duedate, i.targetEndDate].filter(Boolean);
        return dates.some(d => new Date(d) > thisWeekEnd && new Date(d) <= nextWeekEnd);
      });
    } else if (dateFilter === "no_date") {
      list = list.filter(i => !i.duedate && !i.targetEndDate);
    } else if (dateFilter !== "all") {
      // Specific date selected — match if either date field matches
      list = list.filter(i => {
        const dates = [i.duedate, i.targetEndDate].filter(Boolean);
        return dates.some(d => d.slice(0, 10) === dateFilter);
      });
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
  }, [issues, person, proj, statusFilter, sortBy, tab, sprintFilter, availableSprints, dateFilter]);

  const stats = useMemo(() => ({
    active:     issues.filter(isActive).length,
    blocked:    issues.filter(i => i.status === "Blocked").length,
    inProgress: issues.filter(i => ["In Progress","In Dev","In INT"].includes(i.status)).length,
    promoted:   issues.filter(i => i.status === "Promoted").length,
    done:       issues.filter(i => i.statusCategory === "done").length,
    total:      issues.length,
    byPerson:   Object.fromEntries(Object.keys(PEOPLE).map(p => [p, issues.filter(i => (i.assignee === p || i.sdetAssignee === p) && isActive(i)).length])),
    qaReady:    issues.filter(i => i.status === "Ready for QA").length,
    qaAssigned: issues.filter(i => (QA_ASSIGNEES.has(i.assignee) || QA_ASSIGNEES.has(i.sdetAssignee)) && isActive(i)).length,
  }), [issues]);

  const attentionItems = useMemo(() => {
    const activeIssues = issues.filter(isActive);
    const overdue = activeIssues.filter(i => { const d = deadlineInfo(i); return d && d.urgency === 0; });
    const dueSoon = activeIssues.filter(i => { const d = deadlineInfo(i); return d && (d.urgency === 1 || d.urgency === 2); });
    const stale = activeIssues.filter(i => isStale(i) && !overdue.includes(i));
    return { overdue, dueSoon, stale, total: overdue.length + dueSoon.length + stale.length };
  }, [issues]);

  const availableStatuses = useMemo(() => {
    let scoped = issues;
    if (tab === "qa") scoped = scoped.filter(i => QA_ASSIGNEES.has(i.assignee) || QA_ASSIGNEES.has(i.sdetAssignee));
    if (proj !== "All") scoped = scoped.filter(i => i.project === proj);
    return [...new Set(scoped.map(i => i.status))].sort();
  }, [issues, tab, proj]);

  const boardGroups = useMemo(() => {
    const activeFiltered = filtered.filter(isActive);
    const statusGroups = {};
    const priorityOrder = ["P0","P1","P2","P3","P4","Unprioritized"];
    for (const issue of activeFiltered) {
      if (!statusGroups[issue.status]) statusGroups[issue.status] = [];
      statusGroups[issue.status].push(issue);
    }
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

  if (!credentials) {
    return <Login dark={dark} onSuccess={handleLogin} />;
  }

  const Btn = ({ active, onClick, children }) => (
    <button onClick={onClick} style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${active ? "#4F8EF7" : bdr}`, background: active ? "#4F8EF7" : "transparent", color: active ? "#fff" : txt2, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", transition: "all 0.15s" }}>{children}</button>
  );

  return (
    <div style={{ background: bg, minHeight: "100vh", color: txt, fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif", transition: "all 0.2s" }}>

      {/* TOPBAR */}
      <div style={{ background: bg2, borderBottom: `1px solid ${bdr}`, padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#E85D8A,#4F8EF7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900, color: "#fff", userSelect: "none" }}>M</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: txt }}>Maitri Team · Jira Dashboard</div>
            <div style={{ fontSize: 11, color: txt2, fontFamily: "monospace" }}>ACT · CONN · NACT · macrohealth.atlassian.net · {new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {lastFetch && <span style={{ fontSize: 10, color: txt3, fontFamily: "monospace" }}>Fetched {relTime(lastFetch.toISOString())}</span>}
          <button onClick={() => fetchIssues(true)} disabled={loading} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${bdr}`, background: loading ? bg3 : "transparent", color: loading ? txt3 : txt2, cursor: loading ? "wait" : "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>
            {loading ? "Loading..." : "↻ Refresh"}
          </button>
          <div style={{ display: "flex", gap: 1, background: bg3, borderRadius: 8, padding: 2, border: `1px solid ${bdr}` }}>
            {[["dev","Dev Board"],["qa","QA Board"],["standup","Standup"],["reports","Reports"],["attention",`Attention${attentionItems.total > 0 ? ` (${attentionItems.total})` : ""}`]].map(([t, l]) => (
              <button key={t} onClick={() => setTab(t)} style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: tab === t ? (t === "attention" && attentionItems.total > 0 ? "#F74F4F" : bg2) : "transparent", color: tab === t ? (t === "attention" && attentionItems.total > 0 ? "#fff" : txt) : txt2, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", transition: "all 0.15s" }}>{l}</button>
            ))}
          </div>
          {tab !== "attention" && tab !== "reports" && tab !== "standup" && (
            <div style={{ display: "flex", gap: 1, background: bg3, borderRadius: 8, padding: 2, border: `1px solid ${bdr}` }}>
              {[["board","⊞ Board"],["table","☰ Table"]].map(([v, l]) => (
                <button key={v} onClick={() => setView(v)} style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: view === v ? bg2 : "transparent", color: view === v ? txt : txt2, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", transition: "all 0.15s" }}>{l}</button>
              ))}
            </div>
          )}
          <button onClick={() => setDark(d => !d)} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${bdr}`, background: "transparent", color: txt2, cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600 }}>
            {dark ? "☀️ Light" : "🌙 Dark"}
          </button>
          <button onClick={handleLogout} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(247,79,79,0.3)", background: "transparent", color: "#F74F4F", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>
            Logout
          </button>
        </div>
      </div>

      <div style={{ padding: "24px 28px" }}>

        {/* ERROR */}
        {error && (
          <div style={{ background: "rgba(247,79,79,0.1)", border: "1px solid rgba(247,79,79,0.3)", borderRadius: 10, padding: "12px 16px", marginBottom: 18, color: "#F74F4F", fontSize: 13, fontWeight: 600 }}>
            Failed to load: {error}. Check that the backend is running on port 3001.
          </div>
        )}

        {/* STAT CARDS */}
        {tab !== "attention" && tab !== "reports" && tab !== "standup" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 22 }}>
          {(tab === "qa" ? [
            { label: "QA Active",     val: stats.qaAssigned,  color: "#C084FC", sub: "assigned to QA" },
            { label: "Ready for QA",  val: stats.qaReady,     color: "#A78BFA", sub: "awaiting QA" },
            { label: "Blocked",       val: stats.blocked,     color: "#F74F4F", sub: "urgent" },
            { label: "In Progress",   val: stats.inProgress,  color: "#34D399", sub: "being worked on" },
            { label: "Done",          val: stats.done,        color: "#64748B", sub: `of ${stats.total} total` },
          ] : [
            { label: "Active",      val: stats.active,     color: "#4F8EF7", sub: "needs attention" },
            { label: "Blocked",     val: stats.blocked,    color: "#F74F4F", sub: "urgent" },
            { label: "In Progress", val: stats.inProgress, color: "#34D399", sub: "being worked on" },
            { label: "Ready for QA",val: stats.qaReady,    color: "#A78BFA", sub: "awaiting QA" },
            { label: "Done",        val: stats.done,       color: "#64748B", sub: `of ${stats.total} total` },
          ]).map(s => (
            <div key={s.label} style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: "14px 16px", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: s.color, borderRadius: "12px 12px 0 0" }} />
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: txt2, marginBottom: 6, marginTop: 2 }}>{s.label}</div>
              <div style={{ fontSize: 30, fontWeight: 900, fontFamily: "monospace", letterSpacing: "-0.04em", color: s.color }}>{s.val}</div>
              <div style={{ fontSize: 10, color: txt3, marginTop: 2 }}>{s.sub}</div>
            </div>
          ))}
        </div>
        )}

        {/* ATTENTION TAB */}
        {tab === "attention" && (
          <div>
            {attentionItems.total === 0 ? (
              <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, padding: "40px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#34D399" }}>All clear — nothing needs attention</div>
                <div style={{ fontSize: 12, color: txt2, marginTop: 4 }}>No overdue, due soon, or stale issues found.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {attentionItems.overdue.length > 0 && (
                  <div style={{ background: bg2, border: "1px solid rgba(247,79,79,0.3)", borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(247,79,79,0.2)", background: "rgba(247,79,79,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#F74F4F" }} />
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#F74F4F" }}>Overdue ({attentionItems.overdue.length})</span>
                    </div>
                    <div style={{ padding: 10 }}>
                      {attentionItems.overdue.map(issue => <IssueCard key={issue.key} issue={issue} expanded={expanded.has(issue.key)} onToggle={() => toggle(issue.key)} dark={dark} />)}
                    </div>
                  </div>
                )}
                {attentionItems.dueSoon.length > 0 && (
                  <div style={{ background: bg2, border: "1px solid rgba(247,201,79,0.3)", borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(247,201,79,0.2)", background: "rgba(247,201,79,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#F7C94F" }} />
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#F7C94F" }}>Due Soon ({attentionItems.dueSoon.length})</span>
                    </div>
                    <div style={{ padding: 10 }}>
                      {attentionItems.dueSoon.map(issue => <IssueCard key={issue.key} issue={issue} expanded={expanded.has(issue.key)} onToggle={() => toggle(issue.key)} dark={dark} />)}
                    </div>
                  </div>
                )}
                {attentionItems.stale.length > 0 && (
                  <div style={{ background: bg2, border: "1px solid rgba(251,146,60,0.3)", borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(251,146,60,0.2)", background: "rgba(251,146,60,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#FB923C" }} />
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#FB923C" }}>Stale — No Update 7+ Days ({attentionItems.stale.length})</span>
                    </div>
                    <div style={{ padding: 10 }}>
                      {attentionItems.stale.map(issue => <IssueCard key={issue.key} issue={issue} expanded={expanded.has(issue.key)} onToggle={() => toggle(issue.key)} dark={dark} />)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* REPORTS TAB */}
        {tab === "reports" && (
          <ReportsView issues={issues} dark={dark} sprintFilter={sprintFilter} setSprintFilter={setSprintFilter} availableSprints={availableSprints} dateFilter={dateFilter} setDateFilter={setDateFilter} availableDueDates={availableDueDates} />
        )}

        {/* STANDUP TAB */}
        {tab === "standup" && (
          <StandupView issues={issues} dark={dark} sprintFilter={sprintFilter} setSprintFilter={setSprintFilter} availableSprints={availableSprints} dateFilter={dateFilter} setDateFilter={setDateFilter} availableDueDates={availableDueDates} proj={proj} setProj={setProj} />
        )}

        {/* PEOPLE CARDS (dev/qa tabs only) */}
        {tab !== "attention" && tab !== "reports" && tab !== "standup" && (
        <>
        <div style={{ display: "grid", gridTemplateColumns: tab === "qa" ? "repeat(2,1fr)" : "repeat(6,1fr)", gap: 10, marginBottom: 22 }}>
          {Object.entries(PEOPLE).filter(([, cfg]) => tab === "qa" ? cfg.role === "QA" : true).map(([name, cfg]) => (
            <div key={name} onClick={() => setPerson(person === name ? "All" : name)} style={{ background: bg2, border: `1px solid ${person === name ? cfg.color + "70" : bdr}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, transition: "all 0.15s", boxShadow: person === name ? `0 0 0 2px ${cfg.color}22` : "none" }}>
              <Avatar name={name} size={34} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: person === name ? cfg.color : txt }}>
                  {cfg.short}
                  <RoleBadge role={cfg.role} />
                </div>
                <div style={{ fontSize: 11, color: txt2 }}>{stats.byPerson[name] || 0} active</div>
              </div>
            </div>
          ))}
        </div>

        {/* FILTERS */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: txt2, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>Project</span>
          {["All","ACT","CONN","NACT","QA","SUPP"].map(p => <Btn key={p} active={proj === p} onClick={() => setProj(p)}>{p}</Btn>)}
          <div style={{ width: 1, height: 18, background: bdr }} />
          <span style={{ fontSize: 10, color: txt2, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>Status</span>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${statusFilter !== "Active" ? "#4F8EF7" : bdr}`, background: statusFilter !== "Active" ? "#4F8EF7" : (dark ? "#181D2C" : "#fff"), color: statusFilter !== "Active" ? "#fff" : txt2, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", appearance: "auto", minWidth: 120 }}
          >
            <option value="Active">Active</option>
            <option value="All">All</option>
            {availableStatuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <div style={{ width: 1, height: 18, background: bdr }} />
          <span style={{ fontSize: 10, color: txt2, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>Sprint</span>
          <select
            value={sprintFilter}
            onChange={e => setSprintFilter(e.target.value)}
            style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${sprintFilter !== "all" ? "#4F8EF7" : bdr}`, background: sprintFilter !== "all" ? "#4F8EF7" : (dark ? "#181D2C" : "#fff"), color: sprintFilter !== "all" ? "#fff" : txt2, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", appearance: "auto", minWidth: 140 }}
          >
            <option value="all">All Sprints</option>
            <option value="active">Active Sprints</option>
            {["active","future","closed"].map(state => {
              const group = availableSprints.filter(s => s.state === state);
              return group.length > 0 ? (
                <optgroup key={state} label={state === "active" ? "Active" : state === "future" ? "Future" : "Recent Closed"}>
                  {group.map(s => (
                    <option key={s.id || s.name} value={s.name}>{s.name} [{s.project}]</option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </select>
          <div style={{ width: 1, height: 18, background: bdr }} />
          <span style={{ fontSize: 10, color: txt2, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>Due Date</span>
          <select
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${dateFilter !== "all" ? "#4F8EF7" : bdr}`, background: dateFilter !== "all" ? "#4F8EF7" : (dark ? "#181D2C" : "#fff"), color: dateFilter !== "all" ? "#fff" : txt2, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", appearance: "auto", minWidth: 130 }}
          >
            <option value="all">All Dates</option>
            <option value="overdue">Overdue</option>
            <option value="this_week">Due This Week</option>
            <option value="next_week">Due Next Week</option>
            <option value="no_date">No Date Set</option>
            {availableDueDates.map(d => (
              <option key={d.date} value={d.date}>{d.date} ({d.count})</option>
            ))}
          </select>
          <div style={{ width: 1, height: 18, background: bdr }} />
          <span style={{ fontSize: 10, color: txt2, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>Sort</span>
          {["updated","priority","status","deadline"].map(s => <Btn key={s} active={sortBy === s} onClick={() => setSortBy(s)}>{s}</Btn>)}
          <span style={{ marginLeft: "auto", fontSize: 11, color: txt2, fontFamily: "monospace" }}>{filtered.length} issues</span>
        </div>

        {/* BOARD VIEW */}
        {view === "board" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16, marginBottom: 20 }}>
              {boardGroups.map(group => {
                const cfg = pickColors(STATUS_CONFIG[group.status] ?? STATUS_CONFIG["New"], dark);
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
            </div>
            {/* Non-active section */}
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
          </div>
        )}

        {/* TABLE VIEW */}
        {view === "table" && (
          <div style={{ background: bg2, border: `1px solid ${bdr}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: bg3 }}>
                    {["Key","Summary","Assignee","SDET","Status","Priority","Project","Deadline","Updated","Last Comment"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: txt2, borderBottom: `1px solid ${bdr}`, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(issue => (
                    <tr key={issue.key} style={{ borderBottom: `1px solid ${bdr}`, cursor: "pointer" }}
                      onMouseEnter={e => e.currentTarget.style.background = dark ? "rgba(255,255,255,0.03)" : "#F8FAFF"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      onClick={() => window.open(JIRA_BASE + issue.key, "_blank")}>
                      <td style={{ padding: "10px 14px" }}><a href={JIRA_BASE + issue.key} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 12, fontWeight: 700, color: "#4F8EF7", fontFamily: "monospace", textDecoration: "none" }}>{issue.key}</a></td>
                      <td style={{ padding: "10px 14px", maxWidth: 280 }}><div style={{ fontSize: 12.5, fontWeight: 500, color: txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{issue.summary}</div></td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <Avatar name={issue.assignee} size={22} />
                          <span style={{ fontSize: 12, color: txt2 }}>{PEOPLE[issue.assignee]?.short ?? issue.assignee}</span>
                          <RoleBadge role={PEOPLE[issue.assignee]?.role} />
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        {issue.sdetAssignee ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <Avatar name={issue.sdetAssignee} size={22} />
                            <span style={{ fontSize: 12, color: "#C084FC" }}>{PEOPLE[issue.sdetAssignee]?.short ?? issue.sdetAssignee}</span>
                          </div>
                        ) : <span style={{ fontSize: 11, color: txt3, fontStyle: "italic" }}>—</span>}
                      </td>
                      <td style={{ padding: "10px 14px" }}><StatusPill status={issue.status} dark={dark} /></td>
                      <td style={{ padding: "10px 14px" }}><PriBadge priority={issue.priority} dark={dark} /></td>
                      <td style={{ padding: "10px 14px" }}><ProjectBadge project={issue.project} dark={dark} /></td>
                      <td style={{ padding: "10px 14px" }}><DeadlineBadge issue={issue} /></td>
                      <td style={{ padding: "10px 14px", fontSize: 11, color: txt2, fontFamily: "monospace", whiteSpace: "nowrap" }}>{relTime(issue.updated)}</td>
                      <td style={{ padding: "10px 14px", maxWidth: 220 }}>
                        {issue.last_comment_text
                          ? <div><div style={{ fontSize: 10, color: txt3, fontWeight: 700, marginBottom: 2 }}>{issue.last_comment_author} · {relTime(issue.last_comment_date)}</div><div style={{ fontSize: 11, color: txt2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{issue.last_comment_text}</div></div>
                          : <span style={{ fontSize: 11, color: txt3, fontStyle: "italic" }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}