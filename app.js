
const DATA = window.__LIVE_DATA;
// keep only the clock time (the EHL ribbon sometimes gives "sestdiena: 19:30")
(DATA.upcomingGames || []).forEach(g => { const m = String(g.time || '').match(/\d{1,2}:\d{2}/); if (m) g.time = m[0]; });
const LV_COLOR = (DATA.teamAssets['Ledus Veči'] && DATA.teamAssets['Ledus Veči'].accent) || '#830C67';
const DEFAULT_LOGO = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="none" stroke="%237C8A93" stroke-width="1.5"/></svg>');

// ---- team logos: always looked up in the logos folder first ----
// DATA.logoFiles (made by the refresh script) lists every file in the folder by a simplified name, so
// "APARĀTI.png", "aparati.png" or "Aparati.png" all match the team "Aparāti". Old names used in the game
// sheet are mapped to the names on the logo files below.
const LOGO_ALIAS = { 'Warriors':'Ice Warriors', 'Ice Wolves II':'Ice Wolves', 'Iecava/Mammoths':'Mammoths', 'Leģendas V':'Pilsētas Leģendas',
  'Sparta II':'Sparta 2', 'Moltto Plus':'Moltto', 'Cargo serviss':'Cargo Serviss' };
const logoKeyOf = n => String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
function logoFor(name){
  const files = DATA.logoFiles || {};
  for (const n of [name, LOGO_ALIAS[name]]) { const f = n && files[logoKeyOf(n)]; if (f) return f; }
  return null;
}
// every DATA.teamAssets[...] lookup on the site goes through this, so the folder wins everywhere
const RAW_ASSETS = DATA.teamAssets || {};
DATA.teamAssets = new Proxy(RAW_ASSETS, { get(t, k) {
  if (typeof k !== 'string') return t[k];
  const own = t[k], f = logoFor(k);
  if (!own && !f) return undefined;
  return { ...(own || { accent: '#7C8A93' }), logo: f || (own && own.logo) || null };
} });
function teamInfo(name){
  return DATA.teamAssets[name] || {accent:'#7C8A93', logo: null};
}
function teamColor(name){ return teamInfo(name).accent || '#7C8A93'; }
function teamLogo(name){ return teamInfo(name).logo || DEFAULT_LOGO; }

document.querySelector('.brand img').src = teamLogo('Ledus Veči');

let filteredGames = DATA.boxscores.slice();
let idx = filteredGames.length - 1;

const seasonSelect = document.getElementById('seasonSelect');
const seasons = [...new Set(DATA.boxscores.map(b=>b.season))];

// A season string is always "<Reg. Season|Playoffs> <year>", e.g.
// "Reg. Season 2024-2025" — the year is the last space-separated token.
// This groups them by year so each dropdown can offer a "Total" option
// (combining that year's regular season + playoffs) alongside the two
// individually, rather than a flat list of every season/playoffs entry.
function seasonYear(s){ return s.split(' ').pop(); }
function buildSeasonGroups(){
  const years = [];
  const byYear = {};
  seasons.forEach(s=>{
    const year = seasonYear(s);
    const type = s.includes('Playoffs') ? 'Playoffs' : 'Season';
    if(!byYear[year]){ byYear[year] = {}; years.push(year); }
    byYear[year][type] = s;
  });
  return years.map(year => ({year, season: byYear[year]['Season'], playoffs: byYear[year]['Playoffs']}));
}
function populateGroupedSeasonSelect(selectEl, allLabel){
  const optAll = document.createElement('option');
  optAll.value = 'ALL'; optAll.textContent = allLabel;
  selectEl.appendChild(optAll);
  buildSeasonGroups().forEach(g=>{
    const og = document.createElement('optgroup');
    og.label = g.year;
    const totalOpt = document.createElement('option');
    totalOpt.value = 'TOTAL:'+g.year; totalOpt.textContent = 'Total';
    og.appendChild(totalOpt);
    if(g.season){
      const so = document.createElement('option');
      so.value = g.season; so.textContent = 'Season';
      og.appendChild(so);
    }
    if(g.playoffs){
      const po = document.createElement('option');
      po.value = g.playoffs; po.textContent = 'Playoffs';
      og.appendChild(po);
    }
    selectEl.appendChild(og);
  });
}
// A row's own season is always a real "Reg. Season YEAR" / "Playoffs YEAR"
// string; the filter value picked in a dropdown can additionally be 'ALL'
// or 'TOTAL:YEAR' (matches either type, for that one year).
function matchesSeason(rowSeason, filterValue){
  if(filterValue==='ALL') return true;
  if(filterValue.startsWith('TOTAL:')) return seasonYear(rowSeason)===filterValue.slice(6);
  return rowSeason===filterValue;
}
function defaultSeasonValue(){
  return 'TOTAL:'+seasonYear(seasons[seasons.length-1]);
}
populateGroupedSeasonSelect(seasonSelect, 'All seasons');
seasonSelect.value = defaultSeasonValue();

const gameSelect = document.getElementById('gameSelect');

function seasonLogo(name){ return DATA.seasonAssets && DATA.seasonAssets[name]; }
function seasonLogoForFilter(filterValue){
  if(filterValue==='ALL') return null;
  if(filterValue.startsWith('TOTAL:')){
    const year = filterValue.slice(6);
    return seasonLogo('Reg. Season '+year) || seasonLogo('Playoffs '+year);
  }
  return seasonLogo(filterValue);
}

function rebuildGameList(){
  const season = seasonSelect.value;
  filteredGames = season==='ALL' ? DATA.boxscores.slice() : DATA.boxscores.filter(b=>matchesSeason(b.season, season));
  gameSelect.innerHTML = '';
  filteredGames.forEach((b,i)=>{
    const o = document.createElement('option');
    o.value = i;
    o.textContent = `${b.date} · ${b.homeTeam} vs ${b.awayTeam} (${b.htGoals}-${b.atGoals})`;
    gameSelect.appendChild(o);
  });
  idx = filteredGames.length - 1;
  gameSelect.value = idx;
  const navLogo = document.getElementById('seasonNavLogo');
  const logoSrc = season!=='ALL' ? seasonLogoForFilter(season) : null;
  navLogo.style.display = logoSrc ? '' : 'none';
  if(logoSrc) navLogo.src = logoSrc;
  updateNavButtons();
  render();
}
function updateNavButtons(){
  document.getElementById('prevGame').disabled = idx<=0;
  document.getElementById('nextGame').disabled = idx>=filteredGames.length-1;
}

seasonSelect.addEventListener('change', rebuildGameList);
gameSelect.addEventListener('change', ()=>{ idx = parseInt(gameSelect.value); updateNavButtons(); render(); });
document.getElementById('prevGame').addEventListener('click', ()=>{ if(idx>0){idx--; gameSelect.value=idx; updateNavButtons(); render();} });
document.getElementById('nextGame').addEventListener('click', ()=>{ if(idx<filteredGames.length-1){idx++; gameSelect.value=idx; updateNavButtons(); render();} });

// ---- site sections (Home / Stats / Calendar), each with its own address: #home, #stats, #calendar ----
const STATS_VIEWS = { overview:'overviewView', box:'boxView', stats:'statsView', team:'teamView', roster:'rosterView', methodology:'methodologyView' };
let currentStatsTab = 'overview';
function showSection(sec){
  if (!['home','stats','calendar','lv2','lv3'].includes(sec)) sec = 'home';
  document.querySelectorAll('.main-btn').forEach(b=>b.classList.toggle('active', b.dataset.section===sec));
  document.getElementById('homeView').classList.toggle('hidden', sec!=='home');
  document.getElementById('calendarView').classList.toggle('hidden', sec!=='calendar');
  ['lv2','lv3'].forEach(k => { const v = document.getElementById(k + 'View'); if (v) v.classList.toggle('hidden', sec !== k); });
  document.getElementById('statsBar').classList.toggle('hidden', sec!=='stats');
  Object.entries(STATS_VIEWS).forEach(([tab,id])=>document.getElementById(id).classList.toggle('hidden', !(sec==='stats' && tab===currentStatsTab)));
}
function goSection(sec){
  if (location.hash.slice(1) === sec) showSection(sec); else location.hash = sec;   // the hashchange below does the rest
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', ()=>showSection(location.hash.slice(1)));
document.querySelectorAll('.main-btn').forEach(b=>b.addEventListener('click', ()=>goSection(b.dataset.section)));
const brandHome = document.getElementById('brandHome');
brandHome.addEventListener('click', ()=>goSection('home'));
brandHome.addEventListener('keydown', e=>{ if (e.key==='Enter') goSection('home'); });

document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentStatsTab = btn.dataset.tab;
    if (location.hash.slice(1) !== 'stats') location.hash = 'stats';
    showSection('stats');
  });
});

function pct(a,b){ return (a+b)>0 ? Math.round((a/(a+b))*100) : 50; }
function goalRow(g, i){
  const assists = [g.a1, g.a2].filter(Boolean).map(playerLink).join(', ');
  const sitBadge = g.situation ? `<span class="sit-badge sit-${g.situation}">${g.situation}</span>` : '';
  return `<div class="goal-item">
    <span class="goal-num">${i+1}</span>
    <div>
      <div class="goal-scorer">${playerLink(g.scorer)} ${sitBadge}</div>
      ${assists ? `<div class="goal-assists">Assists: ${assists}</div>` : ''}
    </div>
    ${g.video ? `<a class="goal-video" href="${g.video}" target="_blank" rel="noopener">▶ video</a>` : ''}
  </div>`;
}

const LINEUP_ROWS = [
  {label:'fwd', slots:['1 LW','1 C','1 RW']},
  {label:'def', slots:['1 LD','1 RD']},
  {label:'fwd', slots:['2 LW','2 C','2 RW']},
  {label:'def', slots:['2 LD','2 RD']},
  {label:'fwd', slots:['3 LW','3 C','3 RW']},
  {label:'def', slots:['3 LD','3 RD']},
  {label:'gk', slots:['GK']},
];
const ROSTER_NR = {};
const ROSTER_POS = {};
const ROSTER_BY_NAME = {};
DATA.roster.forEach(p=>{ ROSTER_NR[p.name] = p.nr; ROSTER_POS[p.name] = p.position; ROSTER_BY_NAME[p.name] = p; });

// Team shot differential per game (LV shots for minus against) — a coarser,
// team-context "with this player in the lineup" signal, since we don't have
// true per-shift on-ice shot data. Used as a minor Defence component.
const GAME_SHOT_DIFF = {};
DATA.boxscores.forEach(b=>{
  const lv = b.lvIsHome ? b.htShots : b.atShots;
  const opp = b.lvIsHome ? b.atShots : b.htShots;
  GAME_SHOT_DIFF[b.date] = (lv!=null && opp!=null) ? (lv-opp) : null;
});
const DEFAULT_PHOTO = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23161D27"/><circle cx="50" cy="38" r="18" fill="%23586570"/><ellipse cx="50" cy="88" rx="32" ry="26" fill="%23586570"/></svg>');

// ---------------- Player stats tab (player-picker, adapts to skater/goalie) ----------------
const statsPlayerSelect = document.getElementById('statsPlayerSelect');
const statsSeasonSelect = document.getElementById('statsSeasonSelect');
const statsHighlightOnly = document.getElementById('statsHighlightOnly');

// build player list from whoever actually has rows, grouped by position
const skaterPlayers = [...new Set(DATA.skaterRows.map(r=>r.player))];
const goaliePlayers = [...new Set(DATA.goalieRows.map(r=>r.player))];
const fwdPlayers = skaterPlayers.filter(p=>ROSTER_POS[p]==='FWD').sort();
const defPlayers = skaterPlayers.filter(p=>ROSTER_POS[p]==='DEF').sort();
const otherSkaters = skaterPlayers.filter(p=>!fwdPlayers.includes(p) && !defPlayers.includes(p)).sort();
const gkPlayers = goaliePlayers.slice().sort();

function addOptGroup(label, names){
  if(!names.length) return;
  const grp = document.createElement('optgroup');
  grp.label = label;
  names.forEach(n=>{
    const o = document.createElement('option');
    o.value = n; o.textContent = n;
    grp.appendChild(o);
  });
  statsPlayerSelect.appendChild(grp);
}
addOptGroup('Forwards', fwdPlayers);
addOptGroup('Defense', defPlayers);
addOptGroup('Other', otherSkaters);
addOptGroup('Goalies', gkPlayers);
statsPlayerSelect.value = fwdPlayers[0] || skaterPlayers[0] || gkPlayers[0];

const KNOWN_PLAYERS = new Set([...skaterPlayers, ...goaliePlayers]);
function goToPlayerStats(name){
  statsPlayerSelect.value = name;
  statsSortState = {key:'date', dir:-1};
  renderStatsTab();
  document.querySelector('.tab-btn[data-tab="stats"]').click();
  window.scrollTo({top:0, behavior:'auto'});
}
function playerLink(name){
  if(!name) return '';
  if(KNOWN_PLAYERS.has(name)){
    const safe = name.replace(/'/g,"\'");
    return `<a href="javascript:void(0)" class="player-link" onclick="goToPlayerStats('${safe}')">${name}</a>`;
  }
  return name;
}

populateGroupedSeasonSelect(statsSeasonSelect, 'All seasons');
statsSeasonSelect.value = defaultSeasonValue();

let statsSortState = {key:'date', dir:-1};

const SKATER_COLS = [
  {key:'date', label:'Datums', left:true},
  {key:'opponent', label:'Pretinieks', left:true},
  {key:'g', label:'G'}, {key:'a', label:'A'},
  {key:'shAtt', label:'Shots'}, {key:'sh', label:'SOG'}, {key:'shPct', label:'Shot%'},
  {key:'bl', label:'BLK'}, {key:'pim', label:'PIM'}, {key:'pimA', label:'PIM/A'},
  {key:'pm', label:'+/-'}, {key:'pmAdj', label:'+/- adj'},
  {key:'fow', label:'FOW/FOT', sortable:false}, {key:'foPct', label:'FO%'},
];
const GOALIE_COLS = [
  {key:'date', label:'Datums', left:true},
  {key:'opponent', label:'Pretinieks', left:true},
  {key:'shotsFaced', label:'Shots faced'}, {key:'saves', label:'Saves'},
  {key:'ga', label:'GA'}, {key:'savePct', label:'SV%'},
];

function fmtPctVal(v){ return (v===null||v===undefined) ? '—' : Math.round(v*1000)/10+'%'; }
function fmtPM2(v){ return (v===null||v===undefined) ? '—' : ((v>0?'+':'')+v); }
function fmtNum(v){ return (v===null||v===undefined) ? '—' : v; }

function sortRows(rows, sortState){
  const k = sortState.key;
  rows.sort((a,b)=>{
    let av=a[k], bv=b[k];
    if(av===null||av===undefined) av = -Infinity;
    if(bv===null||bv===undefined) bv = -Infinity;
    if(typeof av==='string') return sortState.dir===1 ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortState.dir===1 ? (av-bv) : (bv-av);
  });
  return rows;
}

function buildHead(cols){
  document.getElementById('statsTableHead').innerHTML = cols.map(c=>{
    const cls = (c.sortable===false) ? '' : 'sortable';
    const align = c.left ? 'style="text-align:left"' : '';
    return `<th class="${cls}" data-key="${c.key}" ${align}>${c.label}</th>`;
  }).join('');
  document.querySelectorAll('#statsTable thead th.sortable').forEach(th=>{
    th.addEventListener('click', ()=>{
      const key = th.dataset.key;
      if(statsSortState.key===key) statsSortState.dir *= -1;
      else { statsSortState = {key, dir:-1}; }
      renderStatsTab();
    });
    if(th.dataset.key===statsSortState.key){
      const arrow=document.createElement('span');
      arrow.className='arrow';
      arrow.textContent = statsSortState.dir===1 ? '▲' : '▼';
      th.appendChild(arrow);
    }
  });
}

function goToBoxscoreGame(date){
  const game = DATA.boxscores.find(g=>g.date===date);
  if(!game) return;
  seasonSelect.value = game.season;
  rebuildGameList();
  const i = filteredGames.findIndex(g=>g.date===date);
  if(i>=0){ idx = i; gameSelect.value = idx; updateNavButtons(); render(); }
  document.querySelector('.tab-btn[data-tab="box"]').click();
  window.scrollTo({top:0, behavior:'auto'});
}

function renderGameDetail(date, player, isGoalie){
  const b = DATA.boxscores.find(x=>x.date===date);
  if(!b) return '<div class="detail-wrap">Game not found</div>';
  const oppTeam = b.lvIsHome ? b.awayTeam : b.homeTeam;
  const usGoals = b.lvIsHome ? b.htGoals : b.atGoals;
  const oppGoals = b.lvIsHome ? b.atGoals : b.htGoals;
  const resultText = b.result==='W' ? 'WIN' : b.result==='L' ? 'LOSS' : b.result==='D' ? 'DRAW' : '—';
  let highlightHtml = '';
  if(!isGoalie){
    const row = DATA.skaterRows.find(r=>r.player===player && r.date===date);
    const hls = (row && row.highlights) || [];
    highlightHtml = hls.length
      ? `<div style="margin-top:10px;display:flex;flex-direction:column;gap:6px;">` +
          hls.map(h=>`<a class="goal-video" href="${h.video}" target="_blank" rel="noopener">▶ Highlight — ${h.role}</a>`).join('') +
        `</div>`
      : `<div style="margin-top:10px;color:var(--text-faint);font-size:12.5px;">No highlight logged for this game</div>`;
  }
  return `<div class="detail-wrap">
    <div class="detail-head">
      <span class="name">Ledus Veči ${usGoals}–${oppGoals} ${oppTeam}</span>
      <a onclick="goToBoxscoreGame('${date}')">View full boxscore →</a>
    </div>
    <div style="display:flex;align-items:center;gap:10px;color:var(--text-dim);font-size:12.5px;">
      <span>${b.date} · ${b.season} · ${b.lvIsHome?'Home':'Away'}</span>
      <span class="result-badge ${b.result}">${resultText}</span>
    </div>
    ${highlightHtml}
  </div>`;
}

function wireStatsExpandableRows(colspan, player, isGoalie){
  const tbody = document.querySelector('#statsTable tbody');
  tbody.querySelectorAll('tr.expandable').forEach(row=>{
    row.addEventListener('click', ()=>{
      const next = row.nextElementSibling;
      const isOpen = next && next.classList.contains('detail-row');
      tbody.querySelectorAll('tr.detail-row').forEach(r=>r.remove());
      tbody.querySelectorAll('.chevron.open').forEach(c=>c.classList.remove('open'));
      if(isOpen) return;
      const date = row.dataset.date;
      const detailRow = document.createElement('tr');
      detailRow.className = 'detail-row';
      detailRow.innerHTML = `<td colspan="${colspan}">${renderGameDetail(date, player, isGoalie)}</td>`;
      row.after(detailRow);
      row.querySelector('.chevron').classList.add('open');
    });
  });
}

function renderPlayerCard(player, season, isGoalie){
  const info = ROSTER_BY_NAME[player] || {};
  document.getElementById('cardPhoto').src = DATA.playerPhotos[player] || DEFAULT_PHOTO;
  document.getElementById('cardName').textContent = player;
  const metaBits = [info.height, info.weight, info.handedness].filter(Boolean).join(' · ');
  document.getElementById('cardMeta').innerHTML =
    `<span class="badge ${info.position||''}">${info.position||'—'}</span>` +
    (info.nr!=null ? `<span>#${info.nr}</span>` : '') +
    (metaBits ? `<span>${metaBits}</span>` : '');
  const ehlLink = document.getElementById('cardEhl');
  if(info.ehl){ ehlLink.href = info.ehl; ehlLink.style.display = ''; }
  else { ehlLink.style.display = 'none'; }

  let statsHtml = '';
  if(isGoalie){
    let rows = DATA.goalieRows.filter(r=>r.player===player);
    if(season!=='ALL') rows = rows.filter(r=>matchesSeason(r.season, season));
    const gp = rows.length;
    const shotsFaced = rows.reduce((s,r)=>s+r.shotsFaced,0);
    const saves = rows.reduce((s,r)=>s+r.saves,0);
    const savePct = shotsFaced>0 ? Math.round((saves/shotsFaced)*1000)/10 : 0;
    const gaa = gp>0 ? Math.round(((shotsFaced-saves)/gp)*100)/100 : 0;
    const shutouts = rows.filter(r=>(r.shotsFaced-r.saves)===0).length;
    statsHtml = `<div class="card-stat-row">` + [
      {n:gp, l:'GP'}, {n:shotsFaced, l:'SHOTS FACED'}, {n:saves, l:'SAVES'},
      {n:shotsFaced-saves, l:'GA'}, {n:savePct+'%', l:'SV%'}, {n:gaa, l:'GAA'}, {n:shutouts, l:'SO'},
    ].map(s=>`<div class="card-stat"><div class="card-stat-num">${s.n}</div><div class="card-stat-label">${s.l}</div></div>`).join('') + `</div>`;
  } else {
    // Matches the workbook's Player info card exactly: Goals, Assists, Points,
    // Shots, Blocks, PIM, PIM Against, SH success %, GF, GA
    let rows = DATA.skaterRows.filter(r=>r.player===player);
    if(season!=='ALL') rows = rows.filter(r=>matchesSeason(r.season, season));
    const goals = rows.reduce((s,r)=>s+(r.g||0),0);
    const assists = rows.reduce((s,r)=>s+(r.a||0),0);
    const shots = rows.reduce((s,r)=>s+(r.sh||0),0);
    const blocks = rows.reduce((s,r)=>s+(r.bl||0),0);
    const pim = rows.reduce((s,r)=>s+(r.pim||0),0);
    const pimAgainst = rows.reduce((s,r)=>s+(r.pimA||0),0);
    const gf = rows.reduce((s,r)=>s+(r.gf||0),0);
    const ga = rows.reduce((s,r)=>s+(r.ga||0),0);
    const fot = rows.reduce((s,r)=>s+(r.fot||0),0);
    const fow = rows.reduce((s,r)=>s+(r.fow||0),0);
    const foPct = fot>0 ? Math.round((fow/fot)*1000)/10 : 0;
    const shPct = shots>0 ? Math.round((goals/shots)*1000)/10 : 0;
    const group1 = [
      {n:rows.length, l:'GP'}, {n:goals, l:'G'}, {n:assists, l:'A'}, {n:goals+assists, l:'P'},
      {n:shots, l:'SH'}, {n:shPct+'%', l:'SH%'},
    ];
    const group2 = [
      {n:blocks, l:'BLK'}, {n:pim, l:'PIM'}, {n:pimAgainst, l:'PIM/A'},
      {n:(gf-ga>0?'+':'')+(gf-ga), l:'GF−GA'}, {n:fot>0?`${fow}/${fot}`:'0/0', l:'FOW/FOT'}, {n:foPct+'%', l:'FO%'},
    ];
    const tile = s => `<div class="card-stat"><div class="card-stat-num">${s.n}</div><div class="card-stat-label">${s.l}</div></div>`;
    statsHtml = `
      <div class="card-stat-row">${group1.map(tile).join('')}</div>
      <div class="card-stat-row">${group2.map(tile).join('')}</div>
    `;
  }
  document.getElementById('cardStats').innerHTML = statsHtml;
}

let radarChartInstance = null;

function minMax(arr){
  return {min: Math.min(...arr), max: Math.max(...arr)};
}
function normScore(v, range, invert){
  if(range.max===range.min) return 5;
  let t = (v-range.min)/(range.max-range.min);
  if(invert) t = 1-t;
  return Math.round(Math.max(0,Math.min(1,t))*100)/10;
}
// Shot differential uses a fixed range (-8 to +12), not roster comparison —
// derived from this team's own actual per-player average range (-5.4 to
// +11.67), since there's no external benchmark the way Shot% has one. 0
// (break-even) lands at 4/10 rather than dead-center, since this team
// typically wins the shot battle, so merely breaking even is a bit below
// what's normal here.
function shotDiffScore(v){
  return Math.round(Math.max(0,Math.min(1,(v-(-8))/(12-(-8))))*100)/10;
}
// GA and Blocks also use fixed ranges now, same reasoning as Shot Diff —
// derived from this roster's own real per-player range rather than
// comparing players against each other each time the pool shifts.
// The "good" end (0.55) and "worst" end (1.2) were cross-checked against
// real NHL GA/60 benchmarks scaled down to an amateur ~15-min game: NHL
// "normal" (2.5-3.1 GA/60) scales to ~0.63-0.78/game, and NHL "shocking bad"
// (4.78 GA/60, a real cited outlier case) scales to ~1.2/game — which lines
// up almost exactly with this team's own observed worst-ever performance
// (1.19). Inverted since lower GA is better.
function gaFixedScore(v){
  return Math.round(Math.max(0,Math.min(1,1-((v-0.55)/(1.2-0.55))))*100)/10;
}
// Blocks-adjusted observed range was 0.00 to 1.59; ceiling set at 1.5 per
// discussion (slightly below the single observed outlier).
function blocksFixedScore(v){
  return Math.round(Math.max(0,Math.min(1,(v-0)/(1.5-0)))*100)/10;
}

function computeRadarData(player, season, isGoalie){
  if(isGoalie){
    let rows = DATA.goalieRows.filter(r=> matchesSeason(r.season, season));
    // Save% fixed range and Quality Start threshold both come from the real
    // EHL E5 league leaderboard (2024-25 and 2025-26, season + playoffs),
    // not this team's own roster or the NHL — the actual league this team
    // plays in. Regular season and playoffs get separate numbers since real
    // league data showed playoff SV% runs meaningfully higher across the
    // board (tighter, more defensive playoff hockey / teams leaning on
    // their best goalie). Cutoffs used when deriving these: 5+ GP for
    // season entries, 3+ GP for playoffs (playoffs have far fewer total
    // games, so a lower bar keeps a meaningful sample).
    //   Season (n=54):   10th pct 82.2%, median 87.8%, 90th pct 91.2%
    //   Playoffs (n=20):  10th pct 85.5%, median 89.7%, 90th pct 92.9%
    function savePctRangeFor(gSeason){
      return gSeason.includes('Playoffs') ? {min:0.86, max:0.93} : {min:0.82, max:0.91};
    }
    function qsThresholdFor(gSeason){
      return gSeason.includes('Playoffs') ? 0.897 : 0.878;
    }

    const byPlayer = {};
    rows.forEach(r=>{
      if(!byPlayer[r.player]) byPlayer[r.player] = {sf:0, sv:0, gp:0, qs:0, gameSvPcts:[]};
      const p = byPlayer[r.player];
      p.sf += r.shotsFaced; p.sv += r.saves; p.gp++;
      // Quality Start: this specific game's SV% met or beat the real EHL
      // median for that season type (Vollman's original NHL definition,
      // applied with our own league's actual threshold).
      const gameSvPct = r.shotsFaced>0 ? r.saves/r.shotsFaced : 0;
      if(gameSvPct >= qsThresholdFor(r.season)) p.qs++;
      p.gameSvPcts.push(gameSvPct);
    });
    const metrics = {};
    Object.entries(byPlayer).forEach(([name,p])=>{
      // Consistency = downside deviation of per-game SV% (lower = more
      // consistent), not full standard deviation. GAA was dropped for this
      // axis — it's largely just shots-faced-per-game combined with save
      // ability, so it mostly duplicated the Save% axis rather than adding
      // new information. Downside deviation only counts games BELOW the
      // baseline toward the penalty — a shutout or any great game above it
      // contributes zero, since "inconsistent" should mean having bad
      // nights, not having good ones.
      // The baseline itself excludes shutouts (SV%=100%): a shutout would
      // otherwise pull the average up and make ordinary good games look
      // "below average" and count against consistency when they aren't
      // really bad nights at all.
      const gp = p.gameSvPcts.length;
      const nonShutouts = p.gameSvPcts.filter(v=>v<1.0);
      const baseline = nonShutouts.length ? nonShutouts : p.gameSvPcts;
      const mean = baseline.reduce((a,b)=>a+b,0)/baseline.length;
      const downsideVariance = gp>0
        ? p.gameSvPcts.reduce((a,b)=>a+Math.pow(Math.min(0,b-mean),2),0)/gp
        : 0;
      const stdev = Math.sqrt(downsideVariance);
      metrics[name] = {
        savePct: p.sf>0 ? p.sv/p.sf : 0,
        qsPct: p.gp>0 ? p.qs/p.gp : 0,
        stdev, gp: p.gp,
      };
    });
    const vals = Object.values(metrics);
    if(!vals.length) return {labels:[], values:[]};
    // Same issue as skaters: a goalie with zero games in this scope would
    // otherwise default to 0/0/0 and normalize into a misleading score.
    if(!metrics[player]){
      return {labels:[], values:[]};
    }
    const m = metrics[player];
    // Consistency uses a fixed range (0-5.0 percentage points of downside
    // deviation), not roster comparison — with only a handful of goalies,
    // comparing them against each other is too noisy. 0-5.0pp is grounded
    // in this team's own observed spread (0.28-4.48pp across goalies with
    // 3+ games), not an NHL/league benchmark, since we don't have per-game
    // data for other teams' goalies to derive one from.
    const consistencyScore = Math.round(Math.max(0,Math.min(1,1-(m.stdev/0.05)))*100)/10;
    const svRange = savePctRangeFor((season==='ALL' || season.startsWith('TOTAL:')) ? 'Reg. Season' : season);
    const saveScore = normScore(m.savePct, svRange, false);
    // Quality Start % scored on a fixed 30-80% range (typical real QS%
    // spreads run roughly high-40s to high-80s across a season).
    const qsScore = Math.round(Math.max(0,Math.min(1,(m.qsPct*100-30)/(80-30)))*100)/10;
    return {
      labels: ['Save %','Quality Start %','Consistency'],
      values: [saveScore, qsScore, consistencyScore]
    };
  }
  let rows = DATA.skaterRows.filter(r=> matchesSeason(r.season, season));
  // The comparison pool (used only for min/max ranges) is wider than the
  // player's own selected scope: all regular-season games pooled together,
  // or all playoff games pooled together — not just the one season/playoff
  // run currently selected. This gives a much bigger, more stable sample
  // (avoids one freak game setting the ceiling for everyone) while still
  // keeping regular season and playoffs separate, since they play
  // differently (e.g. 3rd-line scoring drops much further in playoffs).
  // "All seasons" selected pools every game regardless of type.
  let poolRows;
  if(season==='ALL' || season.startsWith('TOTAL:')){
    poolRows = DATA.skaterRows;
  } else if(season.includes('Playoffs')){
    poolRows = DATA.skaterRows.filter(r=>r.season.includes('Playoffs'));
  } else {
    poolRows = DATA.skaterRows.filter(r=>r.season.includes('Reg. Season'));
  }
  // Points multiplier is based on top-scorer output by position across three
  // reference points (regular seasons: 35 F/18 D and 32 F/20 D; playoffs:
  // 16 F/9 D), averaged into one multiplier pair used everywhere.
  const pointsMult = {FWD:0.784, DEF:1.387};

  // Shots and blocks multipliers, derived from this roster's actual per-game
  // rates (overall average ÷ position average, min 5 GP).
  const MULT = {
    FWD: {points:pointsMult.FWD, shots:0.86, blocks:1.44},
    DEF: {points:pointsMult.DEF, shots:1.34, blocks:0.68},
  };
  function multFor(position){ return MULT[position] || MULT.FWD; }

  // GA-against gets its own line multiplier, separate from the Offence one
  // (goals against scales with ice time the same way goals for does, but
  // the shape of that scaling is different from scoring). Derived from this
  // roster's actual GA/game by line, forwards and defensemen pooled
  // together into one shared set. Playoffs gets its own, more pronounced
  // version — benches shorten in playoff hockey, so 3rd liners play a lot
  // less relative to the top two lines than they do in the regular season.
  // Values are dampened halfway between the regular-season multiplier and
  // the full playoff-data-derived one, rather than applied at full strength.
  const GA_LINE_MULT = {
    regular: {'1':0.88, '2':0.98, '3':1.19},
    playoffs: {'1':0.78, '2':1.00, '3':1.50},
  };
  function gaLineMultFor(lineSlot, season){
    const lineNum = lineSlot ? lineSlot[0] : null;
    const table = (season && season.includes('Playoffs')) ? GA_LINE_MULT.playoffs : GA_LINE_MULT.regular;
    return table[lineNum] || 1.0;
  }

  // Line multiplier: only line 3 gets adjusted (1st vs 2nd have roughly
  // equal ice time in practice, so no adjustment between them). At the
  // amateur level, ice time isn't the main driver of the line-3 scoring gap
  // the way it is in the NHL — shifts are rolled more evenly — so this is
  // grounded in this roster's own actual scoring gap instead: top-2-line
  // average was 0.554 pts/game vs 0.190 for line 3, a 2.92x gap, dampened
  // slightly to 2.1x rather than applied in full. Same multiplier applied
  // to both forwards and defensemen.
  const LINE_MULT = {
    FWD: {'1':1.0, '2':1.0, '3':2.1},
    DEF: {'1':1.0, '2':1.0, '3':2.1},
  };
  function lineMultFor(position, lineSlot){
    const lineNum = lineSlot ? lineSlot[0] : null;
    const table = LINE_MULT[position];
    return (table && table[lineNum]) || 1.0;
  }

  // Position for the goal/assist/shot multiplier is read from what the
  // player actually played THAT GAME (the line-slot letters), not their
  // usual roster position — a defenseman filling in at forward for one
  // game (line slot like "3RW") should get the forward multiplier for that
  // game, not have the defense multiplier wrongly stack with the line-3
  // multiplier on top of a forward performance.
  function positionFromLineSlot(lineSlot){
    if(!lineSlot) return null;
    const suffix = lineSlot.slice(1);
    if(suffix==='LW'||suffix==='C'||suffix==='RW') return 'FWD';
    if(suffix==='LD'||suffix==='RD') return 'DEF';
    return null;
  }

  function buildMetrics(rowSet){
    const byPlayer = {};
    rowSet.forEach(r=>{
      if(!byPlayer[r.player]) byPlayer[r.player] = {
        goalsAdjSum:0, assistsAdjSum:0, shotsAdjSum:0, gaAdjSum:0,
        shAtt:0, bl:0, pim:0, pimA:0, fot:0, fow:0, g:0, sh:0, gp:0, shotDiffSum:0,
      };
      const p = byPlayer[r.player];
      const gamePosition = positionFromLineSlot(r.lineSlot) || ROSTER_POS[r.player];
      const mult = multFor(gamePosition);
      const lineMult = lineMultFor(gamePosition, r.lineSlot);
      const gaLineMult = gaLineMultFor(r.lineSlot, r.season);
      // Goals, assists and shots get BOTH the position multiplier and this
      // game's line multiplier, applied per game (since line can change game
      // to game) before being summed into a season total. Primary and
      // secondary assists are combined into one weighted "assist value" here
      // — a primary assist = 1.0, a secondary = 0.538 (same 1.857:1 ratio as
      // before, just anchored to a full primary assist instead of two
      // fractions) — rather than kept separate, since normalizing them
      // independently would let a player with mostly secondary assists get
      // unfairly tanked by a near-zero primary score eating up most of the
      // assist weight, even with a solid total assist count.
      const assistValue = (r.aPrimary||0)*1.0 + (r.aSecondary||0)*0.538;
      p.goalsAdjSum += (r.g||0) * mult.points * lineMult;
      p.assistsAdjSum += assistValue * mult.points * lineMult;
      p.shotsAdjSum += (r.sh||0) * mult.shots * lineMult;
      // GA-against uses its own line multiplier (see GA_LINE_MULT above),
      // not the Offence one and no cross-position bridge — the position gap
      // in raw GA/game was small (~5%) compared to line's effect. It also
      // uses gaWeighted instead of raw GA where available: on games with
      // zero GF, +/- adj reflects only the GA side, so its situational
      // weighting (PK goals against count less, ~0.8x; goals against while
      // on the power play count more, ~1.25x) can be read directly back out
      // as -( +/- adj ). Mixed GF-and-GA games can't be cleanly split this
      // way, so those fall back to plain GA (weight 1.0).
      p.gaAdjSum += (r.gaWeighted!=null ? r.gaWeighted : (r.ga||0)) * gaLineMult;
      p.shAtt+=r.shAtt||0; p.bl+=r.bl||0;
      p.pim+=r.pim||0; p.pimA+=r.pimA||0; p.fot+=r.fot||0; p.fow+=r.fow||0;
      p.g+=r.g||0; p.sh+=r.sh||0;
      const gsd = GAME_SHOT_DIFF[r.date];
      p.shotDiffSum += (gsd!=null ? gsd : 0);
      p.gp++;
    });

    const metrics = {};
    Object.entries(byPlayer).forEach(([name,p])=>{
      const position = ROSTER_POS[name];
      const mult = multFor(position);
      const blocksPerGame = p.gp>0 ? p.bl/p.gp : 0;
      metrics[name] = {
        position, gp: p.gp,
        pimPerGame: p.gp>0 ? p.pim/p.gp : 0,
        pimAgainstPerGame: p.gp>0 ? p.pimA/p.gp : 0,
        faceoffPct: p.fot>0 ? p.fow/p.fot : null,
        fot: p.fot,
        // Shot% and SOG% are NOT multiplied — each already reflects position
        // naturally. Only their relative importance in the blend differs.
        shotPct: p.sh>0 ? p.g/p.sh : null,
        sogPct: p.shAtt>0 ? p.sh/p.shAtt : null,
        // Goals, assists and shots are on very different natural scales, so
        // each is normalized to 0-10 on its own before being blended by
        // importance — adding the raw numbers directly would let volume stats
        // dominate. Position AND line multipliers were already applied per
        // game when these sums were built.
        goalsAdj: p.gp>0 ? p.goalsAdjSum/p.gp : 0,
        assistsAdj: p.gp>0 ? p.assistsAdjSum/p.gp : 0,
        shotsAdj: p.gp>0 ? p.shotsAdjSum/p.gp : 0,
        blocksAdj: blocksPerGame*mult.blocks,
        gaAdj: p.gp>0 ? p.gaAdjSum/p.gp : 0,
        shotDiffAdj: p.gp>0 ? p.shotDiffSum/p.gp : 0,
      };
    });
    return metrics;
  }

  // Pool metrics (from the wider season-type pool) supply the min/max
  // ranges used for normalization; the target player's own numbers are
  // computed separately from just their selected scope (rows), so the
  // number shown reflects what they actually did in that selection while
  // being judged against a bigger, steadier comparison set.
  const poolMetrics = buildMetrics(poolRows);
  const vals = Object.values(poolMetrics);
  if(!vals.length) return {labels:[], values:[]};
  const goalsAdjR = minMax(vals.map(v=>v.goalsAdj));
  const assistsAdjR = minMax(vals.map(v=>v.assistsAdj));
  const shotsAdjR = minMax(vals.map(v=>v.shotsAdj));
  const pimAgainstR = minMax(vals.map(v=>v.pimAgainstPerGame));
  const shotPctVals = vals.filter(v=>v.shotPct!=null).map(v=>v.shotPct);
  const shotPctR = shotPctVals.length ? minMax(shotPctVals) : {min:0,max:1};
  const sogPctVals = vals.filter(v=>v.sogPct!=null).map(v=>v.sogPct);
  const sogPctR = sogPctVals.length ? minMax(sogPctVals) : {min:0,max:1};
  // PIM/game is normalized against same-position peers only: defensemen and
  // forwards take penalties at different rates for different reasons, so
  // comparing across positions isn't a fair "discipline" read.
  const fwdPimVals = vals.filter(v=>v.position==='FWD').map(v=>v.pimPerGame);
  const defPimVals = vals.filter(v=>v.position==='DEF').map(v=>v.pimPerGame);
  const pimRByPos = {
    FWD: fwdPimVals.length ? minMax(fwdPimVals) : minMax(vals.map(v=>v.pimPerGame)),
    DEF: defPimVals.length ? minMax(defPimVals) : minMax(vals.map(v=>v.pimPerGame)),
  };

  const ownMetrics = buildMetrics(rows);
  // If the player has zero games in the selected scope, their stats would
  // default to 0/null — but 0 isn't necessarily the bottom of the pool's
  // range, so it would normalize into some misleading non-empty score
  // instead of correctly showing "no data".
  if(!ownMetrics[player]){
    return {labels:[], values:[]};
  }
  const m = ownMetrics[player];
  const position = ROSTER_POS[player];
  // Shot% vs SOG% importance split differs by position: Shot% (finishing)
  // matters more for forwards, SOG% (getting it through) matters more for D.
  const shootW = position==='DEF' ? {shotPct:0.4, sogPct:0.6} : {shotPct:0.7, sogPct:0.3};
  // Offence importance: Goals 48% / Assists 32% / Shots 20% (scoring keeps
  // an 80/20 split against shot volume; within scoring, goals count 60/40
  // over assists). Assists themselves are a single weighted value (primary
  // counted at 65%, secondary at 35%) combined and normalized once — see
  // where assistValue is built above — rather than normalized separately,
  // so a player heavy on secondary assists isn't unfairly penalized.
  const offW = {goals:0.48, assists:0.32, shots:0.20};
  // GA vs Blocks vs team Shot Differential importance for Defence. GA and
  // Blocks are both individually attributable to the player; Shot Diff is a
  // coarser "team performance in games this player played" signal (we don't
  // have true per-shift on-ice shot data), so it gets a smaller share.
  const defW = {ga:0.40, blocks:0.40, shotDiff:0.20};

  const offence = offW.goals*normScore(m.goalsAdj,goalsAdjR,false)
                + offW.assists*normScore(m.assistsAdj,assistsAdjR,false)
                + offW.shots*normScore(m.shotsAdj,shotsAdjR,false);
  // Penalties drawn ("PIM Against") create power-play chances, so they're a
  // small offensive bonus on top of the points/shots score — capped at +1,
  // not blended in as a full weighted component.
  const pimAgainstBonus = normScore(m.pimAgainstPerGame, pimAgainstR, false)/10;
  const offenceWithBonus = Math.min(10, offence + pimAgainstBonus);
  // Shot% uses a fixed real-world range, same logic as Faceoffs: a genuinely
  // bad shooting % is around 2% (worst-ever forward career mark is 4.3%;
  // slumping players dip to ~2-3%; undefended point shots run ~1%), elite
  // shooters sit around 18% (top active leaders: Draisaitl 18.6%, Point
  // 18.4%). The actual league average (~9.5%) lands near the midpoint.
  const shotPctScore = Math.max(0,Math.min(1,((m.shotPct ?? 0)-0.02)/(0.18-0.02)))*10;
  const shooting = shootW.shotPct*shotPctScore + shootW.sogPct*normScore(m.sogPct ?? 0, sogPctR, false);
  const defence = defW.ga*gaFixedScore(m.gaAdj)
                + defW.blocks*blocksFixedScore(m.blocksAdj)
                + defW.shotDiff*shotDiffScore(m.shotDiffAdj);
  const discipline = normScore(m.pimPerGame, pimRByPos[position] || minMax(vals.map(v=>v.pimPerGame)), true);

  const labels = ['Offence','Shooting','Defence','Discipline'];
  const values = [
    Math.round(offenceWithBonus*10)/10, Math.round(shooting*10)/10,
    Math.round(defence*10)/10, discipline,
  ];
  if(m.fot>0){
    labels.push('Faceoffs');
    // Fixed range: 40% win rate maps to 0, 60% maps to 10 (clamped)
    const foScore = Math.round(Math.max(0,Math.min(1,(m.faceoffPct-0.40)/(0.60-0.40)))*100)/10;
    values.push(foScore);
  }
  return {labels, values};
}

function renderRadarChart(player, season, isGoalie){
  const {labels, values} = computeRadarData(player, season, isGoalie);
  const canvas = document.getElementById('radarChart');
  const emptyMsg = document.getElementById('radarEmptyMsg');
  if(!labels.length){
    if(radarChartInstance){ radarChartInstance.destroy(); radarChartInstance = null; }
    canvas.style.display = 'none';
    emptyMsg.style.display = '';
    return;
  }
  canvas.style.display = '';
  emptyMsg.style.display = 'none';
  const ctx = canvas.getContext('2d');
  if(radarChartInstance) radarChartInstance.destroy();
  radarChartInstance = new Chart(ctx, {
    type: 'radar',
    data: {
      labels,
      datasets: [{
        label: player,
        data: values,
        backgroundColor: 'rgba(131,12,103,0.28)',
        borderColor: LV_COLOR,
        pointBackgroundColor: LV_COLOR,
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      devicePixelRatio: Math.max(2, window.devicePixelRatio || 1),
      scales: {
        r: {
          min: 0, max: 10,
          ticks: { display:false, stepSize:2, backdropColor:'transparent' },
          grid: { color: '#232B36' },
          angleLines: { color: '#232B36' },
          pointLabels: { color: '#8A99A3', font: { family:'Inter', size: 11 } }
        }
      },
      plugins: { legend: { display:false } }
    }
  });
}


// ---------------- one player, several teams ----------------
// A player can play for Ledus Veči (E5), II (E7) and III (E9). Teams are matched by EHL person id, then by name.
const TEAM_LABEL = { E5: 'Ledus Veči', E7: 'Ledus Veči II', E9: 'Ledus Veči III' };
const personIdOf = url => ((String(url || '').match(/\/personas\/[a-z0-9-]+\/(\d+)/) || [])[1]) || null;
function playerTeams(name, ehl){
  const id = personIdOf(ehl || (ROSTER_BY_NAME[name] && ROSTER_BY_NAME[name].ehl)), out = [];
  const inE5 = DATA.skaterRows.some(r => r.player === name) || (DATA.goalieRows || []).some(r => r.player === name) || !!ROSTER_BY_NAME[name];
  if (inE5) out.push('E5');
  ['E7', 'E9'].forEach(div => {
    const R = DATA.teamRosters || {}, ids = (R.teams && R.teams[div]) || [];
    const inRoster = ids.some(pid => { const pp = R.people && R.people[pid]; return pp && ((id && personIdOf(pp.ehl) === id) || pp.name === name); });
    const inStats = ((DATA.clubPlayers && DATA.clubPlayers[div]) || []).some(p => p.name === name || (id && personIdOf(p.ehl) === id));
    if (inRoster || inStats) out.push(div);
  });
  return out;
}
function openPlayerInTeam(div, name){
  if (div === 'E5') { location.hash = 'stats'; goToPlayerStats(name); return; }
  const view = document.getElementById(div === 'E7' ? 'lv2View' : 'lv3View'); if (!view) return;
  location.hash = div === 'E7' ? 'lv2' : 'lv3';
  if (view._openPlayer) view._openPlayer(name);
  window.scrollTo(0, 0);
}
const teamSelectHtml = (name, ehl, current) => { let teams = playerTeams(name, ehl); if (current !== 'E5') teams = teams.filter(d => d !== 'E5'); if (!teams.includes(current)) teams.unshift(current);
  return teams.map(d => `<option value="${d}"${d === current ? ' selected' : ''}>${TEAM_LABEL[d]} (${d})</option>`).join(''); };


// overtime / shootout: E5 from the game sheet (OT period played; goals in OT = OT, none = shootout),
// II / III from the EHL protocol
function decidedBy(b){
  const ot = b && b.periods && b.periods.OT;
  if (!ot || ot.s == null && ot.sa == null && ot.g == null && ot.ga == null) return '';
  return (ot.g || 0) + (ot.ga || 0) > 0 ? 'OT' : 'SO';
}
const otTag = d => d ? ` <span class="ot-tag" title="${d === 'OT' ? 'papildlaikā' : 'pēcspēles metienos'}">${d}</span>` : '';
const DECIDED = {}; DATA.boxscores.forEach(b => { DECIDED[b.date] = decidedBy(b); });

// opponent cell for the player game log: "vs" (home) or "@" (away), plus the team logo
const GAME_HOME = {}; DATA.boxscores.forEach(b => { GAME_HOME[b.date] = b.lvIsHome; });
const OPP_ALIAS = { 'Warriors':'Ice Warriors', 'Ice Wolves II':'Ice Wolves', 'Iecava/Mammoths':'Mammoths', 'Leģendas V':'Pilsētas Leģendas', 'Sparta II':'Sparta 2', 'Moltto Plus':'Moltto' };
function oppCell(r){
  const info = (DATA.teamAssets || {})[OPP_ALIAS[r.opponent] || r.opponent];
  const home = GAME_HOME[r.date];
  const ha = home === undefined ? '' : (home ? 'vs' : '@');
  return `<span class="opp-cell"><span class="ha">${ha}</span>${info && info.logo ? `<img src="${teamLogo(OPP_ALIAS[r.opponent] || r.opponent)}" alt="">` : ''}${r.opponent}</span>`;
}

function renderStatsTab(){
  (function(){ const ts = document.getElementById('statsTeamSelect'); if (!ts) return; const n = statsPlayerSelect.value;
    ts.innerHTML = teamSelectHtml(n, null, 'E5'); ts.style.display = ts.options.length > 1 ? '' : 'none';
    if (typeof STATS_TEAM !== 'undefined' && STATS_TEAM !== 'E5' && [...ts.options].some(o => o.value === STATS_TEAM)) { ts.value = STATS_TEAM; showOtherTeam(); }
    else document.getElementById('statsView').classList.remove('show-other'); })();
  const player = statsPlayerSelect.value;
  const season = statsSeasonSelect.value;
  const isGoalie = ROSTER_POS[player]==='GK' || gkPlayers.includes(player);

  renderPlayerCard(player, season, isGoalie);
  renderRadarChart(player, season, isGoalie);
  document.getElementById('statsHighlightOnly').closest('.highlight-toggle').style.display = isGoalie ? 'none' : '';

  if(isGoalie){
    let rows = DATA.goalieRows.filter(r=>r.player===player);
    if(season!=='ALL') rows = rows.filter(r=>matchesSeason(r.season, season));
    if(!GOALIE_COLS.find(c=>c.key===statsSortState.key)) statsSortState = {key:'date', dir:-1};
    sortRows(rows, statsSortState);
    buildHead(GOALIE_COLS);
    document.querySelector('#statsTable tbody').innerHTML = rows.map(r=>`
      <tr class="expandable" data-date="${r.date}">
        <td style="text-align:left"><span class="chevron">▶</span>${r.date}</td>
        <td style="text-align:left">${oppCell(r)}</td>
        <td>${r.shotsFaced}</td><td>${r.saves}</td><td>${r.ga}</td><td>${r.savePct}%</td>
      </tr>`).join('') || `<tr><td colspan="6" style="color:var(--text-dim);text-align:center;padding:20px;">No games in this range</td></tr>`;
    wireStatsExpandableRows(6, player, true);
  } else {
    let rows = DATA.skaterRows.filter(r=>r.player===player);
    if(season!=='ALL') rows = rows.filter(r=>matchesSeason(r.season, season));
    if(statsHighlightOnly.checked) rows = rows.filter(r=>r.highlights && r.highlights.length);
    if(!SKATER_COLS.find(c=>c.key===statsSortState.key)) statsSortState = {key:'date', dir:-1};
    sortRows(rows, statsSortState);
    buildHead(SKATER_COLS);
    document.querySelector('#statsTable tbody').innerHTML = rows.map(r=>{
      const foRatio = (r.fot!=null && r.fot>0) ? `${r.fow}/${r.fot}` : (r.fot===0 ? '0/0' : '—');
      return `<tr class="expandable" data-date="${r.date}">
        <td style="text-align:left"><span class="chevron">▶</span>${r.date}</td>
        <td style="text-align:left">${oppCell(r)}</td>
        <td>${r.g}</td><td>${r.a}</td>
        <td>${fmtNum(r.shAtt)}</td><td>${fmtNum(r.sh)}</td><td>${fmtPctVal(r.shPct)}</td>
        <td>${fmtNum(r.bl)}</td><td>${fmtNum(r.pim)}</td><td>${fmtNum(r.pimA)}</td>
        <td>${fmtPM2(r.pm)}</td><td>${fmtPM2(r.pmAdj)}</td>
        <td>${foRatio}</td><td>${fmtPctVal(r.foPct)}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="14" style="color:var(--text-dim);text-align:center;padding:20px;">No games in this range</td></tr>`;
    wireStatsExpandableRows(14, player, false);
  }
}

let STATS_TEAM = 'E5';   // team chosen in the Player stats team picker
statsPlayerSelect.addEventListener('change', ()=>{ STATS_TEAM = 'E5'; statsSortState = {key:'date', dir:-1}; renderStatsTab(); });
statsSeasonSelect.addEventListener('change', renderStatsTab);
statsHighlightOnly.addEventListener('change', renderStatsTab);

function render(){
  const b = filteredGames[idx];
  const homeColor = teamColor(b.homeTeam);
  const awayColor = teamColor(b.awayTeam);

  document.getElementById('sbMeta').textContent = `${b.date}  ·  ${b.season}`;
  const sbLogo = document.getElementById('sbSeasonLogo');
  const sLogo = seasonLogo(b.season);
  sbLogo.style.display = sLogo ? '' : 'none';
  if(sLogo) sbLogo.src = sLogo;
  document.getElementById('sbHomeName').textContent = b.homeTeam;
  document.getElementById('sbHomeName').style.color = homeColor;
  document.getElementById('sbAwayName').textContent = b.awayTeam;
  document.getElementById('sbAwayName').style.color = awayColor;
  document.getElementById('sbHomeLogo').src = teamLogo(b.homeTeam);
  document.getElementById('sbAwayLogo').src = teamLogo(b.awayTeam);
  document.getElementById('sbHomeGoals').textContent = b.htGoals ?? '–';
  document.getElementById('sbAwayGoals').textContent = b.atGoals ?? '–';
  const resEl = document.getElementById('sbResult');
  const resultText = b.result==='W' ? 'WIN' : b.result==='L' ? 'LOSS' : b.result==='D' ? 'DRAW' : '—';
  const dcd = decidedBy(b);
  resEl.textContent = resultText + (dcd === 'OT' ? ' (OT)' : dcd === 'SO' ? ' (SO)' : '');
  resEl.className = 'result-badge ' + (b.result||'');
  document.getElementById('sbOtg').innerHTML = b.otg ? `Player of the game: <b>${playerLink(b.otg)}</b>` : '';

  document.getElementById('goalHomeTitle').innerHTML = `<img src="${teamLogo(b.homeTeam)}" alt=""> <span style="color:${homeColor}">${b.homeTeam.toUpperCase()}</span>`;
  document.getElementById('goalAwayTitle').innerHTML = `<img src="${teamLogo(b.awayTeam)}" alt=""> <span style="color:${awayColor}">${b.awayTeam.toUpperCase()}</span>`;
  document.getElementById('goalHomeList').innerHTML = b.htGoalLog.length ? b.htGoalLog.map(goalRow).join('') : '<span class="empty-note">No goals logged</span>';
  document.getElementById('goalAwayList').innerHTML = b.atGoalLog.length ? b.atGoalLog.map(goalRow).join('') : '<span class="empty-note">No goals logged</span>';

  const stats = [
    {label:'Shots on goal', h:b.htShots, a:b.atShots},
    {label:'Faceoffs won', h:b.htFO, a:b.atFO},
    {label:'Penalty minutes', h:b.htPIM, a:b.atPIM},
    {label:'Icings', h:b.htIcings, a:b.atIcings},
    {label:'Offsides', h:b.htOffsides, a:b.atOffsides},
  ];
  document.getElementById('compareBars').innerHTML = stats.map(s=>{
    const hv = s.h ?? 0, av = s.a ?? 0;
    const hp = pct(hv, av);
    return `<div class="compare-row">
      <div class="compare-labels"><span class="h">${hv}</span><span class="mid">${s.label}</span><span class="a">${av}</span></div>
      <div class="compare-bar"><div style="width:${hp}%;background:${homeColor}"></div><div style="width:${100-hp}%;background:${awayColor}"></div></div>
    </div>`;
  }).join('') + ((b.pp!=null || b.pk!=null) ? [
    { label: 'Power play', made: b.ppScored ?? 0, of: b.pp ?? 0 },
    { label: 'Penalty kill', made: b.pkScored ?? 0, of: b.pk ?? 0 },
  ].map((s, i) => {
    const pct2 = s.of ? Math.round(s.made / s.of * 100) : 0;
    return `<div class="compare-row"${i === 0 ? ' style="margin-top:18px;border-top:1px solid var(--line);padding-top:14px;"' : ''}>
      <div class="compare-labels"><span class="h">${s.made} / ${s.of}</span><span class="mid">${s.label}</span><span class="a">${pct2}%</span></div>
      <div class="compare-bar"><div style="width:${pct2}%;background:${homeColor}"></div><div style="width:${100-pct2}%;background:var(--panel2)"></div></div>
    </div>`;
  }).join('') : '');

  const periods = ['1st','2nd','3rd','OT'];
  document.querySelector('#periodTable tbody').innerHTML = periods.map(p=>{
    const d = b.periods[p];
    if(d.s==null && d.sa==null && d.fow==null && d.g==null && d.ga==null) return '';
    return `<tr><td>${p}</td><td>${d.g ?? '—'}</td><td>${d.ga ?? '—'}</td><td>${d.s ?? '—'}</td><td>${d.sa ?? '—'}</td><td>${d.fow ?? '—'}</td><td>${d.fol ?? '—'}</td></tr>`;
  }).join('') || '<tr><td colspan="7" style="color:var(--text-faint);">No period data</td></tr>';

  const rink = document.getElementById('lineupRink');
  const slotSkater = name => b.skaters.find(s => s.player === name);
  const slotGoalie = name => b.goalies.find(s => s.player === name);
  if(Object.keys(b.lineup).length){
    rink.innerHTML = LINEUP_ROWS.map(row=>{
      const cls = row.label==='def' ? 'rink-row def' : row.label==='gk' ? 'rink-row gk' : 'rink-row';
      return `<div class="${cls}">` + row.slots.map(slot=>{
        const name = b.lineup[slot];
        // both forward and defense slots show bare position (no line number)
        const label = row.label==='gk' ? slot : slot.replace(/^\d+\s*/,'');
        const nr = name ? ROSTER_NR[name] : null;
        const photo = name ? (DATA.playerPhotos && DATA.playerPhotos[name]) : null;
        // number + first name(s) on the first row, surname on the second
        let nameHtml = '—';
        if (name) {
          const parts = name.split(' '), last = parts.length > 1 ? parts.pop() : '', first = parts.join(' ');
          const inner = `<span class="nw">${nr!=null ? `<span class="slot-nr">#${nr}</span> ` : ''}${first}</span>${last ? '<br>' + last : ''}`;
          nameHtml = KNOWN_PLAYERS.has(name) ? `<a href="javascript:void(0)" class="player-link" onclick="goToPlayerStats('${name.replace(/'/g, "\\'")}')">${inner}</a>` : inner;
        }
        let statLine = '';
        if (name) {
          const sk = slotSkater(name);
          if (sk) statLine = `${sk.g}G ${sk.a}A · ${sk.pim}PIM`;
          else { const gk = slotGoalie(name); if (gk) statLine = `${gk.saves}/${gk.shotsFaced} SV · ${gk.savePct ?? '—'}%`; }
        }
        const photoHtml = photo ? `<img class="slot-photo" src="${photo}" alt="">` : (name ? `<div class="slot-photo slot-photo-empty"></div>` : '');
        return `<div class="slot" data-n="${name || ''}" style="border-color:${name?LV_COLOR+'55':'var(--line)'}">${photoHtml}<div class="slot-label">${label}</div><div class="slot-name">${nameHtml}</div>${statLine ? `<div class="slot-stat">${statLine}</div>` : ''}</div>`;
      }).join('') + `</div>`;
    }).join('');
  } else {
    rink.innerHTML = '<span class="empty-note">No lineup logged for this game</span>';
  }

  const tbody = document.querySelector('#skaterBoxTable tbody');
  window.__BOX = { skaters: b.skaters || [], goalies: b.goalies || [], detail: skaterDetailHtml };   // used by the rink hover cards
  const fmt = (v, digits) => (v===null || v===undefined) ? '—' : (digits!=null ? Number(v).toFixed(digits) : v);
  const fmtPct = (v) => (v===null || v===undefined) ? '—' : Math.round(v*1000)/10 + '%';
  const fmtPM = (v) => (v===null || v===undefined) ? '—' : ((v>0?'+':'')+v);
  function skaterDetailHtml(s){
    const foRatio = (s.fot!=null && s.fot>0) ? `${s.fow}/${s.fot}` : (s.fot===0 ? '0/0' : '—');
    const items = [
      {l:'G', n:s.g}, {l:'A', n:s.a}, {l:'P', n:s.g+s.a},
      {l:'Shots', n:fmt(s.shAtt)}, {l:'SOG', n:fmt(s.sh)}, {l:'Shot%', n:fmtPct(s.shPct)},
      {l:'BLK', n:fmt(s.bl)}, {l:'PIM', n:fmt(s.pim)}, {l:'PIM/A', n:fmt(s.pimA)},
      {l:'+/-', n:fmtPM(s.pm)}, {l:'+/- adj', n:fmtPM(s.pmAdj)},
      {l:'FOW/FOT', n:foRatio}, {l:'FO%', n:fmtPct(s.foPct)},
    ];
    return `<div class="detail-wrap"><div class="card-stat-row" style="flex-wrap:wrap;gap:20px;">` +
      items.map(it=>`<div class="card-stat"><div class="card-stat-num">${it.n}</div><div class="card-stat-label">${it.l}</div></div>`).join('') +
      `</div></div>`;
  }
  tbody.innerHTML = b.skaters.map(s=>{
    const nr = s.nr ?? ROSTER_NR[s.player];
    return `<tr class="expandable" data-player-key="${s.player}">
      <td><span class="chevron">▶</span>${nr ?? '—'}</td>
      <td style="text-align:left">${playerLink(s.player)}</td>
      <td>${s.pos.replace(/[0-9]/g,'')}</td>
      <td>${s.g}</td><td>${s.a}</td><td>${s.g+s.a}</td>
      <td>${fmt(s.sh)}</td><td>${fmt(s.pim)}</td><td>${fmtPM(s.pm)}</td><td>${fmtPct(s.foPct)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="10" style="color:var(--text-faint);">No player stats logged</td></tr>';

  tbody.querySelectorAll('tr.expandable').forEach(row=>{
    const s = b.skaters.find(sk=>sk.player===row.dataset.playerKey);
    row.addEventListener('click', (e)=>{
      if(e.target.closest('a')) return;
      const next = row.nextElementSibling;
      const isOpen = next && next.classList.contains('detail-row');
      tbody.querySelectorAll('tr.detail-row').forEach(r=>r.remove());
      tbody.querySelectorAll('.chevron.open').forEach(c=>c.classList.remove('open'));
      if(isOpen) return;
      const detailRow = document.createElement('tr');
      detailRow.className = 'detail-row';
      detailRow.innerHTML = `<td colspan="10">${skaterDetailHtml(s)}</td>`;
      row.after(detailRow);
      row.querySelector('.chevron').classList.add('open');
    });
  });

  const goalieTbody = document.querySelector('#goalieBoxTable tbody');
  goalieTbody.innerHTML = (b.goalies && b.goalies.length) ? b.goalies.map(g=>{
    const nr = g.nr ?? ROSTER_NR[g.player];
    return `<tr>
      <td>${nr ?? '—'}</td>
      <td style="text-align:left">${playerLink(g.player)}</td>
      <td>${g.shotsFaced}</td><td>${g.saves}</td><td>${g.ga}</td><td>${g.savePct}%</td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" style="color:var(--text-faint);">No goalie logged</td></tr>';
}

function careerSkaterTotals(name){
  const rows = DATA.skaterRows.filter(r=>r.player===name);
  const gp = rows.length;
  const g = rows.reduce((s,r)=>s+(r.g||0),0);
  const a = rows.reduce((s,r)=>s+(r.a||0),0);
  const pm = rows.reduce((s,r)=>s+(r.pm||0),0);
  return {gp, g, a, p:g+a, pm};
}
function careerGoalieTotals(name){
  const rows = DATA.goalieRows.filter(r=>r.player===name);
  const gp = rows.length;
  const sf = rows.reduce((s,r)=>s+(r.shotsFaced||0),0);
  const sv = rows.reduce((s,r)=>s+(r.saves||0),0);
  const svPct = sf>0 ? Math.round((sv/sf)*1000)/10 : 0;
  return {gp, sf, sv, svPct};
}
function rosterStatRow(p){
  if(p.position==='GK'){
    const t = careerGoalieTotals(p.name);
    return `<div class="roster-stat-row">
      <div class="roster-stat"><div class="roster-stat-num">${t.gp}</div><div class="roster-stat-label">GP</div></div>
      <div class="roster-stat"><div class="roster-stat-num">${t.sf}</div><div class="roster-stat-label">SF</div></div>
      <div class="roster-stat"><div class="roster-stat-num">${t.sv}</div><div class="roster-stat-label">SV</div></div>
      <div class="roster-stat"><div class="roster-stat-num">${t.svPct}%</div><div class="roster-stat-label">SV%</div></div>
    </div>`;
  }
  const t = careerSkaterTotals(p.name);
  return `<div class="roster-stat-row">
    <div class="roster-stat"><div class="roster-stat-num">${t.gp}</div><div class="roster-stat-label">GP</div></div>
    <div class="roster-stat"><div class="roster-stat-num">${t.g}</div><div class="roster-stat-label">G</div></div>
    <div class="roster-stat"><div class="roster-stat-num">${t.a}</div><div class="roster-stat-label">A</div></div>
    <div class="roster-stat"><div class="roster-stat-num">${t.p}</div><div class="roster-stat-label">P</div></div>
    <div class="roster-stat"><div class="roster-stat-num">${t.pm>0?'+':''}${t.pm}</div><div class="roster-stat-label">+/-</div></div>
  </div>`;
}
function rosterCard(p){
  const photo = DATA.playerPhotos[p.name] || DEFAULT_PHOTO;
  return `<div class="roster-card">
    <img class="roster-photo" src="${photo}" alt="">
    <div style="flex:1;min-width:0;">
      <div class="roster-info-name">${playerLink(p.name)} <span style="color:var(--text-faint);font-weight:500;">#${p.nr ?? '—'}</span></div>
      <div class="roster-info-meta">${[p.height,p.weight,p.handedness].filter(Boolean).join(' · ')}</div>
      <span class="roster-pos-badge ${p.position||''}">${p.position||'—'}</span>
      ${p.ehl ? `<a class="card-ehl" style="display:block;margin-top:4px;font-size:11.5px;" href="${p.ehl}" target="_blank" rel="noopener">EHL profile →</a>` : ''}
      ${rosterStatRow(p)}
    </div>
  </div>`;
}

const POS_GROUPS = [
  {key:'FWD', label:'Forwards'},
  {key:'DEF', label:'Defense'},
  {key:'GK', label:'Goalies'},
];
// Only this season's players: those listed on Ledus Veči's EHL team page (collected by refresh-data.js).
// Until that list exists, everyone in the roster sheet is shown.
const EHL_E5_IDS = new Set(((DATA.teamRosters && DATA.teamRosters.teams && DATA.teamRosters.teams.E5) || []).map(String));
const personId = url => ((String(url || '').match(/\/personas\/[a-z0-9-]+\/(\d+)/) || [])[1]);
const CURRENT_ROSTER = EHL_E5_IDS.size ? DATA.roster.filter(p => EHL_E5_IDS.has(personId(p.ehl))) : DATA.roster;
// games played (the GP shown on each card: all seasons, skaters + goalies), most games first
const ROSTER_GP = {};
DATA.skaterRows.concat(DATA.goalieRows || []).forEach(r => { ROSTER_GP[r.player] = (ROSTER_GP[r.player] || 0) + 1; });
document.getElementById('rosterSections').innerHTML = POS_GROUPS.map(g=>{
  const players = CURRENT_ROSTER.filter(p=>p.position===g.key).sort((x, y) => (ROSTER_GP[y.name] || 0) - (ROSTER_GP[x.name] || 0) || x.name.localeCompare(y.name));
  if(!players.length) return '';
  return `<div class="roster-section-title">${g.label}</div>
    <div class="roster-grid">${players.map(rosterCard).join('')}</div>`;
}).join('');

// ---------------- Team Stats tab ----------------
const teamSeasonSelect = document.getElementById('teamSeasonSelect');
populateGroupedSeasonSelect(teamSeasonSelect, 'All seasons');
teamSeasonSelect.value = defaultSeasonValue();

function fmtPctT(v){ return (v==null || isNaN(v)) ? '—' : Math.round(v*1000)/10+'%'; }
function fmtNumT(v, d){ return (v==null || isNaN(v)) ? '—' : (d!=null ? v.toFixed(d) : v); }

function renderTeamStats(){
  const season = teamSeasonSelect.value;
  const logo = document.getElementById('teamSeasonLogo');
  const src = season!=='ALL' ? seasonLogoForFilter(season) : null;
  logo.style.display = src ? '' : 'none';
  if(src) logo.src = src;

  const games = season==='ALL' ? DATA.boxscores : DATA.boxscores.filter(b=>matchesSeason(b.season, season));
  const gp = games.length;

  // ---- record strip ----
  let w=0,l=0,d=0,gf=0,ga=0;
  games.forEach(b=>{
    if(b.result==='W') w++; else if(b.result==='L') l++; else if(b.result==='D') d++;
    gf += (b.lvIsHome ? b.htGoals : b.atGoals) || 0;
    ga += (b.lvIsHome ? b.atGoals : b.htGoals) || 0;
  });
  const winPct = gp ? Math.round((w/gp)*1000)/10 : 0;
  const diff = gf-ga;
  const cells = [
    {label:'GAMES PLAYED', val:gp, cls:''},
    {label:'RECORD', val:`${w}-${l}${d?('-'+d):''}`, cls:''},
    {label:'WIN %', val:winPct+'%', cls:''},
    {label:'GOALS FOR', val:gf, cls:'win'},
    {label:'GOALS AGAINST', val:ga, cls:'loss'},
    {label:'DIFFERENTIAL', val:(diff>0?'+':'')+diff, cls: diff>0?'win':(diff<0?'loss':'')},
  ];
  const rs = document.getElementById('teamRecordStrip');
  rs.classList.add('rec2-wrap');
  const gfShare = (gf + ga) ? gf / (gf + ga) * 100 : 50;
  rs.innerHTML = `<div class="rec2">
    <div class="rec-ring" style="background:conic-gradient(var(--win) 0 ${winPct}%, var(--loss) ${winPct}% 100%)"><div><b>${winPct}%</b><span>uzvaras</span></div></div>
    <div class="rec-side">
      <div class="rec-top"><div class="rec-gp"><b>${gp}</b><span>spēles</span></div>
        <div class="rec-pills"><span class="pill w"><b>${w}</b> W</span><span class="pill l"><b>${l}</b> L</span>${d ? `<span class="pill d"><b>${d}</b> D</span>` : ''}</div></div>
      <div class="rec-goals"><div class="t"><span>Gūtie <b class="g">${gf}</b></span><span class="df ${diff > 0 ? 'pos' : diff < 0 ? 'neg' : ''}">${(diff > 0 ? '+' : '') + diff}</span><span><b class="a">${ga}</b> Ielaistie</span></div>
        <div class="duel"><span class="g" style="width:${gfShare}%"></span><span class="a" style="width:${100 - gfShare}%"></span></div></div>
    </div></div>`;

  // ---- season totals & averages ----
  function gameFields(b){
    const blk = (b.skaters||[]).reduce((s,pl)=>s+(pl.bl||0),0);
    return {
      g: b.lvIsHome ? b.htGoals : b.atGoals,
      ga: b.lvIsHome ? b.atGoals : b.htGoals,
      shots: b.lvIsHome ? b.htShots : b.atShots,
      sa: b.lvIsHome ? b.atShots : b.htShots,
      fow: b.lvIsHome ? b.htFO : b.atFO,
      fol: b.lvIsHome ? b.atFO : b.htFO,
      pim: b.lvIsHome ? b.htPIM : b.atPIM,
      pimA: b.lvIsHome ? b.atPIM : b.htPIM,
      blk, pp: b.pp||0, ppScored: b.ppScored||0, sh: b.scoredPK||0,
      pk: b.pk||0, pkScored: b.pkScored||0, gaPP: b.allowedPP||0,
    };
  }
  const t = {
    g:0, ga:0, shots:0, sa:0, blk:0, pim:0, pimA:0, fow:0, fol:0,
    pp:0, ppScored:0, sh:0, pk:0, pkScored:0, gaPP:0,
  };
  games.forEach(b=>{
    const f = gameFields(b);
    t.g += f.g||0; t.ga += f.ga||0;
    t.shots += f.shots||0; t.sa += f.sa||0;
    t.fow += f.fow||0; t.fol += f.fol||0;
    t.pim += f.pim||0; t.pimA += f.pimA||0;
    t.pp += f.pp; t.ppScored += f.ppScored;
    t.sh += f.sh; t.pk += f.pk; t.pkScored += f.pkScored;
    t.gaPP += f.gaPP; t.blk += f.blk;
  });

  const shotPct = t.shots>0 ? t.g/t.shots : null;
  const savePct = t.sa>0 ? (t.sa-t.ga)/t.sa : null;
  const foPct = (t.fow+t.fol)>0 ? t.fow/(t.fow+t.fol) : null;
  const ppPct = t.pp>0 ? t.ppScored/t.pp : null;
  const pkPct = t.pk>0 ? t.pkScored/t.pk : null;

  const statDefs = [
    ['G', t.g, gp>0?fmtNumT(t.g/gp,1):'—'],
    ['GA', t.ga, gp>0?fmtNumT(t.ga/gp,1):'—'],
    ['Shots', t.shots, gp>0?fmtNumT(t.shots/gp,1):'—'],
    ['SA', t.sa, gp>0?fmtNumT(t.sa/gp,1):'—'],
    ['Shot%', fmtPctT(shotPct), null],
    ['Save%', fmtPctT(savePct), null],
    ['BLK', t.blk, gp>0?fmtNumT(t.blk/gp,1):'—'],
    ['PIM', t.pim, gp>0?fmtNumT(t.pim/gp,1):'—'],
    ['PIM/A', t.pimA, gp>0?fmtNumT(t.pimA/gp,1):'—'],
    ['FOW', t.fow, gp>0?fmtNumT(t.fow/gp,1):'—'],
    ['FOL', t.fol, gp>0?fmtNumT(t.fol/gp,1):'—'],
    ['FO%', fmtPctT(foPct), null],
    ['PP', `${t.ppScored}/${t.pp}`, gp>0?`${Math.round(t.ppScored/gp)}/${Math.round(t.pp/gp)}`:'—'],
    ['PP%', fmtPctT(ppPct), null],
    ['SH', t.sh, gp>0?fmtNumT(t.sh/gp,2):'—'],
    ['PK', `${t.pkScored}/${t.pk}`, gp>0?`${Math.round(t.pkScored/gp)}/${Math.round(t.pk/gp)}`:'—'],
    ['PK%', fmtPctT(pkPct), null],
    ['GA/PP', t.gaPP, gp>0?fmtNumT(t.gaPP/gp,2):'—'],
  ];
  // grouped, with a small bar for the percentages
  const PCTV = { 'Shot%': shotPct, 'Save%': savePct, 'FO%': foPct, 'PP%': ppPct, 'PK%': pkPct };
  const GROUPS = [['Uzbrukums', ['G','Shots','Shot%']], ['Aizsardzība', ['GA','SA','Save%','BLK']], ['Iemetieni', ['FOW','FOL','FO%']],
    ['Disciplīna', ['PIM','PIM/A']], ['Vairākums / mazākums', ['PP','PP%','SH','PK','PK%','GA/PP']]];
  const byLabel = {}; statDefs.forEach(d => byLabel[d[0]] = d);
  document.querySelector('#teamTotalsTable tbody').innerHTML = games.length ?
    GROUPS.map(([title, labels]) => `<tr class="tt-group"><td colspan="3">${title}</td></tr>` + labels.map(l => {
      const [label, total, avg] = byLabel[l];
      if (avg === null) {
        const v = PCTV[l]; const w = v == null ? 0 : Math.max(0, Math.min(100, v * 100));
        return `<tr class="tt-pct"><td style="text-align:left">${label}</td><td colspan="2"><div class="tt-pv"><div class="tt-bar"><span style="width:${w}%"></span></div><b>${total}</b></div></td></tr>`;
      }
      return `<tr><td style="text-align:left">${label}</td><td>${total}</td><td>${avg}</td></tr>`;
    }).join('')).join('') :
    `<tr><td colspan="3" style="color:var(--text-dim);text-align:center;padding:20px;">No games in this range</td></tr>`;

  // ---- by period ----
  const periods = ['1st','2nd','3rd','OT'];
  const periodTotals = {};
  periods.forEach(p=>{ periodTotals[p] = {g:0, ga:0, s:0, sa:0, fow:0, fol:0, any:false}; });
  games.forEach(b=>{
    periods.forEach(p=>{
      const d = b.periods && b.periods[p];
      if(!d) return;
      if(d.g!=null || d.ga!=null || d.s!=null || d.sa!=null) periodTotals[p].any = true;
      periodTotals[p].g += d.g||0; periodTotals[p].ga += d.ga||0;
      periodTotals[p].s += d.s||0; periodTotals[p].sa += d.sa||0;
      periodTotals[p].fow += d.fow||0; periodTotals[p].fol += d.fol||0;
    });
  });
  document.querySelector('#teamPeriodTable tbody').innerHTML = periods.map(p=>{
    const d = periodTotals[p];
    if(!d.any) return '';
    const gDiff = d.g-d.ga, sDiff = d.s-d.sa;
    const duel = (lbl, f, ag, df, cls) => { const sh = (f + ag) ? f / (f + ag) * 100 : 50;
      return `<div class="pd"><div class="lbl">${lbl}</div><div class="t"><b>${f}</b><span class="sep">:</span><b class="ag">${ag}</b><span class="df ${df > 0 ? 'pos' : df < 0 ? 'neg' : ''}">${(df > 0 ? '+' : '') + df}</span></div>
        <div class="duel ${cls}"><span class="g" style="width:${sh}%"></span><span class="a" style="width:${100 - sh}%"></span></div></div>`; };
    return `<tr class="pr"><td class="pn">${p}</td><td colspan="6"><div class="pr-grid">${duel('Vārti', d.g, d.ga, gDiff, '')}${duel('Metieni', d.s, d.sa, sDiff, 'sh')}${duel('Iemetieni', d.fow, d.fol, d.fow - d.fol, 'fo')}</div></td></tr>`;
  }).join('') || `<tr><td colspan="7" style="color:var(--text-dim);text-align:center;padding:20px;">No period data</td></tr>`;

  // ---- game log ----
  const logGames = [...games].sort((a,b)=> b.date.localeCompare(a.date));
  function gameLogDetailHtml(f, gFoPct){
    const items = [
      {l:'Shots', n:f.shots}, {l:'SA', n:f.sa}, {l:'BLK', n:f.blk},
      {l:'PIM', n:f.pim}, {l:'PIM/A', n:f.pimA},
      {l:'FOW', n:f.fow}, {l:'FOL', n:f.fol}, {l:'FO%', n:fmtPctT(gFoPct)},
      {l:'SH', n:f.sh}, {l:'GA/PP', n:f.gaPP},
    ];
    return `<div class="detail-wrap"><div class="card-stat-row" style="flex-wrap:wrap;gap:16px;">` +
      items.map(it=>`<div class="card-stat"><div class="card-stat-num">${it.n}</div><div class="card-stat-label">${it.l}</div></div>`).join('') +
      `</div></div>`;
  }
  const tbody = document.querySelector('#teamGameLogTable tbody');
  tbody.innerHTML = logGames.map(b=>{
    const f = gameFields(b);
    const opp = b.lvIsHome ? b.awayTeam : b.homeTeam;
    const gShotPct = f.shots>0 ? f.g/f.shots : null;
    const gSavePct = f.sa>0 ? (f.sa-f.ga)/f.sa : null;
    const gPpPct = f.pp>0 ? f.ppScored/f.pp : null;
    const gPkPct = f.pk>0 ? f.pkScored/f.pk : null;
    return `<tr class="expandable" data-date="${b.date}">
      <td><span class="chevron">▶</span>${b.date}${otTag(decidedBy(b))}</td><td style="text-align:left">${oppCell({ date: b.date, opponent: opp })}</td>
      <td>${f.g}</td><td>${f.ga}</td><td>${fmtPctT(gShotPct)}</td><td>${fmtPctT(gSavePct)}</td>
      <td>${f.ppScored}/${f.pp}</td><td>${fmtPctT(gPpPct)}</td>
      <td>${f.pkScored}/${f.pk}</td><td>${fmtPctT(gPkPct)}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="10" style="color:var(--text-dim);text-align:center;padding:20px;">No games in this range</td></tr>`;
  tbody.querySelectorAll('tr.expandable').forEach(row=>{
    const b = logGames.find(g=>g.date===row.dataset.date);
    row.addEventListener('click', ()=>{
      const next = row.nextElementSibling;
      const isOpen = next && next.classList.contains('detail-row');
      tbody.querySelectorAll('tr.detail-row').forEach(r=>r.remove());
      tbody.querySelectorAll('.chevron.open').forEach(c=>c.classList.remove('open'));
      if(isOpen) return;
      const f = gameFields(b);
      const gFoPct = (f.fow+f.fol)>0 ? f.fow/(f.fow+f.fol) : null;
      const detailRow = document.createElement('tr');
      detailRow.className = 'detail-row';
      detailRow.innerHTML = `<td colspan="10">${gameLogDetailHtml(f, gFoPct)}</td>`;
      row.after(detailRow);
      row.querySelector('.chevron').classList.add('open');
    });
  });

  // ---- wins & losses by game ----
  // Built as one unified HTML row per game (color block + game info both in
  // the same flex row), not a separate chart, so the colored block and its
  // game text are always at the exact same vertical position by
  // construction — no cross-rendering-system alignment issues.
  const sortedGames = [...games].sort((a,b)=> b.date.localeCompare(a.date));
  document.getElementById('teamWinLossList').innerHTML = sortedGames.map(b=>{
    const opp = b.lvIsHome ? b.awayTeam : b.homeTeam;
    const isWin = b.result==='W', isLoss = b.result==='L';
    return `<div class="wl-item" data-date="${b.date}" title="${opp} · ${b.date} · ${b.htGoals}-${b.atGoals}">
      <div class="wl-bar-half loss">${isLoss ? '<div class="wl-bar loss"></div>' : ''}</div>
      <div class="wl-center-line"></div>
      <div class="wl-bar-half win">${isWin ? '<div class="wl-bar win"></div>' : ''}</div>
    </div>`;
  }).join('');
  document.querySelectorAll('#teamWinLossList .wl-item').forEach(item=>{
    item.addEventListener('click', ()=>{
      const date = item.dataset.date;
      const gi = DATA.boxscores.findIndex(b=>b.date===date);
      if(gi<0) return;
      document.querySelector('.tab-btn[data-tab="box"]').click();
      seasonSelect.value = 'ALL';
      rebuildGameList();
      idx = filteredGames.findIndex(b=>b.date===date);
      gameSelect.value = idx;
      updateNavButtons();
      render();
    });
  });
}

teamSeasonSelect.addEventListener('change', renderTeamStats);

// ---- E5 league table ----
// Scraped from the league's own published standings page by the background
// refresh job (see refresh-data.js) - not hand-maintained. The name map below
// only handles matching the official team name to this site's logo assets
// and display spelling; it isn't standings data itself.
const LEAGUE_NAME_MAP = {
  'SPARTA II': { display: 'Sparta II', logoKey: 'Sparta 2' },
  'MOLTTO PLUS': { logoKey: 'Moltto' },
  'WARRIORS': { logoKey: 'Ice Warriors' },
  'ICE WOLVES II': { display: 'Ice Wolves II', logoKey: 'Ice Wolves' },
  'IECAVA/MAMMOTHS': { logoKey: 'Mammoths' },
  'LEĢENDAS V': { display: 'Leģendas V', logoKey: 'Pilsētas Leģendas' },
};
function titleCaseLv(s) {
  return s.toLowerCase().replace(/(^|[\s/])\p{L}/gu, c => c.toUpperCase());
}
function renderLeagueGroup(elId, teams) {
  document.getElementById(elId).innerHTML = teams.map((t, i) => {
    const map = LEAGUE_NAME_MAP[t.team] || {};
    const display = map.display || titleCaseLv(t.team);
    const isLDV = display === DATA.team;
    // the league's own rule: top 3 per conference qualify outright, so the line sits after the 3rd row
    const classes = [isLDV ? 'ldv-row' : '', i === 2 ? 'playoff-cutoff' : ''].filter(Boolean).join(' ');
    const logoObj = DATA.teamAssets && DATA.teamAssets[map.logoKey || display];
    const logo = logoObj && logoObj.logo;
    const nameCell = logo ? `<img class="league-logo" src="${logo}" alt="">${display}` : display;
    const st = (DATA.leagueStats && DATA.leagueStats.teams || {})[String(t.team).toUpperCase()] || {};
    const pc = v => v == null ? '—' : Math.round(v) + '%';
    return `<tr class="${classes}"><td>${nameCell}</td><td>${t.gp}</td><td>${st.gf ?? '—'}</td><td>${st.ga ?? '—'}</td><td>${pc(st.pp)}</td><td>${pc(st.pk)}</td><td class="pts">${t.points}</td></tr>`;
  }).join('');
}
if (DATA.leagueTable && DATA.leagueTable.divisions) {
  const byName = n => (DATA.leagueTable.divisions.find(d => d.division === n) || { teams: [] }).teams;
  renderLeagueGroup('leagueZiemeli', byName('ZIEMEĻI'));
  renderLeagueGroup('leagueDienvidi', byName('DIENVIDI'));
  const label = document.getElementById('leagueUpdatedLabel');
  if (label) label.textContent = DATA.leagueTable.fetchedAt ? `— updated ${agoText(DATA.leagueTable.fetchedAt)}` : '';
}

if (DATA.upcomingGames && DATA.upcomingGames.length) {
  const CAL_LOGO_ALIAS = { 'Warriors': 'Ice Warriors', 'Ice Wolves II': 'Ice Wolves',
    'Iecava/Mammoths': 'Mammoths', 'Leģendas V': 'Pilsētas Leģendas', 'Sparta II': 'Sparta 2', 'Moltto Plus': 'Moltto' };
  document.getElementById('calendarBody').innerHTML = DATA.upcomingGames.slice(0, 6).map(g => {
    const logoObj = DATA.teamAssets && DATA.teamAssets[CAL_LOGO_ALIAS[g.opponent] || g.opponent];
    const logo = logoObj && logoObj.logo;
    const oppCell = logo ? `<img class="league-logo" src="${logo}" alt="">${g.opponent}` : g.opponent;
    // short form: "Sestd., 10. okt."
    const WDS = { pirmdiena:'Pirmd.', otrdiena:'Otrd.', trešdiena:'Trešd.', ceturtdiena:'Ceturtd.', piektdiena:'Piektd.', sestdiena:'Sestd.', svētdiena:'Svētd.' };
    const MS = { janv:'janv.', febr:'febr.', mart:'marts', apr:'apr.', maij:'maijs', jūn:'jūn.', jūl:'jūl.', aug:'aug.', sept:'sept.', okt:'okt.', nov:'nov.', dec:'dec.' };
    const wd = g.weekday ? (WDS[String(g.weekday).toLowerCase()] || g.weekday) : '';
    const dm = String(g.date || '').match(/(\d{1,2})\.?\s*([A-Za-zĀ-ž]+)/);
    const mk = dm ? Object.keys(MS).find(k => dm[2].toLowerCase().startsWith(k)) : null;
    const dateShort = dm ? `${dm[1]}. ${mk ? MS[mk] : dm[2]}` : (g.date || '');
    const when = g.date ? `${wd ? wd + ', ' : ''}${dateShort}` : '';
    const arena = g.arena ? String(g.arena).toLowerCase().replace(/(^|[\s/-])\S/g, c => c.toUpperCase()) : '';
    return `
    <div class="calendar-row">
      <div class="calendar-opp"><span class="vs">${g.isHome ? 'vs' : '@'}</span>${oppCell}</div>
      <div class="calendar-when">${when}${when ? ' · ' : ''}${g.time || ''}${arena ? ' · ' + arena : ''}</div>
    </div>`;
  }).join('');
}
renderTeamStats();

rebuildGameList();renderTeamStats();

rebuildGameList();
renderStatsTab();

// ---------------- Calendar tab ----------------
// games (played + upcoming), practices, birthdays and name days in one month view
(function(){
  // the regular weekly practice; extra or cancelled practices come from the Practices sheet tab
  const USE_WEEKLY_SLOT = false;   // practices now all come from the "Practice" sheet tab
  const PRACTICE = { weekday: 1, time: '21:15', rink: 'Akropole', seasonStart: '09-01', seasonEnd: '04-30' };   // weekday 1 = Monday
  const SHOW_AGE = false;   // true = show the age a player is turning on their birthday
  const TYPES = { E5: 'E5', E7: 'E7', E9: 'E9', practice: 'Practices', bday: 'Birthdays', nday: 'Name days' };
  const ORDER = { game: 0, practice: 1, bday: 2, nday: 3 };
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const shown = { E5: true, E7: true, E9: true, practice: true, bday: true, nday: true };

  const pad = n => String(n).padStart(2, '0');
  const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const titleCase = s => String(s || '').toLowerCase().replace(/(^|[\s/-])\S/g, c => c.toUpperCase());
  const now = new Date(), todayIso = iso(now.getFullYear(), now.getMonth(), now.getDate());
  // birthdays and name days only for this season's players (EHL roster, see the Sastāvs tab)
  const rosterNames = new Set((typeof CURRENT_ROSTER !== 'undefined' ? CURRENT_ROSTER : DATA.roster).map(p => p.name));
  const firstName = n => n.split(' ')[0];

  // the EHL calendar gives dates like "10. Oktobris" (no year) - turn them into YYYY-MM-DD
  const LV_MONTHS = ['jan','feb','mar','apr','mai','jūn','jūl','aug','sep','okt','nov','dec'];
  function upcomingIso(g){
    const m = String(g.date || '').toLowerCase().match(/(\d{1,2})\.?\s*([a-zāčēģīķļņšūž]+)/);
    if (!m) return null;
    let mon = LV_MONTHS.findIndex(x => m[2].startsWith(x));
    if (mon < 0) mon = { jun: 5, jul: 6 }[m[2].slice(0, 3)] ?? -1;
    if (mon < 0) return null;
    const ref = new Date(g.fetchedAt || Date.now());
    let y = ref.getFullYear();
    if (mon < ref.getMonth() - 2) y++;   // e.g. a January game listed in November belongs to next year
    return iso(y, mon, +m[1]);
  }

  const fixed = [];   // events tied to one specific date
  DATA.boxscores.forEach(b => {
    if (!b.date) return;
    const home = b.lvIsHome, opp = home ? b.awayTeam : b.homeTeam;
    const us = home ? b.htGoals : b.atGoals, them = home ? b.atGoals : b.htGoals;
    const score = us != null && us !== '' ? ` · ${us}–${them}${b.result ? ' ' + b.result : ''}` : '';
    fixed.push({ date: b.date, type: 'game', div: 'E5', ha: home ? 'vs' : '@', opp, sub: us != null && us !== '' ? `${us}-${them}${b.result ? ' ' + b.result : ''}` : '',
      short: `${home ? 'vs' : 'at'} ${opp}`, text: `E5 · ${home ? 'vs' : 'at'} ${opp}${score}` });
  });
  (DATA.upcomingGames || []).forEach(g => {
    const d = upcomingIso(g);
    if (!d || fixed.some(f => f.type === 'game' && f.date === d)) return;
    const where = [g.time, g.arena ? titleCase(g.arena) : ''].filter(Boolean).join(' · ');
    fixed.push({ date: d, type: 'game', div: 'E5', ha: g.isHome ? 'vs' : '@', opp: g.opponent, sub: where,
      short: `${g.isHome ? 'vs' : 'at'} ${g.opponent}`, text: `E5 · ${g.isHome ? 'vs' : 'at'} ${g.opponent}${where ? ' · ' + where : ''}` });
  });
  // Ledus Veči II (E7) and III (E9) games from the EHL calendar
  ['E7', 'E9'].forEach(div => {
    const t = DATA.club && DATA.club[div]; if (!t || !t.games) return;
    t.games.forEach(g => {
      if (!g.date || fixed.some(f => f.div === div && f.date === g.date)) return;
      const home = g.home.abbr === t.abbr, o = home ? g.away : g.home, opp = (t.names || {})[o.abbr] || o.abbr;
      const sub = g.played ? `${home ? g.hg : g.ag}-${home ? g.ag : g.hg}` : [g.time, g.arena ? titleCase(g.arena) : ''].filter(Boolean).join(' · ');
      fixed.push({ date: g.date, type: 'game', div, ha: home ? 'vs' : '@', opp, logo: logoFor(opp) || (t.logos || {})[o.abbr] || null, sub, short: `${home ? 'vs' : 'at'} ${opp}`, text: `${div} · ${home ? 'vs' : 'at'} ${opp}${sub ? ' · ' + sub : ''}` });
    });
  });
  const extras = DATA.practiceExtras || [];
  const cancelled = new Set(extras.filter(x => x.cancelled).map(x => x.date));
  extras.filter(x => !x.cancelled).forEach(x => fixed.push({ date: x.date, type: 'practice', sub: [x.time, x.rink].filter(Boolean).join(' · '),
    short: 'Practice', text: ['Practice', x.time, x.rink, x.note].filter(Boolean).join(' · ') }));

  function inSeason(md){
    const s = PRACTICE.seasonStart, e = PRACTICE.seasonEnd;
    return s <= e ? (md >= s && md <= e) : (md >= s || md <= e);
  }

  function eventsOn(ds){
    const [y, m, d] = ds.split('-').map(Number), md = ds.slice(5);
    const out = fixed.filter(e => e.date === ds);
    if (USE_WEEKLY_SLOT && new Date(y, m - 1, d).getDay() === PRACTICE.weekday && inSeason(md) && !cancelled.has(ds))
      out.push({ type: 'practice', sub: `${PRACTICE.time} · ${PRACTICE.rink}`, short: 'Practice', text: `Practice ${PRACTICE.time} · ${PRACTICE.rink}` });
    Object.entries(DATA.birthdays || {}).forEach(([n, b]) => {
      if (rosterNames.has(n) && b && b.slice(5) === md)
        out.push({ type: 'bday', name: n, short: firstName(n), text: `Birthday: ${n}${SHOW_AGE ? ` (${y - Number(b.slice(0, 4))})` : ''}` });
    });
    Object.entries(DATA.nameDays || {}).forEach(([n, v]) => {
      if (rosterNames.has(n) && v && v.d === md)
        out.push({ type: 'nday', name: n, short: firstName(n), text: `Name day: ${n}${v.special ? ' (day of uncommon names)' : ''}` });
    });
    // players on this season's EHL roster who aren't in the roster sheet (birthday + name day from their EHL profile)
    const R = DATA.teamRosters, ehlIds = (R && R.teams && R.teams.E5) || [];
    ehlIds.forEach(id => { const pp = R.people && R.people[id]; if (!pp || rosterNames.has(pp.name)) return;
      if (pp.birthday && pp.birthday.slice(5) === md) out.push({ type: 'bday', name: pp.name, short: firstName(pp.name), text: `Birthday: ${pp.name}` });
      if (pp.nameDay && pp.nameDay.d === md) out.push({ type: 'nday', name: pp.name, short: firstName(pp.name), text: `Name day: ${pp.name}${pp.nameDay.special ? ' (day of uncommon names)' : ''}` });
    });
    return out.filter(e => e.type === 'game' ? shown[e.div] : shown[e.type]).sort((a, b) => ORDER[a.type] - ORDER[b.type] || String(a.div).localeCompare(String(b.div)));
  }

  const dayLabel = ds => { const [y, m, d] = ds.split('-').map(Number); return `${d} ${MONTHS[m - 1].slice(0, 3)}`; };
  const rowHtml = (e, ds) => `<div class="cal-row t-${e.type === 'game' ? e.div : e.type}">${ds ? `<span class="when">${dayLabel(ds)}</span>` : ''}<span class="cal-dot"></span><span>${esc(e.text)}</span></div>`;

  let viewY = now.getFullYear(), viewM = now.getMonth(), selected = todayIso;

  // one event inside a day cell: games and practices as "vs/@ + logo" with time and place below,
  // birthdays and name days as plain "Name (type)"
  const OPP_LOGO_ALIAS = { 'Warriors':'Ice Warriors', 'Ice Wolves II':'Ice Wolves', 'Iecava/Mammoths':'Mammoths', 'Leģendas V':'Pilsētas Leģendas', 'Sparta II':'Sparta 2', 'Moltto Plus':'Moltto' };
  const WHISTLE = '<svg class="ce-ic" viewBox="0 0 1200 1100" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="56" stroke-linecap="round" stroke-linejoin="round"><path d="M70 383 H527 V550 L622 383 H757 A300 300 0 0 1 757 983 A300 300 0 0 1 490 830 C440 740 350 660 240 637 C205 629 185 625 157 625 C135 625 120 640 105 660 C90 676 75 672 64 672 C42 672 22 652 22 625 L24 430 C24 405 45 383 70 383 Z"/><path d="M120 503 V630"/><circle cx="1115" cy="685" r="60"/><path d="M623 240 L672 118 M718 265 L937 45"/></svg>';
  function oppLogo(name, url){
    if (url) return `<img class="ce-logo" src="${url}" alt="" title="${esc(name)}">`;
    const k = OPP_LOGO_ALIAS[name] || name, info = DATA.teamAssets && DATA.teamAssets[k];
    if (info && info.logo) return `<img class="ce-logo" src="${teamLogo(k)}" alt="" title="${esc(name)}">`;
    return `<span class="ce-ini" title="${esc(name)}">${esc(String(name).split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase())}</span>`;
  }
  function cellItem(e, solo){
    if (e.type === 'game') return `<span class="ce ce-g d-${e.div}${solo ? ' solo' : ''}" title="${esc(e.text)}"><span class="ce-top"><span class="ha">${e.ha}</span>${oppLogo(e.opp, e.logo)}</span>${e.sub ? `<span class="ce-sub">${esc(e.sub)}</span>` : ''}</span>`;
    if (e.type === 'practice') return `<span class="ce ce-p${solo ? ' solo' : ''}" title="${esc(e.text)}"><span class="ce-top">${WHISTLE}</span>${e.sub ? `<span class="ce-sub">${esc(e.sub)}</span>` : ''}</span>`;
    const icon = e.type === 'bday'
      ? '<svg class="ce-pi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16M5 20v-7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7M5 15c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 5 0M12 11V8M12 5.5c.8-.9.8-1.7 0-2.5-.8.8-.8 1.6 0 2.5z"/></svg>'
      : '<svg class="ce-pi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>';
    const nm = String(e.name || e.short), parts = nm.split(' '), last = parts.length > 1 ? parts.pop() : '';
    return `<span class="ce ce-t${solo ? ' solo' : ''}">${icon}<span class="ce-pn"><b>${esc(parts.join(' '))}${last ? ' ' + esc(last) : ''}</b><small>${e.type === 'bday' ? 'dzimšanas diena' : 'vārda diena'}</small></span></span>`;
  }

  function renderCalendar(){
    document.getElementById('calTitle').textContent = `${MONTHS[viewM]} ${viewY}`;
    document.getElementById('calFilters').innerHTML = Object.entries(TYPES).map(([k, label]) =>
      `<button class="cal-chip t-${k}${shown[k] ? '' : ' off'}" data-type="${k}"><span class="cal-dot"></span>${label}</button>`).join('');

    let html = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => `<div class="cal-dow">${d}</div>`).join('');
    html += '<div class="cal-day blank"></div>'.repeat((new Date(viewY, viewM, 1).getDay() + 6) % 7);
    const days = new Date(viewY, viewM + 1, 0).getDate();
    for (let d = 1; d <= days; d++) {
      const ds = iso(viewY, viewM, d), ev = eventsOn(ds);
      const cls = ['cal-day', ds === todayIso ? 'today' : '', ds === selected ? 'sel' : '', ds < todayIso ? 'past' : ''].filter(Boolean).join(' ');
      html += `<button class="${cls}" data-date="${ds}"><span class="cal-num">${d}</span>
        <span class="cal-items">${ev.map(e => cellItem(e, ev.length === 1)).join('')}</span>
        <span class="cal-dots">${ev.map(e => `<span class="cal-dot t-${e.type === 'game' ? e.div : e.type}"></span>`).join('')}</span></button>`;
    }
    document.getElementById('calGrid').innerHTML = html;

    const selEv = eventsOn(selected);
    document.getElementById('calDayTitle').textContent = selected === todayIso ? `Today, ${dayLabel(selected)}` : dayLabel(selected);
    document.getElementById('calDayList').innerHTML = selEv.length ? selEv.map(e => rowHtml(e)).join('') : '<div class="empty-note">Nothing on this day</div>';

    const up = [];
    for (let i = 0; i < 120 && up.length < 10; i++) {
      const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i), ds = iso(t.getFullYear(), t.getMonth(), t.getDate());
      eventsOn(ds).forEach(e => up.push(rowHtml(e, ds)));
    }
    document.getElementById('calUpcoming').innerHTML = up.slice(0, 10).join('') || '<div class="empty-note">Nothing scheduled yet</div>';

    document.getElementById('calNote').textContent = (!DATA.birthdays || !DATA.nameDays)
      ? 'Birthdays and name days appear after the next data refresh.' : '';
  }

  document.getElementById('calGrid').addEventListener('click', e => {
    const btn = e.target.closest('.cal-day[data-date]'); if (!btn) return;
    selected = btn.dataset.date; renderCalendar();
    if (window.innerWidth <= 860) document.getElementById('calDayPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  document.getElementById('calFilters').addEventListener('click', e => {
    const chip = e.target.closest('.cal-chip'); if (!chip) return;
    shown[chip.dataset.type] = !shown[chip.dataset.type]; renderCalendar();
  });
  document.getElementById('calPrev').addEventListener('click', () => { viewM--; if (viewM < 0) { viewM = 11; viewY--; } renderCalendar(); });
  document.getElementById('calNext').addEventListener('click', () => { viewM++; if (viewM > 11) { viewM = 0; viewY++; } renderCalendar(); });
  document.getElementById('calToday').addEventListener('click', () => { viewY = now.getFullYear(); viewM = now.getMonth(); selected = todayIso; renderCalendar(); });
  const link = document.getElementById('openCalendarLink');
  if (link) link.addEventListener('click', e => { e.preventDefault(); goSection('calendar'); });
  window.calEventsOn = eventsOn;   // the home page's "This week" box reuses this
  renderCalendar();
})();

// ---------------- Ledus Veči stats > Overview ----------------
// One screen: games (results / upcoming), player scoring, goalies and the E5 table.
(function(){
  const el = document.getElementById('overviewView'); if (!el) return;
  const LV = 'Ledus Veči';
  const ALIAS = { 'Warriors':'Ice Warriors', 'Ice Wolves II':'Ice Wolves', 'Iecava/Mammoths':'Mammoths',
    'Leģendas V':'Pilsētas Leģendas', 'Sparta II':'Sparta 2', 'Moltto Plus':'Moltto' };
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const LV_MONTHS = ['jan','feb','mar','apr','mai','jūn','jūl','aug','sep','okt','nov','dec'];
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  const up = s => String(s || '').trim().toUpperCase();
  const nice = s => String(s || '').toLowerCase().replace(/(^|[\s/-])\S/g, c => c.toUpperCase()).replace(/\b(Ii|Iii|Iv|Vi)\b/g, m => m.toUpperCase());
  const ord = n => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
  const shortDate = iso => { const [, m, d] = iso.split('-').map(Number); return `${d} ${MON[m - 1]}`; };
  const assetKey = {}; Object.keys(DATA.teamAssets || {}).forEach(k => assetKey[up(k)] = k);
  const logoSrc = name => { const f = logoFor(name) || logoFor(nice(name)); if (f) return f;
    const k = assetKey[up(name)] || assetKey[up(ALIAS[name])] || assetKey[up(ALIAS[nice(name)])]; return k ? teamLogo(k) : null; };
  const logo = name => { const src = logoSrc(name); return src ? `<img class="tlogo" src="${src}" alt="">` : ''; };
  const chips = (names, on) => `<div class="grp-chips">${names.map((n, i) => `<button data-i="${i}" class="${i === on ? 'on' : ''}">${esc(n)}</button>`).join('')}</div>`;
  const parts = (bodies, on) => bodies.map((b, i) => `<div class="ov-part" data-i="${i}"${i === on ? '' : ' style="display:none"'}>${b}</div>`).join('');

  // this season = the season of our latest game (regular season and playoffs)
  const all = DATA.boxscores.filter(b => b.date).slice().sort((x, y) => x.date < y.date ? -1 : 1);
  if (!all.length) { el.innerHTML = '<div class="empty-note" style="padding:20px 0">No games yet</div>'; return; }
  const yrs = (all[all.length - 1].season.match(/\d{4}-\d{4}/) || [''])[0];
  const games = all.filter(b => b.season.includes(yrs)).map(b => { const h = b.lvIsHome;
    return { date: b.date, home: h, opp: h ? b.awayTeam : b.homeTeam, us: h ? b.htGoals : b.atGoals, them: h ? b.atGoals : b.htGoals, r: b.result }; });
  const W = games.filter(g => g.r === 'W').length, L = games.filter(g => g.r === 'L').length;
  const GF = games.reduce((s, g) => s + (+g.us || 0), 0), GA = games.reduce((s, g) => s + (+g.them || 0), 0);

  const divs = (DATA.leagueTable && DATA.leagueTable.divisions) || [];
  const ourDiv = Math.max(0, divs.findIndex(d => d.teams.some(t => up(t.team) === up(LV))));
  const ourPos = divs[ourDiv] ? divs[ourDiv].teams.findIndex(t => up(t.team) === up(LV)) : -1;

  // player scoring: points, then goals, then +/-, then fewer games played
  const sk = {};
  DATA.skaterRows.filter(r => r.season.includes(yrs)).forEach(r => { const p = sk[r.player] || (sk[r.player] = { gp: 0, g: 0, a: 0, pm: 0, sog: 0, pim: 0 });
    p.gp++; p.g += r.g || 0; p.a += r.a || 0; p.pm += r.pm || 0; p.sog += r.sh || 0; p.pim += r.pim || 0; });
  const skaters = Object.entries(sk).map(([n, p]) => ({ n, ...p, p: p.g + p.a }))
    .sort((x, y) => y.p - x.p || y.g - x.g || y.pm - x.pm || x.gp - y.gp || x.n.localeCompare(y.n));
  const gl = {};
  (DATA.goalieRows || []).filter(r => r.season.includes(yrs)).forEach(r => { const g = gl[r.player] || (gl[r.player] = { gp: 0, sa: 0, sv: 0, ga: 0 });
    g.gp++; g.sa += r.shotsFaced || 0; g.sv += r.saves || 0; g.ga += r.ga || 0; });

  // upcoming games from the EHL calendar ("10. Oktobris" -> date)
  const upIso = g => { const m = String(g.date || '').toLowerCase().match(/(\d{1,2})\.?\s*([a-zāčēģīķļņšūž]+)/); if (!m) return null;
    const mi = LV_MONTHS.findIndex(x => m[2].startsWith(x)); if (mi < 0) return null;
    const ref = new Date(g.fetchedAt || Date.now()); let y = ref.getFullYear(); if (mi < ref.getMonth() - 2) y++;
    return `${y}-${String(mi + 1).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`; };
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (DATA.upcomingGames || []).map(g => ({ g, d: upIso(g) })).filter(x => x.d && x.d >= today).sort((x, y) => x.d < y.d ? -1 : 1).slice(0, 6);

  const sign = n => n > 0 ? '+' + n : String(n);
  const resultsHtml = `<div class="scroll-x"><table class="ovt"><tr><th>Datums</th><th>Pretinieks</th><th class="num">Score</th><th></th></tr>
    ${games.slice().reverse().map(g => `<tr><td>${shortDate(g.date)}</td><td>${g.home ? 'vs' : '@'} ${logo(g.opp)}${esc(g.opp)}</td>
      <td class="num">${g.us}-${g.them}<span class="r ${g.r}">${g.r}</span>${otTag(DECIDED[g.date])}</td><td class="num"><a href="#stats" data-boxdate="${g.date}">Boxscore</a></td></tr>`).join('')}</table></div>`;
  const upcomingHtml = upcoming.map(({ g, d }) => `<div class="ov-up"><span class="when">${shortDate(d)}</span>
    <span>${g.isHome ? 'vs' : '@'} ${logo(g.opponent)}${esc(g.opponent)}${g.time ? ' · ' + g.time : ''}${g.arena ? ' · ' + esc(nice(g.arena)) : ''}</span></div>`).join('')
    || '<div class="empty-note">Nothing scheduled yet</div>';
  const scoringRows = skaters.map((p, i) => `<tr${i >= 10 ? ' class="extra" style="display:none"' : ''}><td class="name">${playerLink(p.n)}</td><td class="num">${p.gp}</td><td class="num">${p.g}</td>
    <td class="num">${p.a}</td><td class="num"><b>${p.p}</b></td><td class="num">${sign(p.pm)}</td><td class="num">${p.sog}</td><td class="num">${p.pim}</td></tr>`).join('');
  const goalies = Object.entries(gl);
  const tableHtml = d => `<table class="ovt"><tr><th>#</th><th>Team</th><th class="num">GP</th><th class="num">PTS</th></tr>
    ${d.teams.map((t, i) => `<tr class="${[up(t.team) === up(LV) ? 'me' : '', i === 2 ? 'cut' : ''].join(' ')}"><td>${i + 1}</td><td class="name">${logo(t.team)}${esc(nice(t.team))}</td><td class="num">${t.gp ?? ''}</td><td class="num">${t.points ?? ''}</td></tr>`).join('')}</table>`;

  el.innerHTML = `
    <div class="ov-head"><img src="${teamLogo(LV)}" alt=""><div><div style="display:flex;align-items:center;gap:10px"><span class="div-badge">E5</span><span class="ov-title">${LV}</span></div>
      <div class="ov-sub">Season ${yrs}</div></div>
      <div class="ov-stats"><div class="ov-stat"><b>${W}-${L}</b><span>Bilance</span></div>
        <div class="ov-stat"><b>${ourPos >= 0 ? (ourPos + 1) + '. vieta' : '-'}</b><span>${ourPos >= 0 ? esc(nice(divs[ourDiv].division)) : 'E5'}</span></div>
        <div class="ov-stat"><b>${ourPos >= 0 ? divs[ourDiv].teams[ourPos].points : '-'}</b><span>Punkti</span></div>
        <div class="ov-stat"><b>${GF}-${GA}</b><span>Vārtu attiecība</span></div></div></div>
    <div class="ov-grid">
      <div>
        <div class="panel ov-switch"><div class="panel-head"><span class="league-group-title">Games</span>${chips(['Results', 'Upcoming'], 0)}</div>${parts([resultsHtml, upcomingHtml], 0)}</div>
        ${goalies.length ? `<div class="panel"><div class="panel-head"><span class="league-group-title">Goalies</span></div><table class="ovt"><tr><th>Goalie</th><th class="num">GP</th><th class="num">SA</th><th class="num">SV</th><th class="num">GA</th><th class="num">SV%</th></tr>
          ${goalies.map(([n, g]) => `<tr><td class="name">${playerLink(n)}</td><td class="num">${g.gp}</td><td class="num">${g.sa}</td><td class="num">${g.sv}</td><td class="num">${g.ga}</td><td class="num"><b>${g.sa ? (100 * g.sv / g.sa).toFixed(1) + '%' : '-'}</b></td></tr>`).join('')}</table></div>` : ''}
      </div>
      <div>
        <div class="panel"><div class="panel-head"><span class="league-group-title">Player scoring</span></div><div class="scroll-x"><table class="ovt" id="ovScoring"><tr><th>Player</th><th class="num">GP</th><th class="num">G</th><th class="num">A</th><th class="num">P</th><th class="num">+/-</th><th class="num">SOG</th><th class="num">PIM</th></tr>${scoringRows}</table></div>
          ${skaters.length > 10 ? `<button class="more-btn" id="ovMore">Show all ${skaters.length} players</button>` : ''}</div>
      </div>
      <div>
        ${divs.length ? `<div class="panel ov-switch"><div class="panel-head"><span class="league-group-title">E5 table</span>${divs.length > 1 ? chips(divs.map(d => nice(d.division)), ourDiv) : ''}</div>${parts(divs.map(tableHtml), ourDiv)}</div>` : ''}
      </div>
    </div>`;

  el.addEventListener('click', e => {
    const b = e.target.closest('.ov-switch .grp-chips button');
    if (b) { const box = b.closest('.ov-switch');
      box.querySelectorAll('.grp-chips button').forEach(x => x.classList.toggle('on', x === b));
      box.querySelectorAll('.ov-part').forEach(d => d.style.display = d.dataset.i === b.dataset.i ? '' : 'none'); }
    if (e.target.id === 'ovMore') { const open = e.target.dataset.open !== '1';
      el.querySelectorAll('#ovScoring tr.extra').forEach(r => r.style.display = open ? '' : 'none');
      e.target.dataset.open = open ? '1' : '0'; e.target.textContent = open ? 'Show top 10' : `Show all ${skaters.length} players`; }
  });
})();

// ---------------- Home ----------------
// One box per club team (E5, E7, E9): next game, last results, season so far, this week.
// E5 uses the game sheet for our own games; E7 / E9 and all opponents come from the EHL calendar
// (DATA.club, filled in by refresh-data.js).
(function(){
  const CLUB = DATA.club || {};
  const TABLES = DATA.leagueTables || { E5: DATA.leagueTable };
  // names as the EHL calendar writes them -> names used in the game sheet / logo list
  const ALIAS = { 'Warriors':'Ice Warriors', 'Ice Wolves II':'Ice Wolves', 'Iecava/Mammoths':'Mammoths',
    'Leģendas V':'Pilsētas Leģendas', 'Sparta II':'Sparta 2', 'Moltto Plus':'Moltto' };
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const WD = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const pad = n => String(n).padStart(2, '0');
  const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const fmt = s => { const [y,m,d] = s.split('-').map(Number); return `${WD[new Date(y,m-1,d).getDay()]} ${d} ${MON[m-1]}`; };
  const tc = s => String(s||'').toLowerCase().replace(/(^|[\s/-])\S/g, c => c.toUpperCase());
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  const ord = n => n + (n===1 ? 'st' : n===2 ? 'nd' : n===3 ? 'rd' : 'th');
  const plain = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate()), todayIso = isoOf(today);
  const res = (a, b) => a > b ? 'W' : a < b ? 'L' : 'D';

  const pos = (div, name) => {
    for (const d of ((TABLES[div] && TABLES[div].divisions) || [])) {
      const i = d.teams.findIndex(t => plain(t.team) === plain(name) || plain(t.team) === plain(ALIAS[name]));
      if (i >= 0) return { n: i + 1, pts: d.teams[i].points, div: tc(d.division) };
    }
    return null;
  };
  const initials = n => String(n).split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 3).toUpperCase();
  const logoHtml = (src, name, size) => src ? `<img src="${src}" alt="" style="width:${size}px;height:${size}px;object-fit:contain">`
    : `<div class="ph-logo" style="width:${size}px;height:${size}px;font-size:${Math.round(size / 3)}px">${esc(initials(name))}</div>`;
  const knownLogo = name => { const i = teamInfo(ALIAS[name] || name); return i && i.logo ? i.logo : null; };
  const ldvLogo = teamLogo('Ledus Veči');

  // one team's EHL games from that team's point of view
  function ehlPersp(g, abbr, names){
    const home = g.home.abbr === abbr, us = home ? g.home : g.away, them = home ? g.away : g.home;
    return { date: g.date, home, opp: names[them.abbr] || them.abbr, oppAbbr: them.abbr,
      us: home ? g.hg : g.ag, them: home ? g.ag : g.hg, result: g.played ? res(home ? g.hg : g.ag, home ? g.ag : g.hg) : null, link: g.protocol };
  }

  // ---- build the same shape for every team ----
  function modelE5(){
    const games = DATA.boxscores.filter(b => b.date).slice().sort((a, b) => a.date < b.date ? -1 : 1);
    const persp = b => { const h = b.lvIsHome; return { date: b.date, home: h, opp: h ? b.awayTeam : b.homeTeam,
      us: h ? b.htGoals : b.atGoals, them: h ? b.atGoals : b.htGoals, result: b.result, link: '#box:' + b.date, decided: decidedBy(b) }; };
    const LV_MONTHS = ['jan','feb','mar','apr','mai','jūn','jūl','aug','sep','okt','nov','dec'];
    const gameDate = g => { const m = String(g.date||'').toLowerCase().match(/(\d{1,2})\.?\s*([a-zāčēģīķļņšūž]+)/); if (!m) return null;
      const mi = LV_MONTHS.findIndex(x => m[2].startsWith(x)); if (mi < 0) return null;
      const ref = new Date(g.fetchedAt || Date.now()); let y = ref.getFullYear(); if (mi < ref.getMonth() - 2) y++; return isoOf(new Date(y, mi, +m[1])); };
    const up = (DATA.upcomingGames || []).map(g => ({ g, d: gameDate(g) })).filter(x => x.d && x.d >= todayIso).sort((a, b) => a.d < b.d ? -1 : 1)[0];
    const played = games.map(persp);
    const last = played[played.length - 1];
    const yrs = last ? ((games[games.length - 1].season.match(/\d{4}-\d{4}/) || [''])[0]) : '';
    const season = games.filter(b => b.season.includes(yrs)).map(persp);
    const next = up && { date: up.d, time: up.g.time, arena: up.g.arena ? tc(up.g.arena) : '', home: up.g.isHome, opp: up.g.opponent };
    const h2h = next ? played.filter(p => p.opp === next.opp || p.opp === ALIAS[next.opp]) : [];
    const opp = CLUB.E5 && CLUB.E5.opponent && next && plain(CLUB.E5.opponent.name) === plain(next.opp) ? CLUB.E5.opponent : (CLUB.E5 && CLUB.E5.opponent);
    return { div: 'E5', name: 'Ledus Veči', logo: ldvLogo, played, season, next, h2h, h2hLink: true,
      oppPlayed: oppGames(opp, CLUB.E5), oppLogo: next ? knownLogo(next.opp) : null };
  }
  function oppGames(opp, team){
    if (!opp || !opp.games) return [];
    const names = Object.assign({}, team && team.names, { [opp.abbr]: opp.name });
    return opp.games.filter(g => g.played && g.date).sort((a, b) => a.date < b.date ? -1 : 1).map(g => ehlPersp(g, opp.abbr, names));
  }
  function modelEhl(div){
    const t = CLUB[div]; if (!t || !t.abbr) return null;
    const names = t.names || {};
    const games = (t.games || []).filter(g => g.date).sort((a, b) => a.date < b.date ? -1 : 1);
    const played = games.filter(g => g.played).map(g => ehlPersp(g, t.abbr, names));
    const nx = games.find(g => !g.played && g.date >= todayIso);
    const next = nx && (p => ({ date: nx.date, time: nx.time, arena: nx.arena ? tc(nx.arena) : '', home: p.home,
      opp: (t.opponent && t.opponent.abbr === p.oppAbbr) ? t.opponent.name : p.opp }))(ehlPersp(nx, t.abbr, names));
    const oppAbbr = nx ? ehlPersp(nx, t.abbr, names).oppAbbr : null;
    return { div, name: t.name, logo: ldvLogo, played, season: played, next,
      h2h: played.filter(p => p.oppAbbr === oppAbbr), h2hLink: false,
      oppPlayed: oppGames(t.opponent, t), oppLogo: (next && logoFor(next.opp)) || (oppAbbr && t.logos ? t.logos[oppAbbr] || null : null), ehlUpcoming: games.filter(g => !g.played) };
  }

  // ---- this week (Mon-Sun): games, the shared practice, players' birthdays and name days ----
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (today.getDay() + 6) % 7);
  function weekRows(t){
    const rows = [];
    const R = DATA.teamRosters || {};
    const people = t.div === 'E5' ? [] : ((R.teams && R.teams[t.div]) || []).map(id => R.people[id]).filter(Boolean);
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i), ds = isoOf(d), md = ds.slice(5);
      let ev;
      if (t.div === 'E5') ev = (window.calEventsOn ? window.calEventsOn(ds) : []).filter(e => e.type !== 'game' || e.div === 'E5');
      else {
        ev = (window.calEventsOn ? window.calEventsOn(ds) : []).filter(e => e.type === 'practice');
        (t.ehlUpcoming || []).filter(g => g.date === ds).forEach(g => { const p = ehlPersp(g, CLUB[t.div].abbr, CLUB[t.div].names || {});
          ev.unshift({ type: 'game', text: [`${p.home ? 'vs' : 'at'} ${p.opp}`, g.time, g.arena ? tc(g.arena) : ''].filter(Boolean).join(' · ') }); });
        people.forEach(p => {
          if (p.birthday && p.birthday.slice(5) === md) ev.push({ type: 'bday', text: `Birthday: ${p.name}` });
          if (p.nameDay && p.nameDay.d === md) ev.push({ type: 'nday', text: `Name day: ${p.name}${p.nameDay.special ? ' (day of uncommon names)' : ''}` });
        });
      }
      ev.forEach(e => rows.push(`<div class="cal-row t-${e.type}"${ds < todayIso ? ' style="opacity:.45"' : ''}><span class="when">${ds === todayIso ? 'Today' : WD[d.getDay()]}</span><span class="cal-dot"></span><span>${esc(e.text)}</span></div>`));
    }
    return rows.join('') || '<div class="empty-note">Nothing on this week</div>';
  }

  // ---- render one team box ----
  // hover text for a W / L / D box: "vs Huligan 1-2 · 30. sept."
  const LVM = ['janv.','febr.','marts','apr.','maijs','jūn.','jūl.','aug.','sept.','okt.','nov.','dec.'];
  const tip = p => { const [, m, d] = String(p.date || '').split('-').map(Number);
    return esc(`${p.home ? 'vs' : '@'} ${p.opp} ${p.us}-${p.them}${d ? ` · ${d}. ${LVM[m - 1]}` : ''}`); };
  const form = (list, away) => `<div class="match-form">${away ? '' : '<span class="lbl5" style="margin-left:0">Last 5</span>'}${list.slice(-5).map(p => `<span class="f ${p.result}" data-tip="${tip(p)}">${p.result}</span>`).join('')}${away ? '<span class="lbl5" style="margin-right:0">Last 5</span>' : ''}</div>`;
  const boxLink = (link, label) => !link ? '' : link.startsWith('#box:')
    ? `<a href="#stats" data-boxdate="${link.slice(5)}">${label}</a>` : `<a href="${link}" target="_blank" rel="noopener">${label}</a>`;
  const resRow = (logo, name, p) => !p ? '' : `<div class="res-row">${logoHtml(logo, name, 30)}<div style="min-width:0">
      <div class="line">${esc(name === 'Ledus Veči' || name.startsWith('Ledus Veči ') ? '' : name + ' ')}${p.home ? 'vs' : 'at'} ${esc(p.opp)} ${p.us}-${p.them}<span class="home-res ${p.result}">${p.result}</span>${otTag(p.decided)}</div>
      <div class="home-sub">${fmt(p.date)}${p.link ? ' · ' + boxLink(p.link, 'Boxscore') : ''}</div></div></div>`;

  function block(t){
    if (!t) return '';
    const n = t.next, us = pos(t.div, t.name);
    let matchHtml;
    if (n) {
      const nd = n.date.split('-').map(Number), days = Math.round((new Date(nd[0], nd[1] - 1, nd[2]) - today) / 864e5);
      const cd = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`;
      const side = (name, logo, p, list, away) => `<div class="match-team${away ? ' away' : ''}">${logoHtml(logo, name, 72)}<div><div class="match-name">${esc(name)}</div>${p ? `<div class="match-pos">${ord(p.n)} in ${esc(p.div)} · ${p.pts} pts</div>` : ''}${list.length ? form(list, away) : ''}</div></div>`;
      const mine = [t.name, t.logo, us, t.played], theirs = [n.opp, t.oppLogo, pos(t.div, n.opp), t.oppPlayed];
      const [L, R] = n.home ? [mine, theirs] : [theirs, mine];
      const w = t.h2h.filter(p => p.result === 'W').length, l = t.h2h.filter(p => p.result === 'L').length;
      const lm = t.h2h[t.h2h.length - 1];
      matchHtml = `<div class="match-top"><div><div class="match-label"><span class="div-badge">${t.div}</span><span class="league-group-title" style="margin:0">Next game</span></div>
          <div class="match-when">${[fmt(n.date), n.time, n.arena].filter(Boolean).join(' · ')}</div></div><span class="countdown">${cd}</span></div>
        <div class="match-teams">${side(...L)}<div class="match-vs">VS</div>${side(...R, true)}</div>
        <div class="match-foot">${t.h2h.length ? `<span>Head-to-head <b>${w}-${l}</b></span>${lm ? `<span>Last meeting <b>${lm.us}-${lm.them}</b><span class="home-res ${lm.result}">${lm.result}</span>${otTag(lm.decided)} ${fmt(lm.date)} ${lm.date.slice(0, 4)}${lm.link ? ' · ' + boxLink(lm.link, 'Boxscore') : ''}</span>` : ''}` : '<span>First meeting</span>'}</div>`;
    } else {
      matchHtml = `<div class="match-label"><span class="div-badge">${t.div}</span><span class="league-group-title" style="margin:0">Next game</span></div><div class="empty-note">No upcoming games in the EHL calendar yet</div>`;
    }
    const lastUs = t.played[t.played.length - 1], lastThem = t.oppPlayed[t.oppPlayed.length - 1];
    const W = t.season.filter(p => p.result === 'W').length, Lc = t.season.filter(p => p.result === 'L').length;
    // Last results / Season so far / This week share one box with a switch, next to the Next game card
    const tabs = [
      ['Last results', `${resRow(t.logo, t.name, lastUs)}${n ? resRow(t.oppLogo, n.opp, lastThem) : ''}${!lastUs && !lastThem ? '<div class="empty-note">No games played yet</div>' : ''}`],
      ['Season so far', `<div class="home-big">${W}-${Lc}${us ? ` · ${ord(us.n)}` : ''}</div>
        <div class="home-sub">${t.season.length} games${us ? ` · ${us.pts} pts in ${esc(us.div)}` : ''}</div>
        <div class="home-form">${t.season.slice(-5).map(p => `<span class="${p.result}" data-tip="${tip(p)}">${p.result}</span>`).join('')}</div>`],
      ['This week', weekRows(t)],
    ];
    return `<section class="team-block"><div class="home-top">
      <div class="match">${matchHtml}</div>
      <div class="panel combo"><div class="grp-chips">${tabs.map((x, i) => `<button data-i="${i}" class="${i === 0 ? 'on' : ''}">${x[0]}</button>`).join('')}</div>
        ${tabs.map((x, i) => `<div class="combo-body" data-i="${i}"${i ? ' style="display:none"' : ''}>${x[1]}</div>`).join('')}</div>
    </div></section>`;
  }

  const blocks = [];
  try { blocks.push(block(modelE5())); } catch (e) { console.error('home E5:', e); }
  ['E7', 'E9'].forEach(div => { try { blocks.push(block(modelEhl(div))); } catch (e) { console.error('home ' + div + ':', e); } });
  document.getElementById('teamBlocks').innerHTML = blocks.join('');

  document.getElementById('teamBlocks').addEventListener('click', e => {
    const b = e.target.closest('.combo .grp-chips button'); if (!b) return;
    const box = b.closest('.combo');
    box.querySelectorAll('.grp-chips button').forEach(x => x.classList.toggle('on', x === b));
    box.querySelectorAll('.combo-body').forEach(d => d.style.display = d.dataset.i === b.dataset.i ? '' : 'none');
  });
  // Boxscore links for our own E5 games (home page and Overview) open that game in Stats > Boxscore
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-boxdate]'); if (!a) return;
    e.preventDefault();
    const sel = document.getElementById('gameSelect');
    const find = () => sel && [...sel.options].find(o => o.textContent.startsWith(a.dataset.boxdate));
    let opt = find();
    const ss = document.getElementById('seasonSelect');
    if (!opt && ss && [...ss.options].some(o => o.value === 'ALL')) { ss.value = 'ALL'; ss.dispatchEvent(new Event('change')); opt = find(); }
    if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change')); }
    document.querySelector('.tab-btn[data-tab="box"]').click(); window.scrollTo(0, 0);
  });
  // sponsor boxes without a website yet are not clickable
  document.querySelectorAll('.sponsor').forEach(a => { if (!a.getAttribute('href')) { a.removeAttribute('href'); a.style.cursor = 'default'; } });
})();
showSection(location.hash.slice(1) || 'home');

// ---------------- Season picker with season badges ----------------
// Replaces the look of the season dropdowns; the original <select> stays (hidden) and still drives everything.
(function(){
  const badge = v => {
    if (!v || v === 'ALL') return null;
    if (v.startsWith('TOTAL:')) { const y = v.slice(6); return seasonLogo('Reg. Season ' + y) || seasonLogo('Playoffs ' + y); }
    return seasonLogo(v);
  };
  const img = v => { const b = badge(v); return b ? `<img src="${b}" alt="">` : '<span class="ph"></span>'; };
  function enhance(sel){
    if (!sel || sel.dataset.dd) return; sel.dataset.dd = '1';
    const wrap = document.createElement('div'); wrap.className = 'season-dd';
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'season-dd-btn';
    const menu = document.createElement('div'); menu.className = 'season-dd-menu';
    sel.parentNode.insertBefore(wrap, sel); wrap.append(btn, menu, sel); sel.style.display = 'none';
    const label = opt => { const g = opt.parentElement.tagName === 'OPTGROUP' ? opt.parentElement.label : '';
      return g ? `<span>${g}</span> · <span>${opt.textContent}</span>` : `<span>${opt.textContent}</span>`; };
    function draw(){
      const cur = sel.options[sel.selectedIndex];
      btn.innerHTML = `${img(sel.value)}<span>${cur ? label(cur) : ''}</span><span class="caret">▾</span>`;
      let html = '';
      [...sel.children].forEach(ch => {
        if (ch.tagName === 'OPTGROUP') {
          html += `<div class="grp">${ch.label}</div>`;
          [...ch.children].forEach(o => html += `<button type="button" data-v="${o.value}" class="${o.value === sel.value ? 'on' : ''}">${img(o.value)}<span>${o.textContent}</span></button>`);
        } else html += `<button type="button" data-v="${ch.value}" class="${ch.value === sel.value ? 'on' : ''}">${img(ch.value)}<span>${ch.textContent}</span></button>`;
      });
      menu.innerHTML = html;
    }
    btn.addEventListener('click', e => { e.stopPropagation(); document.querySelectorAll('.season-dd.open').forEach(d => d !== wrap && d.classList.remove('open')); wrap.classList.toggle('open'); });
    menu.addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (!b) return;
      sel.value = b.dataset.v; sel.dispatchEvent(new Event('change')); wrap.classList.remove('open'); draw(); });
    sel.addEventListener('change', draw);
    draw();
  }
  document.addEventListener('click', () => document.querySelectorAll('.season-dd.open').forEach(d => d.classList.remove('open')));
  ['seasonSelect', 'statsSeasonSelect', 'teamSeasonSelect'].forEach(id => enhance(document.getElementById(id)));
})();

// ---------------- E5 table: Ziemeļi / Dienvidi switch (opens on our group) ----------------
(function(){
  const box = document.getElementById('leagueSwitchBox'); if (!box) return;
  const show = g => { box.classList.remove('show-Z', 'show-D'); box.classList.add('show-' + g);
    box.querySelectorAll('.grp-chips button').forEach(b => b.classList.toggle('on', b.dataset.g === g)); };
  box.querySelector('.grp-chips').addEventListener('click', e => { const b = e.target.closest('button[data-g]'); if (b) show(b.dataset.g); });
  const ours = () => document.querySelector('#leagueDienvidi tr.ldv-row') ? 'D' : 'Z';
  show(ours());
  new MutationObserver(() => show(ours())).observe(document.getElementById('leagueDienvidi'), { childList: true });
})();

// ---------------- Lineup: one line at a time, hover cards, table for the chosen line ----------------
(function(){
  const rink = document.getElementById('lineupRink'), chips = document.getElementById('lineChips');
  if (!rink || !chips) return;
  let cur = 0;
  const slotName = slot => slot.dataset.n || '';
  function filterTable(names){
    const tb = document.querySelector('#skaterBoxTable tbody'); if (!tb) return;
    tb.querySelectorAll('tr.line-total').forEach(r => r.remove());
    const rows = [...tb.querySelectorAll('tr')].filter(r => r.children.length >= 9);
    const shown = rows.filter(r => { const ok = names.some(n => r.children[1].textContent.includes(n)); r.style.display = ok ? '' : 'none'; return ok; });
    tb.querySelectorAll('tr').forEach(r => { if (r.children.length < 9 && r.previousElementSibling && r.previousElementSibling.style.display === 'none') r.style.display = 'none'; });
    const num = (r, i) => parseFloat(String(r.children[i].textContent).replace('+', '')) || 0;
    const sum = i => shown.reduce((s, r) => s + num(r, i), 0);
    const sk = (window.__BOX && window.__BOX.skaters || []).filter(s => names.includes(s.player));
    const fow = sk.reduce((s, x) => s + (x.fow || 0), 0), fot = sk.reduce((s, x) => s + (x.fot || 0), 0);
    const pm = sum(8);
    const tr = document.createElement('tr'); tr.className = 'line-total';
    tr.innerHTML = `<td></td><td style="text-align:left">Maiņa kopā</td><td></td><td>${sum(3)}</td><td>${sum(4)}</td><td>${sum(5)}</td><td>${sum(6)}</td><td>${sum(7)}</td><td>${pm > 0 ? '+' + pm : pm}</td><td>${fot ? Math.round(fow / fot * 1000) / 10 + '%' : '—'}</td>`;
    tb.appendChild(tr);
    const t = document.getElementById('lineTitle'); if (t) t.textContent = chips.children.length ? ` · ${cur + 1}. maiņa` : '';
  }
  function apply(){
    const rows = [...rink.children].filter(r => r.classList.contains('rink-row'));
    const fwd = rows.filter(r => !r.matches('.def,.gk')), def = rows.filter(r => r.matches('.def')), gk = rows.filter(r => r.matches('.gk'));
    const n = Math.max(fwd.length, def.length);
    if (cur >= n) cur = 0;
    chips.innerHTML = n > 1 ? Array.from({ length: n }, (_, i) => `<button type="button" data-l="${i}" class="${i === cur ? 'on' : ''}">${i + 1}. maiņa</button>`).join('') : '';
    rows.forEach(r => r.classList.remove('show'));
    [fwd[cur], def[cur], ...gk].forEach(r => r && r.classList.add('show'));
    const names = [fwd[cur], def[cur]].filter(Boolean).flatMap(r => [...r.querySelectorAll('.slot')].map(slotName)).filter(Boolean);
    filterTable(names);
  }
  chips.addEventListener('click', e => { const b = e.target.closest('button[data-l]'); if (b) { cur = +b.dataset.l; apply(); } });
  new MutationObserver(muts => { if (muts.some(m => [...m.addedNodes].some(x => x.classList && x.classList.contains('rink-row')))) apply(); }).observe(rink, { childList: true });
  apply();

  // hover (or tap) a player on the rink: their stats for this game
  const pop = document.createElement('div'); pop.className = 'slot-pop'; rink.appendChild(pop);
  const pct = v => v == null ? '—' : Math.round(v * 1000) / 10 + '%', sgn = v => v > 0 ? '+' + v : String(v ?? 0);
  function showPop(slot){
    const name = slot.dataset.n, B = window.__BOX; if (!name || !B) return;
    const s = B.skaters.find(x => x.player === name), g = B.goalies.find(x => x.player === name);
    if (!s && !g) return;
    const photo = DATA.playerPhotos && DATA.playerPhotos[name];
    const pos = (slot.querySelector('.slot-label') || {}).textContent || '';
    const head = `<div class="pc-head">${photo ? `<img src="${photo}" alt="">` : ''}<div><div class="pc-name">${name}</div><div class="pc-meta">#${ROSTER_NR[name] ?? ''} · ${pos}</div></div></div>`;
    let body;
    if (s) {
      const sog = s.sh || 0, att = s.shAtt || 0, fow = s.fow || 0, fot = s.fot || 0;
      body = `<div class="pc-trio"><div><b>${s.g}</b><span>G</span></div><div><b>${s.a}</b><span>A</span></div><div class="hl"><b>${s.g + s.a}</b><span>P</span></div></div>
        <div class="pc-bar"><div class="t"><span>SOG / Shots</span><span><b>${sog}</b> / ${att} · Shot% <b>${pct(s.shPct)}</b></span></div><div class="track"><div class="fill" style="width:${att ? sog / att * 100 : 0}%"></div></div></div>
        ${fot ? `<div class="pc-bar"><div class="t"><span>FOW / FOT</span><span><b>${fow}</b> / ${fot} · <b>${pct(s.foPct)}</b></span></div><div class="track"><div class="fill mg" style="width:${fow / fot * 100}%"></div></div></div>` : ''}
        <div class="pc-all">${[['Shots', att], ['SOG', sog], ['Shot%', pct(s.shPct)], ['BLK', s.bl ?? 0], ['PIM', s.pim ?? 0], ['PIM/A', s.pimA ?? 0],
          ['+/-', sgn(s.pm), s.pm > 0 ? 'pos' : s.pm < 0 ? 'neg' : ''], ['+/- adj', sgn(s.pmAdj), s.pmAdj > 0 ? 'pos' : s.pmAdj < 0 ? 'neg' : ''],
          ['FOW/FOT', fot ? fow + '/' + fot : '0/0'], ['FO%', fot ? pct(s.foPct) : '—']]
          .map(([l, v, c]) => `<div class="${c || ''}"><b>${v}</b><span>${l}</span></div>`).join('')}</div>`;
    } else {
      const sv = g.savePct || 0, col = sv >= 91 ? '#4CC98E' : sv >= 85 ? '#E8B24F' : '#E15A5A';
      body = `<div class="pc-ring"><div class="c" style="background:conic-gradient(${col} ${sv}%, #2A3340 0)"><div>${sv}%</div></div>
        <div class="k">Atvairīti <b>${g.saves}</b> no <b>${g.shotsFaced}</b> metieniem<br>GA <b>${g.ga}</b></div></div>
        <div class="pc-all">${[['Shots faced', g.shotsFaced], ['Saves', g.saves], ['GA', g.ga], ['SV%', sv + '%']].map(([l, v]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}</div>`;
    }
    pop.innerHTML = head + `<div class="pc-body">${body}</div>`;
    pop.style.display = 'block';
    const r = rink.getBoundingClientRect(), q = slot.getBoundingClientRect();
    let left = Math.max(4, Math.min(q.left - r.left + q.width / 2 - pop.offsetWidth / 2, r.width - pop.offsetWidth - 4));
    const lower = (q.top + q.height / 2 - r.top) > r.height * 0.45;
    pop.style.left = left + 'px';
    pop.style.top = (lower ? Math.max(4, q.top - r.top - pop.offsetHeight - 8) : q.bottom - r.top + 8) + 'px';
  }
  rink.addEventListener('mouseover', e => { const s = e.target.closest('.slot'); if (s) showPop(s); });
  rink.addEventListener('mouseleave', () => { pop.style.display = 'none'; });
  rink.addEventListener('mouseout', e => { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('.slot')) pop.style.display = 'none'; });
})();

// ---------------- E5 table: click a column header to sort ----------------
// 1st click: highest first (lowest first for GA), 2nd click: the other way, 3rd click: back to the standings.
(function(){
  const box = document.getElementById('leagueSwitchBox'); if (!box) return;
  const LOW_FIRST = { GA: true, Team: true };
  let key = null, dir = 0;   // dir: 1 = natural (high first), -1 = reversed
  const val = (td, k) => k === 'Team' ? td.textContent.trim().toLowerCase() : (parseFloat(td.textContent.replace('%', '')) || (td.textContent.trim() === '—' ? -Infinity : 0));
  function apply(){
    box.classList.toggle('sorted', !!key);
    box.querySelectorAll('table.league-table').forEach(t => {
      const heads = [...t.querySelectorAll('thead th')], tb = t.querySelector('tbody');
      heads.forEach(h => { h.dataset.k = h.dataset.k || h.textContent.trim(); h.classList.toggle('sort-on', h.dataset.k === key);
        h.dataset.arrow = h.dataset.k === key ? (((dir === 1) !== !!LOW_FIRST[key]) ? '▼' : '▲') : ''; });
      const rows = [...tb.querySelectorAll('tr')];
      rows.forEach((r, i) => { if (r.dataset.rank === undefined) r.dataset.rank = i; });
      const ci = heads.findIndex(h => h.dataset.k === key);
      rows.sort((a, b) => {
        if (!key || ci < 0) return a.dataset.rank - b.dataset.rank;
        const va = val(a.children[ci], key), vb = val(b.children[ci], key);
        let c = typeof va === 'string' ? va.localeCompare(vb) : (vb - va);
        if (LOW_FIRST[key]) c = -c;
        return (c * dir) || (a.dataset.rank - b.dataset.rank);
      }).forEach(r => tb.appendChild(r));
    });
  }
  box.addEventListener('click', e => {
    const th = e.target.closest('table.league-table thead th'); if (!th) return;
    const k = th.dataset.k || th.textContent.trim();
    if (key !== k) { key = k; dir = 1; } else if (dir === 1) dir = -1; else { key = null; dir = 0; }
    apply();
  });
  apply();
})();

// Player stats: choosing Ledus Veči II / III shows that team's numbers for the same player right here
// The season picker and the highlight filter work here too (for II / III: season by game date, highlights from the protocols)
function showOtherTeam(){
  const sv = document.getElementById('statsView'), box = document.getElementById('statsOtherTeam'), div = STATS_TEAM;
  if (div === 'E5') { sv.classList.remove('show-other'); box.innerHTML = ''; return; }
  const v = document.getElementById(div === 'E7' ? 'lv2View' : 'lv3View');
  const opts = { season: statsSeasonSelect.value, hlOnly: statsHighlightOnly.checked };
  box.innerHTML = (v && v._playerView && v._playerView(statsPlayerSelect.value, opts)) || '<div class="empty-note" style="padding:20px 0">Nav datu šai komandai</div>';
  sv.classList.add('show-other');
}
document.getElementById('statsTeamSelect') && document.getElementById('statsTeamSelect').addEventListener('change', e => { STATS_TEAM = e.target.value; showOtherTeam(); });

// ---------------- Ledus Veči II (E7) and III (E9) statistika ----------------
// Built from EHL data: games and results (team calendar), protocols (goals, assists, penalties, shots, goalie),
// division table, roster. Highlight links come from the "Highlights" sheet tab. Same look as the Ledus Veči pages.
(function(){
  const MON = ['janv.','febr.','marts','apr.','maijs','jūn.','jūl.','aug.','sept.','okt.','nov.','dec.'];
  const WDS = ['Svētd.','Pirmd.','Otrd.','Trešd.','Ceturtd.','Piektd.','Sestd.'];
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  const up = s => String(s || '').trim().toUpperCase();
  const nice = s => String(s || '').toLowerCase().replace(/(^|[\s/-])\S/g, c => c.toUpperCase()).replace(/\b(Ii|Iii|Iv|Vi)\b/g, m => m.toUpperCase()).replace(/&amp;/g, '&');
  const dShort = iso => { const [, m, d] = iso.split('-').map(Number); return `${d}. ${MON[m - 1]}`; };
  const dLong = iso => { const [y, m, d] = iso.split('-').map(Number); return `${WDS[new Date(y, m - 1, d).getDay()]}, ${d}. ${MON[m - 1]} ${y}`; };
  const today = new Date().toISOString().slice(0, 10);
  const initials = n => String(n).split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const logoImg = (url, name, cls = 'tlogo') => url ? `<img class="${cls}" src="${url}" alt="">` : `<span class="tlogo ph">${esc(initials(name))}</span>`;
  const bigLogo = (url, name) => url ? `<img src="${url}" alt="" style="width:84px;height:84px;object-fit:contain">` : `<div class="ph-logo" style="width:84px;height:84px;font-size:28px">${esc(initials(name))}</div>`;
  const res = (a, b) => a > b ? 'W' : a < b ? 'L' : 'D';
  const pc = v => v == null || isNaN(v) ? '—' : Math.round(v * 10) / 10 + '%';
  const sgn = v => v > 0 ? '+' + v : String(v);
  const POS = [['F', 'Uzbrucēji'], ['D', 'Aizsargi'], ['G', 'Vārtsargi']];
  const POSL = { F: 'FWD', D: 'DEF', G: 'GK' };
  const photo = (ehl, size = 'px150') => { const id = (String(ehl || '').match(/\/personas\/[a-z0-9-]+\/(\d+)/) || [])[1];
    return id ? `https://ehl.entuziasti.com/uploads/player/${size}/player_${id}.jpg` : null; };
  const plink = n => n ? `<a href="#" class="player-link" data-player="${esc(n)}">${esc(n)}</a>` : '';
  const imgOrPh = (src, cls) => src ? `<img class="${cls}" src="${src}" alt="" onerror="this.outerHTML='<div class=&quot;${cls} ph&quot;></div>'">` : `<div class="${cls} ph"></div>`;
  const chips = (list, on) => `<div class="grp-chips">${list.map((n, i) => `<button type="button" data-i="${i}" class="${i === on ? 'on' : ''}">${esc(n)}</button>`).join('')}</div>`;
  const parts = (list, on) => list.map((b, i) => `<div class="ov-part" data-i="${i}"${i === on ? '' : ' style="display:none"'}>${b}</div>`).join('');
  const duel = (lbl, f, ag, cls, lowGood) => { const sh = (f + ag) ? f / (f + ag) * 100 : 50, df = f - ag, good = lowGood ? -df : df;
    return `<div class="pd"><div class="lbl">${lbl}</div><div class="t"><b>${f}</b><span class="sep">:</span><b class="ag">${ag}</b><span class="df ${good > 0 ? 'pos' : good < 0 ? 'neg' : ''}">${sgn(df)}</span></div>
      <div class="duel ${cls}"><span class="g" style="width:${sh}%"></span><span class="a" style="width:${100 - sh}%"></span></div></div>`; };

  function render(view){
    const div = view.dataset.div, t = DATA.club && DATA.club[div];
    if (!t || !t.games) { view.innerHTML = '<div class="wrap"><div class="empty-note" style="padding:30px 0">Dati vēl nav ielādēti.</div></div>'; return; }
    const names = t.names || {}, logos = t.logos || {};
    const logoKey = n => String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const fileLogo = n => logoFor(n);
    const prot = {}; ((DATA.clubGames && DATA.clubGames[div]) || []).forEach(p => prot[p.date] = p);
    const games = t.games.filter(g => g.date).sort((x, y) => x.date < y.date ? -1 : 1).map(g => {
      const home = g.home.abbr === t.abbr, o = home ? g.away : g.home, pr = prot[g.date] || null;
      return { date: g.date, home, opp: names[o.abbr] || o.abbr, logo: logoFor(names[o.abbr] || o.abbr) || logos[o.abbr] || null, played: g.played,
        us: home ? g.hg : g.ag, them: home ? g.ag : g.hg, r: g.played ? res(home ? g.hg : g.ag, home ? g.ag : g.hg) : null,
        time: g.time, arena: g.arena ? nice(g.arena) : '', link: g.protocol, pr, decided: pr ? pr.decided || '' : '',
        s: pr ? pr.shots.us : null, sa: pr ? pr.shots.them : null,
        pim: pr ? pr.penalties.filter(x => x.side === 'us').reduce((s, x) => s + x.min, 0) : null,
        pimA: pr ? pr.penalties.filter(x => x.side === 'them').reduce((s, x) => s + x.min, 0) : null }; });
    const played = games.filter(g => g.played), upcoming = games.filter(g => !g.played && g.date >= today);
    const W = played.filter(g => g.r === 'W').length, L = played.filter(g => g.r === 'L').length, D = played.filter(g => g.r === 'D').length;
    const sum = k => played.reduce((s, g) => s + (g[k] || 0), 0), GF = sum('us'), GA = sum('them');
    // shots and penalty minutes: from the protocols, or from the EHL team stats page until protocols are read
    const ts = ((DATA.clubTeamStats && DATA.clubTeamStats[div] && DATA.clubTeamStats[div].teams) || {})[up(t.name)] || {};
    const hasProt = played.some(g => g.pr);
    const S = hasProt ? sum('s') : (ts.s ?? 0), SA = hasProt ? sum('sa') : (ts.sa ?? 0), PIM = hasProt ? sum('pim') : (ts.pim ?? 0), PIMA = hasProt ? sum('pimA') : 0;
    const FOW = played.reduce((s, g) => s + (g.pr && g.pr.faceoffs ? g.pr.faceoffs.us : 0), 0), FOL = played.reduce((s, g) => s + (g.pr && g.pr.faceoffs ? g.pr.faceoffs.them : 0), 0);
    const gp = played.length || 1;
    const divs = (DATA.leagueTables && DATA.leagueTables[div] && DATA.leagueTables[div].divisions) || [];
    const ourDiv = Math.max(0, divs.findIndex(d => d.teams.some(x => up(x.team) === up(t.name))));
    const pos = divs[ourDiv] ? divs[ourDiv].teams.findIndex(x => up(x.team) === up(t.name)) : -1;
    // players: from the protocols when the bot has read them, otherwise just the EHL roster (no numbers yet)
    const fromProt = (DATA.clubPlayers && DATA.clubPlayers[div]) || null;
    const Rr = DATA.teamRosters || {};
    const players = (fromProt || ((Rr.teams && Rr.teams[div]) || []).map(id => Rr.people && Rr.people[id]).filter(Boolean)
        .map(pp => ({ name: pp.name, ehl: pp.ehl, pos: pp.pos || null, nr: pp.nr ?? null, gp: null, g: null, a: null, pim: null })))
      .map(p => ({ ...p, p: p.g == null ? null : p.g + p.a }))
      .map(p => { // copy what the E5 roster sheet already knows about this player
        // what the EHL profile says (height, weight, hand, position, photo), found by EHL person id
        const pid0 = personIdOf(p.ehl), RP = (DATA.teamRosters && DATA.teamRosters.people) || {};
        const prof = (pid0 && RP[pid0]) || Object.values(RP).find(x => personIdOf(x.ehl) === pid0 || x.name === p.name) || {};
        p = { ...p, pos: p.pos || prof.pos || null, height: prof.height || null, weight: prof.weight || null, handedness: prof.hand || null, ehlPhoto: prof.photo || null };
        const e5 = ROSTER_BY_NAME[p.name] || DATA.roster.find(r => personIdOf(r.ehl) && personIdOf(r.ehl) === personIdOf(p.ehl));
        if (!e5) return p;
        const posMap = { FWD: 'F', DEF: 'D', GK: 'G' };
        return { ...p, pos: p.pos || posMap[e5.position] || null, nr: p.nr ?? e5.nr ?? null, height: e5.height || p.height, weight: e5.weight || p.weight, handedness: e5.handedness || p.handedness,
          localPhoto: DATA.playerPhotos && DATA.playerPhotos[e5.name] || null }; });
    const nz = v => v ?? '—';
    const photoOf = p => p.localPhoto || p.ehlPhoto || null;
    const skaters = players.filter(p => p.pos !== 'G').sort((x, y) => (y.p ?? -1) - (x.p ?? -1) || (y.g ?? 0) - (x.g ?? 0) || (x.gp ?? 0) - (y.gp ?? 0) || x.name.localeCompare(y.name));
    const goalieStats = {}; Object.values(prot).forEach(pr => { if (!pr.goalie) return; const k = pr.goalie.name, s = goalieStats[k] || (goalieStats[k] = { name: k, gp: 0, sa: 0, ga: 0 });
      s.gp++; s.sa += pr.goalie.sa; s.ga += pr.goalie.ga; });
    const goalies = Object.values(goalieStats);

    // ---- Pārskats ----
    const head = `<div class="ov-head"><img src="${teamLogo('Ledus Veči')}" alt=""><div><div style="display:flex;align-items:center;gap:10px"><span class="div-badge">${div}</span><span class="ov-title">${esc(t.name)}</span></div>
        <div class="ov-sub">Sezona 2026-2027</div></div>
      <div class="ov-stats"><div class="ov-stat"><b>${W}-${L}${D ? '-' + D : ''}</b><span>Bilance</span></div>
        <div class="ov-stat"><b>${pos >= 0 ? (pos + 1) + '. vieta' : '-'}</b><span>${pos >= 0 ? esc(nice(divs[ourDiv].division)) : div}</span></div>
        <div class="ov-stat"><b>${pos >= 0 ? divs[ourDiv].teams[pos].points : '-'}</b><span>Punkti</span></div>
        <div class="ov-stat"><b>${GF}-${GA}</b><span>Vārtu attiecība</span></div></div></div>`;
    const resultsHtml = played.length ? `<table class="ovt"><tr><th>Datums</th><th>Pretinieks</th><th class="num">Score</th><th></th></tr>
      ${played.slice().reverse().map(g => `<tr><td>${dShort(g.date)}</td><td class="name">${g.home ? 'vs' : '@'} ${logoImg(g.logo, g.opp)}${esc(g.opp)}</td>
        <td class="num">${g.us}-${g.them}<span class="r ${g.r}">${g.r}</span>${otTag(g.decided)}</td><td class="num"><a href="#" data-game="${g.date}">Protokols</a></td></tr>`).join('')}</table>`
      : '<div class="empty-note">Vēl nav aizvadītu spēļu</div>';
    const upHtml = upcoming.map(g => `<div class="ov-up"><span class="when">${dShort(g.date)}</span><span>${g.home ? 'vs' : '@'} ${logoImg(g.logo, g.opp)}${esc(g.opp)}${g.time ? ' · ' + g.time : ''}${g.arena ? ' · ' + esc(g.arena) : ''}</span></div>`).join('')
      || '<div class="empty-note">Vēl nekas nav ieplānots</div>';
    const scoringHtml = fromProt && skaters.length ? `<table class="ovt"><tr><th>Player</th><th class="num">GP</th><th class="num">G</th><th class="num">A</th><th class="num">P</th><th class="num">PIM</th></tr>
      ${skaters.map((p, i) => `<tr${i >= 10 ? ' class="extra" style="display:none"' : ''}><td class="name">${plink(p.name)}</td><td class="num">${p.gp}</td><td class="num">${p.g}</td><td class="num">${p.a}</td><td class="num"><b>${p.p}</b></td><td class="num">${p.pim}</td></tr>`).join('')}</table>
      ${skaters.length > 10 ? `<button class="more-btn" data-more="1">Rādīt visus ${skaters.length} spēlētājus</button>` : ''}` : '<div class="empty-note">Spēlētāju statistika vēl nav ielādēta</div>';
    const goaliesHtml = goalies.length ? `<table class="ovt"><tr><th>Goalie</th><th class="num">GP</th><th class="num">SA</th><th class="num">SV</th><th class="num">GA</th><th class="num">SV%</th></tr>
      ${goalies.map(g => `<tr><td class="name">${plink(g.name)}</td><td class="num">${g.gp}</td><td class="num">${g.sa}</td><td class="num">${g.sa - g.ga}</td><td class="num">${g.ga}</td><td class="num"><b>${pc(g.sa ? (g.sa - g.ga) / g.sa * 100 : null)}</b></td></tr>`).join('')}</table>` : '<div class="empty-note">Nav datu</div>';

    // division table. E7 (one table): 1.-4. straight to the playoffs, 5.-12. play-in; Top 10 / rest switch.
    // E9 (three groups): top 2 of each group advance, plus the 2 best of all the other teams as wildcards.
    const grouped = div === 'E9' || divs.length > 1;
    const wildcards = new Set();
    if (grouped) divs.flatMap(d => d.teams.slice(2)).sort((x, y) => (y.points || 0) - (x.points || 0) || (x.gp || 0) - (y.gp || 0))
      .slice(0, 2).forEach(x => wildcards.add(up(x.team)));
    const tableRows = (teams, offset) => teams.map((x, i) => { const n = offset + i + 1, wc = wildcards.has(up(x.team));
      const cut = grouped ? (n === 2 ? 'cut-po' : '') : (n === 4 ? 'cut-po' : n === 12 ? 'cut-pi' : '');
      return `<tr class="${[up(x.team) === up(t.name) ? 'me' : '', cut, wc ? 'wc' : ''].join(' ')}"><td>${n}</td><td class="name">${up(x.team) === up(t.name) ? `<img class="tlogo" src="${teamLogo('Ledus Veči')}" alt="">` : (fileLogo(x.team) ? `<img class="tlogo" src="${fileLogo(x.team)}" alt="">` : '')}${esc(nice(x.team))}${wc ? ' <span class="wc-badge">WC</span>' : ''}</td><td class="num">${x.gp ?? ''}</td><td class="num"><b>${x.points ?? ''}</b></td></tr>`; }).join('');
    const tableOf = (teams, offset) => `<table class="ovt"><tr><th>#</th><th>Team</th><th class="num">GP</th><th class="num">PTS</th></tr>${tableRows(teams, offset)}</table>`;
    const legend = grouped ? '<div class="tbl-legend"><span class="po"></span>1.-2. izslēgšanas spēles <i class="wc-badge">WC</i> wildcard (2 labākie no pārējām komandām)</div>'
      : '<div class="tbl-legend"><span class="po"></span>1.-4. izslēgšanas spēles <span class="pi"></span>5.-12. play-in</div>';
    let tablePanel = '<div class="panel"><div class="empty-note">Tabula vēl nav ielādēta</div></div>';
    if (grouped) tablePanel = `<div class="panel ov-switch"><div class="panel-head"><span class="league-group-title">${div} tabula</span>${chips(divs.map(d => nice(d.division)), ourDiv)}</div>${parts(divs.map(d => tableOf(d.teams, 0)), ourDiv)}${legend}</div>`;
    else if (divs.length === 1) { const all = divs[0].teams, half = pos >= 10 ? 1 : 0;
      tablePanel = all.length > 10
        ? `<div class="panel ov-switch"><div class="panel-head"><span class="league-group-title">${div} tabula</span>${chips(['Top 10', `11.-${all.length}.`], half)}</div>${parts([tableOf(all.slice(0, 10), 0), tableOf(all.slice(10), 10)], half)}${legend}</div>`
        : `<div class="panel"><div class="panel-head"><span class="league-group-title">${div} tabula</span></div>${tableOf(all, 0)}${legend}</div>`; }
    const overview = `${head}<div class="ov-grid">
        <div><div class="panel ov-switch"><div class="panel-head"><span class="league-group-title">Spēles</span>${chips(['Aizvadītās spēles', 'Gaidāmās'], 0)}</div>${parts([resultsHtml, upHtml], 0)}</div>
             <div class="panel"><div class="panel-head"><span class="league-group-title">Vārtsargi</span></div>${goaliesHtml}</div></div>
        <div><div class="panel"><div class="panel-head"><span class="league-group-title">Rezultatīvākie spēlētāji</span></div>${scoringHtml}</div></div>
        <div>${tablePanel}</div></div>`;

    // ---- Protokols ----
    const protocol = date => {
      const g = played.find(x => x.date === date); if (!g) return '<div class="empty-note">Nav spēļu</div>';
      const pr = g.pr, us = t.name;
      const side = (s) => s === 'us' ? (g.home ? 'L' : 'R') : (g.home ? 'R' : 'L');
      const goalsOf = s => pr ? pr.goals.filter(x => x.side === s).map((x, i) => `<div class="goal-item"><span class="goal-num">${i + 1}</span><div style="flex:1"><div class="goal-scorer">${x.side === 'us' ? plink(x.scorer) : esc(x.scorer)}${x.pp ? ' <span class="ppt">PP</span>' : ''}</div>
          ${x.a1 ? `<div class="goal-assists">Piespēles: ${[x.a1, x.a2].filter(Boolean).map(n => x.side === 'us' ? plink(n) : esc(n)).join(', ')}</div>` : ''}<div class="goal-assists">${x.period}. periods · ${x.time}</div></div>${x.video ? `<a class="goal-video" href="${x.video}" target="_blank" rel="noopener">▶ video</a>` : ''}</div>`).join('') || '<div class="empty-note">—</div>' : '<div class="empty-note">Protokols vēl nav ielādēts</div>';
      const L = { name: g.home ? us : g.opp, logo: g.home ? teamLogo('Ledus Veči') : g.logo, goals: g.home ? g.us : g.them, s: g.home ? 'us' : 'them' };
      const Rt = { name: g.home ? g.opp : us, logo: g.home ? g.logo : teamLogo('Ledus Veči'), goals: g.home ? g.them : g.us, s: g.home ? 'them' : 'us' };
      const bar = (lbl, a, b) => { const sh = (a + b) ? a / (a + b) * 100 : 50; return `<div class="compare-row"><div class="compare-labels"><span class="h">${a}</span><span class="mid">${lbl}</span><span class="a">${b}</span></div><div class="duel sh" style="height:8px"><span class="g" style="width:${sh}%"></span><span class="a" style="width:${100 - sh}%"></span></div></div>`; };
      const pens = pr ? pr.penalties.map(x => `<div class="pen-row"><span>${x.side === 'us' ? esc(us) : esc(g.opp)}</span><b>${x.side === 'us' ? plink(x.player) : esc(x.player)}</b><span>${x.min} min · ${esc(x.reason || '')}</span></div>`).join('') : '';
      return `<div class="bx-pair bx-top">
          <div class="scoreboard"><div class="sb-meta" style="text-align:center;color:var(--text-dim);font-size:13px">${dLong(g.date)}${g.arena ? ' · ' + esc(g.arena) : ''}</div>
            <div class="sb-row" style="margin-top:16px"><div class="sb-team" style="text-align:center">${bigLogo(L.logo, L.name)}<div class="sb-team-name" style="font-family:Oswald,sans-serif;font-size:22px;font-weight:600;margin-top:8px">${esc(L.name).toUpperCase()}</div></div>
              <div style="font-family:Oswald,sans-serif;font-size:56px;font-weight:700;margin:0 24px">${L.goals} <span style="color:var(--text-faint)">-</span> ${Rt.goals}</div>
              <div class="sb-team" style="text-align:center">${bigLogo(Rt.logo, Rt.name)}<div class="sb-team-name" style="font-family:Oswald,sans-serif;font-size:22px;font-weight:600;margin-top:8px">${esc(Rt.name).toUpperCase()}</div></div></div>
            <div style="text-align:center;margin-top:14px"><span class="result-badge ${g.r}" style="font-family:Oswald,sans-serif;font-weight:600;padding:4px 14px;border-radius:999px;background:${g.r === 'W' ? 'rgba(76,201,142,.15);color:var(--win)' : 'rgba(225,90,90,.15);color:var(--loss)'}">${(g.r === 'W' ? 'UZVARA' : g.r === 'L' ? 'ZAUDĒJUMS' : 'NEIZŠĶIRTS') + (g.decided === 'OT' ? ' PAPILDLAIKĀ' : g.decided === 'SO' ? ' PĒCSPĒLES METIENOS' : '')}</span></div>
            <div style="text-align:center;margin-top:12px;display:flex;gap:18px;justify-content:center">${pr && pr.video ? `<a href="${pr.video.replace('/embed/', '/watch?v=')}" target="_blank" rel="noopener">▶ Spēles video</a>` : ''}${g.link ? `<a href="${g.link}" target="_blank" rel="noopener">EHL protokols →</a>` : ''}</div></div>
          <div class="panel bx-stats"><h2>Spēles statistika</h2>${pr ? [bar('Metieni vārtos', L.s === 'us' ? pr.shots.us : pr.shots.them, L.s === 'us' ? pr.shots.them : pr.shots.us),
              bar('Soda minūtes', L.s === 'us' ? g.pim : g.pimA, L.s === 'us' ? g.pimA : g.pim),
              pr.faceoffs && (pr.faceoffs.us || pr.faceoffs.them) ? bar('Uzvarētie iemetieni', L.s === 'us' ? pr.faceoffs.us : pr.faceoffs.them, L.s === 'us' ? pr.faceoffs.them : pr.faceoffs.us) : ''].join('') +
              (pr.goalie ? `<div class="gk-line">Vārtsargs: <b>${plink(pr.goalie.name)}</b> · ${pr.goalie.sa - pr.goalie.ga}/${pr.goalie.sa} · ${pc((pr.goalie.sa - pr.goalie.ga) / pr.goalie.sa * 100)}</div>` : '') : '<div class="empty-note">Protokols vēl nav ielādēts</div>'}</div></div>
        <div class="bx-pair"><div class="panel"><h2>Vārti</h2><div class="goal-cols"><div><div class="goal-col-title">${logoImg(L.logo, L.name)}<span>${esc(L.name).toUpperCase()}</span></div>${goalsOf(L.s)}</div>
            <div><div class="goal-col-title">${logoImg(Rt.logo, Rt.name)}<span>${esc(Rt.name).toUpperCase()}</span></div>${goalsOf(Rt.s)}</div></div></div>
          <div class="panel"><h2>Noraidījumi</h2>${pens || '<div class="empty-note">Nav</div>'}</div></div>`;
    };
    const gameOpts = played.slice().reverse().map(g => `<option value="${g.date}">${g.date} · ${g.home ? 'vs' : '@'} ${esc(g.opp)} (${g.us}-${g.them})</option>`).join('');
    const protoPane = played.length ? `<div class="game-nav" style="padding-left:0;padding-right:0"><select class="cl-game">${gameOpts}</select></div><div class="cl-proto">${protocol(played[played.length - 1].date)}</div>` : '<div class="empty-note">Vēl nav aizvadītu spēļu</div>';

    // ---- Spēlētāju statistika ----
    // season value as used by the E5 pickers ("Reg. Season 2026-2027", "Playoffs 2025-2026", "TOTAL:2025-2026", "ALL")
    const seasonOf = iso => { const [y, m] = iso.split('-').map(Number); return m >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`; };
    const inSeason = (iso, sel) => !sel || sel === 'ALL' || (String(sel).match(/\d{4}-\d{4}/) || [''])[0] === seasonOf(iso);
    const playerView = (name, opts = {}) => {
      const p0 = players.find(x => x.name === name); if (!p0) return '';
      const hasVideo = pr => pr.goals.some(x => x.side === 'us' && x.video && (x.scorer === name || x.a1 === name || x.a2 === name));
      const gamesFor = played.filter(g => inSeason(g.date, opts.season) && (!opts.hlOnly || (g.pr && hasVideo(g.pr))));
      let p = p0;
      if (played.some(g => g.pr)) {   // totals for the chosen season / filter, counted from the protocols
        const mine = gamesFor.filter(g => g.pr && g.pr.players.some(x => (x.name || x) === name));
        const G = mine.reduce((s, g) => s + g.pr.goals.filter(x => x.side === 'us' && x.scorer === name).length, 0);
        const A = mine.reduce((s, g) => s + g.pr.goals.filter(x => x.side === 'us' && (x.a1 === name || x.a2 === name)).length, 0);
        const PIMp = mine.reduce((s, g) => s + g.pr.penalties.filter(x => x.side === 'us' && x.player === name).reduce((t, x) => t + x.min, 0), 0);
        p = { ...p0, gp: mine.length, g: G, a: A, p: G + A, pim: PIMp };
      }
      // power-play goals / assists and game-winning goals, from the goal list of each game
      const mineG = gamesFor.filter(g => g.pr && g.pr.players.some(x => (x.name || x) === name));
      const ppg = mineG.reduce((s, g) => s + g.pr.goals.filter(x => x.side === 'us' && x.pp && x.scorer === name).length, 0);
      const ppa = mineG.reduce((s, g) => s + g.pr.goals.filter(x => x.side === 'us' && x.pp && (x.a1 === name || x.a2 === name)).length, 0);
      const gwg = mineG.reduce((s, g) => { if (g.r !== 'W') return s; const ours = g.pr.goals.filter(x => x.side === 'us'); const w = ours[g.them]; return s + (w && w.scorer === name ? 1 : 0); }, 0);
      const pp = (DATA.teamRosters && DATA.teamRosters.people && Object.values(DATA.teamRosters.people).find(x => x.name === name)) || {};
      const HAND = { LEFT: 'kreisais tvēriens', RIGHT: 'labais tvēriens', L: 'kreisais tvēriens', R: 'labais tvēriens' };
      const logRows = gamesFor.slice().reverse().map(g => { const pr = g.pr; if (!pr || !pr.players.some(x => (x.name || x) === name)) return '';
        const G = pr.goals.filter(x => x.side === 'us' && x.scorer === name).length, A = pr.goals.filter(x => x.side === 'us' && (x.a1 === name || x.a2 === name)).length;
        const pim = pr.penalties.filter(x => x.side === 'us' && x.player === name).reduce((s, x) => s + x.min, 0);
        return `<tr><td>${dShort(g.date)}</td><td class="name">${g.home ? 'vs' : '@'} ${logoImg(g.logo, g.opp)}${esc(g.opp)}</td><td class="num">${g.us}-${g.them} <span class="r ${g.r}">${g.r}</span>${otTag(g.decided)}</td><td class="num">${G}</td><td class="num">${A}</td><td class="num"><b>${G + A}</b></td><td class="num">${pim}</td></tr>`; }).join('');
      return `<div class="panel cl-pcard"><div style="display:flex;gap:22px;align-items:center">${imgOrPh(photoOf(p), 'cl-photo')}
          <div style="flex:1"><div style="font-family:Oswald,sans-serif;font-size:30px;font-weight:600">${esc(p.name)}</div>
            <div style="color:var(--text-dim);margin-top:4px">${p.pos ? `<span class="pos-badge">${POSL[p.pos]}</span>` : ''}${p.nr != null ? ' #' + p.nr : ''}${[p.height, p.weight, HAND[p.handedness] || ''].filter(Boolean).map(x => ' · ' + x).join('')}${p.ehl ? ` · <a href="${p.ehl}" target="_blank" rel="noopener">EHL profils →</a>` : ''}</div>
            <div class="cl-tot" style="margin-top:16px;grid-template-columns:repeat(5,1fr)">${[['GP', p.gp], ['G', p.g], ['A', p.a], ['P', p.p], ['P/GP', p.gp ? (p.p / p.gp).toFixed(2) : null],
              ['PPG', ppg], ['PPA', ppa], ['PIM', p.pim], ['PIM/GP', p.gp ? (p.pim / p.gp).toFixed(1) : null], ['GWG', gwg]].map(([l, v]) => `<div><b>${nz(v)}</b><span>${l}</span></div>`).join('')}</div></div></div></div>
        <div class="panel"><h2>Spēles</h2><table class="ovt" style="font-size:14px"><tr><th>Datums</th><th>Pretinieks</th><th class="num">Score</th><th class="num">G</th><th class="num">A</th><th class="num">P</th><th class="num">PIM</th></tr>${logRows || '<tr><td colspan="7" class="empty-note">Nav spēļu</td></tr>'}</table></div>`;
    };
    const sortedPl = players.slice().sort((x, y) => x.name.localeCompare(y.name));
    const firstPl = skaters[0] ? skaters[0].name : (players[0] && players[0].name);
    const playerPane = players.length ? `<div class="game-nav cl-selects" style="padding-left:0;padding-right:0"><select class="cl-player">${sortedPl.map(p => `<option${p.name === (skaters[0] ? skaters[0].name : sortedPl[0].name) ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select><select class="cl-team">${teamSelectHtml(firstPl, (players.find(x => x.name === firstPl) || {}).ehl, div)}</select></div><div class="cl-pview">${playerView(skaters[0] ? skaters[0].name : sortedPl[0].name)}</div>` : '<div class="empty-note">Nav datu</div>';

    // ---- Komandas statistika ----
    const winPct = played.length ? Math.round(W / played.length * 1000) / 10 : 0;
    const gfShare = (GF + GA) ? GF / (GF + GA) * 100 : 50;
    const maxBar = 1;
    const wl = played.slice().reverse().map(g => `<div class="wl-item">${g.r === 'L' ? '<div class="wl-bar-half"><span class="wl-bar loss" style="width:100%"></span></div><div class="wl-bar-half"></div>' : '<div class="wl-bar-half"></div><div class="wl-bar-half"><span class="wl-bar win" style="width:100%"></span></div>'}</div>`).join('');
    const totals = [['Uzbrukums', [['G', GF, (GF / gp).toFixed(1)], ['S', S, (S / gp).toFixed(1)], ['Shot%', pc(S ? GF / S * 100 : null), null]]],
      ['Aizsardzība', [['GA', GA, (GA / gp).toFixed(1)], ['SA', SA, (SA / gp).toFixed(1)], ['Save%', pc(SA ? (SA - GA) / SA * 100 : null), null]]],
      ['Iemetieni', [['FOW', FOW, (FOW / gp).toFixed(1)], ['FOL', FOL, (FOL / gp).toFixed(1)], ['FO%', pc(FOW + FOL ? FOW / (FOW + FOL) * 100 : null), null]]],
      ['Disciplīna', [['PIM', PIM, (PIM / gp).toFixed(1)], ['PIM pret', PIMA, (PIMA / gp).toFixed(1)]]]];
    const teamPane = `<div class="bx-pair ts-pair">
        <div class="panel"><h2>Bilance</h2><div class="rec2" style="margin-top:14px">
          <div class="rec-ring" style="background:conic-gradient(var(--win) 0 ${winPct}%, var(--loss) ${winPct}% 100%)"><div><b>${winPct}%</b><span>uzvaras</span></div></div>
          <div class="rec-side"><div class="rec-top"><div class="rec-gp"><b>${played.length}</b><span>spēles</span></div>
            <div class="rec-pills"><span class="pill w"><b>${W}</b> W</span><span class="pill l"><b>${L}</b> L</span>${D ? `<span class="pill d"><b>${D}</b> D</span>` : ''}</div></div>
            <div class="rec-goals"><div class="t"><span>Gūtie <b class="g">${GF}</b></span><span class="df ${GF - GA > 0 ? 'pos' : GF - GA < 0 ? 'neg' : ''}">${sgn(GF - GA)}</span><span><b class="a">${GA}</b> Ielaistie</span></div>
              <div class="duel"><span class="g" style="width:${gfShare}%"></span><span class="a" style="width:${100 - gfShare}%"></span></div></div></div></div></div>
        <div class="panel"><h2>Kopējā statistika</h2><div class="cl-duels">${duel('Vārti', GF, GA, '')}${duel('Metieni', S, SA, 'sh')}${FOW + FOL ? duel('Uzvarētie iemetieni', FOW, FOL, 'fo') : ''}${duel('Soda minūtes', PIM, PIMA, 'pim', true)}</div></div></div>
      <div class="panel"><h2>Spēles</h2><div class="team-stats-row gamelog-row"><div class="team-wl-col"><div class="wl-header"><span style="color:var(--loss)">Zaudējums</span><span style="color:var(--win)">Uzvara</span></div><div class="wl-list">${wl}</div></div>
        <div class="team-gamelog-col"><table class="ovt cl-log" style="font-size:13.5px"><tr><th>Datums</th><th>Pretinieks</th><th class="num">G</th><th class="num">GA</th><th class="num">S</th><th class="num">SA</th><th class="num">PIM</th><th class="num">PIM pret</th><th></th></tr>
          ${played.slice().reverse().map(g => `<tr><td>${g.date}</td><td class="name">${g.home ? 'vs' : '@'} ${logoImg(g.logo, g.opp)}${esc(g.opp)}${otTag(g.decided)}</td><td class="num">${g.us}</td><td class="num">${g.them}</td><td class="num">${g.s ?? '—'}</td><td class="num">${g.sa ?? '—'}</td><td class="num">${g.pim ?? '—'}</td><td class="num">${g.pimA ?? '—'}</td><td class="num"><a href="#" data-game="${g.date}">Protokols</a></td></tr>`).join('')}</table></div></div></div>
      <div class="cl-bottom"><div class="panel"><h2>Sezonas kopsummas un vidējie</h2><table id="clTot-${div}" class="cl-totals"><tr><th></th><th>Kopā</th><th>Vidēji spēlē</th></tr>
        ${totals.map(([title, rows]) => `<tr class="tt-group"><td colspan="3">${title}</td></tr>` + rows.map(([l, v, av]) => av === null ? `<tr><td>${l}</td><td colspan="2" style="text-align:center"><b>${v}</b></td></tr>` : `<tr><td>${l}</td><td><b>${v}</b></td><td style="color:var(--text-dim)">${av}</td></tr>`).join('')).join('')}</table></div>
        <div class="panel cl-table-next"><div class="league-layout"><div>${tablePanel.replace('class="panel', 'class="tbl-inner').replace('class="tbl-inner ov-switch', 'class="tbl-inner ov-switch')}</div>
          <div class="calendar-section cl-next"><div class="league-group-title">Nākamās spēles</div>${upcoming.slice(0, 6).map(g => `<div class="ov-up"><span class="when">${dShort(g.date)}</span><span>${g.home ? 'vs' : '@'} ${logoImg(g.logo, g.opp)}${esc(g.opp)}${g.time ? ' · ' + g.time : ''}${g.arena ? ' · ' + esc(g.arena) : ''}</span></div>`).join('') || '<div class="empty-note">Vēl nekas nav ieplānots</div>'}</div></div></div></div>`;

    // ---- Sastāvs ----
    const groups = players.some(p => p.pos) ? POS : [[null, 'Spēlētāji']];
    const rosterPane = groups.map(([k, label]) => { const list = players.filter(p => (p.pos || null) === k).sort((x, y) => (y.gp ?? 0) - (x.gp ?? 0) || x.name.localeCompare(y.name)); if (!list.length) return '';
      return `<div class="roster-section-title">${label}</div><div class="cl-roster">${list.map(p => `<div class="cl-card">${imgOrPh(photoOf(p), 'cl-av')}
        <div style="min-width:0"><div class="nm">${plink(p.name)} <span style="color:var(--text-faint);font-weight:500">${p.nr != null ? '#' + p.nr : ''}</span></div><div class="mt">${p.pos ? `<span class="pos-badge">${POSL[p.pos]}</span>` : ''}${p.ehl ? ` · <a href="${p.ehl}" target="_blank" rel="noopener">EHL profils →</a>` : ''}</div>
        <div class="st">${(k === 'G' ? [['GP', p.gp]] : [['GP', p.gp], ['G', p.g], ['A', p.a], ['P', p.p], ['PIM', p.pim]]).map(([l, v]) => `<div><b>${nz(v)}</b><span>${l}</span></div>`).join('')}</div></div></div>`).join('')}</div>`; }).join('');

    view.innerHTML = `<div class="subtabs">${[['ov', 'Pārskats'], ['box', 'Protokols'], ['pl', 'Spēlētāju statistika'], ['team', 'Komandas statistika'], ['roster', 'Sastāvs']]
        .map(([k, l], i) => `<button class="ctab${i ? '' : ' active'}" data-p="${k}">${l}</button>`).join('')}</div>
      <div class="wrap">
        <div class="cpane on" data-p="ov">${overview}</div>
        <div class="cpane" data-p="box">${protoPane}</div>
        <div class="cpane" data-p="pl" style="padding-top:16px">${playerPane}</div>
        <div class="cpane" data-p="team" style="padding-top:20px">${teamPane}</div>
        <div class="cpane" data-p="roster" style="padding-top:10px">${rosterPane}</div>
      </div>`;
    view._protocol = protocol; view._playerView = playerView;
    view._openPlayer = name => { const sel = view.querySelector('.cl-player'); if (!sel || ![...sel.options].some(o => o.value === name || o.textContent === name)) return;
      sel.value = name; view.querySelector('.cl-pview').innerHTML = playerView(name);
      const ct = view.querySelector('.cl-team'); ct.innerHTML = teamSelectHtml(name, (players.find(x => x.name === name) || {}).ehl, div); ct.style.display = ct.options.length > 1 ? '' : 'none';
      view.querySelectorAll('.ctab').forEach(x => x.classList.toggle('active', x.dataset.p === 'pl')); view.querySelectorAll('.cpane').forEach(x => x.classList.toggle('on', x.dataset.p === 'pl')); };
  }
  document.querySelectorAll('.club-view').forEach(view => {
    render(view);
    const show = k => { view.querySelectorAll('.ctab').forEach(x => x.classList.toggle('active', x.dataset.p === k)); view.querySelectorAll('.cpane').forEach(p => p.classList.toggle('on', p.dataset.p === k)); };
    view.addEventListener('click', e => {
      const tb = e.target.closest('.ctab'); if (tb) { show(tb.dataset.p); return; }
      const pl = e.target.closest('a[data-player]');
      if (pl) { e.preventDefault(); view._openPlayer(pl.dataset.player); window.scrollTo(0, 0); return; }
      const gl = e.target.closest('a[data-game]');
      if (gl) { e.preventDefault(); const sel = view.querySelector('.cl-game'); if (sel) { sel.value = gl.dataset.game; view.querySelector('.cl-proto').innerHTML = view._protocol(sel.value); } show('box'); window.scrollTo(0, 0); return; }
      const b = e.target.closest('.ov-switch .grp-chips button');
      if (b) { const box = b.closest('.ov-switch'); box.querySelectorAll('.grp-chips button').forEach(x => x.classList.toggle('on', x === b));
        box.querySelectorAll('.ov-part').forEach(d => d.style.display = d.dataset.i === b.dataset.i ? '' : 'none'); return; }
      const m = e.target.closest('[data-more]');
      if (m) { const open = m.dataset.open !== '1'; m.closest('.panel').querySelectorAll('tr.extra').forEach(r => r.style.display = open ? '' : 'none');
        m.dataset.open = open ? '1' : '0'; m.textContent = open ? 'Rādīt top 10' : `Rādīt visus ${m.closest('.panel').querySelectorAll('tr').length - 1} spēlētājus`; }
    });
    view.addEventListener('change', e => {
      if (e.target.matches('.cl-game')) view.querySelector('.cl-proto').innerHTML = view._protocol(e.target.value);
      if (e.target.matches('.cl-player')) view._openPlayer(e.target.value);
      if (e.target.matches('.cl-team')) { const name = view.querySelector('.cl-player').value, div = e.target.value;
        const src = div === view.dataset.div ? view : document.getElementById(div === 'E7' ? 'lv2View' : 'lv3View');
        view.querySelector('.cl-pview').innerHTML = (src && src._playerView && src._playerView(name)) || '<div class="empty-note" style="padding:20px 0">Nav datu šai komandai</div>'; }
    });
  });
})();

// ---------------- Latvian ----------------
// Everything on the page is translated here in one place, as it is shown. Stat names and
// abbreviations (G, A, PIM, SOG, Shots on goal, ...) and table column headers stay in English.
(function(){
  const EXACT = {
    'Home':'Sākums', 'Ledus Veči stats':'Ledus Veči statistika', 'Ledus Veči II statistika':'Ledus Veči II statistika', 'Calendar':'Kalendārs',
    'Overview':'Pārskats', 'Grupa':'Grupa', 'Maiņa kopā':'Maiņa kopā', 'Boxscore':'Protokols', 'Player stats':'Spēlētāju statistika', 'Team stats':'Komandas statistika',
    'Roster':'Sastāvs', "How it's calculated":'Kā tiek aprēķināts',
    'HOME':'MĀJĀS', 'AWAY':'IZBRAUKUMĀ', 'LOSS':'ZAUDĒJUMS', 'WIN':'UZVARA', 'WIN (OT)':'UZVARA PAPILDLAIKĀ', 'LOSS (OT)':'ZAUDĒJUMS PAPILDLAIKĀ', 'WIN (SO)':'UZVARA PĒCSPĒLES METIENOS', 'LOSS (SO)':'ZAUDĒJUMS PĒCSPĒLES METIENOS', 'Loss':'Zaudējums', 'Win':'Uzvara',
    'Goals':'Vārti', 'Match statistics':'Spēles statistika', 'Shots & faceoffs by period':'Metieni un iemetieni pa periodiem',
    'Starting lineup':'Sastāvs', 'Ledus Veči player stats this game':'Statistika',
    'Player of the game:':'Spēles labākais:', 'Assists:':'Piespēles:', 'Only games with a highlight':'Tikai spēles ar highlight',
    'Shots on goal':'Metieni vārtos', 'Faceoffs won':'Uzvarētie iemetieni', 'Penalty minutes':'Soda minūtes', 'Icings':'Atmetieni',
    'Offsides':'Aizspēles', 'Power play':'Vairākumā', 'Penalty kill':'Mazākumā',
    'EHL profile →':'EHL profils →', 'No games in this range':'Šajā periodā nav spēļu',
    'Record':'Bilance', 'By period':'Pa periodiem', 'Game log':'Spēles', 'Season totals & averages':'Sezonas kopsummas un vidējie',
    'Average / game':'Vidēji spēlē', 'Total':'Kopā', 'Average / game':'Vidēji spēlē', 'All seasons':'Visas sezonas', 'Season':'Sezona',
    'E5 League Table':'E5 turnīra tabula', 'E5 table':'E5 tabula', 'Next game':'Nākamā spēle', 'Next games':'Nākamās spēles', 'Full calendar':'Viss kalendārs',
    'Today':'Šodien', 'Tomorrow':'Rīt', 'Coming up':'Gaidāmie notikumi', 'Last results':'Pēdējie rezultāti', 'Season so far':'Sezona līdz šim',
    'This week':'Šonedēļ', 'Head-to-head':'Savstarpējās spēles', 'Last meeting':'Pēdējā spēle', 'First meeting':'Pirmā savstarpējā spēle',
    'Last 5':'Pēdējās 5', 'Games':'Spēles', 'Results':'Aizvadītās spēles', 'Upcoming':'Gaidāmās', 'Player scoring':'Rezultatīvākie spēlētāji',
    'Goalies':'Vārtsargi', 'Show top 10':'Rādīt top 10', 'Our sponsors':'Mūsu atbalstītāji',
    'Birthdays':'Dzimšanas dienas', 'Name days':'Vārda dienas', 'Practices':'Treniņi', 'Practice':'Treniņš',
    'Nothing on this day':'Šajā dienā nekas nav plānots', 'Nothing scheduled yet':'Vēl nekas nav ieplānots',
    'Nothing on this week':'Šonedēļ nekas nav plānots', 'No games played yet':'Vēl nav aizvadītu spēļu',
    'No upcoming games in the EHL calendar yet':'Nākamās spēles vēl nav kalendārā',
    'Birthdays and name days appear after the next data refresh.':'Dzimšanas un vārda dienas parādīsies pēc nākamās datu atjaunošanas.',
    'Playoffs':'Izslēgšanas spēles', 'Forwards':'Uzbrucēji', 'Defense':'Aizsargi', 'Loading latest data…':'Ielādē jaunākos datus…',
    'Extra practice':'Papildu treniņš', 'No games yet':'Vēl nav spēļu',
  };
  const WD_LONG = { Mon:'Pirmd.', Tue:'Otrd.', Wed:'Trešd.', Thu:'Ceturtd.', Fri:'Piektd.', Sat:'Sestd.', Sun:'Svētd.' };
  const WD_GRID = { Mon:'P', Tue:'O', Wed:'T', Thu:'C', Fri:'Pk', Sat:'S', Sun:'Sv' };
  const MON = { Jan:'janv.', Feb:'febr.', Mar:'marts', Apr:'apr.', May:'maijs', Jun:'jūn.', Jul:'jūl.', Aug:'aug.', Sep:'sept.', Oct:'okt.', Nov:'nov.', Dec:'dec.' };
  const MONTH = { January:'Janvāris', February:'Februāris', March:'Marts', April:'Aprīlis', May:'Maijs', June:'Jūnijs', July:'Jūlijs',
    August:'Augusts', September:'Septembris', October:'Oktobris', November:'Novembris', December:'Decembris' };
  const RES = { W:'W', L:'L', D:'D' };   // results stay W / L
  const MONS = Object.keys(MON).join('|');
  const RULES = [
    [new RegExp(`\\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (\\d{1,2}) (${MONS})\\b`, 'g'), (m, w, d, mo) => `${WD_LONG[w]}, ${d}. ${MON[mo]}`],
    [new RegExp(`\\b(\\d{1,2}) (${MONS})\\b`, 'g'), (m, d, mo) => `${d}. ${MON[mo]}`],
    [/\b(January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})\b/g, (m, mo, y) => `${MONTH[mo]} ${y}`],
    [/^In (\d+) days$/, (m, n) => `Pēc ${n} dienām`],
    [/^Today, /, () => 'Šodien, '],
    [/^(\d+)(?:st|nd|rd|th) in (.+?) · (\d+) pts$/, (m, n, d, p) => `${n}. vieta (${d}) · ${p} p.`],
    [/^(\d+-\d+) · (\d+)(?:st|nd|rd|th)$/, (m, r, n) => `${r} · ${n}. vieta`],
    [/^(\d+) games · (\d+) pts in (.+)$/, (m, g, p, d) => `${g} spēles · ${p} p. (${d})`],
    [/^(\d+) games$/, (m, g) => `${g} spēles`],
    [/^(\d+)(?:st|nd|rd|th)$/, (m, n) => `${n}.`],
    [/^at /, () => '@ '],
    [/Reg\. Season/g, () => 'Regulārā sezona'],
    [/\bPlayoffs (\d{4}-\d{4})/g, (m, y) => `Izslēgšanas spēles ${y}`],
    [/^Show all (\d+) players$/, (m, n) => `Rādīt visus ${n} spēlētājus`],
    [/(\d+) games · latest (\S+) · updated (.+) ago/, (m, n, d, t) => `${n} spēles · pēdējā ${d} · atjaunots pirms ${t}`],
    [/— updated (.+) ago/, (m, t) => `— atjaunots pirms ${t}`],
    [/ · LEFT$/, () => ' · kreisais tvēriens'], [/ · RIGHT$/, () => ' · labais tvēriens'],
    [/^(\d+-\d+) ([WLD])$/, (m, s, r) => `${s} ${RES[r]}`],
    [/^Assists: /, () => 'Piespēles: '],
    [/^Practice /, () => 'Treniņš '], [/^Extra practice/, () => 'Papildu treniņš'],
    [/^Name day: /, () => 'Vārda diena: '], [/^Birthday: /, () => 'Dzimšanas diena: '],
    [/ \(day of uncommon names\)$/, () => ' (neparasto vārdu diena)'],
    [/^Season (\d{4}-\d{4})$/, (m, y) => `Sezona ${y}`],
  ];
  const SKIP = 'script,style,th,#methodologyView,.record-label,.ov-stat span,.card-stats,.slot-label,.cal-num,td.pn';
  function tr(node){
    const el = node.parentElement; if (!el || el.closest(SKIP)) return;
    const raw = node.nodeValue, t = raw.trim(); if (!t || !/[A-Za-z]/.test(t)) return;
    let out;
    if (el.closest('.cal-dow') && WD_GRID[t]) out = WD_GRID[t];
    else if (EXACT[t]) out = EXACT[t];
    else if (RES[t] && el.matches('.home-res,.f,.r,.home-form span,.form span')) out = RES[t];
    else if (WD_LONG[t]) out = WD_LONG[t];
    else { out = t; RULES.forEach(([re, fn]) => { out = out.replace(re, fn); }); }
    if (out !== t) node.nodeValue = raw.replace(t, out);
  }
  function walk(root){
    if (root.nodeType === 3) return tr(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) tr(n);
  }
  walk(document.body);
  document.title = 'Ledus Veči';
  new MutationObserver(list => list.forEach(m => {
    if (m.type === 'characterData') tr(m.target); else m.addedNodes.forEach(walk);
  })).observe(document.body, { childList: true, subtree: true, characterData: true });
})();
