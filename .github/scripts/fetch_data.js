#!/usr/bin/env node
// Reads PROJECT_LIST from env (JSON array) or falls back to projects.json or .github/projects.json
// For each project.id it fetches https://api.scratch.mit.edu/projects/{id} and appends today's metrics to status.json

const fs = require('fs');
const path = require('path');

function safeParse(s) {
  try { return JSON.parse(s); } catch(e) { return null; }
}

async function fetchWithRetry(url, retries = 3, timeout = 10000) {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(id);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      try { return JSON.parse(text); } catch { return JSON.parse(JSON.stringify(text)); }
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

(async function main() {
  try {
    // Load project list from env or fallback files
    const fallbackPath1 = path.join(process.cwd(), 'projects.json');
    const fallbackPath2 = path.join(process.cwd(), '.github', 'projects.json');
    const fallback = fs.existsSync(fallbackPath1) ? fs.readFileSync(fallbackPath1, 'utf-8')
                   : (fs.existsSync(fallbackPath2) ? fs.readFileSync(fallbackPath2, 'utf-8') : '[]');

    const envList = (typeof process.env.PROJECT_LIST === 'string' && process.env.PROJECT_LIST.trim() !== '') ? process.env.PROJECT_LIST : null;
    const projectList = safeParse(envList) || safeParse(fallback) || [];

    if (!Array.isArray(projectList) || projectList.length === 0) {
      console.log('No projects to fetch');
      // still update timestamp but keep existing projects if any
      let status = { update: new Date().toISOString(), projects: [] };
      if (fs.existsSync('status.json')) {
        try {
          const existing = JSON.parse(fs.readFileSync('status.json', 'utf-8'));
          status.projects = existing.projects || [];
        } catch(e) { /* ignore */ }
      }
      fs.writeFileSync('status.json', JSON.stringify(status, null, 2));
      console.log('status.json saved (no projects).');
      return;
    }

    console.log(`Fetching data for ${projectList.length} projects...`);
    let status = { update: new Date().toISOString(), projects: [] };
    if (fs.existsSync('status.json')) {
      try {
        const existing = JSON.parse(fs.readFileSync('status.json', 'utf-8'));
        status.projects = existing.projects || [];
      } catch(e) { /* ignore */ }
    }

    const today = new Date().toISOString().split('T')[0];

    for (const project of projectList) {
      try {
        const id = project.id;
        const url = `https://api.scratch.mit.edu/projects/${id}`;
        const data = await fetchWithRetry(url);

        const newRecord = {
          date: today,
          views: parseInt(data?.stats?.views) || 0,
          loves: parseInt(data?.stats?.loves) || 0,
          favorites: parseInt(data?.stats?.favorites) || 0
        };

        let projectHistory = status.projects.find(p => p.id === id);
        if (!projectHistory) {
          projectHistory = { id: id, name: project.name || project.title || String(id), data: [] };
          status.projects.push(projectHistory);
        }

        // If last entry is today, replace; else push
        const last = projectHistory.data[projectHistory.data.length - 1];
        if (last && last.date === today) {
          projectHistory.data[projectHistory.data.length - 1] = newRecord;
        } else {
          projectHistory.data.push(newRecord);
        }

        console.log(`✓ ${projectHistory.name} (${id}): views=${newRecord.views}, loves=${newRecord.loves}, favs=${newRecord.favorites}`);
      } catch (e) {
        console.error(`✗ Failed to fetch ${project?.id}: ${e.message}`);
      }
      // small delay to be kind to the API
      await new Promise(r => setTimeout(r, 200));
    }

    status.update = new Date().toISOString();
    fs.writeFileSync('status.json', JSON.stringify(status, null, 2));
    console.log('status.json saved!');

  } catch (e) {
    console.error('Fatal error:', e);
    process.exit(1);
  }
})();
