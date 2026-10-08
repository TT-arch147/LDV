// One-time job: collects every Ledus Veči game (all three teams) from the EHL site back to the
// start of the 2024-2025 season, by walking the numbered game protocols from newest to oldest.
// Run it from GitHub: Actions -> "Collect EHL history" -> Run workflow. It does NOT run on a schedule.
//
// Output (committed to the repo by the workflow):
//   history/games.csv       one row per Ledus Veči game: season, date, team, home, away, score, protocol link
//   history/raw/<id>.html   the protocol page itself, so player stats can be extracted from it later
//   history/progress.json   where the scan got to, so a second run continues instead of starting over
const fs = require('fs');
const path = require('path');

const EHL = 'https://ehl.entuziasti.com';
const STOP_BEFORE = '2024-08-01';          // nothing older than the 2024-2025 season
const MAX_PAGES = 9000;                     // safety limit for one run
const PAUSE_MS = 300;                       // pause between pages, to go easy on the EHL site
const OUR_SLUGS = { 'ledus-veci': 'Ledus Veči', 'ledus-veci-ii': 'Ledus Veči II', 'ledus-veci-iii': 'Ledus Veči III' };
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'lv,en;q=0.8' };

const dir = path.join(__dirname, 'history'), rawDir = path.join(dir, 'raw');
fs.mkdirSync(rawDir, { recursive: true });
const progressFile = path.join(dir, 'progress.json'), csvFile = path.join(dir, 'games.csv');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: ctl.signal });
    return { status: res.status, html: res.ok ? await res.text() : '' };
  } catch (e) { return { status: 0, html: '' }; } finally { clearTimeout(t); }
}
const seasonOf = iso => { const [y, m] = iso.split('-').map(Number); return m >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`; };
const csvCell = v => /[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? '');
const slim = html => html.replace(/<head[\s\S]*?<\/head>/i, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');

(async () => {
  const progress = fs.existsSync(progressFile) ? JSON.parse(fs.readFileSync(progressFile, 'utf8')) : null;
  let rows = fs.existsSync(csvFile) ? fs.readFileSync(csvFile, 'utf8').trim().split('\n').slice(1) : [];
  const seen = new Set(rows.map(r => r.split(',').pop()));

  // start from the newest protocol number linked on the EHL front page (or where the last run stopped)
  let id = progress && !progress.finished ? progress.nextId : null;
  if (!id) {
    const home = await get(EHL + '/');
    const ids = [...home.html.matchAll(/\/protokols\/(\d+)/g)].map(m => +m[1]);
    if (!ids.length) { console.error('No protocol links found on the EHL front page (status ' + home.status + '). Stopping.'); process.exit(1); }
    id = Math.max(...ids);
    console.log('newest protocol on the front page:', id);
  }

  let scanned = 0, found = 0, oldInARow = 0, sampleLogged = false;
  for (; id > 0 && scanned < MAX_PAGES; id--, scanned++) {
    const { status, html } = await get(`${EHL}/protokols/${id}`);
    await sleep(PAUSE_MS);
    if (status !== 200 || !html) continue;
    const body = slim(html);
    const dm = body.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    const date = dm ? `${dm[3]}-${dm[2]}-${dm[1]}` : null;
    if (date && date < STOP_BEFORE) { if (++oldInARow >= 60) { console.log(`reached games older than ${STOP_BEFORE} at protocol ${id}`); break; } continue; }
    if (date) oldInARow = 0;

    const teams = [...body.matchAll(/\/komandas\/([a-z0-9-]+)\/(\d+)[^>]*>([\s\S]{0,200}?)<\/a>/g)]
      .map(m => ({ slug: m[1], name: m[3].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }));
    const uniq = []; teams.forEach(t => { if (!uniq.find(u => u.slug === t.slug)) uniq.push(t); });
    const ours = uniq.find(t => OUR_SLUGS[t.slug]);
    if (!ours || seen.has(`${EHL}/protokols/${id}`)) { if (scanned % 250 === 0) console.log(`... protocol ${id}${date ? ' (' + date + ')' : ''}, ${found} Ledus Veči games so far`); continue; }

    const [home, away] = [uniq[0], uniq[1]];
    const score = (body.match(/>\s*(\d{1,2})\s*[:\-–]\s*(\d{1,2})\s*</) || []).slice(1, 3).join('-');
    fs.writeFileSync(path.join(rawDir, `${id}.html`), body);
    rows.push([date ? seasonOf(date) : '', date || '', OUR_SLUGS[ours.slug], home && (home.name || home.slug), away && (away.name || away.slug), score, `${EHL}/protokols/${id}`].map(csvCell).join(','));
    seen.add(`${EHL}/protokols/${id}`); found++;
    console.log(`found: ${date} ${home && home.slug} - ${away && away.slug} ${score} (protocol ${id})`);
    if (!sampleLogged) { sampleLogged = true; console.log('sample of the page structure:', body.slice(0, 1500).replace(/\s+/g, ' ')); }
    if (found % 20 === 0) fs.writeFileSync(progressFile, JSON.stringify({ nextId: id - 1, finished: false }, null, 2));
  }

  rows.sort((a, b) => a.split(',')[1] < b.split(',')[1] ? -1 : 1);
  fs.writeFileSync(csvFile, 'season,date,team,home,away,score,protocol\n' + rows.join('\n') + '\n');
  const finished = scanned < MAX_PAGES;
  fs.writeFileSync(progressFile, JSON.stringify({ nextId: id - 1, finished, scanned, lastRun: new Date().toISOString() }, null, 2));
  console.log(`done: scanned ${scanned} protocols, ${found} new Ledus Veči games, ${rows.length} in total. ${finished ? 'Finished.' : 'Not finished yet - run the workflow again to continue.'}`);
})();
