// Ledus Veči · nūju pasūtījumi
// Each order from the website's "Nūjas" page adds rows to the tab "Nūju pasūtījumi":
// one row per stick line (with its own specs) and one row for socks.
const SHEET_ID = '1Sngi6vW8dbZ3cnP73evBRWh4-yDhrY8Rzfdq3yfD8S8';
const TAB = 'Nūju pasūtījumi';
const HEAD = ['Laiks', 'Spēlētājs', 'Numurs', 'Prece', 'Skaits', 'Dizains', 'Uz nūjas', 'Garums (cm)', 'Flex',
  'Ieliekums', 'Puse', 'Kāts', 'Kickpoint', 'Kāta virsma', 'RocketGrip materiāls', 'RocketGrip dizains',
  'RocketGrip krāsa', 'Teksts uz gripa', 'LDV logo uz gripa', 'RocketGrip iepakojumi', 'Zeķu izmērs'];

function doPost(e) {
  const o = JSON.parse(e.postData.contents);
  const sh = sheet_();
  const when = Utilities.formatDate(new Date(o.laiks || Date.now()), 'Europe/Riga', 'yyyy-MM-dd HH:mm');
  const rows = (o.nujas || []).map(n => [when, o.speletajs, o.numurs, 'Nūja', n.skaits, o.dizains, n.uzNujas, n.garums,
    n.flex, n.ieliekums, n.puse, n.kats, n.kickpoint, n.katavirsma, n.rgMaterials, n.rgDizains, n.rgKrasa,
    n.rgTeksts, n.rgLogo, n.skaits, '']);
  if (o.zekes && o.zekes.skaits > 0) {
    rows.push([when, o.speletajs, o.numurs, 'Zeķes', o.zekes.skaits, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', o.zekes.izmers]);
  }
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, HEAD.length).setValues(rows);
  return ContentService.createTextOutput(JSON.stringify({ ok: true, rows: rows.length }))
    .setMimeType(ContentService.MimeType.JSON);
}

function sheet_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(TAB) || ss.insertSheet(TAB);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
