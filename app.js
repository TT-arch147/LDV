
const DATA = window.__LIVE_DATA;
const LV_COLOR = (DATA.teamAssets['Ledus Veči'] && DATA.teamAssets['Ledus Veči'].accent) || '#830C67';
const DEFAULT_LOGO = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="none" stroke="%237C8A93" stroke-width="1.5"/></svg>');

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

document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.getElementById('boxView').classList.toggle('hidden', tab!=='box');
    document.getElementById('statsView').classList.toggle('hidden', tab!=='stats');
    document.getElementById('teamView').classList.toggle('hidden', tab!=='team');
    document.getElementById('rosterView').classList.toggle('hidden', tab!=='roster');
    document.getElementById('methodologyView').classList.toggle('hidden', tab!=='methodology');
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
  {key:'date', label:'Date', left:true},
  {key:'opponent', label:'Opponent', left:true},
  {key:'g', label:'G'}, {key:'a', label:'A'},
  {key:'shAtt', label:'Shots'}, {key:'sh', label:'SOG'}, {key:'shPct', label:'Shot%'},
  {key:'bl', label:'BLK'}, {key:'pim', label:'PIM'}, {key:'pimA', label:'PIM/A'},
  {key:'pm', label:'+/-'}, {key:'pmAdj', label:'+/- adj'},
  {key:'fow', label:'FOW/FOT', sortable:false}, {key:'foPct', label:'FO%'},
];
const GOALIE_COLS = [
  {key:'date', label:'Date', left:true},
  {key:'opponent', label:'Opponent', left:true},
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

function renderStatsTab(){
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
        <td style="text-align:left">${r.opponent}</td>
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
        <td style="text-align:left">${r.opponent}</td>
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

statsPlayerSelect.addEventListener('change', ()=>{ statsSortState = {key:'date', dir:-1}; renderStatsTab(); });
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
  resEl.textContent = resultText;
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
  }).join('') + ((b.pp!=null || b.pk!=null) ? `
      <div class="compare-row" style="margin-top:18px;border-top:1px solid var(--line);padding-top:14px;">
        <div class="compare-labels"><span style="color:var(--text-dim)">Power play</span><span class="mid">${b.ppScored ?? 0} / ${b.pp ?? 0}</span></div>
        <div class="compare-labels" style="margin-top:8px;"><span style="color:var(--text-dim)">Penalty kill</span><span class="mid">${b.pkScored ?? 0} / ${b.pk ?? 0}</span></div>
      </div>` : '');

  const periods = ['1st','2nd','3rd','OT'];
  document.querySelector('#periodTable tbody').innerHTML = periods.map(p=>{
    const d = b.periods[p];
    if(d.s==null && d.sa==null && d.fow==null && d.g==null && d.ga==null) return '';
    return `<tr><td>${p}</td><td>${d.g ?? '—'}</td><td>${d.ga ?? '—'}</td><td>${d.s ?? '—'}</td><td>${d.sa ?? '—'}</td><td>${d.fow ?? '—'}</td><td>${d.fol ?? '—'}</td></tr>`;
  }).join('') || '<tr><td colspan="7" style="color:var(--text-faint);">No period data</td></tr>';

  const rink = document.getElementById('lineupRink');
  if(Object.keys(b.lineup).length){
    rink.innerHTML = LINEUP_ROWS.map(row=>{
      const cls = row.label==='def' ? 'rink-row def' : row.label==='gk' ? 'rink-row gk' : 'rink-row';
      return `<div class="${cls}">` + row.slots.map(slot=>{
        const name = b.lineup[slot];
        // both forward and defense slots show bare position (no line number)
        const label = row.label==='gk' ? slot : slot.replace(/^\d+\s*/,'');
        const nr = name ? ROSTER_NR[name] : null;
        const nameHtml = name ? (nr!=null ? `<span class="slot-nr">#${nr}</span> ${playerLink(name)}` : playerLink(name)) : '—';
        return `<div class="slot" style="border-color:${name?LV_COLOR+'55':'var(--line)'}"><div class="slot-label">${label}</div><div class="slot-name">${nameHtml}</div></div>`;
      }).join('') + `</div>`;
    }).join('');
  } else {
    rink.innerHTML = '<span class="empty-note">No lineup logged for this game</span>';
  }

  const tbody = document.querySelector('#skaterBoxTable tbody');
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
document.getElementById('rosterSections').innerHTML = POS_GROUPS.map(g=>{
  const players = DATA.roster.filter(p=>p.position===g.key);
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
  document.getElementById('teamRecordStrip').innerHTML = cells.map(c=>`
    <div class="record-cell"><div class="record-num ${c.cls}">${c.val}</div><div class="record-label">${c.label}</div></div>`).join('');

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
    ['Shot%', fmtPctT(shotPct), fmtPctT(shotPct)],
    ['Save%', fmtPctT(savePct), fmtPctT(savePct)],
    ['BLK', t.blk, gp>0?fmtNumT(t.blk/gp,1):'—'],
    ['PIM', t.pim, gp>0?fmtNumT(t.pim/gp,1):'—'],
    ['PIM/A', t.pimA, gp>0?fmtNumT(t.pimA/gp,1):'—'],
    ['FOW', t.fow, gp>0?fmtNumT(t.fow/gp,1):'—'],
    ['FOL', t.fol, gp>0?fmtNumT(t.fol/gp,1):'—'],
    ['FO%', fmtPctT(foPct), fmtPctT(foPct)],
    ['PP', `${t.ppScored}/${t.pp}`, gp>0?fmtNumT(t.pp/gp,1):'—'],
    ['PP%', fmtPctT(ppPct), fmtPctT(ppPct)],
    ['SH', t.sh, gp>0?fmtNumT(t.sh/gp,2):'—'],
    ['PK', `${t.pkScored}/${t.pk}`, gp>0?fmtNumT(t.pk/gp,1):'—'],
    ['PK%', fmtPctT(pkPct), fmtPctT(pkPct)],
    ['GA/PP', t.gaPP, gp>0?fmtNumT(t.gaPP/gp,2):'—'],
  ];
  document.querySelector('#teamTotalsTable tbody').innerHTML = games.length ?
    statDefs.map(([label, total, avg])=>
      `<tr><td style="text-align:left">${label}</td><td>${total}</td><td>${avg}</td></tr>`
    ).join('') :
    `<tr><td colspan="3" style="color:var(--text-dim);text-align:center;padding:20px;">No games in this range</td></tr>`;

  // ---- by period ----
  const periods = ['1st','2nd','3rd','OT'];
  const periodTotals = {};
  periods.forEach(p=>{ periodTotals[p] = {g:0, ga:0, s:0, sa:0, any:false}; });
  games.forEach(b=>{
    periods.forEach(p=>{
      const d = b.periods && b.periods[p];
      if(!d) return;
      if(d.g!=null || d.ga!=null || d.s!=null || d.sa!=null) periodTotals[p].any = true;
      periodTotals[p].g += d.g||0; periodTotals[p].ga += d.ga||0;
      periodTotals[p].s += d.s||0; periodTotals[p].sa += d.sa||0;
    });
  });
  document.querySelector('#teamPeriodTable tbody').innerHTML = periods.map(p=>{
    const d = periodTotals[p];
    if(!d.any) return '';
    const gDiff = d.g-d.ga, sDiff = d.s-d.sa;
    return `<tr><td style="text-align:left">${p}</td><td>${d.g}</td><td>${d.ga}</td><td>${(gDiff>0?'+':'')+gDiff}</td><td>${d.s}</td><td>${d.sa}</td><td>${(sDiff>0?'+':'')+sDiff}</td></tr>`;
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
      <td><span class="chevron">▶</span>${b.date}</td><td style="text-align:left">${opp}</td>
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
    return `<tr class="${classes}"><td>${nameCell}</td><td>${t.gp}</td><td>${t.points}</td></tr>`;
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
  document.getElementById('calendarBody').innerHTML = DATA.upcomingGames.map(g => {
    const logoObj = DATA.teamAssets && DATA.teamAssets[CAL_LOGO_ALIAS[g.opponent] || g.opponent];
    const logo = logoObj && logoObj.logo;
    const oppCell = logo ? `<img class="league-logo" src="${logo}" alt="">${g.opponent}` : g.opponent;
    const when = g.date ? `${g.weekday ? g.weekday + ', ' : ''}${g.date}` : '';
    return `
    <div class="calendar-row">
      <div class="calendar-opp"><span class="vs">${g.isHome ? 'vs' : 'at'}</span>${oppCell}</div>
      <div class="calendar-when">${when}${when ? ' · ' : ''}${g.time || ''}${g.arena ? ' · ' + g.arena : ''}</div>
    </div>`;
  }).join('');
}
renderTeamStats();

rebuildGameList();renderTeamStats();

rebuildGameList();
renderStatsTab();
