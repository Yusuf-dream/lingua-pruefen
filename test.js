/* ===========================================================================
   LINGO CHECK — Selbsttest
   node test.js          lokal
   node test.js --live   gegen GitHub Pages
   ========================================================================= */
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HIER = __dirname;
const LIVE = process.argv.includes('--live');
const PORT = 8181;
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
               '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml' };

const gruen = t => '\x1b[32m' + t + '\x1b[0m';
const rot   = t => '\x1b[31m' + t + '\x1b[0m';
let fehler = 0;
function p(name, ok, extra) {
  if (ok) console.log('  ' + gruen('OK  ') + name + (extra ? '  ' + extra : ''));
  else { fehler++; console.log('  ' + rot('FEHL') + ' ' + name + (extra ? '  ' + extra : '')); }
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

async function menuKlick(s, text) {
  return await s.$$eval('#menueinhalt .meintrag', (els, t) => {
    const i = els.findIndex(e => e.textContent.indexOf(t) >= 0);
    if (i >= 0) { els[i].click(); return true; }
    return false;
  }, text);
}

(async () => {
  let srv = null;
  const basis = LIVE ? 'https://yusuf-dream.github.io/lingua-pruefen/' : 'http://localhost:' + PORT + '/';
  if (!LIVE) srv = await server();
  console.log('\n=== LINGO CHECK — Selbsttest ===\nZiel: ' + basis + '\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox','--disable-dev-shm-usage','--use-fake-ui-for-media-stream',
           '--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']
  });
  const s = await browser.newPage();
  await s.setViewport({ width: 1280, height: 900 });
  const jsFehler = [], konsole = [], netz = [];
  s.on('pageerror', e => jsFehler.push(e.message));
  s.on('console', m => { if (m.type() === 'error') konsole.push(m.text()); });
  s.on('response', r => { if (r.status() >= 400) netz.push(r.url().split('/').pop() + ' HTTP ' + r.status()); });

  try {
    console.log('1. Laden und Anmelden');
    await s.goto(basis, { waitUntil: 'networkidle2', timeout: 45000 });
    p('Seite geladen', true);
    p('Anmeldemaske sichtbar', await s.$eval('#tor', e => getComputedStyle(e).display !== 'none'));
    await s.type('#namefeld', 'Testlauf');
    await s.click('.torbtn');
    await warte(3000);
    p('Maske geschlossen', await s.$eval('#tor', e => getComputedStyle(e).display === 'none'));
    p('Name in der Leiste', (await s.$eval('#ichPille', e => e.textContent)) === 'Testlauf');

    console.log('\n2. Daten');
    let da = false;
    for (let i = 0; i < 40; i++) { await warte(600);
      const t = await s.$eval('#karte', e => e.innerText);
      if (!t.includes('wird geladen')) { da = true; break; } }
    p('Karte gefüllt', da);
    p('Deutsches Wort sichtbar', (await s.$$eval('.wort', e => e.length)) === 1,
      await s.$eval('.wort', e => e.textContent).catch(() => '-'));

    console.log('\n3. Deutsch hören');
    const dBtn = await s.$$eval('.quellekopf .hoerknopf', e => e.length);
    p('Deutsch-Hörknopf vorhanden', dBtn === 1);
    const spracheOK = await s.evaluate(() => {
      window.__ausgabe = [];
      const alt = window.speechSynthesis.speak.bind(window.speechSynthesis);
      window.speechSynthesis.speak = u => { window.__ausgabe.push({ text: u.text, lang: u.lang, rate: u.rate }); };
      document.querySelector('.quellekopf .hoerknopf').click();
      return window.__ausgabe[0] || null;
    });
    p('Deutsch wird vorgelesen', !!spracheOK && spracheOK.lang === 'de-DE',
      spracheOK ? '"' + spracheOK.text + '" lang=' + spracheOK.lang + ' rate=' + spracheOK.rate : 'nichts');

    console.log('\n4. Englisch hören');
    const enDa = await s.$('.enreihe');
    p('Englisch-Zeile vorhanden', !!enDa);
    if (enDa) {
      p('EN-Kennzeichnung', (await s.$eval('.enmark', e => e.textContent)) === 'EN');
      const enText = await s.$eval('.entext', e => e.textContent);
      p('Englischer Text', enText.trim().length > 0, enText.slice(0, 34));
      const enAus = await s.evaluate(() => { window.__ausgabe = [];
        document.querySelector('.enreihe .hoerknopf').click(); return window.__ausgabe[0] || null; });
      p('Englisch wird vorgelesen', !!enAus && enAus.lang === 'en-US', enAus ? enAus.lang : 'nichts');
    }

    console.log('\n5. Tempo');
    const tBtn = await s.$$eval('.tempo button', e => e.length);
    p('Drei Tempostufen', tBtn === 3);
    await s.$$eval('.tempo button', e => e[0].click());
    await warte(600);
    const rate = await s.evaluate(() => { window.__ausgabe = [];
      document.querySelector('.quellekopf .hoerknopf').click();
      return (window.__ausgabe[0] || {}).rate; });
    p('Langsam wirkt', Math.abs(rate - 0.6) < 0.01, 'rate=' + Number(rate).toFixed(2));
    await s.$$eval('.tempo button', e => e[1].click());
    await warte(400);

    console.log('\n6. Zwei Kanäle');
    p('Kanal Af-Maxaa', (await s.$$eval('.kanal.k1', e => e.length)) === 1);
    p('Kanal Af-Maay', (await s.$$eval('.kanal.k2', e => e.length)) === 1);
    const namen = await s.$$eval('.kanalname', e => e.map(x => x.textContent));
    p('Kanalnamen richtig', namen.join('|') === 'Af-Maxaa|Af-Maay', namen.join(' · '));
    const orte = await s.$$eval('.kanalort', e => e.map(x => x.textContent));
    p('Nord und Süd benannt', orte.some(o => o.includes('Somaliland')) && orte.some(o => o.includes('Süd')), orte.join(' · '));
    p('Zwei Eingabefelder', (await s.$$eval('.kanal .kfeld', e => e.length)) === 2);
    p('Wellenform-Flächen', (await s.$$eval('.welle canvas', e => e.length)) === 2);

    console.log('\n7. Eingabe speichern');
    await s.click('.kanal.k2 .kfeld');
    await s.keyboard.type('TESTMAAY');
    await warte(1000);
    p('Af-Maay Eingabe', (await s.$eval('.kanal.k2 .kfeld', e => e.value)).includes('TESTMAAY'));

    console.log('\n8. Urteil per Maus');
    const uBtn = await s.$$('.urteil button');
    p('Drei Urteilsknöpfe', uBtn.length === 3);
    await uBtn[0].click();
    await warte(900);
    p('Heute-Zähler steigt', (await s.$eval('#heute', e => e.textContent)) === '1');

    console.log('\n9. Tastatur');
    const vor = await s.$eval('.pos', e => e.textContent);
    await s.keyboard.press('ArrowRight');
    await warte(500);
    const nach = await s.$eval('.pos', e => e.textContent);
    p('Pfeil rechts blättert', vor !== nach, vor.slice(-12) + ' -> ' + nach.slice(-12));
    await s.keyboard.press('2');
    await warte(800);
    p('Taste 2 urteilt', (await s.$eval('#heute', e => e.textContent)) === '2');
    const leerAus = await s.evaluate(() => { window.__ausgabe = [];
      document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      return window.__ausgabe.length; });
    p('Leertaste liest vor', leerAus === 1);

    console.log('\n10. Menü');
    await s.click('.burger');
    await warte(600);
    p('Menü offen', await s.$eval('#menue', e => e.classList.contains('auf')));
    const anz = await s.$$eval('#menueinhalt .meintrag', e => e.length);
    p('Einträge im Menü', anz > 25, anz + ' Stück');
    p('Drei Gruppen', (await s.$$eval('#menueinhalt .mtitel', e => e.length)) === 3);

    console.log('\n11. Filter "schon geprüft"');
    p('Filter vorhanden', await menuKlick(s, 'Schon geprüft'));
    await warte(800);
    p('Menü geschlossen', await s.$eval('#menue', e => !e.classList.contains('auf')));
    p('Chip zeigt Filter', (await s.$$eval('#chips .chip', e => e.length)) >= 1,
      (await s.$$eval('#chips .chip', e => e.map(x => x.textContent))).join(' | '));
    p('Status-Marke sichtbar', (await s.$$eval('.mk.ok, .mk.falsch, .mk.unklar', e => e.length)) === 1);
    p('Nachbessern möglich', (await s.$$eval('.knoepfe button', e => e.length)) >= 2);

    console.log('\n12. Weitere Filter');
    for (const nm of ['Af-Maay fehlt', 'Ohne Aufnahme', 'Alles']) {
      await s.click('.burger'); await warte(450);
      const ok = await menuKlick(s, nm); await warte(650);
      p('Filter: ' + nm, ok, await s.$eval('.pos', e => e.textContent).catch(() => 'leer'));
    }

    console.log('\n13. Bereich wechseln');
    await s.click('.burger'); await warte(450);
    await menuKlick(s, 'Tiere'); await warte(700);
    p('Bereich Tiere', (await s.$eval('.pos', e => e.textContent)).includes('TIERE'),
      await s.$eval('.wort', e => e.textContent).catch(() => '-'));
    await s.click('#chips .chipx'); await warte(600);
    p('Chip entfernt', (await s.$$eval('#chips .chip', e => e.length)) === 0);

    console.log('\n14. Statistik');
    await s.evaluate(() => zeigeStatistik());
    await warte(500);
    p('Statistik offen', await s.$eval('#statistik', e => getComputedStyle(e).display === 'block'));
    p('Sechs Kacheln', (await s.$$eval('#statistik .kachel', e => e.length)) === 6);
    p('Rangliste', (await s.$$eval('#statistik .rang', e => e.length)) >= 1);
    await s.evaluate(() => zeigeStatistik());

    console.log('\n15. Neuladen');
    await s.reload({ waitUntil: 'networkidle2' });
    await warte(3500);
    p('Angemeldet geblieben', await s.$eval('#tor', e => getComputedStyle(e).display === 'none'));
    const bal = await s.$eval('#balken', e => parseFloat(e.style.width) || 0);
    p('Fortschritt erhalten', bal > 0, bal.toFixed(4) + '%');

    console.log('\n16. Alle Blöcke');
    await warte(9000);
    const ges = await s.evaluate(() => DATEN.length);
    p('Alle Einträge geladen', ges > 60000, ges.toLocaleString('de'));

    console.log('\n17. Fehlerprotokoll');
    p('Keine JS-Fehler', jsFehler.length === 0, jsFehler.slice(0, 2).join(' | '));
    const kk = konsole.filter(x => !/fonts|favicon/i.test(x));
    p('Keine Konsolenfehler', kk.length === 0, kk.slice(0, 2).join(' | '));
    const nn = netz.filter(x => !/fonts|favicon/i.test(x));
    p('Keine Netzfehler', nn.length === 0, nn.slice(0, 2).join(' | '));
    p('Keine Fehleranzeige', !(await s.$eval('#fehler', e => getComputedStyle(e).display !== 'none')));

    console.log('\n18. Darstellung am Rechner');
    p('Kein Überlauf', !(await s.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)));
    const links = await s.$eval('main.mitte', e => Math.round(e.getBoundingClientRect().left));
    const breite = await s.$eval('main.mitte', e => Math.round(e.getBoundingClientRect().width));
    const fenster = await s.evaluate(() => window.innerWidth);
    p('Zentriert', Math.abs(links - (fenster - breite - links)) < 40,
      'links ' + links + ' breite ' + breite);
    await s.screenshot({ path: path.join(HIER, 'ansicht-pc.png') });

    console.log('\n19. Handy — iPhone-Größe');
    await s.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    await warte(900);
    p('Kein Überlauf (390px)', !(await s.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)));
    const wortGr = await s.$eval('.wort', e => parseFloat(getComputedStyle(e).fontSize));
    p('Wort lesbar', wortGr >= 26, wortGr + 'px');
    const hk = await s.$eval('.quellekopf .hoerknopf', e => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, s: r.right <= window.innerWidth }; });
    p('Hörknopf antippbar', hk.w >= 44 && hk.h >= 44, Math.round(hk.w) + 'x' + Math.round(hk.h) + 'px');
    p('Hörknopf im Bild', hk.s);
    const uH = await s.$$eval('.urteil button', e => e.map(x => Math.round(x.getBoundingClientRect().height)));
    p('Urteilsknöpfe groß genug', uH.every(h => h >= 44), uH.join('/') + 'px');
    const kb = await s.$$eval('.knoepfe button', e => e.map(x => Math.round(x.getBoundingClientRect().height)));
    p('Aufnahmeknöpfe groß genug', kb.every(h => h >= 40), kb.join('/') + 'px');
    const mBr = await s.$eval('#menue', e => e.getBoundingClientRect().width);
    p('Menü passt', mBr <= 390, Math.round(mBr) + 'px');
    const mobAus = await s.evaluate(() => { window.__ausgabe = [];
      const alt = window.speechSynthesis.speak.bind(window.speechSynthesis);
      window.speechSynthesis.speak = u => window.__ausgabe.push({ lang: u.lang });
      document.querySelector('.quellekopf .hoerknopf').click();
      return window.__ausgabe[0] || null; });
    p('Deutsch hören am Handy', !!mobAus && mobAus.lang === 'de-DE');
    await s.screenshot({ path: path.join(HIER, 'ansicht-handy.png') });

    console.log('\n20. Handy — kleines Gerät 360px');
    await s.setViewport({ width: 360, height: 740, isMobile: true, hasTouch: true });
    await warte(700);
    p('Kein Überlauf (360px)', !(await s.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)));
    await s.click('.burger'); await warte(700);
    p('Menü am Handy', await s.$eval('#menue', e => e.getBoundingClientRect().right <= 361));
    await s.screenshot({ path: path.join(HIER, 'ansicht-menue.png') });

  } catch (e) {
    fehler++;
    console.log('\n' + rot('ABBRUCH: ') + e.message + '\n' + (e.stack || '').split('\n')[1]);
  }

  await browser.close();
  if (srv) srv.close();
  console.log('\n' + '='.repeat(48));
  console.log(fehler === 0 ? gruen('  ALLE TESTS BESTANDEN') : rot('  ' + fehler + ' FEHLGESCHLAGEN'));
  console.log('='.repeat(48) + '\n');
  process.exit(fehler ? 1 : 0);
})();
