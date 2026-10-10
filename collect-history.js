// One-time job: collects every Ledus Veči II (E7) and III (E9) game from the start of the 2024-2025 season,
// by walking the numbered EHL game protocols from newest to oldest. Run it from GitHub:
// Actions -> "Collect EHL history" -> Run workflow. It does NOT run on a schedule.
//
// Output (committed to the repo by the workflow, read by the site's refresh script):
//   history/club-games.json   { E7: [games...], E9: [games...] } - goals, assists, penalties, shots,
//                             faceoffs, goalies, players, video - the same as the current season
//   history/progress.json     where the scan got to, so a second run continues instead of starting over
const fs = require('fs');
const path = require('path');

const EHL = 'https://ehl.entuziasti.com';
const STOP_BEFORE = '2024-08-01';             // nothing older than the 2024-2025 season
const MAX_PAGES = 9000;                        // safety limit for one run
const PAUSE_MS = 250;                          // pause between pages, to go easy on the EHL site
const OUR_CLUBS = { E7: '334', E9: '527' };    // Ledus Veči II, Ledus Veči III (club ids on the EHL site)
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'lv,en;q=0.8' };

const LV_MONTH_FULL = { 'janvāris':1,'februāris':2,'marts':3,'aprīlis':4,'maijs':5,'jūnijs':6,'jūlijs':7,'augusts':8,'septembris':9,'oktobris':10,'novembris':11,'decembris':12 };

const fixCase = n => String(n || '').trim().split(/\s+/).map(w => /^[IVX]+$/.test(w) ? w : (w.length > 1 && w === w.toUpperCase() ? w[0] + w.slice(1).toLowerCase() : w)).join(' ');

const pidOf = href => (String(href).match(/\/personas\/[a-z0-9-]+\/(\d+)/) || [])[1] || null;

function parseProtocol(html, url, ourClubId) {
  const strip = s => String(s).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const dm = html.match(/<div class="date">\s*(\d{1,2})\.\s*([A-ZĀČĒĢĪĶĻŅŠŪŽa-zāčēģīķļņšūž]+),\s*(\d{4})/);
  if (!dm) return null;
  const month = LV_MONTH_FULL[dm[2].toLowerCase()]; if (!month) return null;
  const date = `${dm[3]}-${String(month).padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
  const place = (html.match(/<div class="place">([\s\S]*?)<\/div>/) || [])[1] || '';
  const pl = place.split(/<br\s*\/?>/i).map(strip);
  const arenaTime = (pl[1] || '').match(/^(.*?),\s*(\d{1,2}:\d{2})/) || [];
  const sideIds = [...html.matchAll(/<div class="team_data( team_b)?">[\s\S]*?\/komandas\/[^"\/]+\/(\d+)/g)].map(m => m[2]);
  const abbrs = [...html.matchAll(/<div class="team_name">\s*<div class="name">([^<]+)<\/div>/g)].map(m => m[1].trim());
  const sa = html.match(/id="score_a">(\d+)</), sb = html.match(/id="score_b">(\d+)</);
  const num = id => +((html.match(new RegExp(`id="${id}">(\\d+)<`)) || [])[1] || 0);
  if (sideIds.length < 2 || abbrs.length < 2) return null;
  const weHome = sideIds[0] === String(ourClubId), weAway = sideIds[1] === String(ourClubId);
  if (!weHome && !weAway) return null;
  const usAbbr = weHome ? abbrs[0] : abbrs[1], themAbbr = weHome ? abbrs[1] : abbrs[0];
  const g = { date, protocol: url, time: arenaTime[2] || null, arena: arenaTime[1] || null,
    home: { abbr: abbrs[0], id: sideIds[0], name: fixCase((pl[0] || '').split(' vs ')[0]) },
    away: { abbr: abbrs[1], id: sideIds[1], name: fixCase((pl[0] || '').split(' vs ')[1]) },
    played: !!(sa && sb), hg: sa ? +sa[1] : null, ag: sb ? +sb[1] : null,
    video: (html.match(/<a href="(https:\/\/www\.youtube\.com\/embed\/[^"]+)"[^>]*>\s*SPĒLES VIDEO/i) || [])[1] || null,
    shots: { us: weHome ? num('stats_sog_a') : num('stats_sog_b'), them: weHome ? num('stats_sog_b') : num('stats_sog_a') },
    faceoffs: { us: weHome ? num('stats_foff_a') : num('stats_foff_b'), them: weHome ? num('stats_foff_b') : num('stats_foff_a') },
    goals: [], penalties: [], goalies: [], players: [], ourSide: weHome ? 'home' : 'away' };
  // events, period by period
  let period = 1;
  for (const blk of html.matchAll(/<span class="title">([^<]+)<\/span>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/g)) {
    const pm = blk[1].match(/(\d)\./); period = pm ? +pm[1] : (/papild/i.test(blk[1]) ? 4 : period);
    for (const ev of blk[2].matchAll(/<tr class="([^"]+)">([\s\S]*?)<\/tr>/g)) {
      const cells = [...ev[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c => c[1]);
      if (cells.length < 4) continue;
      const time = strip(cells[0]), team = strip(cells[1]), type = strip(cells[2]), side = team === usAbbr ? 'us' : 'them';
      const people = [...cells[3].matchAll(/#(\d+)\s*<a href="([^"]+)">([^<]+)<\/a>/g)].map(m => ({ nr: +m[1], pid: pidOf(m[2]), name: fixCase(m[3]) }));
      if (/goal/.test(ev[1])) {
        g.goals.push({ side, period, time, type: (type.match(/\(([A-Z]+)\)/) || [])[1] || '', pp: /\(PP/.test(type),
          scorer: people[0] ? people[0].name : null, a1: people[1] ? people[1].name : null, a2: people[2] ? people[2].name : null, video: null });
      } else if (/penalty/.test(ev[1])) {
        const pen = strip(cells[3]).match(/-\s*(.*?)\s*\((\d+)\s*min\)/);
        g.penalties.push({ side, period, time, player: people[0] ? people[0].name : null, min: pen ? +pen[2] : 2, reason: pen ? pen[1] : '' });
      } else if (/gk_in|gk_out/.test(ev[1]) && side === 'us' && people[0]) {
        g.goalies.push({ name: people[0].name, ev: /gk_in/.test(ev[1]) ? 'in' : 'out', time });
      }
    }
  }
  // overtime / shootout
  const titles = [...html.matchAll(/<span class="title">([^<]+)<\/span>/g)].map(m => m[1].trim());
  const pdata = strip((html.match(/id="periodData">([\s\S]*?)<\/div>\s*<div class="score/) || [])[1] || '');
  const so = titles.some(x => /metien|bull|shoot|\bSO\b/i.test(x)) || /\bSO\b|metien/i.test(pdata);
  const ot = !so && (titles.some(x => /papild|\bOT\b/i.test(x)) || /\bOT\b|papild/i.test(pdata) || g.goals.some(x => x.period >= 4));
  g.decided = so ? 'SO' : ot ? 'OT' : '';
  g.v = 2;   // reader version: older copies (wrong video link, no OT/SO) get read again once
  // our players' stats table (number, position, G, A, P, PIM)
  for (const tb of html.matchAll(/<table class="protocol-stats"><thead><tr><th[^>]*>#<\/th><th class="img-inlcuded"><a href="\/komandas\/[^"\/]+\/(\d+)"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/g)) {
    if (tb[1] !== String(ourClubId)) continue;
    for (const row of tb[2].matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const c = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => x[1]);
      const a = c[1] && c[1].match(/<a href="([^"]+)">([^<]+)<\/a>/); if (!a) continue;
      g.players.push({ nr: +strip(c[0]) || null, name: fixCase(a[2]), pid: pidOf(a[1]), ehl: 'https://ehl.entuziasti.com' + a[1],
        pos: ({ F: 'F', D: 'D', GK: 'G' })[strip(c[2])] || null, g: +strip(c[3]) || 0, a: +strip(c[4]) || 0, pim: +strip(c[6]) || 0 });
    }
  }
  // our goalie(s): shots and goals against while each was in net
  const tSec = s => { const [m, ss] = String(s).split(':').map(Number); return m * 60 + (ss || 0); };
  const ins = g.goalies.filter(x => x.ev === 'in');
  const stints = ins.map(x => { const out = g.goalies.find(y => y.ev === 'out' && y.name === x.name && tSec(y.time) >= tSec(x.time));
    return { name: x.name, from: tSec(x.time), to: out ? tSec(out.time) : 99999 }; });
  const totalTime = stints.reduce((s, x) => s + Math.max(0, Math.min(x.to, 3600) - x.from), 0) || 1;
  g.goalie = stints.length ? stints.map(x => ({ name: x.name,
    ga: g.goals.filter(q => q.side === 'them' && tSec(q.time) >= x.from && tSec(q.time) <= x.to).length,
    sa: Math.round(g.shots.them * Math.max(0, Math.min(x.to, 3600) - x.from) / totalTime) }))
    .sort((p, q) => q.sa - p.sa)[0] : null;
  g.goalieList = stints.length > 1 ? stints : undefined;
  delete g.goalies;
  return g;
}

const dir = path.join(__dirname, 'history');
fs.mkdirSync(dir, { recursive: true });
const outFile = path.join(dir, 'club-games.json'), progressFile = path.join(dir, 'progress.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 20000);
  try { const res = await fetch(url, { headers: HEADERS, signal: ctl.signal }); return { status: res.status, html: res.ok ? await res.text() : '' }; }
  catch (e) { return { status: 0, html: '' }; } finally { clearTimeout(t); }
}

(async () => {
  const out = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : { E7: [], E9: [] };
  const seen = new Set([...out.E7, ...out.E9].map(g => g.protocol));
  const progress = fs.existsSync(progressFile) ? JSON.parse(fs.readFileSync(progressFile, 'utf8')) : null;
  let id = progress && !progress.finished && progress.nextId ? progress.nextId : null;
  if (!id) {
    const home = await get(EHL + '/');
    const ids = [...home.html.matchAll(/\/protokols\/(\d+)/g)].map(m => +m[1]);
    if (!ids.length) { console.error('No protocol links found on the EHL front page. Stopping.'); process.exit(1); }
    id = Math.max(...ids);
  }
  console.log('starting at protocol', id);
  let scanned = 0, found = 0, oldInARow = 0;
  for (; id > 0 && scanned < MAX_PAGES; id--, scanned++) {
    const url = `${EHL}/protokols/${id}`;
    if (seen.has(url)) continue;
    const { status, html } = await get(url);
    await sleep(PAUSE_MS);
    if (status !== 200 || !html) continue;
    const dm = html.match(/<div class="date">\s*(\d{1,2})\.\s*([^,<]+),\s*(\d{4})/);
    const mo = dm ? LV_MONTH_FULL[dm[2].trim().toLowerCase()] : null;
    const date = dm && mo ? `${dm[3]}-${String(mo).padStart(2, '0')}-${dm[1].padStart(2, '0')}` : null;
    if (date && date < STOP_BEFORE) { if (++oldInARow >= 80) { console.log(`reached ${STOP_BEFORE} at protocol ${id}`); break; } continue; }
    if (date) oldInARow = 0;
    for (const [div, club] of Object.entries(OUR_CLUBS)) {
      if (!html.includes(`/komandas/`) || !new RegExp(`/komandas/[^"/]+/${club}[/"]`).test(html)) continue;
      const g = parseProtocol(html, url, club);
      if (!g || !g.played) continue;
      g.division = (html.match(/DIVĪZIJA:\s*([A-Z0-9]+)/) || [])[1] || null;
      out[div].push(g); seen.add(url); found++;
      console.log(`found ${div}: ${g.date} ${g.home.abbr} ${g.hg}:${g.ag} ${g.away.abbr} (${g.division || '?'})`);
    }
    if (scanned % 300 === 0) { console.log(`... protocol ${id}${date ? ' (' + date + ')' : ''}, ${found} games found`);
      fs.writeFileSync(outFile, JSON.stringify(out)); fs.writeFileSync(progressFile, JSON.stringify({ nextId: id - 1, finished: false })); }
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.date < b.date ? -1 : 1);
  fs.writeFileSync(outFile, JSON.stringify(out));
  const finished = scanned < MAX_PAGES;
  fs.writeFileSync(progressFile, JSON.stringify({ nextId: id - 1, finished, scanned, lastRun: new Date().toISOString() }, null, 2));
  console.log(`done: scanned ${scanned}, ${found} new games (E7 team: ${out.E7.length}, E9 team: ${out.E9.length}). ${finished ? 'Finished.' : 'Not finished - run again to continue.'}`);
})();
