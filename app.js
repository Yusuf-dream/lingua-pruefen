/* ===========================================================================
   Lingua Bridge — Pruef- und Aufnahmewerkzeug
   Speichert lokal (IndexedDB) und zentral (Supabase), sobald config.js
   ausgefuellt ist. Faellt bei Problemen sichtbar zurueck statt still zu haengen.
   ========================================================================= */

let DB = null, DATEN = [], korr = {}, VERZ = null;
let kat = 'behoerde', nurOffen = false, idx = 0, suche = '';
let ICH = '';
let ONLINE = false, geladeneBloecke = new Set();
let lokaleAudios = new Set(), zentraleAudios = new Map();

try { ICH = localStorage.getItem('lb_name') || ''; } catch (e) { }

function zeigeFehler(t) {
  const el = document.getElementById('fehler');
  if (el) { el.style.display = 'block'; el.innerHTML = t; }
  console.error(t);
}
function zeigeSync(t, dauer) {
  const el = document.getElementById('sync');
  if (!el) return;
  el.textContent = t;
  el.classList.toggle('online', ONLINE);
  setTimeout(() => { if (el.textContent === t) el.textContent = ONLINE ? '☁ verbunden' : '○ dieses Gerät'; },
    dauer || 2400);
}

/* -------------------------------------------------- IndexedDB (lokal) */
function oeffneDB() {
  return new Promise((res) => {
    let fertig = false;
    const r = indexedDB.open('linguabridge', 3);
    r.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio');
      if (!db.objectStoreNames.contains('korr')) db.createObjectStore('korr');
    };
    r.onsuccess = e => { fertig = true; res(e.target.result); };
    r.onerror = () => { fertig = true; res(null); };
    r.onblocked = () => {
      zeigeFehler('<b>Bitte andere Tabs dieser Seite schließen</b> — die Datenbank ist dort noch geöffnet.');
      setTimeout(() => { if (!fertig) res(null); }, 3000);
    };
    setTimeout(() => { if (!fertig) res(null); }, 6000);
  });
}
function put(s, k, v) {
  return new Promise(r => {
    if (!DB) return r();
    try { const t = DB.transaction(s, 'readwrite'); t.objectStore(s).put(v, k); t.oncomplete = r; t.onerror = r; }
    catch { r(); }
  });
}
function hole(s, k) {
  return new Promise(r => {
    if (!DB) return r(undefined);
    try { const q = DB.transaction(s, 'readonly').objectStore(s).get(k); q.onsuccess = () => r(q.result); q.onerror = () => r(undefined); }
    catch { r(undefined); }
  });
}
function entferne(s, k) {
  return new Promise(r => {
    if (!DB) return r();
    try { const t = DB.transaction(s, 'readwrite'); t.objectStore(s).delete(k); t.oncomplete = r; t.onerror = r; }
    catch { r(); }
  });
}
function alleKeys(s) {
  return new Promise(r => {
    if (!DB) return r([]);
    try { const q = DB.transaction(s, 'readonly').objectStore(s).getAllKeys(); q.onsuccess = () => r(q.result || []); q.onerror = () => r([]); }
    catch { r([]); }
  });
}

/* -------------------------------------------------- Supabase (zentral) */
async function sbAnfrage(pfad, opt = {}) {
  const r = await fetch(CONFIG.SUPABASE_URL + '/rest/v1/' + pfad, {
    ...opt,
    headers: {
      apikey: CONFIG.SUPABASE_KEY,
      Authorization: 'Bearer ' + CONFIG.SUPABASE_KEY,
      'Content-Type': 'application/json',
      ...(opt.headers || {})
    }
  });
  if (!r.ok) throw new Error(r.status + ' ' + (await r.text()).slice(0, 120));
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

async function zentralLaden() {
  if (!ONLINE) return 0;
  try {
    const rows = await sbAnfrage('korrekturen?select=*&limit=100000',
      { headers: { Prefer: 'return=representation' } });
    let n = 0;
    (rows || []).forEach(r => {
      const l = korr[r.eintrag_id];
      if (!l || !l._zeit || new Date(r.geaendert_am) > new Date(l._zeit)) {
        korr[r.eintrag_id] = {
          de: r.de || undefined, so: r.so || undefined, ymm: r.ymm || undefined,
          urteil: r.urteil || undefined, notiz: r.notiz || undefined,
          _zeit: r.geaendert_am, _wer: r.bearbeiter
        };
        n++;
      }
    });
    await put('korr', 'alle', korr);
    return n;
  } catch (e) { console.warn('zentralLaden:', e.message); return 0; }
}

async function zentralSpeichern(id) {
  if (!ONLINE) return;
  const p = korr[id] || {};
  try {
    await sbAnfrage('korrekturen', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify([{
        eintrag_id: id, de: p.de ?? null, so: p.so ?? null, ymm: p.ymm ?? null,
        urteil: p.urteil ?? null, notiz: p.notiz ?? null,
        bearbeiter: ICH || 'unbekannt', team_code: CONFIG.TEAM_CODE
      }])
    });
    zeigeSync('✓ gespeichert');
  } catch { zeigeSync('nur lokal'); }
}

async function positionMerken() {
  if (!ONLINE || !ICH) return;
  try {
    await sbAnfrage('fortschritt', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify([{ bearbeiter: ICH, kategorie: kat, position: idx, team_code: CONFIG.TEAM_CODE }])
    });
  } catch { }
}
async function positionHolen() {
  if (!ONLINE || !ICH) return null;
  try {
    const r = await sbAnfrage('fortschritt?bearbeiter=eq.' + encodeURIComponent(ICH) + '&select=*',
      { headers: { Prefer: 'return=representation' } });
    return r && r[0] ? r[0] : null;
  } catch { return null; }
}

async function audioHochladen(key, blob) {
  if (!ONLINE) return null;
  const pfad = key.replace(/:/g, '_') + '.webm';
  try {
    const r = await fetch(CONFIG.SUPABASE_URL + '/storage/v1/object/aufnahmen/' + pfad, {
      method: 'POST',
      headers: {
        apikey: CONFIG.SUPABASE_KEY, Authorization: 'Bearer ' + CONFIG.SUPABASE_KEY,
        'Content-Type': 'audio/webm', 'x-upsert': 'true'
      },
      body: blob
    });
    if (!r.ok) throw new Error(await r.text());
    const teile = key.split(':');
    await sbAnfrage('aufnahmen', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify([{
        eintrag_id: teile[1], varietaet: teile[2], pfad,
        sprecher: ICH || 'unbekannt', bytes: blob.size, team_code: CONFIG.TEAM_CODE
      }])
    });
    return pfad;
  } catch (e) { console.warn('audioHochladen:', e.message); return null; }
}
async function zentraleAudiosLaden() {
  if (!ONLINE) return;
  try {
    const r = await sbAnfrage('aufnahmen?select=eintrag_id,varietaet,pfad,sprecher',
      { headers: { Prefer: 'return=representation' } });
    zentraleAudios = new Map((r || []).map(a => ['audio:' + a.eintrag_id + ':' + a.varietaet, a]));
  } catch { }
}
function audioUrl(key) {
  const a = zentraleAudios.get(key);
  return a ? CONFIG.SUPABASE_URL + '/storage/v1/object/public/aufnahmen/' + a.pfad : null;
}

/* --------------------------------------------------------- Vorlesen */
function sprich(t) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(t);
  u.lang = 'de-DE'; u.rate = .85;
  speechSynthesis.speak(u);
}

/* --------------------------------------------------------- Aufnahme */
const rec = {};
async function starteAufnahme(key, btnId) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream);
    const chunks = [];
    mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
      await put('audio', key, blob);
      rec[key] = null;
      await zeichne();
      const p = await audioHochladen(key, blob);
      if (p) { await zentraleAudiosLaden(); zeigeSync('☁ hochgeladen'); zeichne(); }
    };
    mr.start();
    rec[key] = { mr, start: Date.now() };
    await zeichne();
    const el = document.getElementById(btnId);
    rec[key].timer = setInterval(() => {
      if (el && rec[key]) el.textContent = '⏹ Stopp · ' + Math.floor((Date.now() - rec[key].start) / 1000) + 's';
    }, 400);
  } catch {
    zeigeFehler('<b>Kein Mikrofonzugriff.</b> Bitte im Browser erlauben (Schloss-Symbol links in der Adresszeile).');
  }
}
function stoppeAufnahme(key) { if (rec[key]) { clearInterval(rec[key].timer); rec[key].mr.stop(); } }
async function spieleAb(key) {
  const b = await hole('audio', key);
  if (b) { new Audio(URL.createObjectURL(b)).play(); return; }
  const u = audioUrl(key);
  if (u) new Audio(u).play();
}
async function ladeRunter(key, wort) {
  let b = await hole('audio', key);
  if (!b) { const u = audioUrl(key); if (!u) return; b = await (await fetch(u)).blob(); }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = key.replace(/:/g, '_') + '_' + String(wort || '').replace(/[^\wäöüßÄÖÜ-]/g, '').slice(0, 30) + '.webm';
  a.click();
}
async function loescheAudio(key) { await entferne('audio', key); zeichne(); }

/* ------------------------------------------------------ Korrekturen */
let tLokal, tZentral;
function setze(id, feld, wert) {
  korr[id] = korr[id] || {};
  korr[id][feld] = wert;
  korr[id]._zeit = new Date().toISOString();
  clearTimeout(tLokal); tLokal = setTimeout(() => put('korr', 'alle', korr), 400);
  clearTimeout(tZentral); tZentral = setTimeout(() => zentralSpeichern(id), 1400);
}
async function urteil(id, wert) {
  setze(id, 'urteil', wert);
  await put('korr', 'alle', korr);
  zentralSpeichern(id);
  const k = document.getElementById('karte');
  if (k && wert === 'ok') { k.classList.add('gut'); setTimeout(() => k.classList.remove('gut'), 600); }
  const l = liste();
  if (idx < l.length - 1) idx++;
  positionMerken();
  zeichne();
}

/* ----------------------------------------------------------- Filter */
function liste() {
  let l = kat === 'alle' ? DATEN : DATEN.filter(d => d.k === kat);
  if (nurOffen) l = l.filter(d => !(korr[d.i] || {}).urteil);
  if (suche) {
    const s = suche.toLowerCase();
    l = l.filter(d => ((d.de || '') + (d.en || '') + (d.so || '') + (d.ymm || '')).toLowerCase().includes(s));
  }
  return l;
}

/* --------------------------------------------------------- Zeichnen */
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

async function zeichne() {
  lokaleAudios = new Set(await alleKeys('audio'));
  const l = liste();
  if (idx >= l.length) idx = Math.max(0, l.length - 1);
  const e = l[idx];
  const fertig = Object.values(korr).filter(p => p && p.urteil).length;
  const ges = DATEN.length || 1;

  document.getElementById('fortschritt').textContent =
    fertig.toLocaleString('de') + ' / ' + DATEN.length.toLocaleString('de');
  document.getElementById('balken').style.width = Math.min(100, fertig / ges * 100) + '%';
  document.getElementById('mitAudio').textContent =
    new Set([...lokaleAudios, ...zentraleAudios.keys()]).size;

  const karte = document.getElementById('karte');
  if (!e) { karte.innerHTML = '<p class="leer">Nichts gefunden.</p>'; return; }

  const p = korr[e.i] || {};
  const kSo = 'audio:' + e.i + ':so', kYmm = 'audio:' + e.i + ':ymm';
  const soW = p.so !== undefined ? p.so : (e.so || '');
  const ymmW = p.ymm !== undefined ? p.ymm : (e.ymm || '');
  const deW = p.de !== undefined ? p.de : (e.de || '');
  const lang = (e.so || '').length > 60;

  karte.innerHTML =
    '<div class="kopfzeile">' +
      '<span class="zaehler">' + (idx + 1).toLocaleString('de') + ' VON ' + l.length.toLocaleString('de') + '</span>' +
      '<span>' + (e.u ? '<span class="warn">unsicher</span> ' : '') +
        (p._wer && p._wer !== ICH ? '<span class="wer">' + esc(p._wer) + '</span>' : '') + '</span>' +
    '</div>' +
    '<div class="dezeile"><div style="flex:1;min-width:0">' +
      (deW ? '<div class="de">' + esc(deW) + '</div>' + (e.pl ? '<div class="pl">Plural: ' + esc(e.pl) + '</div>' : '')
           : '<div class="fehlt">Deutsche Übersetzung fehlt</div>') +
      (e.en ? '<div class="en"><b>EN</b> ' + esc(e.en) + '</div>' : '') +
    '</div>' +
    (deW ? '<button class="rund" onclick="sprich(' + JSON.stringify(deW + (e.pl ? ', ' + e.pl : '')) + ')" title="Deutsch anhören">🔊</button>' : '') +
    '</div>' +
    (!e.de ? '<input class="feld anmerkung" placeholder="Deutsche Übersetzung eintragen" value="' + esc(p.de) + '" oninput="setze(\'' + e.i + '\',\'de\',this.value)">' : '') +
    (e.n ? '<div class="notiz">' + esc(e.n) + '</div>' : '') +

    '<div class="block gruen">' +
      '<div class="blabel"><span class="punkt"></span>Af-Maxaa · Nord / Somaliland</div>' +
      (lang ? '<textarea class="feld gross" rows="3" oninput="setze(\'' + e.i + '\',\'so\',this.value)">' + esc(soW) + '</textarea>'
            : '<input class="feld gross" value="' + esc(soW) + '" oninput="setze(\'' + e.i + '\',\'so\',this.value)">') +
      audioZeile(kSo, soW, 'Af-Maxaa', 'gruen') +
    '</div>' +

    '<div class="block amber">' +
      '<div class="blabel"><span class="punkt"></span>Af-Maay · Süd</div>' +
      (lang ? '<textarea class="feld gross" rows="3" placeholder="Af-Maay eintragen" oninput="setze(\'' + e.i + '\',\'ymm\',this.value)">' + esc(ymmW) + '</textarea>'
            : '<input class="feld gross" placeholder="Af-Maay eintragen" value="' + esc(ymmW) + '" oninput="setze(\'' + e.i + '\',\'ymm\',this.value)">') +
      audioZeile(kYmm, ymmW, 'Af-Maay', 'amber') +
    '</div>' +

    '<textarea class="feld anmerkung" rows="2" placeholder="Anmerkung" oninput="setze(\'' + e.i + '\',\'notiz\',this.value)">' + esc(p.notiz) + '</textarea>' +

    '<div class="urteile">' +
      '<button class="' + (p.urteil === 'ok' ? 'aktiv ok' : '') + '" onclick="urteil(\'' + e.i + '\',\'ok\')">✓ richtig</button>' +
      '<button class="' + (p.urteil === 'falsch' ? 'aktiv falsch' : '') + '" onclick="urteil(\'' + e.i + '\',\'falsch\')">✗ falsch</button>' +
      '<button class="' + (p.urteil === 'unklar' ? 'aktiv unklar' : '') + '" onclick="urteil(\'' + e.i + '\',\'unklar\')">? unklar</button>' +
    '</div>';

  document.getElementById('zurueck').disabled = idx === 0;
  document.getElementById('weiter').disabled = idx >= l.length - 1;
}

function audioZeile(key, wort, label, farbe) {
  const hat = lokaleAudios.has(key) || zentraleAudios.has(key);
  const nurZentral = zentraleAudios.has(key) && !lokaleAudios.has(key);
  const bid = 'btn_' + key.replace(/:/g, '_');
  if (rec[key]) {
    return '<div class="audio"><button id="' + bid + '" class="rot" onclick="stoppeAufnahme(\'' + key + '\')">⏹ Stopp · 0s</button>' +
           '<span class="pulsi">● Aufnahme läuft</span></div>';
  }
  return '<div class="audio">' +
    '<button class="' + farbe + '" onclick="starteAufnahme(\'' + key + '\',\'' + bid + '\')">🎙 ' +
      (hat ? 'Neu aufnehmen' : label + ' aufnehmen') + '</button>' +
    (hat ?
      '<button onclick="spieleAb(\'' + key + '\')">▶ Anhören' + (nurZentral ? ' ☁' : '') + '</button>' +
      '<button onclick="ladeRunter(\'' + key + '\',' + JSON.stringify(String(wort || '')) + ')">⤓ Datei</button>' +
      (lokaleAudios.has(key) ? '<button class="loesch" onclick="loescheAudio(\'' + key + '\')">löschen</button>' : '')
      : '') +
    '</div>';
}

/* --------------------------------------------------- Export / Import */
function exportJSON() {
  const rein = {};
  for (const k in korr) {
    const o = Object.assign({}, korr[k]);
    delete o._zeit; delete o._wer;
    if (Object.keys(o).length) rein[k] = o;
  }
  const b = new Blob([JSON.stringify(rein, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = 'lingua-korrekturen-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
}
async function importJSON(ev) {
  const f = ev.target.files[0]; if (!f) return;
  try {
    const neu = JSON.parse(await f.text());
    let n = 0;
    for (const k in neu) { korr[k] = Object.assign({}, korr[k], neu[k], { _zeit: new Date().toISOString() }); n++; }
    await put('korr', 'alle', korr);
    if (ONLINE) for (const k in neu) await zentralSpeichern(k);
    zeigeSync(n + ' übernommen', 3000);
    zeichne();
  } catch { zeigeFehler('Datei konnte nicht gelesen werden.'); }
  ev.target.value = '';
}
async function alleAudios() {
  const keys = [...new Set([...lokaleAudios, ...zentraleAudios.keys()])];
  if (!keys.length) { zeigeFehler('Noch keine Aufnahmen vorhanden.'); return; }
  if (!confirm(keys.length + ' Aufnahmen herunterladen?')) return;
  for (const k of keys) {
    const e = DATEN.find(d => k.indexOf('audio:' + d.i + ':') === 0);
    await ladeRunter(k, e ? (k.slice(-3) === ':so' ? e.so : e.ymm) : '');
    await new Promise(r => setTimeout(r, 250));
  }
}

/* -------------------------------------------------------------- Laden */
const NAMEN = { behoerde:'Behörde', nordsued:'Nord/Süd', begruessung:'Begrüßung', zahlen:'Zahlen',
  zeit:'Zeit', gesundheit:'Gesundheit', familie:'Familie', weg:'Weg', arbeit:'Arbeit',
  substantive:'Substantive', verben:'Verben', adjektive:'Adjektive', zahlwoerter:'Zahlwörter',
  pronomen:'Pronomen', adverbien:'Adverbien', praepositionen:'Präpositionen',
  konjunktionen:'Konjunktionen', partikeln:'Partikeln', artikelwoerter:'Artikelwörter',
  interjektionen:'Interjektionen', suffixe:'Suffixe', eigennamen:'Eigennamen',
  buchstaben:'Buchstaben', saetze:'Sätze', korpus_saetze:'Korpus-Sätze',
  korpus_woerter:'Korpus-Wörter', sonstige:'Sonstige' };
const ORD = ['behoerde','nordsued','begruessung','zahlen','zeit','gesundheit','familie','weg',
  'arbeit','substantive','verben','adjektive','saetze','korpus_saetze','korpus_woerter',
  'zahlwoerter','pronomen','adverbien','praepositionen','konjunktionen','partikeln',
  'artikelwoerter','interjektionen','suffixe','eigennamen','buchstaben','sonstige'];

function baueFilter() {
  const z = {};
  DATEN.forEach(d => z[d.k] = (z[d.k] || 0) + 1);
  document.getElementById('filter').innerHTML =
    '<button onclick="setKat(\'alle\')" id="k_alle">Alle (' + DATEN.length.toLocaleString('de') + ')</button>' +
    ORD.filter(x => z[x]).map(x =>
      '<button onclick="setKat(\'' + x + '\')" id="k_' + x + '">' + (NAMEN[x] || x) + ' (' + z[x].toLocaleString('de') + ')</button>'
    ).join('');
  const b = document.getElementById('k_' + kat);
  if (b) b.classList.add('aktiv');
}

async function ladeBlock(n) {
  if (geladeneBloecke.has(n)) return;
  const r = await fetch('daten' + n + '.json');
  if (!r.ok) throw new Error('daten' + n + '.json: HTTP ' + r.status);
  DATEN = DATEN.concat(await r.json());
  geladeneBloecke.add(n);
}
async function ladeRest() {
  const info = document.getElementById('ladeinfo');
  for (let n = 1; n < VERZ.bloecke; n++) {
    try { await ladeBlock(n); } catch (e) { console.warn(e.message); }
    if (info) info.textContent = DATEN.length.toLocaleString('de') + ' von ' + VERZ.gesamt.toLocaleString('de') + ' geladen …';
  }
  if (info) info.textContent = '';
  baueFilter();
  zeichne();
}

function setKat(k) {
  kat = k; idx = 0;
  document.querySelectorAll('#filter button').forEach(b => b.classList.remove('aktiv'));
  const b = document.getElementById('k_' + k);
  if (b) { b.classList.add('aktiv'); b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); }
  positionMerken(); zeichne();
}
function toggleOffen() {
  nurOffen = !nurOffen; idx = 0;
  document.getElementById('offenBtn').classList.toggle('aktiv', nurOffen);
  zeichne();
}
function suchen(v) { suche = v; idx = 0; zeichne(); }
function blaettern(n) {
  const l = liste();
  idx = Math.max(0, Math.min(l.length - 1, idx + n));
  positionMerken(); zeichne();
}
function frageName() {
  const n = prompt('Wie heißt du? (damit man sieht, wer was geprüft hat)', ICH);
  if (n !== null) {
    ICH = n.trim();
    try { localStorage.setItem('lb_name', ICH); } catch (e) { }
    const b = document.getElementById('nameBtn');
    if (b) b.textContent = ICH ? '👤 ' + ICH : 'Name setzen';
    zeichne();
  }
}

async function los() {
  try {
    DB = await oeffneDB();
    if (!DB) zeigeFehler('<b>Lokaler Speicher nicht verfügbar.</b> Es wird trotzdem angezeigt, aber nichts gespeichert. Privates Fenster? Dann normal öffnen.');
    korr = (await hole('korr', 'alle')) || {};

    ONLINE = !!(window.CONFIG && CONFIG.SUPABASE_URL && CONFIG.SUPABASE_KEY);
    const s = document.getElementById('sync');
    s.textContent = ONLINE ? '☁ verbunden' : '○ dieses Gerät';
    s.classList.toggle('online', ONLINE);
    const nb = document.getElementById('nameBtn');
    if (nb && ICH) nb.textContent = '👤 ' + ICH;

    const rv = await fetch('verzeichnis.json');
    if (!rv.ok) throw new Error('verzeichnis.json: HTTP ' + rv.status);
    VERZ = await rv.json();

    await ladeBlock(0);
    baueFilter();
    setKat('behoerde');
    await zeichne();

    if (ONLINE) {
      const n = await zentralLaden();
      await zentraleAudiosLaden();
      if (n) zeigeSync('☁ ' + n + ' geholt', 3000);
      const pos = await positionHolen();
      if (pos && pos.kategorie) { kat = pos.kategorie; idx = pos.position || 0; setKat(kat); }
      zeichne();
    }
    ladeRest();
  } catch (err) {
    zeigeFehler('<b>Fehler beim Laden:</b> ' + err.message +
      '<br>Bitte einmal mit Strg+F5 neu laden. Bleibt es, schickt mir diese Meldung.');
    const k = document.getElementById('karte');
    if (k) k.innerHTML = '<p class="leer">Konnte nicht geladen werden.</p>';
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', los);
else los();
