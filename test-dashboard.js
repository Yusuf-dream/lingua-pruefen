/* ===========================================================================
   Lingua Bridge — Test des Admin-Dashboards
   node test-dashboard.js  |  node test-dashboard.js --live
   ========================================================================= */
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HIER = __dirname;
const LIVE = process.argv.includes('--live');
const PORT = 8183;
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
               '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml' };

const gruen = t => '\x1b[32m' + t + '\x1b[0m';
const rot   = t => '\x1b[31m' + t + '\x1b[0m';
let fehler = 0;
function p(n, ok, x) {
  if (ok) console.log('  ' + gruen('OK  ') + n + (x ? '  ' + x : ''));
  else { fehler++; console.log('  ' + rot('FEHL') + ' ' + n + (x ? '  ' + x : '')); }
}
const warte = ms => new Promise(r => setTimeout(r, ms));

function server() {
  return new Promise(res => {
    const s = http.createServer((req, rp) => {
      let u = decodeURIComponent(req.url.split('?')[0]);
      if (u === '/') u = '/index.html';
      const f = path.join(HIER, u);
      if (!f.startsWith(HIER) || !fs.existsSync(f)) { rp.writeHead(404); return rp.end(); }
      rp.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rp);
    });
    s.listen(PORT, () => res(s));
  });
}

(async () => {
  let srv = null;
  const basis = LIVE ? 'https://yusuf-dream.github.io/lingua-pruefen/' : 'http://localhost:' + PORT + '/';
  if (!LIVE) srv = await server();
  console.log('\n=== ADMIN-DASHBOARD — Test ===\nZiel: ' + basis + 'dashboard.html\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox','--disable-dev-shm-usage','--use-fake-ui-for-media-stream',
           '--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']
  });
  const s = await browser.newPage();
  await s.setViewport({ width: 1440, height: 950, deviceScaleFactor: 2 });
  const jsFehler = [], konsole = [], netz = [];
  s.on('pageerror', e => jsFehler.push(e.message));
  s.on('console', m => { if (m.type() === 'error') konsole.push(m.text()); });
  s.on('response', r => { if (r.status() >= 400) netz.push(r.url().split('/').pop() + ' HTTP ' + r.status()); });

  try {
    console.log('1. Laden');
    await s.goto(basis + 'dashboard.html', { waitUntil: 'networkidle2', timeout: 45000 });
    p('Seite geladen', true);
    p('Titel richtig', (await s.title()).indexOf('Lingua Bridge') >= 0, await s.title());

    console.log('\n2. Aufbau');
    p('Seitenleiste', (await s.$$eval('.leiste .lBtn', e => e.length)) === 5,
      (await s.$$eval('.leiste .lBtn', e => e.length)) + ' Symbole');
    p('Vier Kennzahlen', (await s.$$eval('.kpi', e => e.length)) === 4);
    p('Audio-Karte', !!(await s.$('#audio')));
    p('Sprach-Hub', !!(await s.$('#hub')));
    p('Heatmap', !!(await s.$('#qualitaet')));
    p('Phonem-Analyse', !!(await s.$('#phonem')));

    console.log('\n3. Echte Daten (bis 25 s warten)');
    let ok = false, ges = '';
    for (let i = 0; i < 50; i++) { await warte(600);
      ges = await s.$eval('#kpiGesamt', e => e.textContent);
      if (ges !== '—' && ges.length > 3) { ok = true; break; } }
    p('Kennzahl gefüllt', ok, ges);
    const zahl = parseInt(ges.replace(/\D/g, '') || '0', 10);
    p('Echte Anzahl (>1000)', zahl > 1000, zahl.toLocaleString('de'));

    console.log('\n4. Sprachkarten');
    const sp = await s.$$eval('.sprache', e => e.length);
    p('Sprachkarten erzeugt', sp === 5, sp + ' Stück');
    const namen = await s.$$eval('.sName', e => e.map(x => x.textContent.trim().split(' ')[0]));
    p('Af-Maxaa und Af-Maay dabei', namen.includes('Af-Maxaa') && namen.includes('Af-Maay'), namen.join(' · '));
    await warte(900);
    const breiten = await s.$$eval('.sBalken i', e => e.map(x => x.style.width));
    p('Balken animiert', breiten.some(b => b && b !== '0%'), breiten.join(' '));

    console.log('\n5. Heatmap');
    const zellen = await s.$$eval('.zelle', e => e.length);
    p('Zellen erzeugt', zellen > 10, zellen + ' Bereiche');
    p('Kurzinfo vorhanden', (await s.$$eval('.zelle .tip', e => e.length)) === zellen);

    console.log('\n6. Phonem-Graph');
    const gemalt = await s.$eval('#phonemGraph', c => {
      const x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0; for (let i = 3; i < x.length; i += 4) if (x[i] > 0) n++;
      return n;
    });
    p('Graph gezeichnet', gemalt > 500, gemalt + ' Bildpunkte');
    const pt = await s.$eval('#phonemText', e => e.textContent);
    p('Lautzahlen berechnet', pt.indexOf('Vorkommen') >= 0, pt.slice(0, 52) + '…');

    console.log('\n7. Aufgaben und Team');
    p('Aufgaben gelistet', (await s.$$eval('.aufgabe', e => e.length)) === 4);
    p('Team-Bereich', !!(await s.$('#rangliste')));

    console.log('\n8. Regler');
    p('Drei Regler', (await s.$$eval('input[type=range]', e => e.length)) === 3);
    await s.$eval('#rTempo', e => { e.value = 120; e.dispatchEvent(new Event('input')); });
    await warte(300);
    p('Regler zeigt Wert', (await s.$eval('#wTempo', e => e.textContent)) === '120%');

    console.log('\n9. Verknüpfung zum Prüfwerkzeug');
    const links = await s.$$eval('a[href="index.html"]', e => e.length);
    p('Verweise vorhanden', links >= 2, links + ' Verweise');

    console.log('\n10. Fehlerprotokoll');
    p('Keine JS-Fehler', jsFehler.length === 0, jsFehler.slice(0, 2).join(' | '));
    const kk = konsole.filter(x => !/fonts|favicon/i.test(x));
    p('Keine Konsolenfehler', kk.length === 0, kk.slice(0, 2).join(' | '));
    const nn = netz.filter(x => !/fonts|favicon/i.test(x));
    p('Keine Netzfehler', nn.length === 0, nn.slice(0, 2).join(' | '));

    console.log('\n11. Darstellung Desktop');
    p('Kein Überlauf', !(await s.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)));
    const lb = await s.$eval('.leiste', e => e.getBoundingClientRect().width);
    p('Seitenleiste schmal', lb >= 60 && lb <= 90, Math.round(lb) + 'px');
    await s.screenshot({ path: path.join(HIER, 'dash-pc.png') });
    p('Bildschirmfoto', true);

    console.log('\n12. Handy 390px');
    await s.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    await warte(1100);
    p('Kein Überlauf', !(await s.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)));
    p('Seitenleiste versteckt', await s.$eval('.leiste', e => getComputedStyle(e).display === 'none'));
    p('Mobiler Kopf sichtbar', await s.$eval('.mobilKopf', e => getComputedStyle(e).display !== 'none'));
    p('Fußleiste sichtbar', await s.$eval('.unten', e => getComputedStyle(e).display === 'flex'));
    const ub = await s.$$eval('.uBtn', e => e.length);
    p('Vier Fußsymbole', ub === 4, ub + ' Stück');
    const sb = await s.$$eval('.sBtn', e => e.map(x => Math.round(x.getBoundingClientRect().height)));
    p('Schnellknöpfe groß genug', sb.every(h => h >= 44), sb.join('/') + 'px');
    const uh = await s.$$eval('.uBtn', e => e.map(x => Math.round(x.getBoundingClientRect().height)));
    p('Fußknöpfe antippbar', uh.every(h => h >= 40), uh.join('/') + 'px');
    await s.screenshot({ path: path.join(HIER, 'dash-handy.png') });

    console.log('\n13. Handy 360px');
    await s.setViewport({ width: 360, height: 740, isMobile: true, hasTouch: true });
    await warte(800);
    p('Kein Überlauf', !(await s.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)));

  } catch (e) {
    fehler++;
    console.log('\n' + rot('ABBRUCH: ') + e.message);
  }

  await browser.close();
  if (srv) srv.close();
  console.log('\n' + '='.repeat(48));
  console.log(fehler === 0 ? gruen('  ALLE TESTS BESTANDEN') : rot('  ' + fehler + ' FEHLGESCHLAGEN'));
  console.log('='.repeat(48) + '\n');
  process.exit(fehler ? 1 : 0);
})();
