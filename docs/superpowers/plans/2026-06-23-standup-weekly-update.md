# Standup Capture → Weekly Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture each daily stand-up as a pasted transcript, turn it into per-ticket progress notes with Claude, store them locally, and generate the team's weekly update document in its existing format for editing and export.

**Architecture:** Express backend (`:3001`) gains pure helper modules (initiative grouping, week aggregation), a flat-file store (no DB), and a thin Anthropic wrapper; new routes serve daily capture and weekly generation. The React single-file app (`:5173`) gains two tabs (Capture, Weekly). Jira stays read-only. Spec: `docs/superpowers/specs/2026-06-23-standup-weekly-update-design.md`.

**Tech Stack:** Node 18+ (ESM), Express 5, React 19, `@anthropic-ai/sdk` (model `claude-opus-4-8`), `docx` (Word export), `node --test` (backend unit tests).

---

## File Structure

- `server/initiatives.js` — pure: resolve a ticket's initiative (epic → summary-prefix → override → fallback). + `server/initiatives.test.js`
- `server/weekly.js` — pure: ISO week math + week aggregation grouped by initiative / QA. + `server/weekly.test.js`
- `server/standupStore.js` — flat-file read/write under a base dir. + `server/standupStore.test.js`
- `server/claude.js` — pure prompt/schema builders + thin Anthropic calls. + `server/claude.test.js`
- `server/jira.js` — MODIFY `mapIssue` to expose `epicKey`/`epicName`; export it for testing. + `server/jira.test.js`
- `server/index.js` — MODIFY: add standup routes.
- `src/App.jsx` — MODIFY: add Capture and Weekly tabs + API calls + export.
- `package.json` — MODIFY: deps + `test` script.
- `.gitignore` — MODIFY: ignore `data/`.
- `.env` — MODIFY (manual): add `ANTHROPIC_API_KEY`.
- `data/` — created at runtime (git-ignored): `standups/*.json`, `weekly/*.md`, `initiative-overrides.json`.

---

## Task 1: Project setup — dependencies, gitignore, test script

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Modify (manual): `.env`

- [ ] **Step 1: Install runtime dependencies**

Run:
```bash
npm install @anthropic-ai/sdk docx
```
Expected: both added under `dependencies` in `package.json`; no errors.

- [ ] **Step 2: Add the test script**

In `package.json`, add to `"scripts"` (after the `"server"` line):
```json
    "test": "node --test",
```
Expected `"scripts"` block:
```json
  "scripts": {
    "dev": "vite",
    "server": "node server/index.js",
    "test": "node --test",
    "start": "concurrently \"npm run server\" \"npm run dev\"",
    "build": "vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  },
```

- [ ] **Step 3: Ignore the data directory**

Append to `.gitignore`:
```
# Local standup/weekly storage
data/
```

- [ ] **Step 4: Add the API key to `.env` (manual)**

Tell the user to add this line to `.env` (already git-ignored). The agent does NOT have the key:
```
ANTHROPIC_API_KEY=sk-ant-...
```

- [ ] **Step 5: Verify the test runner works**

Run: `npm test`
Expected: exits 0 with "tests 0" (no test files yet) — confirms `node --test` is wired.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore(standup): add anthropic-sdk + docx deps and node test runner"
```

---

## Task 2: Expose epic on mapped issues

`mapIssue` in `server/jira.js` currently returns no epic. The weekly grouping needs the parent epic. Add `epicKey`/`epicName` and export `mapIssue` so it can be tested.

**Files:**
- Modify: `server/jira.js`
- Test: `server/jira.test.js`

- [ ] **Step 1: Write the failing test**

Create `server/jira.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapIssue } from './jira.js';

test('mapIssue extracts parent epic key and name', () => {
  const raw = {
    key: 'NACT-5315',
    fields: {
      summary: 'Validate Receiver ID',
      status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
      project: { key: 'NACT' },
      parent: { key: 'NACT-5204', fields: { summary: 'Requirement Updates / Activation Defects - SummaCare - Cigna' } },
    },
  };
  const m = mapIssue(raw);
  assert.equal(m.epicKey, 'NACT-5204');
  assert.equal(m.epicName, 'Requirement Updates / Activation Defects - SummaCare - Cigna');
});

test('mapIssue tolerates a missing parent', () => {
  const raw = { key: 'SUPP-1', fields: { summary: '(Euro Center) x', status: { name: 'New', statusCategory: { key: 'new' } }, project: { key: 'SUPP' } } };
  const m = mapIssue(raw);
  assert.equal(m.epicKey, null);
  assert.equal(m.epicName, null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test server/jira.test.js`
Expected: FAIL — `mapIssue` is not exported (import is `undefined`).

- [ ] **Step 3: Export `mapIssue` and add epic fields**

In `server/jira.js`, change the declaration `function mapIssue(raw) {` to `export function mapIssue(raw) {`.

Then inside the returned object, add these two fields right after the `project:` line:
```js
    epicKey: f.parent?.key || null,
    epicName: f.parent?.fields?.summary || null,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test server/jira.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/jira.js server/jira.test.js
git commit -m "feat(jira): expose parent epic key/name on mapped issues"
```

---

## Task 3: Initiative grouping (pure)

Resolve a ticket's initiative grouping key by precedence: ticket override → epic override → summary prefix → epic name → project.

**Files:**
- Create: `server/initiatives.js`
- Test: `server/initiatives.test.js`

- [ ] **Step 1: Write the failing test**

Create `server/initiatives.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveInitiative } from './initiatives.js';

const overrides = {
  byTicketKey: { 'ACT-1023': 'AmeriHealth' },
  byEpicKey: { 'NACT-5208': 'Sharp – Valenz Activation' },
  bySummaryPrefix: { '(Euro Center)': 'Euro Center' },
};

test('ticket override wins over everything', () => {
  const r = resolveInitiative({ key: 'ACT-1023', summary: 'Auth CR', epicKey: 'X', epicName: 'Y', project: 'ACT' }, overrides);
  assert.deepEqual(r, { key: 'AmeriHealth', source: 'ticket-override' });
});

test('epic override beats epic name', () => {
  const r = resolveInitiative({ key: 'NACT-5263', summary: 'SPIKE', epicKey: 'NACT-5208', epicName: 'Requirement Updates / Activation Defects - Sharp - Valenz', project: 'NACT' }, overrides);
  assert.deepEqual(r, { key: 'Sharp – Valenz Activation', source: 'epic-override' });
});

test('summary prefix matches when no override', () => {
  const r = resolveInitiative({ key: 'SUPP-2540', summary: '(Euro Center) Diagnostic Error', epicKey: null, epicName: null, project: 'SUPP' }, overrides);
  assert.deepEqual(r, { key: 'Euro Center', source: 'summary-prefix' });
});

test('falls back to epic name', () => {
  const r = resolveInitiative({ key: 'NACT-5315', summary: 'Validate', epicKey: 'NACT-5204', epicName: 'Requirement Updates / Activation Defects - SummaCare - Cigna', project: 'NACT' }, overrides);
  assert.deepEqual(r, { key: 'Requirement Updates / Activation Defects - SummaCare - Cigna', source: 'epic' });
});

test('falls back to project when nothing else', () => {
  const r = resolveInitiative({ key: 'CONN-9', summary: 'x', epicKey: null, epicName: null, project: 'CONN' }, {});
  assert.deepEqual(r, { key: 'CONN', source: 'fallback' });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test server/initiatives.test.js`
Expected: FAIL — cannot find module `./initiatives.js`.

- [ ] **Step 3: Implement `server/initiatives.js`**

```js
// Resolve which client/initiative a ticket rolls up to for the weekly update.
// Precedence: ticket override → epic override → summary prefix → epic name → project.
export function resolveInitiative(issue, overrides = {}) {
  const { byTicketKey = {}, byEpicKey = {}, bySummaryPrefix = {} } = overrides;

  if (byTicketKey[issue.key]) {
    return { key: byTicketKey[issue.key], source: 'ticket-override' };
  }
  if (issue.epicKey && byEpicKey[issue.epicKey]) {
    return { key: byEpicKey[issue.epicKey], source: 'epic-override' };
  }
  const summary = issue.summary || '';
  for (const prefix of Object.keys(bySummaryPrefix)) {
    if (summary.includes(prefix)) {
      return { key: bySummaryPrefix[prefix], source: 'summary-prefix' };
    }
  }
  if (issue.epicName) {
    return { key: issue.epicName, source: 'epic' };
  }
  return { key: issue.project || 'Ungrouped', source: 'fallback' };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test server/initiatives.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/initiatives.js server/initiatives.test.js
git commit -m "feat(standup): initiative grouping resolver with override precedence"
```

---

## Task 4: Week math + aggregation (pure)

Compute the ISO week key, the Mon–Fri date strings for a week, and aggregate a set of daily records into initiative groups + a QA-coverage group.

**Files:**
- Create: `server/weekly.js`
- Test: `server/weekly.test.js`

- [ ] **Step 1: Write the failing test**

Create `server/weekly.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isoWeekKey, weekdayDates, aggregateWeek } from './weekly.js';

test('isoWeekKey formats year + week', () => {
  assert.equal(isoWeekKey('2026-06-23'), '2026-W26'); // Tuesday
  assert.equal(isoWeekKey('2026-06-22'), '2026-W26'); // Monday same week
});

test('weekdayDates returns Mon..Fri from any day in the week', () => {
  assert.deepEqual(weekdayDates('2026-06-23'), [
    '2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26',
  ]);
});

test('aggregateWeek groups tickets by initiative and collects QA coverage', () => {
  const dailies = [
    { date: '2026-06-22', perTicket: [{ key: 'NACT-5315', note: 'Validated headers.' }] },
    { date: '2026-06-23', perTicket: [{ key: 'NACT-5315', note: 'Resolved bug.' }, { key: 'NACT-6490', note: 'Diwas tested ack.' }] },
  ];
  const issuesByKey = {
    'NACT-5315': { key: 'NACT-5315', summary: 'Validate Receiver ID', assignee: 'Anjali Prajapati', sdetAssignee: null, status: 'In Progress', epicName: 'X - SummaCare - Cigna', epicKey: 'E1', project: 'NACT' },
    'NACT-6490': { key: 'NACT-6490', summary: 'Ack values', assignee: 'Diwas Dhital - Maitri', sdetAssignee: null, status: 'Done', epicName: 'X - ACI - Cigna', epicKey: 'E2', project: 'NACT' },
  };
  const qaNames = ['Aarati Adhikari', 'Diwas Dhital - Maitri'];
  const out = aggregateWeek(dailies, issuesByKey, {}, qaNames);

  // NACT-5315 chronological notes accumulated
  const summa = out.initiatives.find(i => i.key === 'X - SummaCare - Cigna');
  assert.equal(summa.tickets[0].notes.length, 2);
  assert.deepEqual(summa.tickets[0].notes, ['Validated headers.', 'Resolved bug.']);

  // NACT-6490 is QA (Diwas assignee) → appears in qaCoverage
  assert.ok(out.qaCoverage.some(t => t.key === 'NACT-6490'));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test server/weekly.test.js`
Expected: FAIL — cannot find module `./weekly.js`.

- [ ] **Step 3: Implement `server/weekly.js`**

```js
import { resolveInitiative } from './initiatives.js';

// ISO-8601 week number for a yyyy-mm-dd string.
export function isoWeekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  d.setUTCDate(d.getUTCDate() - day + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const ftDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ftDay + 3);
  const week = 1 + Math.round((d - firstThursday) / (7 * 24 * 3600 * 1000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// Mon..Fri yyyy-mm-dd strings for the week containing dateStr.
export function weekdayDates(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = (d.getUTCDay() + 6) % 7; // Mon=0
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - day);
  return Array.from({ length: 5 }, (_, i) => {
    const x = new Date(monday);
    x.setUTCDate(monday.getUTCDate() + i);
    return x.toISOString().slice(0, 10);
  });
}

// Aggregate daily records into initiative groups + a QA-coverage group.
// dailies: [{ date, perTicket: [{key, note}] }] (chronological order preserved)
// issuesByKey: { key: { summary, assignee, sdetAssignee, status, epicName, epicKey, project } }
// qaNames: canonical display names treated as QA.
export function aggregateWeek(dailies, issuesByKey, overrides = {}, qaNames = []) {
  const qa = new Set(qaNames);
  const byKey = {}; // key -> { ...meta, notes: [] }

  const ordered = [...dailies].sort((a, b) => a.date.localeCompare(b.date));
  for (const day of ordered) {
    for (const pt of day.perTicket || []) {
      if (!byKey[pt.key]) {
        const meta = issuesByKey[pt.key] || { key: pt.key, summary: pt.key, project: '' };
        byKey[pt.key] = { ...meta, key: pt.key, notes: [] };
      }
      if (pt.note) byKey[pt.key].notes.push(pt.note);
    }
  }

  const initiativeMap = new Map();
  const qaCoverage = [];
  for (const t of Object.values(byKey)) {
    const isQa = qa.has(t.assignee) || qa.has(t.sdetAssignee);
    if (isQa) qaCoverage.push(t);
    const { key: initKey } = resolveInitiative(t, overrides);
    if (!initiativeMap.has(initKey)) initiativeMap.set(initKey, { key: initKey, tickets: [] });
    initiativeMap.get(initKey).tickets.push(t);
  }

  return { initiatives: [...initiativeMap.values()], qaCoverage };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test server/weekly.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/weekly.js server/weekly.test.js
git commit -m "feat(standup): ISO week math and per-initiative week aggregation"
```

---

## Task 5: Flat-file store

Read/write daily JSON, weekly markdown, and the overrides map under a base dir.

**Files:**
- Create: `server/standupStore.js`
- Test: `server/standupStore.test.js`

- [ ] **Step 1: Write the failing test**

Create `server/standupStore.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveDaily, readDaily, listDaily, saveWeekly, readWeekly, readOverrides } from './standupStore.js';

test('daily save/read/list round-trips', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'maitri-'));
  try {
    await saveDaily(dir, { date: '2026-06-23', perTicket: [{ key: 'NACT-1', note: 'x' }] });
    const back = await readDaily(dir, '2026-06-23');
    assert.equal(back.perTicket[0].key, 'NACT-1');
    const list = await listDaily(dir, {});
    assert.equal(list.length, 1);
    assert.equal(list[0].date, '2026-06-23');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('weekly save/read round-trips', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'maitri-'));
  try {
    await saveWeekly(dir, '2026-W26', '# Weekly\nhello');
    assert.match(await readWeekly(dir, '2026-W26'), /hello/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('readOverrides returns empty shape when missing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'maitri-'));
  try {
    assert.deepEqual(await readOverrides(dir), { byTicketKey: {}, byEpicKey: {}, bySummaryPrefix: {} });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('readDaily returns null for a missing date', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'maitri-'));
  try {
    assert.equal(await readDaily(dir, '2099-01-01'), null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test server/standupStore.test.js`
Expected: FAIL — cannot find module `./standupStore.js`.

- [ ] **Step 3: Implement `server/standupStore.js`**

```js
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

export async function saveDaily(baseDir, day) {
  const dir = join(baseDir, 'standups');
  await ensureDir(dir);
  await writeFile(join(dir, `${day.date}.json`), JSON.stringify(day, null, 2), 'utf8');
  return day;
}

export async function readDaily(baseDir, date) {
  try {
    const text = await readFile(join(baseDir, 'standups', `${date}.json`), 'utf8');
    return JSON.parse(text);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function listDaily(baseDir, { from, to } = {}) {
  const dir = join(baseDir, 'standups');
  let names;
  try { names = await readdir(dir); } catch (err) { if (err.code === 'ENOENT') return []; throw err; }
  return names
    .filter(n => n.endsWith('.json'))
    .map(n => n.slice(0, -5))
    .filter(date => (!from || date >= from) && (!to || date <= to))
    .sort()
    .map(date => ({ date }));
}

export async function saveWeekly(baseDir, week, markdown) {
  const dir = join(baseDir, 'weekly');
  await ensureDir(dir);
  await writeFile(join(dir, `${week}.md`), markdown, 'utf8');
  return week;
}

export async function readWeekly(baseDir, week) {
  try {
    return await readFile(join(baseDir, 'weekly', `${week}.md`), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function readOverrides(baseDir) {
  const empty = { byTicketKey: {}, byEpicKey: {}, bySummaryPrefix: {} };
  try {
    const text = await readFile(join(baseDir, 'initiative-overrides.json'), 'utf8');
    return { ...empty, ...JSON.parse(text) };
  } catch (err) {
    if (err.code === 'ENOENT') return empty;
    throw err;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test server/standupStore.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/standupStore.js server/standupStore.test.js
git commit -m "feat(standup): flat-file store for daily/weekly/overrides"
```

---

## Task 6: Claude wrapper — prompt/schema builders + API calls

The pure builders are unit-tested; the two API-calling functions are thin and verified manually (Task 10).

**Files:**
- Create: `server/claude.js`
- Test: `server/claude.test.js`

- [ ] **Step 1: Write the failing test (pure builders only)**

Create `server/claude.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExtractionMessages, DAILY_SCHEMA, buildWeeklyMessages } from './claude.js';

test('extraction messages embed the active ticket list and transcript', () => {
  const { system, messages } = buildExtractionMessages('Anjali validated NACT-5315.', [
    { key: 'NACT-5315', summary: 'Validate Receiver ID', assignee: 'Anjali Prajapati', status: 'In Progress' },
  ]);
  assert.match(system, /ticket keys/i);
  const user = messages[0].content;
  assert.match(user, /NACT-5315/);
  assert.match(user, /Anjali validated/);
});

test('DAILY_SCHEMA requires perTicket/unmatched/noUpdate', () => {
  assert.deepEqual(DAILY_SCHEMA.required, ['perTicket', 'unmatched', 'noUpdate']);
  assert.equal(DAILY_SCHEMA.properties.perTicket.items.required.join(','), 'key,note');
});

test('weekly messages include initiative names and the boilerplate sections', () => {
  const agg = { initiatives: [{ key: 'X - SummaCare - Cigna', tickets: [{ key: 'NACT-5315', summary: 'Validate', assignee: 'Anjali Prajapati', status: 'In Progress', notes: ['Validated headers.'] }] }], qaCoverage: [] };
  const { messages } = buildWeeklyMessages(agg, { sprintCapacityUrl: 'https://x', absenteesThisWeek: 'Aarati: 06/19' });
  const user = messages[0].content;
  assert.match(user, /SummaCare/);
  assert.match(user, /Absentee Report/);
  assert.match(user, /Sprint Capacity/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test server/claude.test.js`
Expected: FAIL — cannot find module `./claude.js`.

- [ ] **Step 3: Implement `server/claude.js`**

```js
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-4-8';

export const DAILY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    perTicket: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          key: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['key', 'note'],
      },
    },
    unmatched: { type: 'array', items: { type: 'string' } },
    noUpdate: { type: 'array', items: { type: 'string' } },
  },
  required: ['perTicket', 'unmatched', 'noUpdate'],
};

export function buildExtractionMessages(transcript, activeTickets) {
  const system =
    'You convert a daily stand-up transcript into per-ticket progress notes. ' +
    'You are given the list of active ticket keys with summaries and assignees. ' +
    'For every ticket clearly discussed, write a one or two sentence progress note in a neutral past-tense reporting voice (e.g. "Resolved bug NACT-5876 for ack header values."). ' +
    'Map spoken references to the correct ticket key using the summaries/assignees. ' +
    'Put any clearly-discussed item you could NOT map to a key into "unmatched" (verbatim phrase). ' +
    'Put active tickets that nobody discussed into "noUpdate" (their keys). ' +
    'Return only tickets from the provided list in perTicket.';

  const ticketLines = activeTickets
    .map(t => `- ${t.key} | ${t.summary} | assignee: ${t.assignee || 'Unassigned'} | status: ${t.status || ''}`)
    .join('\n');

  const user =
    `ACTIVE TICKETS:\n${ticketLines}\n\nSTAND-UP TRANSCRIPT:\n${transcript}`;

  return { system, messages: [{ role: 'user', content: user }] };
}

export function buildWeeklyMessages(aggregate, boilerplate = {}) {
  const system =
    'You write a weekly engineering status update for the Maitri team at MacroHealth. ' +
    'Match this exact section order and headings: ' +
    '"Overall Project Status:", "Detail weekly Update:" (group by client/initiative, narrate per person in past tense, weave in ticket keys), ' +
    '"QA / SDET Coverage :", "Project Risk/ Issue/ Blocker:", "WorkLog and Smart Sheet :", "Sprint Capacity:", "Absentee Report:", "Next Week:". ' +
    'Use the provided aggregated notes verbatim in substance — do not invent work. ' +
    'For sections not derivable from the notes, use the provided boilerplate values (or sensible defaults: status "On Track"; risks "No risks, issues, or blockers were identified for this week."). ' +
    'Output GitHub-flavored markdown.';

  const initiativeBlocks = aggregate.initiatives.map(init => {
    const lines = init.tickets.map(t =>
      `  - ${t.key} (${t.assignee || 'Unassigned'}, ${t.status || ''}): ${t.notes.join(' ')}`).join('\n');
    return `## ${init.key}\n${lines}`;
  }).join('\n');

  const qaBlock = aggregate.qaCoverage.map(t =>
    `  - ${t.key} (${t.sdetAssignee || t.assignee}): ${t.notes.join(' ')}`).join('\n');

  const user =
    `OVERALL STATUS: ${boilerplate.overallStatus || 'On Track'}\n\n` +
    `INITIATIVE NOTES:\n${initiativeBlocks || '(none)'}\n\n` +
    `QA / SDET COVERAGE:\n${qaBlock || '(none)'}\n\n` +
    `RISKS/BLOCKERS: ${boilerplate.risks || 'No risks, issues, or blockers were identified for this week.'}\n` +
    `WORKLOG/SMARTSHEET: ${boilerplate.worklog || 'All team members have submitted their week’s timesheets.'}\n` +
    `SPRINT CAPACITY URL: ${boilerplate.sprintCapacityUrl || '(add link)'}\n` +
    `ABSENTEE REPORT — This week: ${boilerplate.absenteesThisWeek || '(none)'}; Next week: ${boilerplate.absenteesNextWeek || 'No planned leave'}\n` +
    `NEXT WEEK: ${boilerplate.nextWeek || '(summarize from in-progress and planned tickets)'}`;

  return { system, messages: [{ role: 'user', content: user }] };
}

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    const e = new Error('ANTHROPIC_API_KEY is not set. Add it to .env.');
    e.code = 'NO_API_KEY';
    throw e;
  }
  return new Anthropic();
}

// Returns { perTicket, unmatched, noUpdate }.
export async function extractDailyNotes(transcript, activeTickets) {
  const client = getClient();
  const { system, messages } = buildExtractionMessages(transcript, activeTickets);
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system,
    messages,
    output_config: { format: { type: 'json_schema', name: 'daily_notes', schema: DAILY_SCHEMA } },
  });
  const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return JSON.parse(text);
}

// Returns the weekly update as a markdown string (streamed to avoid HTTP timeouts).
export async function composeWeeklyUpdate(aggregate, boilerplate) {
  const client = getClient();
  const { system, messages } = buildWeeklyMessages(aggregate, boilerplate);
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    thinking: { type: 'adaptive' },
    system,
    messages,
  });
  const final = await stream.finalMessage();
  return final.content.filter(b => b.type === 'text').map(b => b.text).join('');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test server/claude.test.js`
Expected: PASS (3 tests). (No network — only pure builders are tested.)

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests across the 5 files PASS.

- [ ] **Step 6: Commit**

```bash
git add server/claude.js server/claude.test.js
git commit -m "feat(standup): Anthropic wrapper with extraction schema + weekly composer"
```

---

## Task 7: Backend routes

Wire the store + claude + aggregation into Express. Active-ticket context reuses the existing Jira cache via `fetchAllIssues`.

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: Add imports**

At the top of `server/index.js`, extend the jira import and add the new modules:
```js
import { fetchAllIssues, clearCache, fetchAllSprints, verifyCredentials } from './jira.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { extractDailyNotes, composeWeeklyUpdate } from './claude.js';
import { saveDaily, readDaily, listDaily, saveWeekly, readWeekly, readOverrides } from './standupStore.js';
import { aggregateWeek, weekdayDates, isoWeekKey } from './weekly.js';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const QA_NAMES = ['Aarati Adhikari', 'Diwas Dhital - Maitri'];
```

- [ ] **Step 2: Add the routes (before `app.listen`)**

```js
// Active tickets that need a stand-up note (in-progress / blocked / planned).
const ACTIVE_CATS = new Set(['indeterminate', 'new']);

app.post('/api/standup/daily', extractAuth, async (req, res) => {
  const { date, transcript } = req.body || {};
  if (!date || !transcript) return res.status(400).json({ error: 'date and transcript are required' });
  try {
    const issues = await fetchAllIssues(req.auth, req.jiraEmail);
    const active = issues.filter(i => ACTIVE_CATS.has(i.statusCategory));
    const activeTickets = active.map(i => ({ key: i.key, summary: i.summary, assignee: i.assignee, status: i.status }));

    // Save raw transcript first so nothing is lost if extraction fails.
    const base = { date, capturedAt: new Date().toISOString(), rawTranscript: transcript, perTicket: [], unmatched: [], noUpdate: [] };
    await saveDaily(DATA_DIR, base);

    const extracted = await extractDailyNotes(transcript, activeTickets);
    const issuesByKey = Object.fromEntries(issues.map(i => [i.key, i]));
    const perTicket = extracted.perTicket.map(pt => {
      const m = issuesByKey[pt.key] || {};
      return { key: pt.key, note: pt.note, summary: m.summary || '', assignee: m.assignee || '', status: m.status || '' };
    });
    const day = { ...base, perTicket, unmatched: extracted.unmatched || [], noUpdate: extracted.noUpdate || [] };
    await saveDaily(DATA_DIR, day);
    res.json(day);
  } catch (err) {
    if (err.code === 'NO_API_KEY') return res.status(500).json({ error: err.message });
    console.error('daily capture error:', err.message);
    res.status(502).json({ error: 'Failed to extract notes', detail: err.message });
  }
});

app.get('/api/standup/daily/:date', extractAuth, async (req, res) => {
  const day = await readDaily(DATA_DIR, req.params.date);
  if (!day) return res.status(404).json({ error: 'no capture for that date' });
  res.json(day);
});

app.get('/api/standup/history', extractAuth, async (req, res) => {
  res.json(await listDaily(DATA_DIR, { from: req.query.from, to: req.query.to }));
});

app.post('/api/standup/weekly', extractAuth, async (req, res) => {
  const { weekStart, boilerplate } = req.body || {};
  if (!weekStart) return res.status(400).json({ error: 'weekStart (a yyyy-mm-dd in the week) is required' });
  try {
    const dates = weekdayDates(weekStart);
    const dailies = (await Promise.all(dates.map(d => readDaily(DATA_DIR, d)))).filter(Boolean);
    const issues = await fetchAllIssues(req.auth, req.jiraEmail);
    const issuesByKey = Object.fromEntries(issues.map(i => [i.key, i]));
    const overrides = await readOverrides(DATA_DIR);
    const aggregate = aggregateWeek(dailies, issuesByKey, overrides, QA_NAMES);
    const markdown = await composeWeeklyUpdate(aggregate, boilerplate || {});
    const week = isoWeekKey(weekStart);
    await saveWeekly(DATA_DIR, week, markdown);
    res.json({ week, markdown });
  } catch (err) {
    if (err.code === 'NO_API_KEY') return res.status(500).json({ error: err.message });
    console.error('weekly compose error:', err.message);
    res.status(502).json({ error: 'Failed to compose weekly update', detail: err.message });
  }
});

app.get('/api/standup/weekly/:week', extractAuth, async (req, res) => {
  const markdown = await readWeekly(DATA_DIR, req.params.week);
  if (markdown == null) return res.status(404).json({ error: 'no weekly draft' });
  res.json({ week: req.params.week, markdown });
});

app.put('/api/standup/weekly/:week', extractAuth, async (req, res) => {
  const { markdown } = req.body || {};
  if (typeof markdown !== 'string') return res.status(400).json({ error: 'markdown string required' });
  await saveWeekly(DATA_DIR, req.params.week, markdown);
  res.json({ week: req.params.week, markdown });
});
```

- [ ] **Step 3: Enable JSON body parsing**

The routes read `req.body`. Add this line right after `app.use(cors(...))` near the top:
```js
app.use(express.json({ limit: '2mb' }));
```

- [ ] **Step 4: Smoke-test the server boots**

Run: `npm run server`
Expected: logs `Maitri API server running on http://localhost:3001` with no import errors. Stop it with Ctrl-C.

- [ ] **Step 5: Commit**

```bash
git add server/index.js
git commit -m "feat(standup): backend routes for daily capture and weekly generation"
```

---

## Task 8: Frontend — Capture tab

Add a `CaptureView` component and a `capture` tab. Paste transcript → POST `/api/standup/daily` → show editable per-ticket notes + unmatched/noUpdate.

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add the CaptureView component**

In `src/App.jsx`, add this component just before `// ─── deadline panel ───` (after `StandupView`):
```jsx
// ─── capture view ───────────────────────────────────────────────
function CaptureView({ credentials, dark }) {
  const bg2 = dark ? "#111520" : "#FFFFFF";
  const bdr = dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,60,0.07)";
  const txt = dark ? "#E2E8F0" : "#0F172A";
  const txt2 = dark ? "#64748B" : "#4A5280";

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const extract = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/standup/daily`, {
        method: "POST",
        headers: { ...authHeaders(credentials), "Content-Type": "application/json" },
        body: JSON.stringify({ date, transcript }),
      });
      if (!res.ok) throw new Error((await res.json()).error || `API ${res.status}`);
      setResult(await res.json());
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  const editNote = (i, val) => setResult(r => {
    const perTicket = r.perTicket.map((pt, idx) => idx === i ? { ...pt, note: val } : pt);
    return { ...r, perTicket };
  });

  const save = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/standup/daily`, {
        method: "POST",
        headers: { ...authHeaders(credentials), "Content-Type": "application/json" },
        body: JSON.stringify({ date, transcript, override: result }),
      });
      if (!res.ok) throw new Error((await res.json()).error || `API ${res.status}`);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 800, color: txt, marginBottom: 12 }}>Stand-up Capture</div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ padding: "6px 10px", borderRadius: 7, border: `1px solid ${bdr}`, background: bg2, color: txt, fontFamily: "inherit" }} />
        <button onClick={extract} disabled={loading || !transcript.trim()}
          style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid #4F8EF7", background: "#4F8EF7", color: "#fff", cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>
          {loading ? "Working…" : "Extract notes"}
        </button>
      </div>
      <textarea value={transcript} onChange={e => setTranscript(e.target.value)} placeholder="Paste the stand-up transcript here…"
        style={{ width: "100%", minHeight: 160, padding: 12, borderRadius: 10, border: `1px solid ${bdr}`, background: bg2, color: txt, fontFamily: "inherit", fontSize: 13, resize: "vertical" }} />
      {error && <div style={{ color: "#F74F4F", fontSize: 13, marginTop: 8 }}>{error}</div>}

      {result && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: txt, marginBottom: 8 }}>Per-ticket notes ({result.perTicket.length})</div>
          {result.perTicket.map((pt, i) => (
            <div key={pt.key + i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
              <a href={JIRA_BASE + pt.key} target="_blank" rel="noreferrer" style={{ fontFamily: "monospace", fontWeight: 700, color: "#4F8EF7", textDecoration: "none", minWidth: 80, paddingTop: 6 }}>{pt.key}</a>
              <textarea value={pt.note} onChange={e => editNote(i, e.target.value)}
                style={{ flex: 1, minHeight: 38, padding: 8, borderRadius: 8, border: `1px solid ${bdr}`, background: bg2, color: txt, fontFamily: "inherit", fontSize: 13, resize: "vertical" }} />
            </div>
          ))}
          {result.unmatched?.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 12, color: "#F7A24F" }}>
              <b>Mentioned but unmatched:</b> {result.unmatched.join(" · ")}
            </div>
          )}
          {result.noUpdate?.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 12, color: txt2 }}>
              <b>No update today:</b> {result.noUpdate.join(", ")}
            </div>
          )}
          <button onClick={save} disabled={loading}
            style={{ marginTop: 12, padding: "7px 16px", borderRadius: 8, border: "1px solid #34D399", background: "rgba(52,211,153,0.12)", color: "#34D399", cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>
            Save edits
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Support the `override` payload in the backend**

In `server/index.js`, in `POST /api/standup/daily`, allow a pre-edited save to skip re-extraction. Replace the `const { date, transcript } = req.body || {};` line with:
```js
  const { date, transcript, override } = req.body || {};
```
and immediately after the `if (!date || !transcript) ...` guard, add:
```js
  if (override && Array.isArray(override.perTicket)) {
    const day = { date, capturedAt: new Date().toISOString(), rawTranscript: transcript,
      perTicket: override.perTicket, unmatched: override.unmatched || [], noUpdate: override.noUpdate || [] };
    await saveDaily(DATA_DIR, day);
    return res.json(day);
  }
```

- [ ] **Step 3: Register the tab and render it**

In the topbar tab array (around the `[["dev","Dev Board"],...]` list), add `["capture","Capture"]` and `["weekly","Weekly"]` before `["reports","Reports"]`:
```jsx
{[["dev","Dev Board"],["qa","QA Board"],["standup","Standup"],["capture","Capture"],["weekly","Weekly"],["reports","Reports"],["attention",`Attention${attentionItems.total > 0 ? ` (${attentionItems.total})` : ""}`]].map(([t, l]) => (
```

Then add a render block next to the other tab blocks (after the STANDUP TAB block):
```jsx
        {/* CAPTURE TAB */}
        {tab === "capture" && <CaptureView credentials={credentials} dark={dark} />}
```

Also exclude `capture` and `weekly` from the stat-cards / people-cards / board sections the same way `standup` is excluded. Find each `tab !== "attention" && tab !== "reports" && tab !== "standup"` condition and change it to also exclude the two new tabs, e.g.:
```jsx
{tab !== "attention" && tab !== "reports" && tab !== "standup" && tab !== "capture" && tab !== "weekly" && (
```
(There are three such conditions: the stat-cards block, the view-toggle in the topbar, and the people-cards/`<>` block. Update all three.)

- [ ] **Step 4: Manual verification**

Run: `npm start`. Log in. Click **Capture**. Paste a short transcript mentioning a couple of real active ticket keys, set the date, click **Extract notes**.
Expected: per-ticket notes appear with editable text; unmatched/noUpdate lists render; **Save edits** returns without error. Confirm `data/standups/<date>.json` was written.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx server/index.js
git commit -m "feat(standup): Capture tab — transcript to editable per-ticket notes"
```

---

## Task 9: Frontend — Weekly tab + export

Add a `WeeklyView`: pick a week, generate, edit markdown, export to `.docx` / `.md`.

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add the docx import**

At the top of `src/App.jsx`, after the `import * as XLSX from "xlsx";` line:
```jsx
import { Document, Packer, Paragraph, TextRun } from "docx";
```

- [ ] **Step 2: Add the WeeklyView component**

Add just after `CaptureView`:
```jsx
// ─── weekly view ────────────────────────────────────────────────
function WeeklyView({ credentials, dark }) {
  const bg2 = dark ? "#111520" : "#FFFFFF";
  const bdr = dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,60,0.07)";
  const txt = dark ? "#E2E8F0" : "#0F172A";
  const txt2 = dark ? "#64748B" : "#4A5280";

  const [weekStart, setWeekStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [markdown, setMarkdown] = useState("");
  const [week, setWeek] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [absThis, setAbsThis] = useState("");
  const [capacityUrl, setCapacityUrl] = useState("");

  const generate = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/standup/weekly`, {
        method: "POST",
        headers: { ...authHeaders(credentials), "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart, boilerplate: { absenteesThisWeek: absThis, sprintCapacityUrl: capacityUrl } }),
      });
      if (!res.ok) throw new Error((await res.json()).error || `API ${res.status}`);
      const data = await res.json();
      setMarkdown(data.markdown); setWeek(data.week);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  const save = async () => {
    if (!week) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/standup/weekly/${week}`, {
        method: "PUT",
        headers: { ...authHeaders(credentials), "Content-Type": "application/json" },
        body: JSON.stringify({ markdown }),
      });
      if (!res.ok) throw new Error((await res.json()).error || `API ${res.status}`);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  const downloadMarkdown = () => {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `weekly-update-${week || weekStart}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const downloadDocx = async () => {
    const paragraphs = markdown.split("\n").map(line => {
      const heading = line.startsWith("#");
      const text = line.replace(/^#+\s*/, "");
      return new Paragraph({ children: [new TextRun({ text, bold: heading })] });
    });
    const doc = new Document({ sections: [{ children: paragraphs }] });
    const blob = await Packer.toBlob(doc);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `weekly-update-${week || weekStart}.docx`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 800, color: txt, marginBottom: 12 }}>Weekly Update</div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <label style={{ fontSize: 12, color: txt2 }}>Week of</label>
        <input type="date" value={weekStart} onChange={e => setWeekStart(e.target.value)}
          style={{ padding: "6px 10px", borderRadius: 7, border: `1px solid ${bdr}`, background: bg2, color: txt, fontFamily: "inherit" }} />
        <input value={absThis} onChange={e => setAbsThis(e.target.value)} placeholder="Absentees this week (e.g. Aarati: 06/19)"
          style={{ padding: "6px 10px", borderRadius: 7, border: `1px solid ${bdr}`, background: bg2, color: txt, fontFamily: "inherit", minWidth: 240 }} />
        <input value={capacityUrl} onChange={e => setCapacityUrl(e.target.value)} placeholder="Sprint capacity URL"
          style={{ padding: "6px 10px", borderRadius: 7, border: `1px solid ${bdr}`, background: bg2, color: txt, fontFamily: "inherit", minWidth: 200 }} />
        <button onClick={generate} disabled={loading}
          style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid #4F8EF7", background: "#4F8EF7", color: "#fff", cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>
          {loading ? "Working…" : "Generate"}
        </button>
      </div>
      {error && <div style={{ color: "#F74F4F", fontSize: 13, marginBottom: 8 }}>{error}</div>}

      {markdown && (
        <>
          <textarea value={markdown} onChange={e => setMarkdown(e.target.value)}
            style={{ width: "100%", minHeight: 420, padding: 14, borderRadius: 10, border: `1px solid ${bdr}`, background: bg2, color: txt, fontFamily: "monospace", fontSize: 13, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={save} disabled={loading} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${bdr}`, background: "transparent", color: txt2, cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>Save draft</button>
            <button onClick={downloadMarkdown} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${bdr}`, background: "transparent", color: txt2, cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>⬇ Markdown</button>
            <button onClick={downloadDocx} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #34D39950", background: "rgba(52,211,153,0.1)", color: "#34D399", cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>⬇ Word (.docx)</button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Render the Weekly tab**

Add next to the Capture render block:
```jsx
        {/* WEEKLY TAB */}
        {tab === "weekly" && <WeeklyView credentials={credentials} dark={dark} />}
```

- [ ] **Step 4: Manual verification**

Run: `npm start`. Capture at least one day this week (Task 8). Click **Weekly**, pick a date in that week, click **Generate**.
Expected: a markdown document appears in the editor with the sample's section headings, grouped by initiative, including a QA/SDET Coverage section. Edit a line, **Save draft** (writes `data/weekly/<week>.md`). **⬇ Word (.docx)** downloads a file that opens in Word; **⬇ Markdown** downloads the `.md`.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat(standup): Weekly tab — generate, edit, export to docx/markdown"
```

---

## Task 10: Changelog + end-to-end verification

**Files:**
- Modify: `docs/changelog.md`

- [ ] **Step 1: Run the full backend test suite**

Run: `npm test`
Expected: all tests across `jira`, `initiatives`, `weekly`, `standupStore`, `claude` PASS.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no new errors in changed files. Fix any introduced.

- [ ] **Step 3: Full manual E2E (requires `ANTHROPIC_API_KEY` in `.env`)**

Run: `npm start`. Log in.
1. **Capture**: paste a transcript referencing 2–3 active tickets → Extract → verify notes map to the right keys → edit one → Save.
2. **Weekly**: pick that week → Generate → verify initiative grouping matches §2 of the spec (e.g. a SummaCare ticket lands under a SummaCare heading) → export `.docx` and open in Word.
Expected: both flows complete; files appear under `data/`.

- [ ] **Step 4: Add the changelog entry**

Prepend under the title in `docs/changelog.md`:
```markdown
## [2026-06-23] Standup Capture → Weekly Update

### What Changed
- **New Capture tab** — paste a daily stand-up transcript; Claude (`claude-opus-4-8`, structured outputs) maps it to per-ticket progress notes against the active Jira tickets, flags mentioned-but-unmatched items and tickets with no update. Notes are editable and saved to `data/standups/<date>.json`.
- **New Weekly tab** — aggregates a week's daily notes, groups by client/initiative (derived from each ticket's parent Epic, with summary-prefix and manual overrides), and Claude composes the team's weekly update in the established section format. Editable; saved to `data/weekly/<week>.md`; exports to `.docx` and markdown.
- **Backend** — new `server/initiatives.js`, `server/weekly.js`, `server/standupStore.js`, `server/claude.js`; `mapIssue` now exposes `epicKey`/`epicName`; new `/api/standup/*` routes. No database — flat files under `data/` (git-ignored). Jira stays read-only.

### Files Modified
- `server/jira.js`, `server/index.js`, `src/App.jsx`, `package.json`, `.gitignore`
- Added: `server/initiatives.js`, `server/weekly.js`, `server/standupStore.js`, `server/claude.js` (+ `.test.js` for each)
- `docs/changelog.md` — this entry

### Notes
- Requires `ANTHROPIC_API_KEY` in `.env` (Anthropic API is paid). Phase 2 (live mic + speech-to-text) is deferred — see the design spec.
```

- [ ] **Step 5: Commit**

```bash
git add docs/changelog.md
git commit -m "docs(standup): changelog for capture + weekly update feature"
```

---

## Self-Review (completed)

- **Spec coverage:** §2 grouping → Tasks 2–4; §3 architecture (claude/store/jira/routes/frontend) → Tasks 2,5,6,7,8,9; §4 data model → Tasks 5,7; §5 daily flow → Tasks 6,7,8; §6 weekly flow → Tasks 4,6,7,9; §7 Claude specifics → Task 6; §8 error handling → Tasks 6 (NO_API_KEY), 7 (save-before-extract, unmatched surfaced); §9 testing → Tasks 2–6 + Task 10; §10 privacy → Task 4 (.env) + changelog note; §11 phasing → Phase 1 only, no audio code.
- **Placeholders:** none — every code step is complete.
- **Type consistency:** `mapIssue` fields `epicKey`/`epicName` are produced (Task 2) and consumed (Tasks 3,4,7); `resolveInitiative(issue, overrides)` signature consistent (Tasks 3,4); `aggregateWeek(dailies, issuesByKey, overrides, qaNames)` consistent (Tasks 4,7); store function names (`saveDaily`/`readDaily`/`listDaily`/`saveWeekly`/`readWeekly`/`readOverrides`) consistent (Tasks 5,7); claude exports (`extractDailyNotes`, `composeWeeklyUpdate`, `buildExtractionMessages`, `DAILY_SCHEMA`, `buildWeeklyMessages`) consistent (Tasks 6,7); `override` payload produced by frontend (Task 8 Step 1) and handled in backend (Task 8 Step 2).
