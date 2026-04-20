import express from 'express';
import cors from 'cors';
import { fetchAllIssues, clearCache, fetchAllSprints, verifyCredentials } from './jira.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:5173' }));

function extractAuth(req, res, next) {
  const email = req.headers['x-jira-email'];
  const token = req.headers['x-jira-token'];
  if (!email || !token) {
    return res.status(401).json({ error: 'Missing Jira credentials. Please log in.' });
  }
  req.jiraEmail = email;
  req.auth = Buffer.from(`${email.trim()}:${token.trim()}`).toString('base64');
  next();
}

app.get('/api/verify', async (req, res) => {
  const email = req.headers['x-jira-email'];
  const token = req.headers['x-jira-token'];
  if (!email || !token) {
    return res.status(401).json({ error: 'Missing credentials' });
  }
  const auth = Buffer.from(`${email.trim()}:${token.trim()}`).toString('base64');
  try {
    const result = await verifyCredentials(auth);
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: 'Invalid Jira credentials', detail: err.message });
  }
});

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

app.listen(PORT, () => {
  console.log(`Maitri API server running on http://localhost:${PORT}`);
});
