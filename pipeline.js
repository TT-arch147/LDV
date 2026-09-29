/* ===== LDV live data pipeline =====
   Fetches the 3 published Google Sheets CSVs on every page load and rebuilds
   boxscores / skaterRows / goalieRows / roster in the exact shape the site expects.
   Photos, logos, season badges and historical gaWeighted overrides stay static
   (a CSV can't carry images; the overrides come from manual PP/SH/EN tagging). */

const CSV_URLS = {
  data:        'https://docs.google.com/spreadsheets/d/e/2PACX-1vQZ8tBkOvTwOJO9-hnZdQKpdVB5q2PTEHPyWR7q8G1Xu1cuYnw3zKxoblh0a_jAhvUnZH9QST1WbdLU/pub?gid=2098354828&single=true&output=csv',
  playerStats: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQZ8tBkOvTwOJO9-hnZdQKpdVB5q2PTEHPyWR7q8G1Xu1cuYnw3zKxoblh0a_jAhvUnZH9QST1WbdLU/pub?gid=493990934&single=true&output=csv',
  roster:      'https://docs.google.com/spreadsheets/d/e/2PACX-1vQZ8tBkOvTwOJO9-hnZdQKpdVB5q2PTEHPyWR7q8G1Xu1cuYnw3zKxoblh0a_jAhvUnZH9QST1WbdLU/pub?gid=698787605&single=true&output=csv',
};

// ---------- CSV ----------
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows;
}
function csvToObjects(text) {
  const rows = parseCSV(text), head = rows[0].map(h => h.trim());
  return rows.slice(1).filter(r => r.some(c => c.trim() !== '')).map(r => {
    const o = {}; head.forEach((h, i) => { o[h] = (r[i] ?? '').trim(); }); return o;
  });
}
// Latvian locale: decimal comma, optional % sign
const num = s => { if (s == null) return null; const t = String(s).replace('%', '').replace(',', '.').trim();
                   if (t === '') return null; const n = parseFloat(t); return Number.isFinite(n) ? n : null; };
const int = s => { const n = num(s); return n === null ? 0 : Math.round(n); };
const iso = d => { const [dd, mm, yy] = d.split('.'); return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`; };

// ---------- Data sheet -> boxscores ----------
const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
const SLOTS = ['1 LW', '2 LW', '3 LW', '1 C', '2 C', '3 C', '1 RW', '2 RW', '3 RW',
               '1 LD', '2 LD', '3 LD', '1 RD', '2 RD', '3 RD', 'GK'];

function goalLog(r, side) {
  const out = [];
  for (const o of ORD) {
    const scorer = r[`${side} ${o} goal`]; if (!scorer) continue;
    const g = { scorer, a1: r[`${side} ${o} 1assist`] || null, a2: r[`${side} ${o} 2assist`] || null };
    // the sheet has a typo ("highligAT") in the AT 8th-10th headers
    const v = r[`${side} ${o} goal highlight`] || r[`${side} ${o} goal highligAT`];
    if (v) g.video = v;
    out.push(g);
  }
  return out;
}
function periods(r) {
  const p = {}, n = s => (r[s] === '' || r[s] === undefined) ? null : int(r[s]);
  for (const k of ['1st', '2nd', '3rd', 'OT'])
    p[k] = { s: n(`${k} period S`), sa: n(`${k} period SA`), fow: n(`${k} period FOW`), fol: n(`${k} period FOL`),
             g: n(`${k} G`), ga: n(`${k} GA`) };
  return p;
}
function buildBoxscores(rows, team, situations = {}) {
  const tag = (log, date, side) => { log.forEach((g, i) => { const s = situations[`${date}|${side}|${i}`];
                                       if (s && s.scorer === g.scorer) g.situation = s.situation; }); return log; };
  return rows.filter(r => r['Match Date']).map(r => {
    const home = r['Home Team'], away = r['Away Team'], lvIsHome = home === team;
    const hg = int(r['HT Goals']), ag = int(r['AT Goals']), lv = lvIsHome ? hg : ag, opp = lvIsHome ? ag : hg;
    const lineup = {}; SLOTS.forEach(s => { if (r[s]) lineup[s] = r[s]; });
    return {
      date: iso(r['Match Date']), season: r['Season/Playoffs'], homeTeam: home, awayTeam: away,
      htGoals: hg, atGoals: ag, htShots: int(r['HT Shots']), atShots: int(r['AT Shots']),
      htFO: int(r['HT Faceoffs']), atFO: int(r['AT Faceoffs']), htPIM: int(r['HT Penalties']), atPIM: int(r['AT Penalties']),
      htIcings: int(r['HT Icings']), atIcings: int(r['AT Icings']), htOffsides: int(r['HT Offsides']), atOffsides: int(r['AT Offsides']),
      lvIsHome, result: r['Win/Loss'] || (lv > opp ? 'W' : lv < opp ? 'L' : 'D'),
      pp: int(r['PP']), ppScored: int(r['PP scored']), pk: int(r['PK']), pkScored: int(r['PK scored']),
      otg: r['Player OTG'] || null, lineup,
      htGoalLog: tag(goalLog(r, 'HT'), iso(r['Match Date']), 'HT'), atGoalLog: tag(goalLog(r, 'AT'), iso(r['Match Date']), 'AT'), periods: periods(r),
      skaters: [], goalies: [], allowedPP: int(r['Allowed PP']), scoredPK: int(r['Scored PK']),
    };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- Player Stats sheet -> skaterRows / goalieRows ----------
// goal logs use short names ("Gustavs H.Horsts"); map them to the full name used in Player Stats
function resolveName(n, known) {
  if (!n || known.has(n)) return n;
  const m = n.match(/^(\S+)\s+(\S)\.(\S.*)$/);
  if (m) for (const k of known) {
    const p = k.split(' ');
    if (p[0] === m[1] && (p[1] || '')[0] === m[2] && p.slice(1).join(' ').endsWith(m[3])) return k;
  }
  return n;
}
function buildPlayers(rows, boxes, gaOverrides) {
  // match by date (unique); the opponent name is only a tie-breaker because the two sheets
  // don't always spell it identically ("Cargo serviss" vs "Cargo Serviss")
  const gamesOn = new Map();
  boxes.forEach(b => { if (!gamesOn.has(b.date)) gamesOn.set(b.date, []); gamesOn.get(b.date).push(b); });
  const gameFor = (date, opp) => { const l = gamesOn.get(date) || []; if (l.length <= 1) return l[0];
    return l.find(b => (b.lvIsHome ? b.awayTeam : b.homeTeam).toLowerCase() === (opp || '').toLowerCase()) || l[0]; };
  const known = new Set(rows.map(r => r['Player']).filter(Boolean));
  const skaterRows = [], goalieRows = [];
  for (const r of rows) {
    if (!r['Date'] || !r['Player']) continue;
    const date = iso(r['Date']), opponent = r['Team'], player = r['Player'], box = gameFor(date, opponent);
    const base = { date, season: r['Season/Playoffs'], opponent, player, nr: num(r['Nr.']) };
    if (r['Position'] === 'GK' || r['Pos'] === 'GK') {          // goalie rows reuse Goals=SF, Assists=SV
      const sf = int(r['Goals']), sv = int(r['Assists']);
      const row = { ...base, shotsFaced: sf, saves: sv, savePct: sf ? Math.round(sv / sf * 1000) / 10 : null, ga: sf - sv };
      goalieRows.push(row);
      if (box) { const { player: p, nr, shotsFaced, saves, savePct, ga } = row; box.goalies.push({ player: p, nr, shotsFaced, saves, savePct, ga }); }
      continue;
    }
    const g = int(r['Goals']), sh = num(r['Shots']) ?? 0, fot = num(r['FO taken']) ?? 0, fow = num(r['FO won']) ?? 0;
    const ga = num(r['GA']) ?? 0, pm = num(r['+/-']) ?? 0;
    // per-player assist split + highlight clips, derived from the LV side of the game's goal log
    const log = box ? (box.lvIsHome ? box.htGoalLog : box.atGoalLog) : [];
    let aPrimary = 0, aSecondary = 0; const highlights = [];
    for (const gl of log) {
      if (resolveName(gl.scorer, known) === player && gl.video) highlights.push({ video: gl.video, role: 'Goal' });
      if (resolveName(gl.a1, known) === player) { aPrimary++;   if (gl.video) highlights.push({ video: gl.video, role: 'Assist' }); }
      if (resolveName(gl.a2, known) === player) { aSecondary++; if (gl.video) highlights.push({ video: gl.video, role: 'Assist' }); }
    }
    const row = {
      ...base, pos: r['Position'] || (/D$/.test(r['Pos'] || '') ? 'DEF' : 'FWD'), lineSlot: r['Pos'], g, a: int(r['Assists']),
      shAtt: num(r['Shot attempts']) ?? 0, sh, shPct: sh ? g / sh : 0, bl: num(r['Blocked shots']) ?? 0,
      pim: num(r['PIM']) ?? 0, pimA: num(r['PIM/A']) ?? 0, gf: num(r['GF']) ?? 0, ga, pm,
      pmAdj: num(r['+/- adj']) ?? pm,                                  // pre-calculated in the sheet
      fot, fow, foPct: fot ? fow / fot : 0, highlights, aPrimary, aSecondary,
      gaWeighted: gaOverrides[`${date}|${player}`] ?? ga,              // untagged games use raw GA
    };
    skaterRows.push(row);
    if (box) box.skaters.push({ player, nr: row.nr, pos: row.lineSlot, g, a: row.a, shAtt: row.shAtt, sh, shPct: row.shPct, bl: row.bl,
      pim: row.pim, pimA: row.pimA, pm, pmAdj: row.pmAdj, fot, fow, foPct: row.foPct });
  }
  // starting lineup first (LW, C, RW, LD, RD order), any in-game substitutes after, in sheet order
  boxes.forEach(b => { const idx = p => { const i = SLOTS.findIndex(s => b.lineup[s] === p.player); return i < 0 ? 99 : i; };
                       b.skaters.sort((x, y) => idx(x) - idx(y)); });
  return { skaterRows, goalieRows };
}

// ---------- Roster sheet ----------
const buildRoster = rows => rows.filter(r => r['Name']).map(r => ({
  nr: int(r['Nr']), name: r['Name'], position: r['Position'] || null, height: r['Height'] || null,
  weight: r['Weight'] || null, handedness: r['Handiness'] || null, ehl: r['EHL profile'] || null }));

// ---------- Entry point ----------
// Fallback routes if the direct request is refused (public CORS relays; the sheet is public anyway)
const PROXIES = [u => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
                 u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u)];
const EXPECT = { data: 'Match Date', playerStats: 'Player', roster: 'Name' };   // header must appear, else it's an error page
const timeoutMs = () => (typeof window !== 'undefined' && window.LDV_TIMEOUT) || 7000;

async function fetchCsv(kind, log) {
  const url = CSV_URLS[kind];
  const attempt = async (u, label) => {                       // every request has a hard timeout: no more stuck pages
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeoutMs());
    try {
      const res = await fetch(u, { signal: ctl.signal }); if (!res.ok) throw new Error('HTTP ' + res.status);
      const t = await res.text(); if (!t.includes(EXPECT[kind])) throw new Error('unexpected response');
      log.push(`${kind}: ${label} OK`); return t;
    } catch (e) { log.push(`${kind}: ${label} failed (${ctl.signal.aborted ? 'timed out' : e.message})`); return null; }
    finally { clearTimeout(timer); }
  };
  let t = await attempt(url, 'direct'); if (t) return { t, via: 'direct' };
  // in parallel: (1) diagnose - a no-cors request skips the CORS check, so it separates "blocked by CORS"
  // from "can't reach Google at all"; (2) race the relays
  const probing = (async () => {
    const c = new AbortController(), tm = setTimeout(() => c.abort(), Math.min(3000, timeoutMs()));
    try { await fetch(url, { mode: 'no-cors', signal: c.signal }); log.push(`${kind}: CORS - Google is reachable but sent no cross-origin permission`); }
    catch (e) { log.push(`${kind}: UNREACHABLE - this page can't connect to Google (offline, ad-blocker, CSP, or opened as a local file)`); }
    finally { clearTimeout(tm); }
  })();
  try {
    return await Promise.any(PROXIES.map((mk, i) => attempt(mk(url), 'proxy ' + (i + 1))
      .then(x => x ? { t: x, via: 'proxy ' + (i + 1) } : Promise.reject(new Error('failed')))));
  } catch (_) { await probing; throw new Error('all routes failed'); }
}
function summarize(log) {
  const has = s => log.some(l => l.includes(s));
  return (has('CORS -') ? 'Google refused the browser request (CORS)'
        : has('UNREACHABLE') ? "can't reach Google from this page (offline / blocker / local file / sandbox)"
        : has('timed out') ? 'requests timed out' : 'requests failed') + '; relay fallbacks failed too';
}
async function loadLiveData(STATIC) {
  const log = []; loadLiveData.info = { via: '', log };
  let got;
  try { got = await Promise.all(['data', 'playerStats', 'roster'].map(k => fetchCsv(k, log))); }
  catch (e) { const err = new Error(summarize(log)); err.log = log; throw err; }
  const [d, p, r] = got.map(g => g.t);
  loadLiveData.info.via = [...new Set(got.map(g => g.via))].join('+');
  const boxscores = buildBoxscores(csvToObjects(d), STATIC.team, STATIC.situations || {});
  const { skaterRows, goalieRows } = buildPlayers(csvToObjects(p), boxscores, STATIC.gaOverrides || {});
  // sanity checks: the sheets only ever grow, so fewer rows than the saved data means a truncated/bad response
  if (boxscores.length < STATIC.boxscores.length) throw new Error('live data has fewer games than the saved data');
  if (skaterRows.length < 0.98 * STATIC.skaterRows.length) throw new Error('live player rows look incomplete');
  const badRows = skaterRows.filter(x => !/^[123](LW|C|RW|LD|RD)$/.test(x.lineSlot || '')).length;
  if (badRows > 0.02 * skaterRows.length) throw new Error('live player rows have an unexpected format');
  const roster = buildRoster(csvToObjects(r));
  return { ...STATIC, boxscores, skaterRows, goalieRows, roster: roster.length ? roster : STATIC.roster };
}

if (typeof module !== 'undefined') module.exports = { parseCSV, csvToObjects, buildBoxscores, buildPlayers, buildRoster, resolveName };
