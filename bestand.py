# -*- coding: utf-8 -*-
"""
Datenbestandsanalyse Lingua Bridge
Liest die echten Datenbloecke und die Korrekturen aus Supabase.
Erfindet nichts. Jede Zahl ist gezaehlt.
"""
import io, os, json, glob, re, collections, urllib.request, sys

HIER = os.path.dirname(os.path.abspath(__file__))
URL = "https://ykpuwwmvdvtemabysotw.supabase.co"
KEY = ("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
       "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrcHV3d212ZHZ0ZW1hYnlzb3R3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyNTE5NTUsImV4cCI6MjEwMjgyNzk1NX0."
       "YdiVJRqy2FTHwFl2LmMDRHF4ltEzTOuHQ2rUhQ-z3MI")

def leer(v):
    return v is None or str(v).strip() == "" or str(v).strip() == "—"

# ---------------------------------------------------------------- laden
dateien = sorted(glob.glob(os.path.join(HIER, "daten*.json")),
                 key=lambda p: int(re.sub(r"\D", "", os.path.basename(p)) or 0))
E = []
for f in dateien:
    E += json.load(io.open(f, encoding="utf-8"))

# Korrekturen aus Supabase
korr = {}
try:
    req = urllib.request.Request(
        URL + "/rest/v1/korrekturen?select=*&limit=200000",
        headers={"apikey": KEY, "Authorization": "Bearer " + KEY})
    for r in json.load(urllib.request.urlopen(req, timeout=40)):
        korr[r["eintrag_id"]] = r
    quelle_korr = "Supabase (live)"
except Exception as ex:
    quelle_korr = "nicht erreichbar: %s" % ex

def wert(e, feld):
    """Korrektur hat Vorrang vor Rohdatum."""
    k = korr.get(e["i"])
    if k and not leer(k.get(feld)):
        return str(k[feld]).strip()
    v = e.get(feld)
    return "" if leer(v) else str(v).strip()

print("=" * 66)
print("  DATENBESTAND LINGUA BRIDGE")
print("=" * 66)
print("  Bloecke gelesen     : %d" % len(dateien))
print("  Eintraege gesamt    : %s" % format(len(E), ",d").replace(",", "."))
print("  Korrekturen         : %s (%s)" % (format(len(korr), ",d").replace(",", "."), quelle_korr))
print()

# ------------------------------------------------- 1-4 Sprachabdeckung
de  = [e for e in E if wert(e, "de")]
en  = [e for e in E if wert(e, "en")]
so  = [e for e in E if wert(e, "so")]
ymm = [e for e in E if wert(e, "ymm")]

def zeile(name, n):
    p = n / len(E) * 100 if E else 0
    print("  %-34s %9s   %6.2f %%" % (name, format(n, ",d").replace(",", "."), p))

print("-" * 66)
print("  SPRACHABDECKUNG")
print("-" * 66)
zeile("Deutsche Eintraege", len(de))
zeile("Englische Eintraege", len(en))
zeile("Somali Af-Maxaa (Nord)", len(so))
zeile("Somali Af-Maay (Sued)", len(ymm))
print()

# ------------------------------------------------- 5 vollstaendig
voll4 = [e for e in E if wert(e,"de") and wert(e,"en") and wert(e,"so") and wert(e,"ymm")]
voll3 = [e for e in E if wert(e,"de") and wert(e,"en") and wert(e,"so")]
voll2 = [e for e in E if wert(e,"de") and wert(e,"so")]
print("-" * 66)
print("  VOLLSTAENDIGKEIT")
print("-" * 66)
zeile("Alle vier Sprachen", len(voll4))
zeile("DE + EN + Af-Maxaa", len(voll3))
zeile("DE + Af-Maxaa (Minimum)", len(voll2))
print()

# ------------------------------------------------- 6 fehlende
print("-" * 66)
print("  FEHLENDE UEBERSETZUNGEN")
print("-" * 66)
zeile("ohne Deutsch", len(E) - len(de))
zeile("ohne Englisch", len(E) - len(en))
zeile("ohne Af-Maxaa", len(E) - len(so))
zeile("ohne Af-Maay", len(E) - len(ymm))
nur_so = [e for e in E if wert(e,"so") and not wert(e,"de") and not wert(e,"en")]
zeile("nur Somali, sonst nichts", len(nur_so))
print()

# ------------------------------------------------- 7 Duplikate
print("-" * 66)
print("  DUPLIKATE")
print("-" * 66)
ids = collections.Counter(e["i"] for e in E)
dop_id = [k for k, v in ids.items() if v > 1]
so_z = collections.Counter(wert(e,"so").lower() for e in E if wert(e,"so"))
dop_so = {k: v for k, v in so_z.items() if v > 1}
de_z = collections.Counter(wert(e,"de").lower() for e in E if wert(e,"de"))
dop_de = {k: v for k, v in de_z.items() if v > 1}
paar = collections.Counter((wert(e,"de").lower(), wert(e,"so").lower())
                           for e in E if wert(e,"de") and wert(e,"so"))
dop_paar = {k: v for k, v in paar.items() if v > 1}

zeile("doppelte Kennungen (kritisch)", len(dop_id))
zeile("doppelte Af-Maxaa-Woerter", len(dop_so))
zeile("  davon betroffene Eintraege", sum(dop_so.values()) - len(dop_so))
zeile("doppelte deutsche Woerter", len(dop_de))
zeile("identische Paare DE+Somali", len(dop_paar))
if dop_so:
    top = sorted(dop_so.items(), key=lambda x: -x[1])[:6]
    print("    haeufigste: " + ", ".join("%s (%dx)" % (w, n) for w, n in top))
print()

# ------------------------------------------------- 8 fehlerhaft
print("-" * 66)
print("  MOEGLICHERWEISE FEHLERHAFT")
print("-" * 66)
kein_so   = [e for e in E if not wert(e,"so")]
sehr_kurz = [e for e in E if 0 < len(wert(e,"so")) <= 1]
sehr_lang = [e for e in E if len(wert(e,"so")) > 260]
nur_zahl  = [e for e in E if wert(e,"so") and re.fullmatch(r"[\d\s.,-]+", wert(e,"so"))]
gleich    = [e for e in E if wert(e,"so") and wert(e,"so").lower() == wert(e,"de").lower()]
steuer    = [e for e in E if any(ord(c) < 32 for c in wert(e,"so"))]
subst_ohne_artikel = [e for e in E
    if wert(e,"de") and wert(e,"de")[0].isupper()
    and not re.match(r"^(der|die|das)\s", wert(e,"de"))
    and e.get("k") in ("behoerde","thema_tiere","thema_essen","thema_getraenke",
                        "thema_koerper","thema_kleidung","thema_haus","thema_natur",
                        "thema_verkehr","thema_alltag","familie","gesundheit","arbeit","weg")]
# Af-Maay-Echtheit: darf kein X oder C enthalten
maay_falsch = [e for e in E if wert(e,"ymm") and re.search(r"[xcXC]", wert(e,"ymm"))]

zeile("ohne Af-Maxaa (leeres Kernfeld)", len(kein_so))
zeile("Af-Maxaa nur 1 Zeichen", len(sehr_kurz))
zeile("Af-Maxaa laenger als 260 Zeichen", len(sehr_lang))
zeile("Af-Maxaa nur Ziffern", len(nur_zahl))
zeile("Somali identisch mit Deutsch", len(gleich))
zeile("Steuerzeichen im Text", len(steuer))
zeile("Substantiv ohne Artikel (Themen)", len(subst_ohne_artikel))
zeile("Af-Maay enthaelt X oder C (verdaechtig)", len(maay_falsch))
if maay_falsch[:5]:
    print("    Beispiele: " + ", ".join(wert(e,"ymm") for e in maay_falsch[:5]))
print()

# ------------------------------------------------- 9 ohne Quelle
print("-" * 66)
print("  HERKUNFT")
print("-" * 66)
def quelle(e):
    n = (e.get("n") or "")
    if "Leipzig" in n: return "Leipzig Corpora (CC BY)"
    if "Tatoeba" in n: return "Tatoeba (CC BY 2.0 FR)"
    if "ASJP" in n:    return "ASJP / Max-Planck (CC BY 4.0)"
    if "IPA" in n or "Haeufigkeit" in n: return "Wiktionary (CC BY-SA 3.0)"
    if "Regel gebildet" in n: return "regelbasiert erzeugt"
    if n.strip(): return "sonstiger Vermerk"
    return "OHNE QUELLENANGABE"
q = collections.Counter(quelle(e) for e in E)
for k, v in q.most_common():
    zeile(k, v)
print()

# ------------------------------------------------- 10 Qualitaetsstatus
print("-" * 66)
print("  QUALITAETSSTATUS")
print("-" * 66)
mit_urteil = [e for e in E if korr.get(e["i"], {}).get("urteil")]
u = collections.Counter(korr.get(e["i"], {}).get("urteil") or "OHNE STATUS" for e in E)
for k in ("ok", "falsch", "unklar", "OHNE STATUS"):
    if k in u: zeile(k, u[k])
print()
unsicher_offen = [e for e in E if e.get("u") and not korr.get(e["i"], {}).get("urteil")]
zeile("als unsicher markiert, ungeprueft", len(unsicher_offen))
print()

print("=" * 66)
print("  Alle Zahlen gezaehlt, keine geschaetzt.")
print("=" * 66)
