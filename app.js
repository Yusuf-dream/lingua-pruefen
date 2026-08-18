/* Lingua Bridge — Prüf- und Aufnahmewerkzeug (eigenständig, ohne Server) */
let DB = null, DATEN = [], korr = {}, kat = 'behoerde', nurOffen = false, idx = 0, suche = '';

/* ---- IndexedDB: Aufnahmen und Korrekturen ---- */
function oeffneDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('linguabridge', 1);
    r.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio');
      if (!db.objectStoreNames.contains('korr')) db.createObjectStore('korr');
    };
    r.onsuccess = e => res(e.target.result);
    r.onerror = () => rej(r.error);
  });
}
function put(store, key, val) {
  return new Promise((res, rej) => {
    const t = DB.transaction(store, 'readwrite');
    t.objectStore(store).put(val, key);
    t.oncomplete = res; t.onerror = () => rej(t.error);
  });
}
function get(store, key) {
  return new Promise((res) => {
    const t = DB.transaction(store, 'readonly');
    const q = t.objectStore(store).get(key);
    q.onsuccess = () => res(q.result); q.onerror = () => res(undefined);
  });
}
function del(store, key) {
  return new Promise(res => {
    const t = DB.transaction(store, 'readwrite');
    t.objectStore(store).delete(key); t.oncomplete = res; t.onerror = res;
  });
}
function alleKeys(store) {
  return new Promise(res => {
    const t = DB.transaction(store, 'readonly');
    const q = t.objectStore(store).getAllKeys();
    q.onsuccess = () => res(q.result || []); q.onerror = () => res([]);
  });
}

/* ---- Deutsch vorlesen ---- */
function sprich(t) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(t);
  u.lang = 'de-DE'; u.rate = 0.85; speechSynthesis.speak(u);
}

/* ---- Aufnahme ---- */
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
    };
    mr.start();
    rec[key] = { mr, start: Date.now() };
    zeichne();
    const el = document.getElementById(btnId);
    rec[key].timer = setInterval(() => {
      if (el && rec[key]) el.textContent = '\u23F9 Stopp \u00B7 ' + Math.floor((Date.now() - rec[key].start) / 1000) + 's';
    }, 500);
  } catch (e) { alert('Kein Mikrofonzugriff. Bitte im Browser erlauben.'); }
}
function stoppeAufnahme(key) {
  if (rec[key]) { clearInterval(rec[key].timer); rec[key].mr.stop(); }
}
async function spieleAb(key) {
  const b = await get('audio', key);
  if (b) new Audio(URL.createObjectURL(b)).play();
}
async function ladeRunter(key, wort) {
  const b = await get('audio', key);
  if (!b) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = key.replace(/:/g, '_') + '_' + (wort || '').replace(/[^\wäöüßÄÖÜ-]/g, '') + '.webm';
  a.click();
}
async function loescheAudio(key) { await del('audio', key); zeichne(); }

/* ---- Korrekturen speichern ---- */
let sichern;
async function setze(id, feld, wert) {
  korr[id] = korr[id] || {};
  korr[id][feld] = wert;
  clearTimeout(sichern);
  sichern = setTimeout(() => put('korr', 'alle', korr), 400);
}
async function urteil(id, wert) {
  await setze(id, 'urteil', wert);
  const l = liste();
  if (idx < l.length - 1) idx++;
  zeichne();
}

/* ---- Liste filtern ---- */
function liste() {
  let l = kat === 'alle' ? DATEN : DATEN.filter(d => d.k === kat);
  if (nurOffen) l = l.filter(d => !(korr[d.i] || {}).urteil);
  if (suche) {
    const s = suche.toLowerCase();
    l = l.filter(d => (d.de + d.en + d.so + d.ymm).toLowerCase().includes(s));
  }
  return l;
}

/* ---- Zeichnen ---- */
let audioKeys = new Set();
async function zeichne() {
  audioKeys = new Set(await alleKeys('audio'));
  const l = liste();
  if (idx >= l.length) idx = Math.max(0, l.length - 1);
  const e = l[idx];
  const fertig = DATEN.filter(d => (korr[d.i] || {}).urteil).length;

  document.getElementById('fortschritt').textContent = fertig + ' / ' + DATEN.length;
  document.getElementById('balken').style.width = (fertig / DATEN.length * 100) + '%';
  document.getElementById('mitAudio').textContent = audioKeys.size;

  if (!e) { document.getElementById('karte').innerHTML = '<p class="leer">Nichts gefunden.</p>'; return; }
  const p = korr[e.i] || {};
  const kSo = 'audio:' + e.i + ':so', kYmm = 'audio:' + e.i + ':ymm';
  const soWert = p.so !== undefined ? p.so : e.so;
  const ymmWert = p.ymm !== undefined ? p.ymm : e.ymm;

  document.getElementById('karte').innerHTML = `
    <div class="kopfzeile">
      <span class="zaehler">${idx + 1} von ${l.length}</span>
      ${e.u ? '<span class="warn">unsicher</span>' : ''}
    </div>
    <div class="dezeile">
      <div>
        <div class="de">${e.de || '<span class="fehlt">Deutsch fehlt \u2014 bitte eintragen</span>'}</div>
        ${e.pl ? `<div class="pl">Plural: ${e.pl}</div>` : ''}
        <div class="en">EN \u00B7 ${e.en || '\u2014'}</div>
      </div>
      ${e.de ? `<button class="rund" onclick="sprich('${(e.de + (e.pl ? ', ' + e.pl : '')).replace(/'/g, "\\'")}')">\u{1F50A}</button>` : ''}
    </div>
    ${!e.de ? `<input class="feld" placeholder="Deutsche \u00DCbersetzung eintragen" value="${(p.de || '').replace(/"/g, '&quot;')}" oninput="setze('${e.i}','de',this.value)">` : ''}
    ${e.n ? `<div class="notiz">${e.n}</div>` : ''}

    <div class="block gruen">
      <div class="blabel">Af-Maxaa \u00B7 Nord / Somaliland</div>
      <input class="feld gross" value="${(soWert || '').replace(/"/g, '&quot;')}" oninput="setze('${e.i}','so',this.value)">
      ${audioZeile(kSo, soWert, 'Af-Maxaa', 'gruen')}
    </div>

    <div class="block orange">
      <div class="blabel">Af-Maay \u00B7 S\u00FCd</div>
      <input class="feld gross" placeholder="Af-Maay eintragen" value="${(ymmWert || '').replace(/"/g, '&quot;')}" oninput="setze('${e.i}','ymm',this.value)">
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
  const hat = audioKeys.has(key);
  const laeuft = !!rec[key];
  const bid = 'btn_' + key.replace(/:/g, '_');
  if (laeuft) return `<div class="audio"><button id="${bid}" class="rot" onclick="stoppeAufnahme('${key}')">\u23F9 Stopp \u00B7 0s</button><span class="pulsi">\u25CF Aufnahme l\u00E4uft</span></div>`;
  return `<div class="audio">
    <button class="${farbe}" onclick="starteAufnahme('${key}','${bid}')">\u{1F399} ${hat ? 'Neu aufnehmen' : label + ' aufnehmen'}</button>
    ${hat ? `<button onclick="spieleAb('${key}')">\u25B6 Anh\u00F6ren</button>
             <button onclick="ladeRunter('${key}','${(wort || '').replace(/'/g, "")}')">\u2913 Datei</button>
             <button class="loesch" onclick="loescheAudio('${key}')">l\u00F6schen</button>` : ''}
  </div>`;
}

/* ---- Export / Import ---- */
async function exportJSON() {
  const blob = new Blob([JSON.stringify(korr, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'lingua-korrekturen-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
}
async function importJSON(ev) {
  const f = ev.target.files[0]; if (!f) return;
  try {
    const neu = JSON.parse(await f.text());
    let n = 0;
    for (const k in neu) { korr[k] = { ...(korr[k] || {}), ...neu[k] }; n++; }
    await put('korr', 'alle', korr);
    alert(n + ' Eintr\u00E4ge \u00FCbernommen.');
    zeichne();
  } catch { alert('Datei konnte nicht gelesen werden.'); }
  ev.target.value = '';
}
async function alleAudios() {
  const keys = await alleKeys('audio');
  if (!keys.length) return alert('Noch keine Aufnahmen.');
  if (!confirm(keys.length + ' Aufnahmen herunterladen?')) return;
  for (let n = 0; n < keys.length; n++) {
    const e = DATEN.find(d => keys[n].startsWith('audio:' + d.i + ':'));
    await ladeRunter(keys[n], e ? (keys[n].endsWith(':so') ? e.so : e.ymm) : '');
    await new Promise(r => setTimeout(r, 250));
  }
}
function kopiereText() {
  const z = DATEN.filter(d => korr[d.i]).map(d => {
    const p = korr[d.i];
    return [p.de || d.de, d.en, p.so !== undefined ? p.so : d.so,
            p.ymm !== undefined ? p.ymm : d.ymm, p.urteil || '', p.notiz || ''].join(' | ');
  });
  navigator.clipboard.writeText(
    'Lingua Bridge \u2014 Korrekturen\nDeutsch | Englisch | Af-Maxaa | Af-Maay | Urteil | Notiz\n' +
    '='.repeat(76) + '\n' + z.join('\n')
  ).then(() => alert(z.length + ' Zeilen kopiert.'));
}

/* ---- Start ---- */
async function los() {
  DB = await oeffneDB();
  DATEN = await (await fetch('daten.json')).json();
  korr = (await get('korr', 'alle')) || {};

  const kats = {};
  DATEN.forEach(d => kats[d.k] = (kats[d.k] || 0) + 1);
  const NAMEN = { behoerde:'Beh\u00F6rde', nordsued:'Nord/S\u00FCd', begruessung:'Begr\u00FC\u00DFung', zahlen:'Zahlen',
    zeit:'Zeit', gesundheit:'Gesundheit', familie:'Familie', weg:'Weg', arbeit:'Arbeit',
    substantive:'Substantive', verben:'Verben', adjektive:'Adjektive', zahlwoerter:'Zahlw\u00F6rter',
    pronomen:'Pronomen', adverbien:'Adverbien', praepositionen:'Pr\u00E4positionen',
    konjunktionen:'Konjunktionen', partikeln:'Partikeln', artikelwoerter:'Artikelw\u00F6rter',
    interjektionen:'Interjektionen', suffixe:'Suffixe', eigennamen:'Eigennamen',
    buchstaben:'Buchstaben', saetze:'S\u00E4tze', sonstige:'Sonstige' };
  const ORD = ['behoerde','nordsued','begruessung','zahlen','zeit','gesundheit','familie','weg',
    'arbeit','substantive','verben','adjektive','saetze','zahlwoerter','pronomen','adverbien',
    'praepositionen','konjunktionen','partikeln','artikelwoerter','interjektionen','suffixe',
    'eigennamen','buchstaben','sonstige'];
  document.getElementById('filter').innerHTML =
    `<button onclick="setKat('alle')" id="k_alle">Alle (${DATEN.length})</button>` +
    ORD.filter(k => kats[k]).map(k =>
      `<button onclick="setKat('${k}')" id="k_${k}">${NAMEN[k] || k} (${kats[k]})</button>`).join('');
  setKat('behoerde');
}
function setKat(k) {
  kat = k; idx = 0;
  document.querySelectorAll('#filter button').forEach(b => b.classList.remove('aktiv'));
  document.getElementById('k_' + k)?.classList.add('aktiv');
  zeichne();
}
function toggleOffen() {
  nurOffen = !nurOffen; idx = 0;
  document.getElementById('offenBtn').classList.toggle('aktiv', nurOffen);
  zeichne();
}
function suchen(v) { suche = v; idx = 0; zeichne(); }
function blaettern(n) { const l = liste(); idx = Math.max(0, Math.min(l.length - 1, idx + n)); zeichne(); }

los();
