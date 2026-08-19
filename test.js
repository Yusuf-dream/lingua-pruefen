/* ===========================================================================
   Lingo Check — Selbsttest
   Startet einen echten Browser, laedt die Seite und prueft alles.
   Aufruf:  node test.js          (lokal)
            node test.js --live   (gegen GitHub Pages)
   ========================================================================= */
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HIER = __dirname;
const LIVE = process.argv.includes('--live');
const PORT = 8177;

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
               '.json':'application/json; charset=utf-8', '.css':'text/css; charset=utf-8' };

function server() {
  return new Promise(res => {
    const s = http.createServer((req, rp) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const datei = path.join(HIER, p);
      if (!datei.startsWith(HIER) || !fs.existsSync(datei)) { rp.writeHead(404); return rp.end('nicht gefunden'); }
      rp.writeHead(200, { 'Content-Type': MIME[path.extname(datei)] || 'application/octet-stream' });
      fs.createReadStream(datei).pipe(rp);
    });
    s.listen(PORT, () => res(s));
  });
}

const gruen = t => '\x1b[32m' + t + '\x1b[0m';
const rot   = t => '\x1b[31m' + t + '\x1b[0m';
let fehlerZahl = 0;

function pruefe(name, ok, extra) {
  if (ok) console.log('  ' + gruen('OK  ') + name + (extra ? '  ' + extra : ''));
  else { fehlerZahl++; console.log('  ' + rot('FEHL') + ' ' + name + (extra ? '  ' + extra : '')); }
}

(async () => {
  let s = null;
  const basis = LIVE ? 'https://yusuf-dream.github.io/lingua-pruefen/' : `http://localhost:${PORT}/`;
  if (!LIVE) s = await server();
  console.log('\n=== Lingo Check Selbsttest ===');
  console.log('Ziel: ' + basis + '\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage',
           '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
           '--autoplay-policy=no-user-gesture-required']
  });

  const seite = await browser.newPage();
  await seite.setViewport({ width: 1280, height: 900 });

  const konsole = [], jsFehler = [], netzFehler = [];
  seite.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') konsole.push(m.type() + ': ' + m.text()); });
  seite.on('pageerror', e => jsFehler.push(e.message));
  seite.on('requestfailed', r => netzFehler.push(r.url().split('/').pop() + ' — ' + (r.failure() || {}).errorText));
  seite.on('response', r => { if (r.status() >= 400) netzFehler.push(r.url().split('/').pop() + ' — HTTP ' + r.status()); });

  try {
    console.log('1. Seite laden');
    await seite.goto(basis, { waitUntil: 'networkidle2', timeout: 45000 });
    pruefe('Seite geladen', true);

    console.log('\n2. Anmeldung');
    const torDa = await seite.$('#tor');
    pruefe('Anmeldemaske vorhanden', !!torDa);
    if (torDa) {
      const sichtbar = await seite.$eval('#tor', el => getComputedStyle(el).display !== 'none');
      if (sichtbar) {
        await seite.type('#namefeld', 'Testlauf');
        await seite.click('.torbtn');
        await new Promise(r => setTimeout(r, 900));
        const weg = await seite.$eval('#tor', el => getComputedStyle(el).display === 'none');
        pruefe('Anmeldung schliesst die Maske', weg);
      } else pruefe('bereits angemeldet', true);
    }

    console.log('\n3. Daten laden');
    let gefuellt = false;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 700));
      const n = await seite.$$eval('#filter button', b => b.length);
      if (n > 0) { gefuellt = true; break; }
    }
    pruefe('Filterleiste gefuellt', gefuellt);
    const anzFilter = await seite.$$eval('#filter button', b => b.length);
    pruefe('Kategorien vorhanden', anzFilter > 5, anzFilter + ' Stueck');

    const karteText = await seite.$eval('#karte', el => el.innerText.slice(0, 60));
    pruefe('Karte zeigt Inhalt', !karteText.includes('Wird geladen'), '"' + karteText.replace(/\n/g, ' ') + '"');

    const fortschritt = await seite.$eval('#fortschritt', el => el.textContent);
    pruefe('Zaehler gefuellt', !/^0 \/ 0/.test(fortschritt), fortschritt);

    console.log('\n4. Bedienelemente');
    for (const sel of ['#suchfeld', '#weiter', '#zurueck', '#offenBtn', '#balken', '#sync', '#ichPille']) {
      pruefe('vorhanden: ' + sel, !!(await seite.$(sel)));
    }
    const felder = await seite.$$eval('#karte input.feld, #karte textarea.feld', e => e.length);
    pruefe('Eingabefelder in der Karte', felder >= 2, felder + ' Stueck');
    const audioBtn = await seite.$$eval('#karte .audio button', e => e.length);
    pruefe('Aufnahmeknoepfe', audioBtn >= 2, audioBtn + ' Stueck');

    console.log('\n5. Blaettern');
    const vorher = await seite.$eval('.zaehler', el => el.textContent);
    await seite.click('#weiter');
    await new Promise(r => setTimeout(r, 500));
    const nachher = await seite.$eval('.zaehler', el => el.textContent);
    pruefe('Weiter blaettert', vorher !== nachher, vorher + ' -> ' + nachher);

    console.log('\n6. Eingabe und Speichern');
    await seite.click('#karte .block.amber input.feld, #karte .block.amber textarea.feld');
    await seite.keyboard.type('TESTWERT');
    await new Promise(r => setTimeout(r, 900));
    const drin = await seite.$eval('#karte .block.amber input.feld, #karte .block.amber textarea.feld', el => el.value);
    pruefe('Af-Maay Eingabe moeglich', drin.includes('TESTWERT'), drin);

    console.log('\n7. Urteil');
    const btns = await seite.$$('.urteile button');
    if (btns.length === 3) {
      await btns[0].click();
      await new Promise(r => setTimeout(r, 700));
      const f2 = await seite.$eval('#fortschritt', el => el.textContent);
      pruefe('Urteil zaehlt hoch', !/^0 /.test(f2), f2);
    } else pruefe('drei Urteilsknoepfe', false, btns.length + ' gefunden');

    console.log('\n8. Statistik');
    await seite.click('button[onclick="zeigeStatistik()"]');
    await new Promise(r => setTimeout(r, 500));
    const statAuf = await seite.$eval('#statistik', el => getComputedStyle(el).display === 'block');
    pruefe('Statistik oeffnet', statAuf);
    const kacheln = await seite.$$eval('#statistik .statkachel', e => e.length);
    pruefe('Statistik-Kacheln', kacheln >= 4, kacheln + ' Stueck');

    console.log('\n9. Suche');
    await seite.click('button[onclick="zeigeStatistik()"]');
    await seite.type('#suchfeld', 'Frist');
    await new Promise(r => setTimeout(r, 700));
    const trefferText = await seite.$eval('.zaehler', el => el.textContent);
    pruefe('Suche liefert Treffer', !trefferText.includes('0 VON 0'), trefferText);

    console.log('\n10. Kategorie wechseln');
    await seite.$eval('#suchfeld', el => { el.value = ''; el.dispatchEvent(new Event('input')); });
    await new Promise(r => setTimeout(r, 400));
    const kats = await seite.$$('#filter button');
    if (kats.length > 3) {
      await kats[3].click();
      await new Promise(r => setTimeout(r, 700));
      const aktiv = await seite.$$eval('#filter button.aktiv', e => e.length);
      pruefe('Kategoriewechsel setzt aktiv', aktiv === 1);
    }

    console.log('\n11. Nachladen aller Bloecke');
    await new Promise(r => setTimeout(r, 9000));
    const ges = await seite.$eval('#fortschritt', el => el.textContent);
    const zahl = parseInt((ges.split('/')[1] || '').replace(/\D/g, '') || '0', 10);
    pruefe('Alle Eintraege geladen', zahl > 60000, zahl.toLocaleString('de') + ' Eintraege');

    console.log('\n12. Fehlerprotokoll');
    pruefe('Keine JS-Fehler', jsFehler.length === 0, jsFehler.slice(0, 3).join(' | '));
    const echteNetz = netzFehler.filter(f => !/fonts|favicon/i.test(f));
    pruefe('Keine Netzwerkfehler', echteNetz.length === 0, echteNetz.slice(0, 3).join(' | '));
    const echteKonsole = konsole.filter(k => !/fonts|favicon|DevTools/i.test(k));
    pruefe('Keine Konsolenfehler', echteKonsole.length === 0, echteKonsole.slice(0, 3).join(' | '));
    const fehlerBox = await seite.$eval('#fehler', el => getComputedStyle(el).display === 'none' ? '' : el.innerText);
    pruefe('Keine Fehlermeldung angezeigt', !fehlerBox, fehlerBox.slice(0, 80));

    console.log('\n13. Darstellung');
    const shot = path.join(HIER, 'test-ansicht.png');
    await seite.screenshot({ path: shot });
    pruefe('Bildschirmfoto erzeugt', fs.existsSync(shot));
    const ueberlauf = await seite.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    pruefe('Kein waagerechter Ueberlauf', !ueberlauf);
    const mitteLinks = await seite.$eval('main.mitte', el => Math.round(el.getBoundingClientRect().left));
    const fensterBreite = await seite.evaluate(() => window.innerWidth);
    const mitteBreite = await seite.$eval('main.mitte', el => Math.round(el.getBoundingClientRect().width));
    const zentriert = Math.abs(mitteLinks - (fensterBreite - mitteBreite - mitteLinks)) < 40;
    pruefe('Inhalt zentriert', zentriert, 'links ' + mitteLinks + ', Breite ' + mitteBreite + ', Fenster ' + fensterBreite);

    console.log('\n14. Mobilansicht');
    await seite.setViewport({ width: 390, height: 844, isMobile: true });
    await new Promise(r => setTimeout(r, 600));
    const ueberlaufM = await seite.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    pruefe('Mobil kein Ueberlauf', !ueberlaufM);
    await seite.screenshot({ path: path.join(HIER, 'test-mobil.png') });
    pruefe('Mobiles Bildschirmfoto', true);

  } catch (e) {
    fehlerZahl++;
    console.log('\n' + rot('ABBRUCH: ') + e.message);
  }

  await browser.close();
  if (s) s.close();

  console.log('\n' + '='.repeat(46));
  if (fehlerZahl === 0) console.log(gruen('  ALLE TESTS BESTANDEN'));
  else console.log(rot('  ' + fehlerZahl + ' TEST(S) FEHLGESCHLAGEN'));
  console.log('='.repeat(46) + '\n');
  process.exit(fehlerZahl ? 1 : 0);
})();
