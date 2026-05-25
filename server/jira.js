const JIRA_BASE_URL = 'https://macrohealth.atlassian.net';
const API = `${JIRA_BASE_URL}/rest/api/3`;
const AGILE_API = `${JIRA_BASE_URL}/rest/agile/1.0`;

const TEAM_ACCOUNT_IDS = [
  '712020:c9c43563-935e-4171-b228-fae9c70c1d19', // Sashank
  '712020:9269d5b7-d525-4222-ae71-c4d8b2288bb5', // Anjali
  '712020:726292d3-c3f8-4ea9-9923-56207f355dfe', // Sanabul
  '712020:5f98e841-ff4e-4cf8-b41f-4ab51032ac27', // Buddhi
  '712020:e72a498d-e082-4350-86b5-f0f4d957ce44', // Aarati
  '712020:2d6a1371-6b2e-459c-a31b-61caff5a7f7d', // Diwas
];

const QA_ACCOUNT_IDS = [
  '712020:e72a498d-e082-4350-86b5-f0f4d957ce44', // Aarati
  '712020:2d6a1371-6b2e-459c-a31b-61caff5a7f7d', // Diwas
];

// Sprint lives in a customfield whose ID varies per Jira tenant. Request *all
// so we can auto-detect it in mapIssue regardless of which ID this tenant uses.
const FIELDS = ['*all'];

// --- Cache ---
const caches = {};
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

function getCache(email) {
  if (!caches[email]) caches[email] = { issues: { data: null, ts: 0 }, sprints: { data: null, ts: 0 } };
  return caches[email];
}

async function jiraGet(url, auth) {
  const res = await fetch(url, {
    headers: {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira API ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

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
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira API ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

function buildJQL() {
  const allIds = TEAM_ACCOUNT_IDS.map(id => `"${id}"`).join(', ');
  const qaIds = QA_ACCOUNT_IDS.map(id => `"${id}"`).join(', ');
  return `project in (ACT, CONN, NACT, QA, SUPP) AND (assignee in (${allIds}) OR "SDET Assignee" in (${qaIds})) ORDER BY updated DESC`;
}

function extractComment(commentField) {
  if (!commentField || !commentField.comments || commentField.comments.length === 0) {
    return { comment_count: 0, last_comment_author: '', last_comment_text: '', last_comment_date: '' };
  }
  const comments = commentField.comments;
  const last = comments[comments.length - 1];

  let text = '';
  if (last.body && last.body.content) {
    text = last.body.content
      .flatMap(block => (block.content || []).map(c => c.text || ''))
      .join(' ')
      .trim();
  }

  return {
    comment_count: commentField.total || comments.length,
    last_comment_author: last.author?.displayName || '',
    last_comment_text: text,
    last_comment_date: last.updated || last.created || '',
  };
}

function findSprintArray(fields) {
  // Sprint customfield ID varies per tenant. Scan all customfields for one
  // whose value is an array of sprint-shaped objects (have name + state).
  for (const key of Object.keys(fields)) {
    if (!key.startsWith('customfield_')) continue;
    const v = fields[key];
    if (Array.isArray(v) && v.length > 0 && v[0] && typeof v[0] === 'object'
        && 'state' in v[0] && 'name' in v[0]) {
      return v;
    }
  }
  return [];
}

function mapIssue(raw) {
  const f = raw.fields;
  const sprints = findSprintArray(f);
  // Prefer the active sprint; otherwise the most recently added (last in array)
  const sprint = sprints.find(s => s.state === 'active') || sprints[sprints.length - 1] || null;
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
    storyPoints: f.story_points ?? null,
    timeOriginalEstimate: f.timeoriginalestimate ?? null,
    timeSpent: f.timespent ?? null,
    ...commentInfo,
  };
}

export async function fetchAllIssues(auth, email) {
  const userCache = getCache(email).issues;
  const now = Date.now();
  if (userCache.data && (now - userCache.ts) < CACHE_TTL) {
    return userCache.data;
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

  userCache.data = allIssues;
  userCache.ts = Date.now();
  return allIssues;
}

export function clearCache(email) {
  delete caches[email];
}

// --- Sprint fetching via Agile API ---
const SPRINT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const PROJECT_KEYS = ['ACT', 'CONN', 'NACT', 'QA', 'SUPP'];

async function fetchBoardsForProject(projectKey, auth) {
  try {
    const data = await jiraGet(`${AGILE_API}/board?projectKeyOrId=${projectKey}&type=scrum&maxResults=5`, auth);
    return (data.values || []).map(b => ({ id: b.id, name: b.name, project: projectKey }));
  } catch {
    // Project might not have a scrum board, try any board type
    try {
      const data = await jiraGet(`${AGILE_API}/board?projectKeyOrId=${projectKey}&maxResults=5`, auth);
      return (data.values || []).map(b => ({ id: b.id, name: b.name, project: projectKey }));
    } catch {
      return [];
    }
  }
}

async function fetchSprintsForBoard(board, auth) {
  const sprints = [];
  let startAt = 0;
  while (true) {
    try {
      const data = await jiraGet(`${AGILE_API}/board/${board.id}/sprint?maxResults=50&startAt=${startAt}&state=active,closed,future`, auth);
      const values = data.values || [];
      for (const s of values) {
        sprints.push({
          id: s.id,
          name: s.name,
          state: s.state, // active, closed, future
          startDate: s.startDate || null,
          endDate: s.endDate || null,
          completeDate: s.completeDate || null,
          boardId: board.id,
          boardName: board.name,
          project: board.project,
        });
      }
      if (data.isLast !== false || values.length === 0) break;
      startAt += values.length;
    } catch {
      break;
    }
  }
  return sprints;
}

export async function fetchAllSprints(auth, email) {
  const userCache = getCache(email).sprints;
  const now = Date.now();
  if (userCache.data && (now - userCache.ts) < SPRINT_CACHE_TTL) {
    return userCache.data;
  }

  const allBoards = [];
  for (const key of PROJECT_KEYS) {
    const boards = await fetchBoardsForProject(key, auth);
    allBoards.push(...boards);
  }

  // Deduplicate boards by ID
  const uniqueBoards = [...new Map(allBoards.map(b => [b.id, b])).values()];

  const allSprints = [];
  const seenIds = new Set();
  for (const board of uniqueBoards) {
    const sprints = await fetchSprintsForBoard(board, auth);
    for (const s of sprints) {
      if (!seenIds.has(s.id)) {
        seenIds.add(s.id);
        allSprints.push(s);
      }
    }
  }

  // Sort: active first, then future, then closed (most recent first)
  allSprints.sort((a, b) => {
    const order = { active: 0, future: 1, closed: 2 };
    if (order[a.state] !== order[b.state]) return order[a.state] - order[b.state];
    return new Date(b.endDate || 0) - new Date(a.endDate || 0);
  });

  userCache.data = allSprints;
  userCache.ts = Date.now();
  return allSprints;
}

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
