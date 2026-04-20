# Login Page — Design Spec

**Date:** 2026-04-15
**Status:** Approved

## Overview

Replace the server-side `.env` credential setup with a browser-based login page. Users enter their Jira email and API token, which are stored in `localStorage` and passed to the Express backend per-request. Team members, project keys, and Jira base URL remain hardcoded.

## Architecture

```
Browser (Login → localStorage) → Express API (:3001) → Jira REST API
                                   ↑
                          credentials via headers
                          (x-jira-email, x-jira-token)
```

- Frontend stores `{ email, token }` in `localStorage`
- Every API call includes credentials as custom headers
- Backend is stateless — no sessions, no `.env` credentials
- Backend validates credentials via Jira's `/rest/api/3/myself` endpoint

## Login Page

### Component: `src/Login.jsx`

**Fields:**
- Jira Email (text input)
- API Token (password input)

**Actions:**
- "Connect" button — validates credentials via `GET /api/verify`, saves to `localStorage` on success
- Help link: "How to generate an API token" → `https://id.atlassian.com/manage-profile/security/api-tokens`

**States:**
- Default: empty form
- Loading: button disabled, spinner while verifying
- Error: inline message — "Invalid credentials" or "Could not connect to Jira"
- Success: transitions to dashboard

**Styling:**
- Centered card layout, minimal
- Respects existing dark/light theme
- Consistent with dashboard typography and colors

## App Flow

### `src/App.jsx` changes

```
On load:
  1. Check localStorage for { email, token }
  2. If missing → render <Login onSuccess={saveAndRefresh} />
  3. If present → render dashboard (existing behavior)
```

- New state: `credentials` — read from `localStorage` on mount
- `Login` component calls back with `{ email, token }` on success
- Dashboard header gains a "Logout" button (clears `localStorage`, returns to login)
- All `fetch()` calls to the backend include credential headers

### Credential Header Format

```
x-jira-email: user@example.com
x-jira-token: ATATT3x...
```

## Backend Changes

### `server/jira.js`

**Remove:**
- `process.env.JIRA_EMAIL` and `process.env.JIRA_API_TOKEN` reading
- Module-level `AUTH` constant
- Startup crash when env vars are missing

**Keep hardcoded:**
- `JIRA_BASE_URL` (`https://macrohealth.atlassian.net`)
- `TEAM_ACCOUNT_IDS`, `QA_ACCOUNT_IDS`
- `PROJECT_KEYS`, `FIELDS`
- All JQL, field mapping, sprint logic

**Change:**
- `jiraGet(url)` → `jiraGet(url, auth)` where `auth` is the Base64 credential string
- `jiraPost(path, body)` → `jiraPost(path, body, auth)`
- `fetchAllIssues()` → `fetchAllIssues(auth)`
- `fetchAllSprints()` → `fetchAllSprints(auth)`
- Cache keyed by user email: `cache[email] = { data, ts }` instead of a single global cache

**New export:**
- `verifyCredentials(auth)` — calls `GET /rest/api/3/myself`, returns `{ valid: true, displayName }` or throws

### `server/index.js`

**New middleware:**
- Extract `x-jira-email` and `x-jira-token` from request headers
- Build Base64 auth string: `Buffer.from(\`${email}:${token}\`).toString('base64')`
- Attach to `req.auth` and `req.jiraEmail`
- If headers missing, return `401`

**New route:**
- `GET /api/verify` — calls `verifyCredentials(req.auth)`, returns `{ valid: true, displayName }` or `401`

**Changed routes:**
- `GET /api/issues` — passes `req.auth` and `req.jiraEmail` to `fetchAllIssues`
- `GET /api/sprints` — passes `req.auth` and `req.jiraEmail` to `fetchAllSprints`
- `POST /api/refresh` — passes `req.auth` and `req.jiraEmail`, clears cache for that user

### `.env` changes

- `.env` no longer needed for Jira credentials
- `PORT` can still optionally be set via `.env` or defaults to `3001`
- Update `.env.example` to reflect this:
  ```
  # Optional
  PORT=3001
  ```

## What Does NOT Change

- `TEAM_ACCOUNT_IDS`, `QA_ACCOUNT_IDS` — hardcoded
- Project keys (`ACT`, `CONN`, `NACT`, `QA`) — hardcoded
- `JIRA_BASE_URL` — hardcoded
- JQL construction, field list, issue mapping, comment extraction
- Sprint fetching logic
- All frontend dashboard UI (board, table, filters, drag-and-drop, etc.)
- `dotenv` dependency can be removed from `package.json` (or kept if `PORT` env var is desired)

## File Changes

| File | Action | Changes |
|------|--------|---------|
| `src/Login.jsx` | **Create** | Login form component |
| `src/App.jsx` | **Edit** | Credential state, conditional login/dashboard render, auth headers on fetch calls, logout button |
| `server/index.js` | **Edit** | Auth middleware, `/api/verify` route, pass auth to jira functions |
| `server/jira.js` | **Edit** | Remove `.env` credentials, accept `auth` param in all functions, per-user cache |
| `.env.example` | **Edit** | Remove Jira credential fields, keep optional PORT |
| `package.json` | **Edit** | Optionally remove `dotenv` dependency |

## Implementation Order

1. **Backend: credential passthrough** — modify `jira.js` to accept auth as a parameter, update all functions, make cache per-user
2. **Backend: middleware + verify route** — add header extraction middleware to `index.js`, add `/api/verify` route, update existing routes
3. **Frontend: Login component** — create `Login.jsx` with form, validation, error handling, theme support
4. **Frontend: App integration** — wire login/logout into `App.jsx`, add auth headers to all fetch calls
5. **Cleanup** — update `.env.example`, optionally remove `dotenv`
