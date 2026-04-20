# Login Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace server-side `.env` Jira credentials with a browser-based login page so any user can connect their own Jira account.

**Architecture:** Frontend stores email + API token in `localStorage` and passes them as custom headers (`x-jira-email`, `x-jira-token`) on every request. Express backend extracts credentials from headers, builds the Basic auth string, and forwards to Jira. A `/api/verify` endpoint validates credentials before saving. Team members, projects, and `JIRA_BASE_URL` remain hardcoded.

**Tech Stack:** React 19, Express 5, Jira REST API v3, localStorage

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `server/jira.js` | Modify | Remove `.env` credential reading, accept `auth` param in all functions, per-user cache |
| `server/index.js` | Modify | Auth extraction middleware, `/api/verify` route, pass auth to jira functions |
| `src/Login.jsx` | Create | Login form component with email + API token fields |
| `src/App.jsx` | Modify | Credential state, conditional login/dashboard render, auth headers on fetch calls, logout button |
| `.env.example` | Modify | Remove Jira credential fields, keep optional PORT |

---

### Task 1: Backend — Refactor jira.js to accept credentials as parameter

**Files:**
- Modify: `server/jira.js:1-11` (remove env reading, AUTH constant, startup crash)
- Modify: `server/jira.js:42-54` (`jiraGet` signature)
- Modify: `server/jira.js:56-71` (`jiraPost` signature)
- Modify: `server/jira.js:132-165` (`fetchAllIssues` signature + per-user cache)
- Modify: `server/jira.js:167-170` (`clearCache` for per-user)
- Modify: `server/jira.js:222-258` (`fetchAllSprints` signature + per-user cache)

- [ ] **Step 1: Replace top-of-file env reading with hardcoded JIRA_BASE_URL**

Replace lines 1-11 of `server/jira.js`:

```js
// Old:
import 'dotenv/config';

const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN } = process.env;

if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {
  console.error('Missing JIRA_BASE_URL, JIRA_EMAIL, or JIRA_API_TOKEN in .env');
  process.exit(1);
}

const AUTH = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
const API = `${JIRA_BASE_URL}/rest/api/3`;
const AGILE_API = `${JIRA_BASE_URL}/rest/agile/1.0`;
```

```js
// New:
const JIRA_BASE_URL = 'https://macrohealth.atlassian.net';
const API = `${JIRA_BASE_URL}/rest/api/3`;
const AGILE_API = `${JIRA_BASE_URL}/rest/agile/1.0`;
```

- [ ] **Step 2: Add `auth` parameter to `jiraGet` and `jiraPost`**

Replace `jiraGet`:

```js
// Old:
async function jiraGet(url) {
  const res = await fetch(url, {
    headers: {
      'Authorization': `Basic ${AUTH}`,
      'Accept': 'application/json',
    },
  });
```

```js
// New:
async function jiraGet(url, auth) {
  const res = await fetch(url, {
    headers: {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
    },
  });
```

Replace `jiraPost`:

```js
// Old:
async function jiraPost(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${AUTH}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
```

```js
// New:
async function jiraPost(path, body, auth) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
```

- [ ] **Step 3: Convert cache to per-user keyed by email**

Replace the cache section:

```js
// Old:
let cache = { data: null, ts: 0 };
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes
```

```js
// New:
const caches = {};
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

function getCache(email) {
  if (!caches[email]) caches[email] = { issues: { data: null, ts: 0 }, sprints: { data: null, ts: 0 } };
  return caches[email];
}
```

- [ ] **Step 4: Update `fetchAllIssues` to accept `auth` and `email`, use per-user cache**

```js
// Old:
export async function fetchAllIssues() {
  const now = Date.now();
  if (cache.data && (now - cache.ts) < CACHE_TTL) {
    return cache.data;
  }

  const jql = buildJQL();
  const allIssues = [];
  const maxResults = 100;

  let nextPageToken = null;

  while (true) {
    const body = {
      jql,
      fields: FIELDS,
      maxResults,
    };
    if (nextPageToken) body.nextPageToken = nextPageToken;

    const result = await jiraPost('/search/jql', body);
    const issues = result.issues || [];
    allIssues.push(...issues.map(mapIssue));

    if (!result.nextPageToken || issues.length === 0) {
      break;
    }
    nextPageToken = result.nextPageToken;
  }

  cache.data = allIssues;
  cache.ts = Date.now();
  return allIssues;
}
```

```js
// New:
export async function fetchAllIssues(auth, email) {
  const userCache = getCache(email);
  const now = Date.now();
  if (userCache.issues.data && (now - userCache.issues.ts) < CACHE_TTL) {
    return userCache.issues.data;
  }

  const jql = buildJQL();
  const allIssues = [];
  const maxResults = 100;

  let nextPageToken = null;

  while (true) {
    const body = {
      jql,
      fields: FIELDS,
      maxResults,
    };
    if (nextPageToken) body.nextPageToken = nextPageToken;

    const result = await jiraPost('/search/jql', body, auth);
    const issues = result.issues || [];
    allIssues.push(...issues.map(mapIssue));

    if (!result.nextPageToken || issues.length === 0) {
      break;
    }
    nextPageToken = result.nextPageToken;
  }

  userCache.issues.data = allIssues;
  userCache.issues.ts = Date.now();
  return allIssues;
}
```

- [ ] **Step 5: Update `clearCache` to accept email**

```js
// Old:
export function clearCache() {
  cache = { data: null, ts: 0 };
  sprintCache = { data: null, ts: 0 };
}
```

```js
// New:
export function clearCache(email) {
  if (email && caches[email]) {
    caches[email] = { issues: { data: null, ts: 0 }, sprints: { data: null, ts: 0 } };
  }
}
```

- [ ] **Step 6: Update sprint cache and `fetchAllSprints`**

Remove the old sprint cache variables:

```js
// Old:
let sprintCache = { data: null, ts: 0 };
const SPRINT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
```

```js
// New (just the TTL — cache is in getCache now):
const SPRINT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
```

Update `fetchBoardsForProject` and `fetchSprintsForBoard` to accept `auth`:

```js
// Old:
async function fetchBoardsForProject(projectKey) {
  try {
    const data = await jiraGet(`${AGILE_API}/board?projectKeyOrId=${projectKey}&type=scrum&maxResults=5`);
```

```js
// New:
async function fetchBoardsForProject(projectKey, auth) {
  try {
    const data = await jiraGet(`${AGILE_API}/board?projectKeyOrId=${projectKey}&type=scrum&maxResults=5`, auth);
```

Also update the fallback `jiraGet` call inside the outer catch:

```js
// Old:
      const data = await jiraGet(`${AGILE_API}/board?projectKeyOrId=${projectKey}&maxResults=5`);
```

```js
// New:
      const data = await jiraGet(`${AGILE_API}/board?projectKeyOrId=${projectKey}&maxResults=5`, auth);
```

Update `fetchSprintsForBoard`:

```js
// Old:
async function fetchSprintsForBoard(board) {
  ...
      const data = await jiraGet(`${AGILE_API}/board/${board.id}/sprint?maxResults=50&startAt=${startAt}&state=active,closed,future`);
```

```js
// New:
async function fetchSprintsForBoard(board, auth) {
  ...
      const data = await jiraGet(`${AGILE_API}/board/${board.id}/sprint?maxResults=50&startAt=${startAt}&state=active,closed,future`, auth);
```

Update `fetchAllSprints`:

```js
// Old:
export async function fetchAllSprints() {
  const now = Date.now();
  if (sprintCache.data && (now - sprintCache.ts) < SPRINT_CACHE_TTL) {
    return sprintCache.data;
  }

  const allBoards = [];
  for (const key of PROJECT_KEYS) {
    const boards = await fetchBoardsForProject(key);
    allBoards.push(...boards);
  }
  ...
  for (const board of uniqueBoards) {
    const sprints = await fetchSprintsForBoard(board);
  ...
  sprintCache.data = allSprints;
  sprintCache.ts = Date.now();
  return allSprints;
}
```

```js
// New:
export async function fetchAllSprints(auth, email) {
  const userCache = getCache(email);
  const now = Date.now();
  if (userCache.sprints.data && (now - userCache.sprints.ts) < SPRINT_CACHE_TTL) {
    return userCache.sprints.data;
  }

  const allBoards = [];
  for (const key of PROJECT_KEYS) {
    const boards = await fetchBoardsForProject(key, auth);
    allBoards.push(...boards);
  }
  ...
  for (const board of uniqueBoards) {
    const sprints = await fetchSprintsForBoard(board, auth);
  ...
  userCache.sprints.data = allSprints;
  userCache.sprints.ts = Date.now();
  return allSprints;
}
```

- [ ] **Step 7: Add `verifyCredentials` export**

Add at the bottom of `server/jira.js`, before the final closing:

```js
export async function verifyCredentials(auth) {
  const res = await fetch(`${API}/myself`, {
    headers: {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira auth failed ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return { valid: true, displayName: data.displayName };
}
```

- [ ] **Step 8: Commit**

```bash
git add server/jira.js
git commit -m "refactor: accept auth as parameter in jira.js, per-user cache"
```

---

### Task 2: Backend — Auth middleware and verify route in index.js

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: Update imports to include `verifyCredentials`**

```js
// Old:
import { fetchAllIssues, clearCache, fetchAllSprints } from './jira.js';
```

```js
// New:
import { fetchAllIssues, clearCache, fetchAllSprints, verifyCredentials } from './jira.js';
```

- [ ] **Step 2: Add auth extraction middleware**

Add after `app.use(cors(...))`:

```js
function extractAuth(req, res, next) {
  const email = req.headers['x-jira-email'];
  const token = req.headers['x-jira-token'];
  if (!email || !token) {
    return res.status(401).json({ error: 'Missing Jira credentials. Please log in.' });
  }
  req.jiraEmail = email;
  req.auth = Buffer.from(`${email}:${token}`).toString('base64');
  next();
}
```

- [ ] **Step 3: Add `/api/verify` route (before the middleware-protected routes)**

```js
app.get('/api/verify', async (req, res) => {
  const email = req.headers['x-jira-email'];
  const token = req.headers['x-jira-token'];
  if (!email || !token) {
    return res.status(401).json({ error: 'Missing credentials' });
  }
  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  try {
    const result = await verifyCredentials(auth);
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: 'Invalid Jira credentials', detail: err.message });
  }
});
```

- [ ] **Step 4: Apply middleware to existing routes and pass auth**

```js
// Old:
app.get('/api/issues', async (_req, res) => {
  try {
    const issues = await fetchAllIssues();
    res.json(issues);
  } catch (err) {
    console.error('Error fetching issues:', err.message);
    res.status(502).json({ error: 'Failed to fetch from Jira', detail: err.message });
  }
});

app.get('/api/sprints', async (_req, res) => {
  try {
    const sprints = await fetchAllSprints();
    res.json(sprints);
  } catch (err) {
    console.error('Error fetching sprints:', err.message);
    res.status(502).json({ error: 'Failed to fetch sprints from Jira', detail: err.message });
  }
});

app.post('/api/refresh', async (_req, res) => {
  clearCache();
  try {
    const issues = await fetchAllIssues();
    res.json(issues);
  } catch (err) {
    console.error('Error refreshing issues:', err.message);
    res.status(502).json({ error: 'Failed to refresh from Jira', detail: err.message });
  }
});
```

```js
// New:
app.get('/api/issues', extractAuth, async (req, res) => {
  try {
    const issues = await fetchAllIssues(req.auth, req.jiraEmail);
    res.json(issues);
  } catch (err) {
    console.error('Error fetching issues:', err.message);
    res.status(502).json({ error: 'Failed to fetch from Jira', detail: err.message });
  }
});

app.get('/api/sprints', extractAuth, async (req, res) => {
  try {
    const sprints = await fetchAllSprints(req.auth, req.jiraEmail);
    res.json(sprints);
  } catch (err) {
    console.error('Error fetching sprints:', err.message);
    res.status(502).json({ error: 'Failed to fetch sprints from Jira', detail: err.message });
  }
});

app.post('/api/refresh', extractAuth, async (req, res) => {
  clearCache(req.jiraEmail);
  try {
    const issues = await fetchAllIssues(req.auth, req.jiraEmail);
    res.json(issues);
  } catch (err) {
    console.error('Error refreshing issues:', err.message);
    res.status(502).json({ error: 'Failed to refresh from Jira', detail: err.message });
  }
});
```

- [ ] **Step 5: Remove `dotenv` import if no longer needed**

The server no longer reads `.env` for credentials. If `PORT` should still be configurable via `.env`, keep `dotenv`. Otherwise remove. For now, keep it for `PORT`:

No change needed — `dotenv` is imported in `jira.js` (which we removed), not in `index.js`. The `process.env.PORT` on line 5 of `index.js` works without dotenv (it reads shell env vars). No action required.

- [ ] **Step 6: Commit**

```bash
git add server/index.js
git commit -m "feat: add auth middleware and /api/verify route"
```

---

### Task 3: Frontend — Create Login component

**Files:**
- Create: `src/Login.jsx`

- [ ] **Step 1: Create `src/Login.jsx`**

```jsx
import { useState } from "react";

const API_BASE = "http://localhost:3001";

export default function Login({ dark, onSuccess }) {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !token.trim()) {
      setError("Both fields are required.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/verify`, {
        headers: { "x-jira-email": email.trim(), "x-jira-token": token.trim() },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Verification failed (${res.status})`);
      }
      const data = await res.json();
      onSuccess({ email: email.trim(), token: token.trim(), displayName: data.displayName });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const bg = dark ? "#0B0D14" : "#F1F4FB";
  const cardBg = dark ? "#111520" : "#FFFFFF";
  const bdr = dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,60,0.07)";
  const txt = dark ? "#E2E8F0" : "#0F172A";
  const txt2 = dark ? "#64748B" : "#4A5280";
  const txt3 = dark ? "#334155" : "#94A3B8";
  const inputBg = dark ? "#181D2C" : "#F8FAFF";

  return (
    <div style={{ minHeight: "100vh", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter','Segoe UI',system-ui,sans-serif" }}>
      <div style={{ width: 380, background: cardBg, border: `1px solid ${bdr}`, borderRadius: 16, padding: "40px 32px", boxShadow: dark ? "0 8px 32px rgba(0,0,0,0.4)" : "0 8px 32px rgba(0,0,60,0.08)" }}>

        {/* Logo + Title */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg,#E85D8A,#4F8EF7)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 900, color: "#fff", marginBottom: 12 }}>M</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: txt }}>Maitri Dashboard</div>
          <div style={{ fontSize: 12, color: txt3, marginTop: 4 }}>Connect your Jira account to continue</div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Email field */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: txt2, marginBottom: 6 }}>Jira Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${bdr}`, background: inputBg, color: txt, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
            />
          </div>

          {/* Token field */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: txt2, marginBottom: 6 }}>API Token</label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ATATT3x..."
              autoComplete="current-password"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${bdr}`, background: inputBg, color: txt, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
            />
            <a
              href="https://id.atlassian.com/manage-profile/security/api-tokens"
              target="_blank"
              rel="noreferrer"
              style={{ display: "inline-block", marginTop: 6, fontSize: 11, color: "#4F8EF7", textDecoration: "none" }}
            >
              How to generate an API token
            </a>
          </div>

          {/* Error */}
          {error && (
            <div style={{ background: "rgba(247,79,79,0.1)", border: "1px solid rgba(247,79,79,0.3)", borderRadius: 8, padding: "8px 12px", marginBottom: 16, color: "#F74F4F", fontSize: 12, fontWeight: 600 }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{ width: "100%", padding: "10px 0", borderRadius: 8, border: "none", background: loading ? "#334155" : "linear-gradient(135deg,#E85D8A,#4F8EF7)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: loading ? "wait" : "pointer", fontFamily: "inherit", transition: "opacity 0.15s" }}
          >
            {loading ? "Connecting..." : "Connect"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/Login.jsx
git commit -m "feat: create Login component with Jira credential form"
```

---

### Task 4: Frontend — Wire login/logout into App.jsx

**Files:**
- Modify: `src/App.jsx:1` (add Login import)
- Modify: `src/App.jsx:536-558` (add credential state)
- Modify: `src/App.jsx:560-584` (add auth headers to fetch calls)
- Modify: `src/App.jsx:809` (add logout button in topbar)
- Modify: `src/App.jsx:836` (update error message text)

- [ ] **Step 1: Add Login import and credential constants**

At the top of `src/App.jsx`, add the Login import after line 4:

```js
// After:
import { CSS } from "@dnd-kit/utilities";
// Add:
import Login from "./Login.jsx";
```

Add a helper for building auth headers. After the `API_BASE` constant (line 8):

```js
// After:
const API_BASE = "http://localhost:3001";
// Add:
function authHeaders(creds) {
  return { "x-jira-email": creds.email, "x-jira-token": creds.token };
}
```

- [ ] **Step 2: Add credential state to App component**

Inside `export default function App()`, add credential state before the `dark` state (line 537):

```js
// Add before: const [dark, setDark] = useState(true);
const [credentials, setCredentials] = useState(() => {
  try {
    const saved = localStorage.getItem("maitri-credentials");
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
});
```

Add login handler and logout handler after the state declarations (after `lastFetch` state, around line 558):

```js
// After: const [lastFetch, setLastFetch] = useState(null);

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
```

- [ ] **Step 3: Add auth headers to all fetch calls**

Update `fetchIssues` (lines 560-575):

```js
// Old:
const fetchIssues = useCallback(async (force = false) => {
  setLoading(true);
  setError(null);
  try {
    const url = force ? `${API_BASE}/api/refresh` : `${API_BASE}/api/issues`;
    const res = await fetch(url, { method: force ? 'POST' : 'GET' });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    const data = await res.json();
    setIssues(data);
    setLastFetch(new Date());
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
}, []);
```

```js
// New:
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
```

Update the sprint fetch `useEffect` (lines 579-584):

```js
// Old:
useEffect(() => {
  fetch(`${API_BASE}/api/sprints`)
    .then(r => r.ok ? r.json() : [])
    .then(data => setJiraSprints(data))
    .catch(() => {});
}, []);
```

```js
// New:
useEffect(() => {
  if (!credentials) return;
  fetch(`${API_BASE}/api/sprints`, { headers: authHeaders(credentials) })
    .then(r => r.ok ? r.json() : [])
    .then(data => setJiraSprints(data))
    .catch(() => {});
}, [credentials]);
```

- [ ] **Step 4: Add early return for login screen**

Right after the state declarations and before the theme variable declarations (before `const bg = dark ? ...` around line 590), add:

```js
if (!credentials) {
  return <Login dark={dark} onSuccess={handleLogin} />;
}
```

- [ ] **Step 5: Add logout button in topbar**

In the topbar (around line 826-828), add a logout button after the dark/light toggle button:

```jsx
// After:
<button onClick={() => setDark(d => !d)} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${bdr}`, background: "transparent", color: txt2, cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600 }}>
  {dark ? "☀️ Light" : "🌙 Dark"}
</button>
// Add:
<button onClick={handleLogout} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(247,79,79,0.3)", background: "transparent", color: "#F74F4F", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>
  Logout
</button>
```

- [ ] **Step 6: Update error message text**

On line 837, update the error hint text:

```jsx
// Old:
Failed to load: {error}. Check that the backend is running on port 3001 and .env is configured.
```

```jsx
// New:
Failed to load: {error}. Check that the backend is running on port 3001.
```

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "feat: wire login/logout into App, auth headers on all API calls"
```

---

### Task 5: Cleanup — Update .env.example and remove dotenv

**Files:**
- Modify: `.env.example`
- Modify: `package.json` (remove dotenv dependency)

- [ ] **Step 1: Update `.env.example`**

```
# Old:
JIRA_BASE_URL=https://macrohealth.atlassian.net
JIRA_EMAIL=your-email@macrohealth.com
JIRA_API_TOKEN=your-api-token-here
```

```
# New:
# Optional — defaults to 3001
PORT=3001
```

- [ ] **Step 2: Remove `dotenv` from package.json dependencies**

Remove `"dotenv": "^16.5.0",` from the `dependencies` object in `package.json`.

- [ ] **Step 3: Run `npm install` to update lockfile**

```bash
npm install
```

- [ ] **Step 4: Commit**

```bash
git add .env.example package.json package-lock.json
git commit -m "chore: remove dotenv dependency, update .env.example"
```

---

### Task 6: Manual Verification

- [ ] **Step 1: Start the backend**

```bash
npm run server
```

Expected: Server starts on port 3001 without crashing (no `.env` required for Jira creds now).

- [ ] **Step 2: Start the frontend**

```bash
npm run dev
```

Expected: Vite dev server starts on port 5173.

- [ ] **Step 3: Test login flow**

1. Open `http://localhost:5173` — should see the login page
2. Enter invalid credentials — should see error message
3. Enter valid Jira email + API token — should transition to dashboard
4. Refresh the page — should still be on dashboard (credentials persisted in localStorage)

- [ ] **Step 4: Test logout**

1. Click the "Logout" button in the topbar
2. Should return to login page
3. `localStorage` should no longer contain `maitri-credentials`

- [ ] **Step 5: Test dashboard still works**

1. Log in with valid credentials
2. Verify issues load on the board
3. Click "Refresh" — should fetch fresh data
4. Switch tabs (Dev Board, QA Board, Reports) — all functional
5. Verify sprint data loads
