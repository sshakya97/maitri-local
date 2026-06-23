# Standup Capture → Weekly Update — Design

**Date:** 2026-06-23
**Status:** Approved (design); pending spec review
**Author:** Sashank (with Claude)

## 1. Problem & Goal

Sashank runs the team's daily stand-up and must produce a **weekly status update** in a
specific MacroHealth format (see `D:\weekly update sample.docx`). Today this is fully manual.

The goal: capture each day's stand-up as structured per-ticket progress notes, accumulate
them over the week, and **generate the weekly update document** in the established format,
which Sashank edits and exports. The daily capture is the *input*; the weekly document is
the *deliverable*.

### Decisions locked during brainstorming
- **Capture source:** voice → transcript. Phase 1 accepts a **pasted/imported transcript**
  (no third-party speech-to-text, no audio leaves the machine). Live in-browser recording is
  **deferred to Phase 2** (needs an STT provider + a MacroHealth privacy sign-off).
- **Persistence:** **flat files on the backend** (no database). Single user ("just me for
  now"); team sharing is via export, not multi-user write.
- **Jira writes:** none. The dashboard stays **read-only** against Jira. Notes live locally
  and are exported.
- **Output:** the weekly update in the exact sample format, editable in-app, exported to
  `.docx` and markdown.

### Non-goals (Phase 1)
- Live microphone capture / speech-to-text.
- Multi-user concurrent editing or a shared server.
- Writing comments or any data back to Jira.
- Authentication beyond the existing Jira-credential flow.

## 2. Initiative grouping — evidence

The weekly format groups work by **client/initiative**, not by Jira project key. Verified
against live Jira (MCP JQL on the sample's tickets): the grouping is the issue's **parent
Epic name**.

| Ticket | Parent Epic summary | Sample heading |
|---|---|---|
| NACT-5315 | `Requirement Updates / Activation Defects - SummaCare - Cigna` | Summacare Activation |
| NACT-6490 | `Requirement Updates / Activation Defects - ACI - Cigna` | ACI Activation |
| NACT-5710 | `Requirement Updates / Activation Defects - MHC - CERIS` | MHC Ceris |
| NACT-5263 | `Requirement Updates / Activation Defects - Sharp - Valenz` | Sharp–Valenz Activation |
| NACT-5019 | `Requirement Updates / Activation Defects - TuGo - UHCG` | Tugo |
| NACT-1931 | `Connect Presbyterian` | Presbyterian Health Plan |
| CONN-3100 | `Cigna Decouple \| Claims Roadmap` | Cigna Decoupling |

Exceptions:
- **SUPP** tickets carry the client in a summary prefix, e.g. `(Euro Center) Diagnostic Error…`.
- **ACT** tickets (e.g. AmeriHealth) had neither epic nor summary signal — these need the
  transcript context or a manual override.

**Grouping strategy (precedence):** parent Epic (normalized) → SUPP summary prefix →
manual override map → transcript mention. Claude normalizes raw epic names to display
headings (e.g. `…- SummaCare - Cigna` → "Summacare Activation").

## 3. Architecture

Fits the existing app (React on :5173, Express proxy on :3001, 2-min Jira cache). No DB.

### Backend (`server/`)
- **`server/claude.js`** — new. Anthropic client wrapper. `new Anthropic()` reads
  `ANTHROPIC_API_KEY` from `.env`. Model `claude-opus-4-8`, `thinking: {type: "adaptive"}`.
  - `extractDailyNotes(transcript, activeTickets)` → uses **structured outputs**
    (`output_config.format` json_schema) so the result is reliably shaped. `max_tokens` ~16000.
  - `composeWeeklyUpdate(weekNotes, jiraMeta, template)` → **streamed** (`.stream()` +
    `.finalMessage()`), `max_tokens` ~32000, returns markdown in the sample's section layout.
- **`server/standupStore.js`** — new. Flat-file read/write under `data/` (add `data/` to
  `.gitignore`; create the dir on first write):
  - `data/standups/YYYY-MM-DD.json` — one per captured day.
  - `data/weekly/YYYY-Www.md` — generated/edited weekly drafts.
  - `data/initiative-overrides.json` — manual ticket/epic → initiative map.
- **`server/jira.js`** — extend `mapIssue` to expose `epicKey` and `epicName` from the
  issue's `parent` field (the `fields: ['*all']` fetch already returns `parent`). Used for
  grouping. No JQL change.
- **`server/index.js`** — new routes (all behind existing `extractAuth`):
  - `POST /api/standup/daily` `{ date, transcript }` → extract, save, return notes.
  - `GET  /api/standup/daily/:date` → read one day.
  - `GET  /api/standup/history?from=&to=` → list saved days (metadata).
  - `POST /api/standup/weekly` `{ weekStart }` → aggregate week, compose, save draft, return markdown.
  - `PUT  /api/standup/weekly/:week` `{ markdown }` → save edits.
  - `GET  /api/standup/weekly/:week` → read a draft.

### Frontend (`src/App.jsx`)
Two new tabs in the existing top-bar tab group (`dev / qa / standup / reports / attention`):
- **"Capture"** — paste transcript, pick date (default today), click *Extract*. Shows the
  per-ticket notes Claude produced (editable inline), plus two lists: *mentioned but
  unmatched* and *active tickets with no update*. Save persists the day.
- **"Weekly"** — pick a week (Mon–Fri), click *Generate*. Renders the composed document in
  an editable textarea/preview, with *Save* and *Export* (`.docx` via the already-present
  `xlsx`/SheetJS dependency is CSV/Excel-only, so add `docx` for Word; markdown export is
  built-in). Sections 4–7 render as editable boilerplate.

## 4. Data model

`data/standups/2026-06-23.json`:
```json
{
  "date": "2026-06-23",
  "capturedAt": "2026-06-23T10:32:00Z",
  "rawTranscript": "…",
  "perTicket": [
    { "key": "NACT-5315", "summary": "...", "assignee": "Anjali Prajapati",
      "status": "In Progress", "note": "Validated header values from Cigna." }
  ],
  "unmatched": ["mentioned 'the Zelis spike' — no ticket key resolved"],
  "noUpdate": ["NACT-5263", "ACT-1023"]
}
```

`data/initiative-overrides.json`:
```json
{ "byEpicKey": { "NACT-5208": "Sharp – Valenz Activation" },
  "byTicketKey": { "ACT-1023": "AmeriHealth" },
  "bySummaryPrefix": { "(Euro Center)": "Euro Center" } }
```

## 5. Daily flow

1. Sashank pastes the stand-up transcript and picks the date.
2. Backend builds the **active ticket list** (from the existing Jira cache: key, summary,
   assignee, sdetAssignee, status, epicName) and passes it to `extractDailyNotes` as context.
3. Claude maps spoken updates to ticket keys and returns, per ticket: a one–two sentence
   progress note in the team's voice; plus `unmatched` (mentioned, no key) and `noUpdate`
   (active tickets nobody discussed).
4. The day is saved as JSON. Sashank can edit any note before/after saving.

## 6. Weekly flow

1. Pick the week (Mon–Fri). Backend reads that week's daily JSON files.
2. Aggregate per ticket: concatenate the week's distinct daily notes in chronological order
   (so progression is visible) and let the composer synthesize them into one narrative line;
   attach Jira metadata (assignee, status, epicName → initiative via §2 precedence).
3. `composeWeeklyUpdate` produces the document in the sample's layout:
   - **Overall Project Status** (default "On Track"; editable).
   - **Detail weekly Update** — grouped by initiative, per-person narrative prose.
   - **QA / SDET Coverage** — tickets where assignee or `sdetAssignee` is Aarati/Diwas,
     sub-grouped by initiative.
   - **Project Risk / Issue / Blocker** — derived from `Blocked` tickets + notes; default
     "No risks, issues, or blockers were identified for this week."
   - **WorkLog and Smart Sheet**, **Sprint Capacity** (+link placeholder), **Absentee
     Report** (This week / Next week), **Next Week** — editable **boilerplate placeholders**
     (not derivable from Jira).
4. Render editable; Save persists `data/weekly/YYYY-Www.md`; Export to `.docx` / markdown.

## 7. Claude integration specifics
- SDK: `@anthropic-ai/sdk` (new dependency). Client: `new Anthropic()` → reads
  `ANTHROPIC_API_KEY` from `.env` (new var; `.env` stays git-ignored).
- Model: `claude-opus-4-8`; `thinking: {type: "adaptive"}`.
- Daily extraction: `messages.create` with `output_config.format` json_schema (per-ticket
  array + unmatched + noUpdate), `max_tokens: 16000`.
- Weekly composition: `messages.stream(...)` + `.finalMessage()`, `max_tokens: 32000`
  (long output → stream to avoid HTTP timeouts).
- Errors: typed SDK exceptions; surface a clear message to the UI.

## 8. Error handling
- Missing `ANTHROPIC_API_KEY` → 500 with a clear "set ANTHROPIC_API_KEY in .env" message.
- Claude failure (rate limit, 5xx) → surface the message; the **raw transcript is always
  saved first** so no input is lost on a composition failure.
- Tickets mentioned but unresolved → returned in `unmatched` for manual review, not dropped.
- A week with no daily files → still generate a skeleton from Jira metadata + boilerplate.
- Jira cache empty/unauthorized → reuse existing 401/502 handling.

## 9. Testing
- Unit (Node test runner): epic→initiative normalization incl. the §2 table + overrides;
  `standupStore` read/write round-trips; week aggregation (date math, latest-wins).
- Golden fixture: the sample `.docx` text becomes the reference the weekly composer's prompt
  and section ordering are checked against.
- Manual: run with a real transcript end-to-end; verify export opens in Word.

## 10. Privacy
Phase 1 sends **transcript text** (not audio) to the Anthropic API. Stand-up text should not
contain PHI, but this is flagged for a glance against MacroHealth data policy before rollout.
Phase 2 (live audio + STT) requires an explicit sign-off and is out of scope here.

## 11. Phasing
- **Phase 1 (this spec):** transcript capture + daily notes + weekly generation + export.
- **Phase 2 (separate spec):** in-browser recording (`MediaRecorder`) → STT provider →
  feed transcript into the existing Phase 1 pipeline. Requires provider + privacy decisions.
