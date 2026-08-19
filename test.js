/* ===========================================================================
   Lingo Check — Test der neuen Funktionen
   Menü, Statusfilter, Nachbessern, Englisch
   Aufruf:  node test2.js  |  node test2.js --live
   ========================================================================= */
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HIER = __dirname;
const LIVE = process.argv.includes('--live');
const PORT = 8179;
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
               '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml' };

const gruen = t => '\x1b[32m' + t + '\x1b[0m';
const rot   = t => '\x1b[31m' + t + '\x1b[0m';
let fehler = 0;
function pruefe(name, ok, extra) {
  if (ok) console.log('  ' + gruen('OK  ') + name + (extra ? '  ' + extra : ''));
  else { fehler++; console.log('  ' + rot('FEHL') + ' ' + name + (extra ? '  ' + extra : '')); }
}

function server() {
  return new Promise(res => {
    const s = http.createServer((req, rp) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const f = path.join(HIER, p);
      if (!f.startsWith(HIER) || !fs.existsSync(f)) { rp.writeHead(404); return rp.end(); }
      rp.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rp);
    });
    s.listen(PORT, () => res(s));
  });
}

// Menüeintrag anhand seines Textes anklicken
async function menuKlick(seite, text) {
  return await seite.$$eval('#menueinhalt .meintrag', (els, t) => {
    const i = els.findIndex(e => e.textContent.indexOf(t) >= 0);
    if (i >= 0) { els[i].click(); return true; }
    return false;
  }, text);
}

(async () => {
  let s = null;
  const basis = LIVE ? 'https://yusuf-dream.github.io/lingua-pruefen/' : 'http://localhost:' + PORT + '/';
  if (!LIVE) s = await server();
  console.log('\n=== Test der neuen Funktionen ===');
  console.log('Ziel: ' + basis + '\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox','--disable-dev-shm-usage','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']
  });
  const seite = await browser.newPage();
  await seite.setViewport({ width: 1280, height: 900 });
  const jsFehler = [], konsole = [];
  seite.on('pageerror', e => jsFehler.push(e.message));
  seite.on('console', m => { if (m.type() === 'error') konsole.push(m.text()); });

  try {
    await seite.goto(basis, { waitUntil: 'networkidle2', timeout: 45000 });
    await seite.type('#namefeld', 'Testlauf');
    await seite.click('.torbtn');
    await new Promise(r => setTimeout(r, 2500));

    console.log('1. Menü öffnen');
    await seite.click('.burger');
    await new Promise(r => setTimeout(r, 600));
    pruefe('Menü öffnet', await seite.$eval('#menue', el => el.classList.contains('auf')));
    pruefe('Schleier sichtbar', await seite.$eval('#schleier', el => el.classList.contains('auf')));
    const anz = await seite.$$eval('#menueinhalt .meintrag', e => e.length);
    pruefe('Einträge im Menü', anz > 25, anz + ' Stück');
    const gruppen = await seite.$$eval('#menueinhalt .mtitel', e => e.map(x => x.textContent));
    pruefe('Drei Gruppen', gruppen.length === 3, gruppen.join(' · '));
    const statusAnz = await seite.$$eval('#menueinhalt .meintrag .anz', e => e.length);
    pruefe('Zahlen neben Einträgen', statusAnz > 25, statusAnz + ' Zähler');

    console.log('\n2. Menü schließen über Schleier');
    await seite.click('#schleier');
    await new Promise(r => setTimeout(r, 500));
    pruefe('Menü schließt', await seite.$eval('#menue', el => !el.classList.contains('auf')));

    console.log('\n3. Erst etwas prüfen, damit "schon geprüft" gefüllt ist');
    const u = await seite.$$('.urteile button');
    await u[0].click();
    await new Promise(r => setTimeout(r, 800));
    await (await seite.$$('.urteile button'))[1].click();
    await new Promise(r => setTimeout(r, 800));
    const f = await seite.$eval('#fortschritt', el => el.textContent);
    pruefe('Zwei Einträge geprüft', /^2 /.test(f), f);

    console.log('\n4. Filter "Schon geprüft — nachbessern"');
    await seite.click('.burger');
    await new Promise(r => setTimeout(r, 500));
    pruefe('Filter gefunden', await menuKlick(seite, 'Schon geprüft'));
    await new Promise(r => setTimeout(r, 800));
    pruefe('Menü schließt nach Auswahl', await seite.$eval('#menue', el => !el.classList.contains('auf')));
    const chips = await seite.$$eval('#aktivfilter .chip', e => e.map(x => x.textContent));
    pruefe('Aktiver Filter angezeigt', chips.length >= 1, chips.join(' | '));
    const marke = await seite.$$eval('#karte .erledigt', e => e.map(x => x.textContent));
    pruefe('Status-Marke auf der Karte', marke.length === 1, marke.join(''));
    const zaehler = await seite.$eval('.zaehler', el => el.textContent);
    pruefe('Nur geprüfte in der Liste', /VON 2$/.test(zaehler), zaehler);

    console.log('\n5. Aufnahme nachbessern');
    const btns = await seite.$$eval('#karte .audio button', e => e.map(x => x.textContent.trim()));
    pruefe('Aufnahmeknöpfe vorhanden', btns.length >= 2, btns.join(' / '));
    pruefe('Feld weiterhin änderbar', await seite.$$eval('#karte .block input.feld, #karte .block textarea.feld', e => e.length) >= 2);

    console.log('\n6. Weitere Statusfilter');
    for (const nm of ['Af-Maay fehlt', 'Ohne Aufnahme', 'Nur ✓ richtig']) {
      await seite.click('.burger');
      await new Promise(r => setTimeout(r, 450));
      const ok = await menuKlick(seite, nm);
      await new Promise(r => setTimeout(r, 650));
      const z = await seite.$eval('.zaehler', el => el.textContent).catch(() => 'leer');
      pruefe('Filter: ' + nm, ok, z);
    }

    console.log('\n7. Zurück auf "Alles anzeigen"');
    await seite.click('.burger');
    await new Promise(r => setTimeout(r, 450));
    await menuKlick(seite, 'Alles anzeigen');
    await new Promise(r => setTimeout(r, 700));
    pruefe('Filter zurückgesetzt', (await seite.$$eval('#aktivfilter .chip', e => e.length)) <= 1);

    console.log('\n8. Englisch sichtbar und hörbar');
    const enZeile = await seite.$('#karte .enzeile');
    pruefe('Englisch-Zeile vorhanden', !!enZeile);
    if (enZeile) {
      const t = await seite.$eval('#karte .entext', el => el.textContent);
      pruefe('Englischer Text gefüllt', t.trim().length > 0, t.slice(0, 40));
      pruefe('Kennzeichnung ENGLISH', (await seite.$eval('#karte .enflag', el => el.textContent)) === 'ENGLISH');
      pruefe('Englisch-Vorlesen', (await seite.$$eval('#karte .enzeile button', e => e.length)) === 1);
    }
    pruefe('Deutsch-Vorlesen', (await seite.$$eval('#karte .dezeile button.rund', e => e.length)) === 1);

    console.log('\n9. Bereich wechseln über Menü');
    await seite.click('.burger');
    await new Promise(r => setTimeout(r, 450));
    await menuKlick(seite, 'Tiere');
    await new Promise(r => setTimeout(r, 700));
    const chip2 = await seite.$$eval('#aktivfilter .chip', e => e.map(x => x.textContent));
    pruefe('Bereich Tiere gewählt', chip2.some(c => c.indexOf('Tiere') >= 0), chip2.join(' | '));
    const wort = await seite.$eval('#karte .de', el => el.textContent).catch(() => '');
    pruefe('Tier-Eintrag sichtbar', wort.length > 0, wort);

    console.log('\n10. Filter über Chip entfernen');
    await seite.click('#aktivfilter .chipx');
    await new Promise(r => setTimeout(r, 600));
    pruefe('Chip entfernt', (await seite.$$eval('#aktivfilter .chip', e => e.length)) === 0);

    console.log('\n11. Speichern überlebt Neuladen');
    await seite.reload({ waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));
    const f2 = await seite.$eval('#fortschritt', el => el.textContent);
    pruefe('Geprüfte Einträge bleiben', /^2 /.test(f2), f2);
    pruefe('Angemeldet geblieben', await seite.$eval('#tor', el => getComputedStyle(el).display === 'none'));

    console.log('\n12. Fehlerprotokoll');
    pruefe('Keine JS-Fehler', jsFehler.length === 0, jsFehler.slice(0, 2).join(' | '));
    const kk = konsole.filter(k => !/fonts|favicon/i.test(k));
    pruefe('Keine Konsolenfehler', kk.length === 0, kk.slice(0, 2).join(' | '));

    console.log('\n13. Darstellung');
    pruefe('Kein waagerechter Überlauf',
      !(await seite.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)));
    await seite.screenshot({ path: path.join(HIER, 'test2-ansicht.png') });
    await seite.click('.burger');
    await new Promise(r => setTimeout(r, 700));
    await seite.screenshot({ path: path.join(HIER, 'test2-menue.png') });
    pruefe('Bildschirmfotos erzeugt', true);

    await seite.setViewport({ width: 390, height: 844, isMobile: true });
    await new Promise(r => setTimeout(r, 600));
    pruefe('Mobil kein Überlauf',
      !(await seite.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)));
    const mBreite = await seite.$eval('#menue', el => el.getBoundingClientRect().width);
    pruefe('Menü passt auf Handy', mBreite <= 390, Math.round(mBreite) + 'px');
    await seite.screenshot({ path: path.join(HIER, 'test2-mobil.png') });

  } catch (e) {
    fehler++;
    console.log('\n' + rot('ABBRUCH: ') + e.message);
  }

  await browser.close();
  if (s) s.close();
  console.log('\n' + '='.repeat(46));
  console.log(fehler === 0 ? gruen('  ALLE TESTS BESTANDEN') : rot('  ' + fehler + ' TEST(S) FEHLGESCHLAGEN'));
  console.log('='.repeat(46) + '\n');
  process.exit(fehler ? 1 : 0);
})();
