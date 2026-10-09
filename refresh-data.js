#!/usr/bin/env node
// Run on a schedule by the GitHub Action below. Fetches the 3 published sheets,
// rebuilds static-data.json, and leaves it untouched if anything looks wrong
// (fewer games than before, an incomplete response, etc.) rather than risk
// overwriting good data with bad.
const fs = require('fs');
const path = require('path');
const { csvToObjects, buildBoxscores, buildPlayers, buildRoster } = require('./pipeline.js');

const CSV_URLS = {
  data:        'https://docs.google.com/spreadsheets/d/e/2PACX-1vQZ8tBkOvTwOJO9-hnZdQKpdVB5q2PTEHPyWR7q8G1Xu1cuYnw3zKxoblh0a_jAhvUnZH9QST1WbdLU/pub?gid=2098354828&single=true&output=csv',
  playerStats: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQZ8tBkOvTwOJO9-hnZdQKpdVB5q2PTEHPyWR7q8G1Xu1cuYnw3zKxoblh0a_jAhvUnZH9QST1WbdLU/pub?gid=493990934&single=true&output=csv',
  roster:      'https://docs.google.com/spreadsheets/d/e/2PACX-1vQZ8tBkOvTwOJO9-hnZdQKpdVB5q2PTEHPyWR7q8G1Xu1cuYnw3zKxoblh0a_jAhvUnZH9QST1WbdLU/pub?gid=698787605&single=true&output=csv',
};
const EXPECT = { data: 'Match Date', playerStats: 'Player', roster: 'Name' };

async function get(url, kind) {
  const res = await fetch(url + (url.includes('?') ? '&' : '?') + '_cb=' + Date.now());
  if (!res.ok) throw new Error(`${kind}: HTTP ${res.status}`);
  const text = await res.text();
  if (!text.includes(EXPECT[kind])) throw new Error(`${kind}: unexpected response (published link may have changed)`);
  return text;
}

const LEAGUE_TABLE_URL = 'https://ehl.entuziasti.com/statistika/tabula';
const CALENDAR_URL = 'https://ehl.entuziasti.com/kalendars';

// abbreviations as used in the calendar/standings pages -> full team names
const TEAM_ABBR = { SP2:'Sparta II', MT2:'Moltto Plus', WRS:'Warriors', ZLG:'Zemgales Leģions',
  WF2:'Ice Wolves II', MDG:'Mad Dogs', BLC:'Blackout', STV:'Steevice', LDV:'Ledus Veči',
  PTR:'Patrioti', NMJ:'Namejs', MTH:'Iecava/Mammoths', MZO:'Mežoņi', JUR:'Jūrmala',
  HLG:'Huligan', PL2:'Leģendas V' };

const TEAM_IDS = { LDV: '293' };   // LDV's team id, from /komandas/ledus-veci/293

// the team-filtered calendar view (main_calendar.team_review) lists BOTH recent results
// and upcoming fixtures for one team; it's reached by POSTing the team's id to the same
// /kalendars URL the dropdown itself submits to.
function parseTeamCalendar(html, teamAbbr) {
  const dayRe = /<li><div class="day"><span>([^<]+)<\/span><h2>([^<]+)<\/h2><\/div>([\s\S]*?)<\/li>/g;
  const games = [];
  let d;
  while ((d = dayRe.exec(html))) {
    const weekday = d[1], dateNum = d[2].replace(/&nbsp;/g, ' ').trim(), dayBlock = d[3];
    const rowRe = /<tr class="div_e5">([\s\S]*?)<\/tr>/g;
    let m;
    while ((m = rowRe.exec(dayBlock))) {
      const row = m[1];
      const names = [...row.matchAll(/<span class="team_name">([A-Z0-9]{2,3})<\/span>/g)].map(x => x[1]);
      if (names.length !== 2 || !names.includes(teamAbbr)) continue;
      const isHome = names[0] === teamAbbr;
      const oppAbbr = isHome ? names[1] : names[0];
      const scoreM = row.match(/<span class="score">(\d+):(\d+)<\/span>/);
      const time = (row.match(/<td>(\d{1,2}:\d{2})<\/td>/) || [])[1] || null;
      const arena = (row.match(/<div class="calendar_arena_block">([^<]+)<\/div>/) || [])[1] || null;
      const game = { opponent: TEAM_ABBR[oppAbbr] || oppAbbr, isHome, time, arena, weekday, date: dateNum };
      if (scoreM) { game.played = true; game.homeGoals = +scoreM[1]; game.awayGoals = +scoreM[2]; }
      else game.played = false;
      games.push(game);
    }
  }
  return games;
}

async function fetchTeamCalendarPost(teamAbbr) {
  const id = TEAM_IDS[teamAbbr];
  if (!id) return null;
  const body = new URLSearchParams({ team: id, search: 'search' });
  const res = await fetch(CALENDAR_URL + '?_cb=' + Date.now(), { method: 'POST', body, headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const html = await res.text();
  if (!html.includes('team_review')) throw new Error('response did not look like the team-filtered view (form field names may differ)');
  return parseTeamCalendar(html, teamAbbr);
}

function findUpcomingGames(html, teamAbbr) {
  // this ribbon is a flat list of <li class="date"> markers interleaved with game <li>s;
  // a marker applies to every game after it until the next marker
  const itemRe = /<li(?: class="date")?\s*>([\s\S]*?)<\/li>/g;
  const games = [];
  let curMonth = null, curDay = null, m;
  while ((m = itemRe.exec(html))) {
    const item = m[1];
    const dateM = item.match(/<div class="month">([^<]+)<\/div><div class="day">([^<]+)<\/div>/);
    if (dateM) { curMonth = dateM[1]; curDay = dateM[2]; continue; }
    const teams = [...item.matchAll(/&nbsp;([A-Z0-9]{2,3})<\/div>/g)].map(x => x[1]);
    if (!item.includes('has-results-2') || !teams.includes(teamAbbr)) continue;
    const time = ((item.match(/<div class="time">([^<]+)<\/div>/) || [])[1] || '').replace(/&nbsp;/g, ' ');
    const arena = (item.match(/<div class="location">([^<]+)<\/div>/) || [])[1] || null;
    const isHome = teams[0] === teamAbbr;   // first team listed = home
    const oppAbbr = isHome ? teams[1] : teams[0];
    games.push({ time, arena, isHome, opponent: TEAM_ABBR[oppAbbr] || oppAbbr,
                 date: curDay && curMonth ? `${curDay} ${curMonth}` : null });
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
    const res = await fetch(CALENDAR_URL + '?_cb=' + Date.now(), { headers: BROWSER_HEADERS });
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

// a plain script request can get a different response than a real browser does (some sites
// vary what they serve based on this) - a realistic header makes the request look like one
const BROWSER_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9,lv;q=0.8' };

async function fetchLeagueTable(previous, divisionId = '400', label = 'E5') {
  try {
    // the site's division switcher (E5 = division 400) may set a cookie a real browser
    // carries automatically; try setting it first, then reuse it on the actual request
    let cookie = '';
    try {
      const switchRes = await fetch('https://ehl.entuziasti.com/switch/division/' + divisionId, { headers: BROWSER_HEADERS, redirect: 'manual' });
      cookie = (switchRes.headers.get('set-cookie') || '').split(';')[0];
      console.log(`league table ${label}: division-switch status`, switchRes.status, cookie ? '(got a cookie)' : '(no cookie set)');
    } catch (e) { console.log('league table: division-switch request itself failed:', e.message); }

    const res = await fetch(LEAGUE_TABLE_URL + '?_cb=' + Date.now(),
      { headers: cookie ? { ...BROWSER_HEADERS, Cookie: cookie } : BROWSER_HEADERS });
    console.log(`league table ${label}: response status`, res.status, '| final URL:', res.url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    const divisions = parseLeagueTable(html);
    const total = divisions.reduce((n, d) => n + d.teams.length, 0);
    if (total < 10) {
      // log enough of the actual response to see WHY, if this happens again
      console.error('league table: unexpected response, first 400 chars:', html.slice(0, 400).replace(/\s+/g, ' '));
      throw new Error(`only found ${total} teams (page layout may have changed)`);
    }
    console.log(`league table ${label}: ${divisions.map(d => `${d.division} (${d.teams.length})`).join(', ')}`);
    return { divisions, fetchedAt: new Date().toISOString() };
  } catch (err) {
    console.error(`league table ${label} fetch failed, keeping previous table:`, err.message);
    return previous || null;
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


// ---------- E5 team stats (GF, GA, PP%, PK% ... for the E5 table) ----------
// The league's "Statistika > Komandas" page, regular season, for one division.
async function fetchTeamStats(previous, divisionId = '400', label = 'E5') {
  try {
    let cookie = '';
    try {
      const sw = await fetch('https://ehl.entuziasti.com/switch/division/' + divisionId, { headers: BROWSER_HEADERS, redirect: 'manual' });
      cookie = (sw.headers.get('set-cookie') || '').split(';')[0];
    } catch (e) { /* the page may still answer for the right division */ }
    const res = await fetch('https://ehl.entuziasti.com/statistika/komandas?_cb=' + Date.now(),
      { headers: cookie ? { ...BROWSER_HEADERS, Cookie: cookie } : BROWSER_HEADERS });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    const table = (html.match(/<table class="team-stats color-columns stat-div-(\d+)">([\s\S]*?)<\/table>/) || []);
    if (!table[2]) throw new Error('team stats table not found');
    if (table[1] !== divisionId) throw new Error(`page shows division ${table[1]}, not ${divisionId}`);
    const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; };
    const teams = {};
    for (const row of table[2].matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c => c[1]);
      if (cells.length < 17) continue;
      const name = cells[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
      const [gp, w, l, t, otw, otl, pts, gf, ga, pp, pk, s, sa, fow, pim] = cells.slice(2, 17).map(num);
      teams[name.toUpperCase()] = { gp, w, l, t, otw, otl, pts, gf, ga, pp, pk, s, sa, fow, pim };
    }
    if (Object.keys(teams).length < 8) throw new Error('only ' + Object.keys(teams).length + ' teams found');
    console.log(`team stats ${label}: ${Object.keys(teams).length} teams`);
    return { teams, fetchedAt: new Date().toISOString() };
  } catch (err) {
    console.error(`team stats ${label} failed, keeping previous:`, err.message);
    return previous || null;
  }
}

// ---------- E7 / E9 team logos into the logos folder ----------
// Reads the teams of a division from the league's "Statistika > Komandas" page and saves each team's logo
// (largest size EHL has) as logos/<team-name>.png. Files that already exist are never touched, so a logo you
// upload yourself always wins. The workflow commits the logos folder.
async function downloadTeamLogos(divisionId, label) {
  try {
    const cookie = await divisionCookie(divisionId);
    const html = await getHtml(`${EHL}/statistika/komandas?_cb=${Date.now()}`, { headers: { ...BROWSER_HEADERS, ...(cookie ? { Cookie: cookie } : {}) } });
    const div = (html.match(/stat-div-(\d+)/) || [])[1];
    if (div !== divisionId) throw new Error(`page shows division ${div}, not ${divisionId}`);
    const teams = [...html.matchAll(/<a href="\/komandas\/[^"]+"><img src="\/uploads\/team\/px\d+\/team_(\d+)\.png[^"]*"[^>]*class="team-logo">([^<]+)<\/a>/g)]
      .map(m => ({ img: m[1], name: niceName(m[2].trim()) }));
    const fileSlug = n => plain(n).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let saved = 0;
    for (const t of teams) {
      if (/^ledus ve/i.test(plain(t.name))) continue;
      const file = path.join(__dirname, 'logos', fileSlug(t.name) + '.png');
      if (fs.existsSync(file)) continue;
      for (const size of ['px150', 'px100', 'px50']) {
        try {
          const res = await fetch(`${EHL}/uploads/team/${size}/team_${t.img}.png`, { headers: BROWSER_HEADERS });
          if (!res.ok) continue;
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length < 200) continue;
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, buf); saved++;
          break;
        } catch (e) { /* try the next size */ }
      }
    }
    console.log(`logos ${label}: ${teams.length} teams on the page, ${saved} new logo files saved`);
  } catch (err) {
    console.error(`logos ${label} failed:`, err.message);
  }
}

// ---------- page samples for the next step (protocol reader + E7 table) ----------
// Saves trimmed copies of one E7 and one E9 game protocol and of the E7 table page into the data file,
// so their exact layout can be checked from the (public) repo before writing the readers for them.
async function capturePageSamples(club) {
  const slim = html => html.replace(/<head[\s\S]*?<\/head>/i, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/i, '').replace(/<footer[\s\S]*?<\/footer>/i, '').replace(/\s+/g, ' ').slice(0, 60000);
  const out = { capturedAt: new Date().toISOString() };
  for (const div of ['E7', 'E9']) {
    const g = ((club && club[div] && club[div].games) || []).filter(x => x.played && x.protocol).pop();
    if (!g) continue;
    try { out['protocol' + div] = { url: g.protocol, html: slim(await getHtml(g.protocol)) }; } catch (e) { out['protocol' + div] = { url: g.protocol, error: e.message }; }
  }
  try {
    const cookie = await divisionCookie('402');
    out.tableE7 = slim(await getHtml(`${EHL}/statistika/tabula?_cb=${Date.now()}`, { headers: { ...BROWSER_HEADERS, ...(cookie ? { Cookie: cookie } : {}) } }));
  } catch (e) { out.tableE7 = 'error: ' + e.message; }
  console.log('page samples saved:', Object.keys(out).join(', '));
  return out;
}

// ---------- Home page: all three club teams (E5, E7, E9) from the EHL calendar ----------
// Each team's own calendar view (the same POST the E5 code above uses) lists its played games
// with scores and protocol links, and its upcoming games. The same view for the next opponent
// gives the opponent's last result and form. Team ids are looked up by name in the calendar's
// team dropdown, so nothing has to be typed in by hand; the fallbacks below are used if that fails.
const CLUB_TEAMS = [
  { div: 'E5', name: 'Ledus Veči',     slug: 'ledus-veci',     fallbackId: '293', divisionId: '400' },
  { div: 'E7', name: 'Ledus Veči II',  slug: 'ledus-veci-ii',  fallbackId: null,  divisionId: '402' },
  { div: 'E9', name: 'Ledus Veči III', slug: 'ledus-veci-iii', fallbackId: '527', divisionId: '404' },
];
const EHL = 'https://ehl.entuziasti.com';
const plain = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
// "LEDUS VEČI III" -> "Ledus Veči III" (roman numerals and short abbreviations stay in capitals)
const niceName = s => String(s || '').trim().split(/\s+/).map(w =>
  /^(I{1,3}|IV|V|VI{0,3}|[A-Z0-9]{1,3})$/.test(w) && w.length <= 4 && !/^[A-Z][a-z]/.test(w) && /^[IVX]+$|^[A-Z0-9]{1,2}$/.test(w)
    ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

async function getHtml(url, opts = {}) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, signal: ctl.signal, ...opts });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  } finally { clearTimeout(timer); }
}

// team id -> name, from the <select> on the calendar page
async function fetchTeamDirectory() {
  const html = await getHtml(CALENDAR_URL + '?_cb=' + Date.now());
  const dir = {};
  for (const m of html.matchAll(/<option[^>]*value="(\d+)"[^>]*>\s*([^<]+?)\s*<\/option>/g)) dir[m[1]] = m[2].replace(/&amp;/g, '&');
  console.log(`team directory: ${Object.keys(dir).length} teams in the calendar dropdown`);
  return dir;
}

function isoFromText(text) {
  const t = String(text || '').replace(/&nbsp;/g, ' ').toLowerCase();
  const num = t.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (num) return `${num[3]}-${num[2].padStart(2, '0')}-${num[1].padStart(2, '0')}`;
  const m = t.match(/(\d{1,2})\.?\s*([a-zāčēģīķļņšūž]+)(?:\s*(\d{4}))?/);
  if (!m) return null;
  const keys = ['jan','feb','mar','apr','mai','jūn','jūl','aug','sep','okt','nov','dec'];
  let mi = keys.findIndex(k => m[2].startsWith(k));
  if (mi < 0) mi = { jun: 5, jul: 6 }[m[2].slice(0, 3)] ?? -1;
  if (mi < 0) return null;
  let y = m[3] ? +m[3] : null;
  if (!y) { const now = new Date(), start = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1; y = mi >= 6 ? start : start + 1; }
  return `${y}-${String(mi + 1).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`;
}

// every game row of one team's calendar view, any division
function parseTeamView(html) {
  const dayRe = /<li><div class="day"><span>([^<]+)<\/span><h2>([^<]+)<\/h2><\/div>([\s\S]*?)<\/li>/g;
  const games = [];
  let d;
  while ((d = dayRe.exec(html))) {
    const date = isoFromText(d[2]);
    const rowRe = /<tr class="div_(e\d+)">([\s\S]*?)<\/tr>/g;
    let m;
    while ((m = rowRe.exec(d[3]))) {
      const row = m[2];
      const abbrs = [...row.matchAll(/<span class="team_name">([A-Z0-9]{2,3})<\/span>/g)].map(x => x[1]);
      if (abbrs.length !== 2) continue;
      const ids = [...new Set([...row.matchAll(/\/komandas\/[^"'\/]+\/(\d+)/g)].map(x => x[1]))];
      const score = row.match(/<span class="score">(\d+):(\d+)<\/span>/);
      const prot = (row.match(/\/protokols\/(\d+)/) || [])[1] || null;
      const imgs = [...row.matchAll(/team_(\d+)\.png/g)].map(x => x[1]);
      games.push({
        date, division: m[1].toUpperCase(),
        time: (row.match(/<td>(\d{1,2}:\d{2})<\/td>/) || [])[1] || null,
        arena: (row.match(/<div class="calendar_arena_block">([^<]+)<\/div>/) || [])[1] || null,
        home: { abbr: abbrs[0], id: ids.length === 2 ? ids[0] : null, img: imgs.length === 2 ? imgs[0] : null },
        away: { abbr: abbrs[1], id: ids.length === 2 ? ids[1] : null, img: imgs.length === 2 ? imgs[1] : null },
        played: !!score, hg: score ? +score[1] : null, ag: score ? +score[2] : null,
        protocol: prot ? `${EHL}/protokols/${prot}` : null,
      });
    }
  }
  return games;
}

// the calendar remembers the chosen division in a cookie; without it the team filter can come back empty,
// so if the first try fails, switch to the team's division first and try again with that cookie
async function divisionCookie(divisionId) {
  try {
    const sw = await fetch(`${EHL}/switch/division/${divisionId}`, { headers: BROWSER_HEADERS, redirect: 'manual' });
    const all = (sw.headers.getSetCookie ? sw.headers.getSetCookie() : [sw.headers.get('set-cookie') || '']).filter(Boolean);
    return all.map(c => c.split(';')[0]).join('; ');
  } catch (e) { return ''; }
}
async function fetchTeamView(teamId, divisionId) {
  const body = () => new URLSearchParams({ team: teamId, search: 'search' });
  let html = await getHtml(CALENDAR_URL + '?_cb=' + Date.now(), { method: 'POST', body: body() });
  if (!html.includes('team_review') && divisionId) {
    const cookie = await divisionCookie(divisionId);
    html = await getHtml(CALENDAR_URL + '?_cb=' + Date.now(), { method: 'POST', body: body(), headers: { ...BROWSER_HEADERS, ...(cookie ? { Cookie: cookie } : {}) } });
  }
  if (!html.includes('team_review')) {
    console.log(`team view ${teamId}: page start:`, html.replace(/\s+/g, ' ').slice(0, 300));
    throw new Error('response did not look like the team-filtered view');
  }
  const games = parseTeamView(html);
  if (!games.length) {
    const i = html.indexOf('<tr class="div_');
    console.log(`team view ${teamId}: no game rows parsed; sample:`, i >= 0 ? html.slice(i, i + 500).replace(/\s+/g, ' ') : '(no div_ rows at all)');
  }
  return games;
}

const mostCommonAbbr = games => {
  const n = {}; games.forEach(g => [g.home.abbr, g.away.abbr].forEach(a => n[a] = (n[a] || 0) + 1));
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
};


// the biggest version of an EHL team logo that exists (the site keeps several sizes)
const LOGO_CACHE = {};
async function ehlLogo(img) {
  if (LOGO_CACHE[img]) return LOGO_CACHE[img];
  for (const size of ['px150', 'px100', 'px50']) {
    const url = `${EHL}/uploads/team/${size}/team_${img}.png`;
    try { const res = await fetch(url, { method: 'HEAD', headers: BROWSER_HEADERS }); if (res.ok) return (LOGO_CACHE[img] = url); } catch (e) {}
  }
  return (LOGO_CACHE[img] = `${EHL}/uploads/team/px50/team_${img}.png`);
}
async function fetchClubTeams(previous) {
  const prev = previous || {};
  let dir = {};
  try { dir = await fetchTeamDirectory(); } catch (err) { console.error('team directory failed:', err.message); }
  const byName = n => Object.keys(dir).find(id => plain(dir[id]) === plain(n));
  const out = {};
  for (const t of CLUB_TEAMS) {
    const id = byName(t.name) || prev[t.div]?.id || t.fallbackId;
    if (!id) { console.error(`club ${t.div}: team id not found (no "${t.name}" in the dropdown) - keeping previous`); if (prev[t.div]) out[t.div] = prev[t.div]; continue; }
    try {
      const games = await fetchTeamView(id, t.divisionId);
      const abbr = mostCommonAbbr(games);
      const today = new Date().toISOString().slice(0, 10);
      const next = games.filter(g => !g.played && g.date && g.date >= today).sort((a, b) => a.date < b.date ? -1 : 1)[0];
      let opponent = prev[t.div]?.opponent || null;
      if (next) {
        const opp = next.home.abbr === abbr ? next.away : next.home;
        const oppName = (opp.id && dir[opp.id]) ? niceName(dir[opp.id]) : (TEAM_ABBR[opp.abbr] || opp.abbr);
        let oppGames = [];
        if (opp.id) { try { oppGames = (await fetchTeamView(opp.id, t.divisionId)).filter(g => g.played); } catch (e) { console.error(`club ${t.div}: opponent view failed:`, e.message); } }
        opponent = { id: opp.id, abbr: opp.abbr, name: oppName, games: oppGames };
      }
      // names for every team id seen, so the page can show full names instead of abbreviations
      const names = {};
      games.concat(opponent?.games || []).forEach(g => [g.home, g.away].forEach(s => { if (s.id && dir[s.id]) names[s.abbr] = niceName(dir[s.id]); }));
      // logos: a file in the logos folder named after the team wins (logos/kalniesi.png), otherwise the EHL logo
      const logos = {};
      const fileSlug = n => plain(n).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      for (const g of games.concat(opponent?.games || [])) for (const s of [g.home, g.away]) {
        if (logos[s.abbr] || s.abbr === abbr) continue;
        const nm = names[s.abbr] || (opponent && opponent.abbr === s.abbr ? opponent.name : null);
        const own = nm && fs.existsSync(path.join(__dirname, 'logos', fileSlug(nm) + '.png')) ? `logos/${fileSlug(nm)}.png` : null;
        if (own) logos[s.abbr] = own;
        else if (s.img) logos[s.abbr] = await ehlLogo(s.img);
      }
      out[t.div] = { div: t.div, id, name: t.name, slug: t.slug, abbr, games, opponent, names, logos, fetchedAt: new Date().toISOString() };
      console.log(`club ${t.div}: id ${id} (${abbr}), ${games.filter(g => g.played).length} played, ${games.filter(g => !g.played).length} upcoming` +
        (opponent ? `, next opponent ${opponent.name} (${opponent.games.length} results)` : ''));
    } catch (err) {
      console.error(`club ${t.div}: failed, keeping previous:`, err.message);
      if (prev[t.div]) out[t.div] = prev[t.div];
    }
  }
  return out;
}

// E7 / E9 players with birthdays and name days (E5 already has these from the roster sheet).
// Team pages are re-read once a day; each player's profile is only opened once, ever.
async function fetchTeamRosters(club, previous) {
  const prev = previous || { people: {}, teams: {} };
  const out = { people: { ...(prev.people || {}) }, teams: { ...(prev.teams || {}) }, fetchedAt: prev.fetchedAt || null };
  const complete = ['E5', 'E7', 'E9'].every(d => ((prev.teams || {})[d] || []).length);
  if (complete && prev.fetchedAt && Date.now() - new Date(prev.fetchedAt) < 20 * 3600 * 1000) { console.log('team rosters: fresh (less than a day old), skipped'); return prev; }
  let list = {};
  try { list = JSON.parse(fs.readFileSync(path.join(__dirname, 'namedays.json'), 'utf8')); } catch (e) {}
  const plainList = {}; Object.entries(list).forEach(([n, d]) => { if (!plainList[plain(n)]) plainList[plain(n)] = d; });
  for (const div of ['E5', 'E7', 'E9']) {   // E5: only to know who is on this season's team (Roster tab)
    const team = club[div];
    if (!team) continue;
    try {
      const html = await getHtml(`${EHL}/komandas/${CLUB_TEAMS.find(t => t.div === div).slug}/${team.id}`);
      // player links are relative (/personas/name/personId/teamSeasonId). The page also lists other teams'
      // top scorers in a sidebar, so keep only links with this team's own season id (the most common one).
      const all = [...html.matchAll(/href="(?:https?:\/\/ehl\.entuziasti\.com)?\/personas\/([a-z0-9-]+)\/(\d+)\/(\d+)"/g)];
      const cnt = {}; all.forEach(m => cnt[m[3]] = (cnt[m[3]] || 0) + 1);
      const ownTeam = Object.entries(cnt).sort((x, y) => y[1] - x[1])[0]?.[0];
      const links = [...new Set(all.filter(m => m[3] === ownTeam).map(m => `${EHL}/personas/${m[1]}/${m[2]}/${m[3]}`))];
      if (!links.length) console.log(`team roster ${div}: no player links found; sample:`, (html.match(/personas[^"]{0,80}/) || ['(none)'])[0]);
      const ids = [];
      for (const url of links) {
        const pid = url.match(/\/personas\/[a-z0-9-]+\/(\d+)/)[1];
        ids.push(pid);
        if (out.people[pid]) continue;
        try {
          const ph = await getHtml(url);
          const nm = (ph.match(/<h1[^>]*>\s*([^<]{3,60}?)\s*<\/h1>/) || ph.match(/<h2[^>]*class="[^"]*name[^"]*"[^>]*>\s*([^<]{3,60}?)\s*<\/h2>/) || [])[1];
          const slugName = url.match(/\/personas\/([a-z0-9-]+)\//)[1].split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
          const b = ph.match(/Dzim\S*\s+dati[\s\S]{0,300}?(\d{1,2})\.(\d{1,2})\.(\d{4})/i);
          out.people[pid] = { name: nm ? niceName(nm) : slugName, ehl: url,
            birthday: b ? `${b[3]}-${b[2].padStart(2, '0')}-${b[1].padStart(2, '0')}` : null };
        } catch (e) { /* try again next day */ }
      }
      // name days from the official list (exact name first, then the same name without accents)
      ids.forEach(pid => { const p = out.people[pid]; if (!p) return; const first = p.name.split(' ')[0];
        const d = list[first] || plainList[plain(first)]; p.nameDay = d ? { d } : { d: '05-22', special: true }; });
      out.teams[div] = ids.filter(pid => out.people[pid]);
      console.log(`team roster ${div}: ${out.teams[div].length} players, ${out.teams[div].filter(pid => out.people[pid].birthday).length} with birthdays`);
    } catch (err) { console.error(`team roster ${div} failed, keeping previous:`, err.message); }
  }
  out.fetchedAt = new Date().toISOString();
  return out;
}

// ---------- Calendar tab data: birthdays, name days, extra practices ----------
// Extra or cancelled practices: the "Practice" tab of the same Google Sheet. The tab's id (gid) is looked up
// by its name on the sheet's published page, so nothing has to be pasted here. Columns (row 1):
// Datums | Laiks | Halle | Piezīme | Atcelts   (Atcelts: "jā" = the regular practice that day is cancelled)
const PRACTICE_TAB_NAME = 'Practice';
const PRACTICES_CSV_URL = '';   // optional: a direct published CSV link overrides the lookup

async function practicesCsvUrl() {
  if (PRACTICES_CSV_URL) return PRACTICES_CSV_URL;
  const base = CSV_URLS.data.split('/pub?')[0];   // same published spreadsheet as the game data
  const html = await (await fetch(base + '/pubhtml?_cb=' + Date.now())).text();
  const esc = PRACTICE_TAB_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = html.match(new RegExp(`sheet-button-(\\d+)"[^>]*>\\s*<a[^>]*>\\s*${esc}\\s*<`, 'i'))
    || html.match(new RegExp(`name:\\s*"${esc}"[^}]*?gid:\\s*"(\\d+)"`, 'i'))
    || html.match(new RegExp(`gid=(\\d+)[^>]*>\\s*${esc}\\s*<`, 'i'));
  if (!m) {
    const tabs = [...html.matchAll(/sheet-button-\d+"[^>]*>\s*<a[^>]*>([^<]+)</g)].map(x => x[1].trim());
    throw new Error(`no published tab named "${PRACTICE_TAB_NAME}" (published tabs: ${tabs.join(', ') || 'none found'}) - check File > Share > Publish to web`);
  }
  return `${base}/pub?gid=${m[1]}&single=true&output=csv`;
}

async function fetchPracticeExtras(previous) {
  try {
    const url = await practicesCsvUrl();
    const res = await fetch(url + '&_cb=' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    const rows = csvToObjects(text).map(r => { const o = {}; Object.entries(r).forEach(([k, v]) => o[String(k).trim().toLowerCase()] = String(v ?? '').trim()); return o; });
    const col = (r, ...names) => { for (const n of names) if (r[n] != null && r[n] !== '') return r[n]; return ''; };
    const toIso = v => {
      v = String(v || '').trim();
      const m = v.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
      if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
    };
    const list = rows.map(r => ({ date: toIso(col(r, 'datums', 'date')), time: col(r, 'laiks', 'time'), rink: col(r, 'halle', 'rink'),
      note: col(r, 'piezīme', 'piezime', 'note'), cancelled: /^(j|y|x|atc)/i.test(col(r, 'atcelts', 'cancelled')) })).filter(x => x.date);
    console.log(`practices: ${list.filter(x => !x.cancelled).length} extra, ${list.filter(x => x.cancelled).length} cancelled (from the "${PRACTICE_TAB_NAME}" tab)`);
    return list;
  } catch (err) {
    console.error('practices sheet failed, keeping previous list:', err.message);
    return previous || [];
  }
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

  // an outer safety net around BOTH of these: even a bug neither function's own try/catch
  // anticipates must never stop the real game/player data above from being saved
  let leagueTable = STATIC.leagueTable, upcomingGames = STATIC.upcomingGames;
  try { leagueTable = await fetchLeagueTable(STATIC.leagueTable); }
  catch (err) { console.error('league table: unexpected error, keeping previous value:', err.message); }
  try { upcomingGames = await fetchUpcomingGames('LDV', STATIC.upcomingGames); }
  catch (err) { console.error('calendar: unexpected error, keeping previous value:', err.message); }

  const finalRoster = roster.length ? roster : STATIC.roster;
  let birthdays = STATIC.birthdays, nameDays = STATIC.nameDays, practiceExtras = STATIC.practiceExtras;
  try { birthdays = await fetchBirthdays(finalRoster, STATIC.birthdays); }
  catch (err) { console.error('birthdays: unexpected error, keeping previous value:', err.message); }
  try { nameDays = buildNameDays(finalRoster); }
  catch (err) { console.error('name days: could not build (is namedays.json in the repo?):', err.message); }
  try { practiceExtras = await fetchPracticeExtras(STATIC.practiceExtras); }
  catch (err) { console.error('practices: unexpected error, keeping previous value:', err.message); }

  // home page: E7 / E9 tables, all three teams' games and opponents, E7 / E9 players
  const leagueTables = { ...(STATIC.leagueTables || {}), E5: leagueTable };
  for (const t of CLUB_TEAMS.filter(t => t.div !== 'E5')) {
    try { leagueTables[t.div] = await fetchLeagueTable(leagueTables[t.div], t.divisionId, t.div); }
    catch (err) { console.error(`league table ${t.div}: unexpected error, keeping previous value:`, err.message); }
  }
  // E5 upcoming games: the team calendar read for the home page (club.E5) has the whole schedule, while the older
  // E5 reader often falls back to the site's header strip, which only shows the next few days. Use the full one.
  const fromClub = (c) => {
    const e5 = c && c.E5; if (!e5 || !e5.games) return null;
    const MON = ['Janvāris','Februāris','Marts','Aprīlis','Maijs','Jūnijs','Jūlijs','Augusts','Septembris','Oktobris','Novembris','Decembris'];
    const WD = ['Svētdiena','Pirmdiena','Otrdiena','Trešdiena','Ceturtdiena','Piektdiena','Sestdiena'];
    const today = new Date().toISOString().slice(0, 10);
    const fut = e5.games.filter(g => !g.played && g.date && g.date >= today).sort((a, b) => a.date < b.date ? -1 : 1);
    if (!fut.length) return null;
    return fut.map(g => { const [y, m, d] = g.date.split('-').map(Number), home = g.home.abbr === e5.abbr, o = home ? g.away : g.home;
      return { date: `${d}. ${MON[m - 1]}`, weekday: WD[new Date(y, m - 1, d).getDay()], time: g.time || '', arena: g.arena || '',
        opponent: TEAM_ABBR[o.abbr] || (e5.names || {})[o.abbr] || o.abbr, isHome: home, protocol: g.protocol || null, fetchedAt: new Date().toISOString() }; });
  };
  let leagueStats = STATIC.leagueStats;
  try { leagueStats = await fetchTeamStats(STATIC.leagueStats, '400', 'E5'); }
  catch (err) { console.error('team stats: unexpected error, keeping previous value:', err.message); }
  await downloadTeamLogos('402', 'E7');
  await downloadTeamLogos('404', 'E9');
  let club = STATIC.club, teamRosters = STATIC.teamRosters;
  try { club = await fetchClubTeams(STATIC.club); }
  catch (err) { console.error('club teams: unexpected error, keeping previous value:', err.message); }
  try { teamRosters = await fetchTeamRosters(club || {}, STATIC.teamRosters); }
  catch (err) { console.error('team rosters: unexpected error, keeping previous value:', err.message); }
  let pageSamples = STATIC.pageSamples;
  try { pageSamples = await capturePageSamples(club); } catch (err) { console.error('page samples failed:', err.message); }
  const fullE5 = fromClub(club);
  if (fullE5) { upcomingGames = fullE5; console.log(`upcoming E5: ${fullE5.length} games from the team calendar`); }

  const updated = { ...STATIC, boxscores, skaterRows, goalieRows, roster: finalRoster,
                     leagueTable, leagueTables, leagueStats, club, pageSamples, teamRosters, upcomingGames, birthdays, nameDays, practiceExtras, lastRefreshed: new Date().toISOString() };
  fs.writeFileSync(file, JSON.stringify(updated) + '\n');
  console.log(`updated static-data.json: ${boxscores.length} games, latest ${boxscores[boxscores.length - 1].date}`);
})().catch(err => { console.error('refresh failed, static-data.json left unchanged:', err.message); process.exit(1); });
