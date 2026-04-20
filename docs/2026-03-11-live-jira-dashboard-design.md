# Live Jira Dashboard — Design Spec

**Date:** 2026-03-11
**Status:** Approved

## Overview

Replace the hardcoded static ISSUES array in App.jsx with live data from Jira REST API via an Express backend proxy. Expand scope to 3 projects and 6 team members with deadline tracking.

## Architecture

```
Browser (React on :5173) → Express API (:3001) → Jira REST API (macrohealth.atlassian.net)
```

- Express backend holds Jira credentials (email + API token) in `.env`
- Backend caches responses for 2 minutes to avoid rate limits
- Frontend fetches on page load + manual refresh button
- CORS enabled for local dev

## Projects

| Key  | Name                    |
|------|-------------------------|
| ACT  | Activations             |
| CONN | Connectivity Tasks      |
| NACT | New Activations         |

## Team Members (6)

| Name    | Display Name (Jira)        | Account ID                                   | Role | Color   |
|---------|---------------------------|-----------------------------------------------|------|---------|
| Sashank | Sashank Shakya - Maitri   | 712020:c9c43563-935e-4171-b228-fae9c70c1d19  | Dev  | #F7A24F |
| Anjali  | Anjali Prajapati          | 712020:9269d5b7-d525-4222-ae71-c4d8b2288bb5  | Dev  | #E85D8A |
| Sanabul | Sanabul Uddin             | 712020:726292d3-c3f8-4ea9-9923-56207f355dfe  | Dev  | #4F8EF7 |
| Buddhi  | buddhi.sagar.poudel.ext   | 712020:5f98e841-ff4e-4cf8-b41f-4ab51032ac27  | Dev  | #4FC9A4 |
| Aarati  | Aarati Adhikari           | 712020:e72a498d-e082-4350-86b5-f0f4d957ce44  | QA   | #C084FC |
| Diwas   | Diwas Dhital - Maitri     | 712020:2d6a1371-6b2e-459c-a31b-61caff5a7f7d  | QA   | #38BDF8 |

## Jira Fields

| Field              | Jira Key           | Usage                      |
|--------------------|--------------------|-----------------------------|
| Summary            | summary            | Ticket title               |
| Status             | status             | Board grouping + filters   |
| Assignee           | assignee           | Person filter + avatar     |
| Priority           | priority           | Sort + badge               |
| Issue Type         | issuetype          | Display label              |
| Updated            | updated            | Sort + relative time       |
| Due Date           | duedate            | Deadline tracking          |
| Target End Date    | customfield_10015  | Deadline tracking          |
| Sprint             | sprint             | Sprint info + end date     |
| Comment            | comment            | Latest comment display     |

## Deadline Tracking

### On Cards
Color-coded deadline indicator using the earliest available date (duedate, customfield_10015, sprint end):
- **Red**: overdue
- **Yellow**: due within 3 days
- **Green**: due within 7 days
- **Gray**: due later
- **Warning icon**: stale (active ticket, no update in 7+ days)

### Deadline Summary Panel
Top-level panel between stat cards and people cards showing:
- Overdue tickets (red, sorted oldest first)
- Due soon tickets (within 7 days, sorted by urgency)
- Stale active tickets (no update 7+ days)

## Status Handling

### ACT/CONN Statuses (existing)
In Progress, Blocked, Ready for QA, Ready for Promotion, Ready for Development, In Review, New, Promoted, Done, Deferred

### NACT Additional Statuses
In INT, In Dev, Req Done — mapped into the board using Jira's statusCategory:
- statusCategory "In Progress" → active (board column)
- statusCategory "Done" → done section
- statusCategory "To Do" → new/backlog

## UI Changes

- Project filter: All / ACT / CONN / NACT
- People cards: 6 members (2 rows of 3, or responsive grid)
- QA members: small "QA" badge next to name
- "Ready for QA" tickets: highlighted in QA member cards
- Refresh button in top bar
- Loading/error states for API calls

## Backend API

### `GET /api/issues`
Returns all issues for the 6 team members across 3 projects.

JQL: `project in (ACT, CONN, NACT) AND assignee in (<6 account IDs>) ORDER BY updated DESC`

Response shape (matches current ISSUES format):
```json
[{
  "project": "ACT",
  "key": "ACT-1234",
  "summary": "...",
  "status": "In Progress",
  "assignee": "Sashank Shakya - Maitri",
  "priority": "P1",
  "issuetype": "Story",
  "updated": "2026-03-11T...",
  "duedate": "2026-03-15",
  "targetEndDate": "2026-03-14",
  "sprintName": "Sprint 42",
  "sprintEndDate": "2026-03-20",
  "comment_count": 5,
  "last_comment_author": "...",
  "last_comment_text": "...",
  "last_comment_date": "..."
}]
```

## File Structure

```
maitri-local/
  server/
    index.js          # Express server
    jira.js            # Jira API client + caching
  src/
    App.jsx            # Updated frontend (fetch from /api/issues)
    App.css
    main.jsx
  .env.example         # Template for Jira credentials
  .env                 # Actual credentials (gitignored)
  docs/
    changelog.md       # Change log
    2026-03-11-live-jira-dashboard-design.md  # This file
  package.json         # Updated with express, cors, dotenv deps
```

## Decisions Log

1. Express backend over direct browser calls — avoids CORS issues and keeps API token secure
2. 2-minute cache — balances freshness with Jira rate limits
3. Account IDs used in JQL for reliable filtering (display names can change)
4. customfield_10015 confirmed as target end date field
5. Unified status handling via Jira's statusCategory for cross-project consistency