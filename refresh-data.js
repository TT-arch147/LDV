#!/usr/bin/env node
// Run on a schedule by the GitHub Action below. Fetches the 3 published sheets,
// rebuilds static-data.json, and leaves it untouched if anything looks wrong
// (fewer games than before, an incomplete response, etc.) rather than risk
// overwriting good data with bad.
const fs = require('fs');
const path = require('path');
const { csvToObjects, buildBoxscores, buildPlayers, buildRoster } = require('./pipeline.js');

const LEAGUE_TABLE_URL = 'https://ehl.entuziasti.com/statistika/tabula';
const CALENDAR_URL = 'https://ehl.entuziasti.com/kalendars';

// abbreviations as used in the calendar/standings pages -> full team names
const TEAM_IDS = { LDV: '293' };   // LDV's team id, from /komandas/ledus-veci/293

// the team-filtered calendar view (main_calendar.team_review) lists BOTH recent results
// and upcoming fixtures for one team; it's reached by POSTing the team's id to the same
// /kalendars URL the dropdown itself submits to.
function parseTeamCalendar(html, teamAbbr) {
  const rowRe = /<tr class="div_e5">([\s\S]*?)<\/tr>/g;
  const games = [];
  let m;
  while ((m = rowRe.exec(html))) {
    const row = m[1];
    const names = [...row.matchAll(/<span class="team_name">([A-Z0-9]{2,3})<\/span>/g)].map(x => x[1]);
    if (names.length !== 2 || !names.includes(teamAbbr)) continue;
    const isHome = names[0] === teamAbbr;
    const oppAbbr = isHome ? names[1] : names[0];
    const scoreM = row.match(/<span class="score">(\d+):(\d+)<\/span>/);
    const time = (row.match(/<td>(\d{1,2}:\d{2})<\/td>/) || [])[1] || null;
    const arena = (row.match(/<div class="calendar_arena_block">([^<]+)<\/div>/) || [])[1] || null;
    const game = { opponent: TEAM_ABBR[oppAbbr] || oppAbbr, isHome, time, arena };
    if (scoreM) { game.played = true; game.homeGoals = +scoreM[1]; game.awayGoals = +scoreM[2]; }
    else game.played = false;
    games.push(game);
  }
  return games;
}

async function fetchTeamCalendarPost(teamAbbr) {
  const id = TEAM_IDS[teamAbbr];
  if (!id) return null;
  const body = new URLSearchParams({ team: id, search: 'search' });
  const res = await fetch(CALENDAR_URL + '?_cb=' + Date.now(), { method: 'POST', body });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const html = await res.text();
  if (!html.includes('team_review')) throw new Error('response did not look like the team-filtered view (form field names may differ)');
  return parseTeamCalendar(html, teamAbbr);
}

const TEAM_ABBR = { SP2:'Sparta II', MT2:'Moltto Plus', WRS:'Warriors', ZLG:'Zemgales Leģions',
  WF2:'Ice Wolves II', MDG:'Mad Dogs', BLC:'Blackout', STV:'Steevice', LDV:'Ledus Veči',
  PTR:'Patrioti', NMJ:'Namejs', MTH:'Iecava/Mammoths', MZO:'Mežoņi', JUR:'Jūrmala',
  HLG:'Huligan', PL2:'Leģendas V' };

function findUpcomingGames(html, teamAbbr) {
  const rowRe = /<li ><div class="parent has-results-2">([\s\S]*?)<\/div><\/li>/g;
  const games = [];
  let m;
  while ((m = rowRe.exec(html))) {
    const row = m[1];
    const teams = [...row.matchAll(/&nbsp;([A-Z0-9]{2,3})<\/div>/g)].map(x => x[1]);
    if (!teams.includes(teamAbbr)) continue;
    const time = ((row.match(/<div class="time">([^<]+)<\/div>/) || [])[1] || '').replace(/&nbsp;/g, ' ');
    const arena = (row.match(/<div class="location">([^<]+)<\/div>/) || [])[1] || null;
    const isHome = teams[0] === teamAbbr;   // first team listed = home
    const oppAbbr = isHome ? teams[1] : teams[0];
    games.push({ time, arena, isHome, opponent: TEAM_ABBR[oppAbbr] || oppAbbr });
  }
  return games;
}

async function fetchUpcomingGames(teamAbbr, previous) {
  const now = new Date().toISOString();
  // preferred: the team-filtered calendar (more games, further ahead) - untested against the
  // live site, since this form-POST behaviour can only be confirmed by actually running it there
  try {
    const games = await fetchTeamCalendarPost(teamAbbr);
    if (games) {
      const upcoming = games.filter(g => !g.played);
      if (upcoming.length) {
        console.log(`calendar (team view): ${upcoming.length} upcoming game(s) - next is ${upcoming[0].isHome ? 'vs' : 'at'} ${upcoming[0].opponent}, ${upcoming[0].time}`);
        return upcoming.map(g => ({ ...g, fetchedAt: now }));
      }
      console.log('calendar (team view): reachable but no unplayed games found - falling back');
    }
  } catch (err) {
    console.error('calendar (team view) failed, falling back to the general calendar:', err.message);
  }
  // fallback: the general calendar's game ribbon (already proven to work, but a shorter window)
  try {
    const res = await fetch(CALENDAR_URL + '?_cb=' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    const games = findUpcomingGames(html, teamAbbr);
    if (!games.length) { console.log('calendar (fallback): no upcoming games found (off-season, or the ribbon window has none for this team)'); return previous || []; }
    console.log(`calendar (fallback): ${games.length} upcoming game(s) - next is ${games[0].isHome ? 'vs' : 'at'} ${games[0].opponent}, ${games[0].time}`);
    return games.map(g => ({ ...g, fetchedAt: now }));
  } catch (err) {
    console.error('calendar (fallback) failed too, keeping previous value:', err.message);
    return previous || [];
  }
}

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
    const res = await fetch(LEAGUE_TABLE_URL + '?_cb=' + Date.now());
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
  // append a unique value so no cache between here and Google can ever serve a stale copy
  const res = await fetch(url + (url.includes('?') ? '&' : '?') + '_cb=' + Date.now());
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
  const upcomingGames = await fetchUpcomingGames('LDV', STATIC.upcomingGames);   // same: non-fatal on its own

  const updated = { ...STATIC, boxscores, skaterRows, goalieRows, roster: roster.length ? roster : STATIC.roster,
                     leagueTable, upcomingGames, lastRefreshed: new Date().toISOString() };
  fs.writeFileSync(file, JSON.stringify(updated) + '\n');
  console.log(`updated static-data.json: ${boxscores.length} games, latest ${boxscores[boxscores.length - 1].date}`);
})().catch(err => { console.error('refresh failed, static-data.json left unchanged:', err.message); process.exit(1); });
