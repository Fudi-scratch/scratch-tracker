#!/usr/bin/env node
// Usage: node fetch_projects.js <username> [maxProjects]
// Outputs JSON array [{"id":123,"name":"..."}] to stdout.
const fs = require('fs');

const username = process.argv[2];
if (!username) {
  console.error('Usage: node fetch_projects.js <username> [maxProjects]');
  process.exit(1);
}
const maxProjects = parseInt(process.argv[3], 10) || 200;
const limit = 40;
let all = [];

async function main() {
  for (let offset = 0; offset < maxProjects; offset += limit) {
    const url = `https://api.scratch.mit.edu/users/${encodeURIComponent(username)}/projects?limit=${limit}&offset=${offset}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.error(`HTTP ${res.status} fetching ${url}`);
        break;
      }
      const data = await res.json();
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < limit) break;
      await new Promise(r => setTimeout(r, 300)); // 軽い待ち
    } catch (err) {
      console.error(`Fetch error (offset ${offset}):`, err);
      break;
    }
  }

  const list = all.map(p => ({ id: p.id, name: p.title || p.name || String(p.id) }));
  console.log(JSON.stringify(list, null, 2));
}

main();
