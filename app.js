/* ===========================================================================
   Lingua Bridge — Prüf- und Aufnahmewerkzeug
   ---------------------------------------------------------------------------
   Speichert immer lokal (IndexedDB) und zusätzlich zentral (Supabase),
   sobald in config.js Zugangsdaten hinterlegt sind. Damit setzt man auf
   jedem Gerät genau dort fort, wo man aufgehört hat.
   ========================================================================= */

let DB = null, DATEN = [], korr = {}, VERZ = null, sb = null;
let kat = 'behoerde', nurOffen = false, idx = 0, suche = '';
let ICH = localStorage.getItem('lb_name') || '';
let ONLINE = false, geladeneBloecke = new Set();

/* ---------------------------------------------------- IndexedDB (lokal) */
function oeffneDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('linguabridge', 2);
    r.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio');
      if (!db.objectStoreNames.contains('korr')) db.createObjectStore('korr');
    };
    r.onsuccess = e => res(e.target.result);
    r.onerror = () => rej(r.error);
  });
}
const tx = (s, m) => DB.transaction(s, m).objectStore(s);
function put(s, k, v) { return new Promise(r => { const t = DB.transaction(s, 'readwrite'); t.objectStore(s).put(v, k); t.oncomplete = r; t.onerror = r; }); }
function get(s, k) { return new Promise(r => { const q = tx(s, 'readonly').get(k); q.onsuccess = () => r(q.result); q.onerror = () => r(undefined); }); }
function del(s, k) { return new Promise(r => { const t = DB.transaction(s, 'readwrite'); t.objectStore(s).delete(k); t.oncomplete = r; t.onerror = r; }); }
function alleKeys(s) { return new Promise(r => { const q = tx(s, 'readonly').getAllKeys(); q.onsuccess = () => r(q.result || []); q.onerror = () => r([]); }); }

/* ------------------------------------------------------ Supabase (zentral) */
async function sbAnfrage(pfad, opt = {}) {
  if (!ONLINE) return null;
  const r = await fetch(CONFIG.SUPABASE_URL + '/rest/v1/' + pfad, {
    ...opt,
    headers: {
      apikey: CONFIG.SUPABASE_KEY,
      Authorization: 'Bearer ' + CONFIG.SUPABASE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
      ...(opt.headers || {})
    }
  });
  if (!r.ok) throw new Error(await r.text());
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

async function zentralLaden() {
  if (!ONLINE) return;
  try {
    const rows = await sbAnfrage('korrekturen?select=*&limit=100000', {
      headers: { Prefer: 'return=representation' }
    });
    let n = 0;
    (rows || []).forEach(r => {
      const lokal = korr[r.eintrag_id];
      const zentralNeuer = !lokal || !lokal._zeit || new Date(r.geaendert_am) > new Date(lokal._zeit);
      if (zentralNeuer) {
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
  } catch (e) { console.warn('Zentral laden:', e.message); return 0; }
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
    zeigeSync('gespeichert');
  } catch (e) { zeigeSync('nur lokal'); }
}

async function positionMerken() {
  if (!ONLINE || !ICH) return;
  try {
    await sbAnfrage('fortschritt', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify([{ bearbeiter: ICH, kategorie: kat, position: idx, team_code: CONFIG.TEAM_CODE }])
    });
  } catch (e) { /* nicht kritisch */ }
}

async function positionHolen() {
  if (!ONLINE || !ICH) return null;
  try {
    const r = await sbAnfrage(`fortschritt?bearbeiter=eq.${encodeURIComponent(ICH)}&select=*`,
      { headers: { Prefer: 'return=representation' } });
    return r && r[0] ? r[0] : null;
  } catch { return null; }
}

/* ------------------------------------------------------ Aufnahmen zentral */
async function audioHochladen(key, blob) {
  if (!ONLINE) return null;
  const pfad = key.replace(/:/g, '_') + '.webm';
  try {
    const r = await fetch(CONFIG.SUPABASE_URL + '/storage/v1/object/aufnahmen/' + pfad, {
      method: 'POST',
      headers: {
        apikey: CONFIG.SUPABASE_KEY,
        Authorization: 'Bearer ' + CONFIG.SUPABASE_KEY,
        'Content-Type': 'audio/webm',
        'x-upsert': 'true'
      },
      body: blob
    });
    if (!r.ok) throw new Error(await r.text());
    const [, eid, varietaet] = key.split(':');
    await sbAnfrage('aufnahmen', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify([{
        eintrag_id: eid, varietaet, pfad, sprecher: ICH || 'unbekannt',
        bytes: blob.size, team_code: CONFIG.TEAM_CODE
      }])
    });
    return pfad;
  } catch (e) { console.warn('Audio hoch:', e.message); return null; }
}

let zentraleAudios = new Map();
async function zentraleAudiosLaden() {
  if (!ONLINE) return;
  try {
    const r = await sbAnfrage('aufnahmen?select=eintrag_id,varietaet,pfad,sprecher', {
      headers: { Prefer: 'return=representation' }
    });
    zentraleAudios = new Map((r || []).map(a => ['audio:' + a.eintrag_id + ':' + a.varietaet, a]));
  } catch { /* egal */ }
}
function audioUrl(key) {
  const a = zentraleAudios.get(key);
  return a ? CONFIG.SUPABASE_URL + '/storage/v1/object/public/aufnahmen/' + a.pfad : null;
}

/* ------------------------------------------------------------- Vorlesen */
function sprich(t) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(t);
  u.lang = 'de-DE'; u.rate = 0.85; speechSynthesis.speak(u);
}

/* ------------------------------------------------------------- Aufnahme */
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
      zeichne();
      const p = await audioHochladen(key, blob);
      if (p) { await zentraleAudiosLaden(); zeigeSync('Aufnahme hochgeladen'); zeichne(); }
    };
    mr.start();
    rec[key] = { mr, start: Date.now() };
    zeichne();
    const el = document.getElementById(btnId);
    rec[key].timer = setInterval(() => {
      if (el && rec[key]) el.textContent = '\u23F9 Stopp \u00B7 ' + Math.floor((Date.now() - rec[key].start) / 1000) + 's';
    }, 500);
  } catch { alert('Kein Mikrofonzugriff. Bitte im Browser erlauben.'); }
}
function stoppeAufnahme(key) { if (rec[key]) { clearInterval(rec[key].timer); rec[key].mr.stop(); } }

async function spieleAb(key) {
  const b = await get('audio', key);
  if (b) { new Audio(URL.createObjectURL(b)).play(); return; }
  const u = audioUrl(key);
  if (u) new Audio(u).play();
}
async function ladeRunter(key, wort) {
  let b = await get('audio', key);
  if (!b) {
    const u = audioUrl(key);
    if (!u) return;
    b = await (await fetch(u)).blob();
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = key.replace(/:/g, '_') + '_' + (wort || '').replace(/[^\wäöüßÄÖÜ-]/g, '') + '.webm';
  a.click();
}
async function loescheAudio(key) { await del('audio', key); zeichne(); }

/* ---------------------------------------------------------- Korrekturen */
let sichernTimer, sbTimer;
function setze(id, feld, wert) {
  korr[id] = korr[id] || {};
  korr[id][feld] = wert;
  korr[id]._zeit = new Date().toISOString();
  clearTimeout(sichernTimer);
  sichernTimer = setTimeout(() => put('korr', 'alle', korr), 400);
  clearTimeout(sbTimer);
  sbTimer = setTimeout(() => zentralSpeichern(id), 1200);
}
async function urteil(id, wert) {
  setze(id, 'urteil', wert);
  await put('korr', 'alle', korr);
  zentralSpeichern(id);
  const l = liste();
  if (idx < l.length - 1) idx++;
  positionMerken();
  zeichne();
}

/* --------------------------------------------------------------- Filter */
function liste() {
  let l = kat === 'alle' ? DATEN : DATEN.filter(d => d.k === kat);
  if (nurOffen) l = l.filter(d => !(korr[d.i] || {}).urteil);
  if (suche) {
    const s = suche.toLowerCase();
    l = l.filter(d => ((d.de || '') + (d.en || '') + d.so + (d.ymm || '')).toLowerCase().includes(s));
  }
  return l;
}

/* ------------------------------------------------------------- Zeichnen */
let lokaleAudios = new Set();
function zeigeSync(t) {
  const el = document.getElementById('sync');
  if (el) { el.textContent = t; setTimeout(() => { if (el.textContent === t) el.textContent = ONLINE ? '\u2601 verbunden' : '\u25CB nur dieses Gerät'; }, 2200); }
}

async function zeichne() {
  lokaleAudios = new Set(await alleKeys('audio'));
  const l = liste();
  if (idx >= l.length) idx = Math.max(0, l.length - 1);
  const e = l[idx];
  const fertig = Object.values(korr).filter(p => p.urteil).length;

  document.getElementById('fortschritt').textContent = fertig.toLocaleString('de') + ' / ' + DATEN.length.toLocaleString('de');
  document.getElementById('balken').style.width = Math.min(100, fertig / DATEN.length * 100) + '%';
  document.getElementById('mitAudio').textContent = new Set([...lokaleAudios, ...zentraleAudios.keys()]).size;

  if (!e) { document.getElementById('karte').innerHTML = '<p class="leer">Nichts gefunden.</p>'; return; }
  const p = korr[e.i] || {};
  const kSo = 'audio:' + e.i + ':so', kYmm = 'audio:' + e.i + ':ymm';
  const soWert = p.so !== undefined ? p.so : e.so;
  const ymmWert = p.ymm !== undefined ? p.ymm : (e.ymm || '');
  const deWert = p.de !== undefined ? p.de : e.de;
  const esc = s => (s || '').replace(/"/g, '&quot;');
  const langerText = e.so && e.so.length > 60;

  document.getElementById('karte').innerHTML = `
    <div class="kopfzeile">
      <span class="zaehler">${(idx + 1).toLocaleString('de')} von ${l.length.toLocaleString('de')}</span>
      <span>
        ${e.u ? '<span class="warn">unsicher</span>' : ''}
        ${p._wer && p._wer !== ICH ? `<span class="wer">${p._wer}</span>` : ''}
      </span>
    </div>
    <div class="dezeile">
      <div style="flex:1">
        ${deWert
          ? `<div class="de">${deWert}</div>${e.pl ? `<div class="pl">Plural: ${e.pl}</div>` : ''}`
          : `<div class="fehlt">Deutsche Übersetzung fehlt</div>`}
        ${e.en ? `<div class="en">EN \u00B7 ${e.en}</div>` : ''}
      </div>
      ${deWert ? `<button class="rund" onclick="sprich(${JSON.stringify(deWert + (e.pl ? ', ' + e.pl : ''))})">\u{1F50A}</button>` : ''}
    </div>
    ${!e.de ? `<input class="feld" placeholder="Deutsche \u00DCbersetzung eintragen" value="${esc(p.de)}" oninput="setze('${e.i}','de',this.value)">` : ''}
    ${e.n ? `<div class="notiz">${e.n}</div>` : ''}

    <div class="block gruen">
      <div class="blabel">Af-Maxaa \u00B7 Nord / Somaliland</div>
      ${langerText
        ? `<textarea class="feld gross" rows="3" oninput="setze('${e.i}','so',this.value)">${soWert || ''}</textarea>`
        : `<input class="feld gross" value="${esc(soWert)}" oninput="setze('${e.i}','so',this.value)">`}
      ${audioZeile(kSo, soWert, 'Af-Maxaa', 'gruen')}
    </div>

    <div class="block orange">
      <div class="blabel">Af-Maay \u00B7 S\u00FCd</div>
      ${langerText
        ? `<textarea class="feld gross" rows="3" placeholder="Af-Maay eintragen" oninput="setze('${e.i}','ymm',this.value)">${ymmWert}</textarea>`
        : `<input class="feld gross" placeholder="Af-Maay eintragen" value="${esc(ymmWert)}" oninput="setze('${e.i}','ymm',this.value)">`}
      ${audioZeile(kYmm, ymmWert, 'Af-Maay', 'orange')}
    </div>

    <textarea class="feld" rows="2" placeholder="Anmerkung" oninput="setze('${e.i}','notiz',this.value)">${p.notiz || ''}</textarea>

    <div class="urteile">
      <button class="${p.urteil === 'ok' ? 'aktiv ok' : ''}" onclick="urteil('${e.i}','ok')">\u2713 richtig</button>
      <button class="${p.urteil === 'falsch' ? 'aktiv falsch' : ''}" onclick="urteil('${e.i}','falsch')">\u2717 falsch</button>
      <button class="${p.urteil === 'unklar' ? 'aktiv unklar' : ''}" onclick="urteil('${e.i}','unklar')">? unklar</button>
    </div>`;

  document.getElementById('zurueck').disabled = idx === 0;
  document.getElementById('weiter').disabled = idx >= l.length - 1;
}

function audioZeile(key, wort, label, farbe) {
  const hat = lokaleAudios.has(key) || zentraleAudios.has(key);
  const zentral = zentraleAudios.has(key) && !lokaleAudios.has(key);
  const laeuft = !!rec[key];
  const bid = 'btn_' + key.replace(/:/g, '_');
  if (laeuft) return `<div class="audio"><button id="${bid}" class="rot" onclick="stoppeAufnahme('${key}')">\u23F9 Stopp \u00B7 0s</button><span class="pulsi">\u25CF Aufnahme läuft</span></div>`;
  return `<div class="audio">
    <button class="${farbe}" onclick="starteAufnahme('${key}','${bid}')">\u{1F399} ${hat ? 'Neu aufnehmen' : label + ' aufnehmen'}</button>
    ${hat ? `<button onclick="spieleAb('${key}')">\u25B6 Anhören${zentral ? ' \u2601' : ''}</button>
             <button onclick="ladeRunter('${key}',${JSON.stringify(wort || '')})">\u2913 Datei</button>
             ${lokaleAudios.has(key) ? `<button class="loesch" onclick="loescheAudio('${key}')">lokal löschen</button>` : ''}` : ''}
  </div>`;
}

/* ------------------------------------------------------- Export / Import */
function exportJSON() {
  const rein = {};
  for (const k in korr) { const { _zeit, _wer, ...rest } = korr[k]; if (Object.keys(rest).length) rein[k] = rest; }
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
    for (const k in neu) { korr[k] = { ...(korr[k] || {}), ...neu[k], _zeit: new Date().toISOString() }; n++; }
    await put('korr', 'alle', korr);
    if (ONLINE) for (const k in neu) await zentralSpeichern(k);
    alert(n + ' Einträge übernommen.');
    zeichne();
  } catch { alert('Datei konnte nicht gelesen werden.'); }
  ev.target.value = '';
}
async function alleAudios() {
  const keys = [...new Set([...lokaleAudios, ...zentraleAudios.keys()])];
  if (!keys.length) return alert('Noch keine Aufnahmen.');
  if (!confirm(keys.length + ' Aufnahmen herunterladen?')) return;
  for (const k of keys) {
    const e = DATEN.find(d => k.startsWith('audio:' + d.i + ':'));
    await ladeRunter(k, e ? (k.endsWith(':so') ? e.so : e.ymm) : '');
    await new Promise(r => setTimeout(r, 250));
  }
}

/* ------------------------------------------------------------ Laden */
async function ladeBlock(n) {
  if (geladeneBloecke.has(n)) return;
  const r = await fetch(`daten${n}.json`);
  DATEN = DATEN.concat(await r.json());
  geladeneBloecke.add(n);
}
async function ladeAlle() {
  for (let n = 0; n < VERZ.bloecke; n++) {
    await ladeBlock(n);
    document.getElementById('ladeinfo').textContent =
      `${DATEN.length.toLocaleString('de')} von ${VERZ.gesamt.toLocaleString('de')} geladen`;
  }
  document.getElementById('ladeinfo').textContent = '';
  baueFilter();
  zeichne();
}

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
  const k = {};
  DATEN.forEach(d => k[d.k] = (k[d.k] || 0) + 1);
  document.getElementById('filter').innerHTML =
    `<button onclick="setKat('alle')" id="k_alle">Alle (${DATEN.length.toLocaleString('de')})</button>` +
    ORD.filter(x => k[x]).map(x =>
      `<button onclick="setKat('${x}')" id="k_${x}">${NAMEN[x] || x} (${k[x].toLocaleString('de')})</button>`).join('');
  document.getElementById('k_' + kat)?.classList.add('aktiv');
}

async function los() {
  DB = await oeffneDB();
  korr = (await get('korr', 'alle')) || {};

  ONLINE = !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_KEY);
  document.getElementById('sync').textContent = ONLINE ? '\u2601 verbunden' : '\u25CB nur dieses Gerät';
  if (!ICH) frageName();

  VERZ = await (await fetch('verzeichnis.json')).json();
  await ladeBlock(0);
  baueFilter();
  setKat('behoerde');

  if (ONLINE) {
    const n = await zentralLaden();
    await zentraleAudiosLaden();
    if (n) zeigeSync(n + ' vom Server geholt');
    const pos = await positionHolen();
    if (pos && pos.kategorie) { kat = pos.kategorie; idx = pos.position || 0; }
  }
  zeichne();
  ladeAlle();
}

function frageName() {
  const n = prompt('Wie heißt du? (damit man sieht, wer was geprüft hat)');
  if (n) { ICH = n.trim(); localStorage.setItem('lb_name', ICH); }
}
function setKat(k) {
  kat = k; idx = 0;
  document.querySelectorAll('#filter button').forEach(b => b.classList.remove('aktiv'));
  document.getElementById('k_' + k)?.classList.add('aktiv');
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

los();
