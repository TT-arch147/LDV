#!/usr/bin/env node
// Run on a schedule by the GitHub Action below. Fetches the 3 published sheets,
// rebuilds static-data.json, and leaves it untouched if anything looks wrong
// (fewer games than before, an incomplete response, etc.) rather than risk
// overwriting good data with bad.
const fs = require('fs');
const path = require('path');
const { csvToObjects, buildBoxscores, buildPlayers, buildRoster } = require('./pipeline.js');

const LEAGUE_TABLE_URL = 'https://ehl.entuziasti.com/statistika/tabula';

function parseLeagueTable(html) {
  const divisions = [];
  const headerRe = /<h2 class="subtitle color-orange">([^<]+)<\/h2>/g;
  let m, marks = [];
  while ((m = headerRe.exec(html))) marks.push({ name: m[1].trim(), pos: m.index });
  for (const { name, pos } of marks) {
    const tableRe = /<table[^>]*class="[^"]*\bstandings-table\b(?!-teams)[^"]*"[^>]*>([\s\S]*?)<\/table>/g;
    tableRe.lastIndex = pos;
    const tm = tableRe.exec(html);
    if (!tm) continue;
    const rowRe = /<tr>([\s\S]*?)<\/tr>/g;
    const teams = [];
    let rm;
    while ((rm = rowRe.exec(tm[1]))) {
      const row = rm[1];
      const nameM = row.match(/<span class="teams_name">([^<]+)<\/span>/);
      if (!nameM) continue;
      const gpM = row.match(/class="mobile-hide gray">(\d+)</);
      const ptsM = row.match(/<td>(\d+)<\/td>\s*$/);
      teams.push({ team: nameM[1].trim(), gp: gpM ? parseInt(gpM[1], 10) : null, points: ptsM ? parseInt(ptsM[1], 10) : null });
    }
    if (teams.length) divisions.push({ division: name, teams });
  }
  return divisions;
}

async function fetchLeagueTable(previous) {
  try {
    const res = await fetch(LEAGUE_TABLE_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    const divisions = parseLeagueTable(html);
    const total = divisions.reduce((n, d) => n + d.teams.length, 0);
    if (total < 10) throw new Error(`only found ${total} teams (page layout may have changed)`);
    console.log(`league table: ${divisions.map(d => `${d.division} (${d.teams.length})`).join(', ')}`);
    return { divisions, fetchedAt: new Date().toISOString() };
  } catch (err) {
    console.error('league table fetch failed, keeping previous table:', err.message);
    return previous || null;
  }
}

const CSV_URLS = {
  data:        'https://docs.google.com/spreadsheets/d/e/2PACX-1vQZ8tBkOvTwOJO9-hnZdQKpdVB5q2PTEHPyWR7q8G1Xu1cuYnw3zKxoblh0a_jAhvUnZH9QST1WbdLU/pub?gid=2098354828&single=true&output=csv',
  playerStats: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQZ8tBkOvTwOJO9-hnZdQKpdVB5q2PTEHPyWR7q8G1Xu1cuYnw3zKxoblh0a_jAhvUnZH9QST1WbdLU/pub?gid=493990934&single=true&output=csv',
  roster:      'https://docs.google.com/spreadsheets/d/e/2PACX-1vQZ8tBkOvTwOJO9-hnZdQKpdVB5q2PTEHPyWR7q8G1Xu1cuYnw3zKxoblh0a_jAhvUnZH9QST1WbdLU/pub?gid=698787605&single=true&output=csv',
};
const EXPECT = { data: 'Match Date', playerStats: 'Player', roster: 'Name' };

async function get(url, kind) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${kind}: HTTP ${res.status}`);
  const text = await res.text();
  if (!text.includes(EXPECT[kind])) throw new Error(`${kind}: unexpected response (published link may have changed)`);
  return text;
}

(async () => {
  const file = path.join(__dirname, 'static-data.json');
  const STATIC = JSON.parse(fs.readFileSync(file, 'utf8'));

  const [d, p, r] = await Promise.all([
    get(CSV_URLS.data, 'data'), get(CSV_URLS.playerStats, 'playerStats'), get(CSV_URLS.roster, 'roster'),
  ]);

  const boxscores = buildBoxscores(csvToObjects(d), STATIC.team, STATIC.situations || {});
  const { skaterRows, goalieRows } = buildPlayers(csvToObjects(p), boxscores, STATIC.gaOverrides || {});
  const roster = buildRoster(csvToObjects(r));

  if (boxscores.length < STATIC.boxscores.length) throw new Error('fewer games than the current file - aborting');
  if (skaterRows.length < 0.98 * STATIC.skaterRows.length) throw new Error('player rows look incomplete - aborting');
  const badRows = skaterRows.filter(x => !/^[123](LW|C|RW|LD|RD)$/.test(x.lineSlot || '')).length;
  if (badRows > 0.02 * skaterRows.length) throw new Error('player rows have an unexpected format - aborting');

  const leagueTable = await fetchLeagueTable(STATIC.leagueTable);   // non-fatal on its own: keeps last good table if this fails

  const updated = { ...STATIC, boxscores, skaterRows, goalieRows, roster: roster.length ? roster : STATIC.roster,
                     leagueTable, lastRefreshed: new Date().toISOString() };
  fs.writeFileSync(file, JSON.stringify(updated) + '\n');
  console.log(`updated static-data.json: ${boxscores.length} games, latest ${boxscores[boxscores.length - 1].date}`);
})().catch(err => { console.error('refresh failed, static-data.json left unchanged:', err.message); process.exit(1); });
