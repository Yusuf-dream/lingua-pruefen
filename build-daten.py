#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Lingua Bridge â€” Aufbau der PrÃ¼fdaten
Zieht die Wortdaten aus den offenen Quellen und schreibt daten.json.

Quellen und Lizenzen:
  Wiktionary via kaikki.org   CC BY-SA 3.0
  ASJP, Max-Planck-Institut   CC BY 4.0   (enthÃ¤lt Af-Maxaa UND Af-Maay)
  Tatoeba                     CC BY 2.0 FR

Aufruf:  python build-daten.py
"""
import json, re, urllib.request, time, os, sys
import korpus

HIER = os.path.dirname(os.path.abspath(__file__))
UA = {"User-Agent": "LinguaBridge/1.0 (Sprachlern-Projekt; github.com/Yusuf-dream)"}

def hole(url, timeout=90):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout)

# ---------------------------------------------------------------- KernwÃ¶rter
# Von Hand kuratiert. Diese sind fÃ¼r das Produkt am wichtigsten.
KERN = [
 ("die Frist","die Fristen","deadline","wakhtiga xadidan","","behoerde",1,"KRITISCH. Nur eine Umschreibung. Wie sagt man das wirklich?"),
 ("der Bescheid","die Bescheide","official decision","warqad go'aan","","behoerde",1,"Keine etablierte Entsprechung gefunden."),
 ("der Widerspruch","die WidersprÃ¼che","objection","diidmo","","behoerde",1,"Rechtsbegriff â€” besonders wichtig."),
 ("der Termin","die Termine","appointment","ballan","","behoerde",0,""),
 ("der Brief","die Briefe","letter","warqad","","behoerde",0,""),
 ("das Amt","die Ã„mter","public office","xafiis","","behoerde",0,""),
 ("der Antrag","die AntrÃ¤ge","application","codsi","","behoerde",0,""),
 ("der Ausweis","die Ausweise","ID card","aqoonsi","","behoerde",0,""),
 ("der Pass","die PÃ¤sse","passport","baasaboor","","behoerde",0,""),
 ("die Unterschrift","die Unterschriften","signature","saxiix","","behoerde",0,""),
 ("das Formular","die Formulare","form","foom","","behoerde",0,""),
 ("die Anmeldung","die Anmeldungen","registration","diiwaangelin","","behoerde",0,""),
 ("die Adresse","die Adressen","address","cinwaan","","behoerde",0,""),
 ("der Dolmetscher","die Dolmetscher","interpreter","turjubaan","","behoerde",0,""),
 ("die Beratung","die Beratungen","counselling","la-talin","","behoerde",0,""),
 ("die BehÃ¶rde","die BehÃ¶rden","authority","hay'ad dowladeed","","behoerde",0,""),
 ("die Bescheinigung","die Bescheinigungen","certificate","caddayn","","behoerde",0,""),
 ("die GebÃ¼hr","die GebÃ¼hren","fee","khidmad","","behoerde",0,""),
 ("Hallo","","Hello","Salaan","","begruessung",0,""),
 ("Guten Morgen","","Good morning","Subax wanaagsan","","begruessung",0,""),
 ("Guten Tag","","Good day","Maalin wanaagsan","","begruessung",0,""),
 ("Guten Abend","","Good evening","Habeen wanaagsan","","begruessung",0,""),
 ("Auf Wiedersehen","","Goodbye","Nabadgelyo","","begruessung",0,""),
 ("Danke","","Thank you","Mahadsanid","","begruessung",0,""),
 ("Bitte","","Please","Fadlan","","begruessung",0,""),
 ("Ja","","Yes","Haa","","begruessung",0,""),
 ("Nein","","No","Maya","","begruessung",0,""),
 ("Wie heiÃŸt du?","","What is your name?","Magacaa?","","begruessung",0,""),
 ("Ich heiÃŸe â€¦","","My name is â€¦","Magacaygu waa â€¦","","begruessung",0,""),
 ("Ich verstehe nicht.","","I do not understand.","Ma fahmin.","","begruessung",0,""),
 ("Sprechen Sie bitte langsamer.","","Please speak slower.","Fadlan si tartiib ah u hadal.","","begruessung",0,""),
 ("Wie geht es dir?","","How are you?","Iska warran?","","begruessung",0,""),
 ("null","","zero","eber","","zahlen",0,""),("eins","","one","kow","","zahlen",0,""),
 ("zwei","","two","laba","","zahlen",0,""),("drei","","three","saddex","","zahlen",0,""),
 ("vier","","four","afar","","zahlen",0,""),("fÃ¼nf","","five","shan","","zahlen",0,""),
 ("sechs","","six","lix","","zahlen",0,""),("sieben","","seven","toddoba","","zahlen",0,""),
 ("acht","","eight","siddeed","","zahlen",0,""),("neun","","nine","sagaal","","zahlen",0,""),
 ("zehn","","ten","toban","","zahlen",0,""),("zwanzig","","twenty","labaatan","","zahlen",0,""),
 ("dreiÃŸig","","thirty","soddon","","zahlen",0,""),("vierzig","","forty","afartan","","zahlen",0,""),
 ("fÃ¼nfzig","","fifty","konton","","zahlen",0,""),("sechzig","","sixty","lixdan","","zahlen",0,""),
 ("siebzig","","seventy","toddobaatan","","zahlen",0,""),("achtzig","","eighty","siddeetan","","zahlen",0,""),
 ("neunzig","","ninety","sagaashan","","zahlen",0,""),("hundert","","hundred","boqol","","zahlen",0,""),
 ("tausend","","thousand","kun","","zahlen",0,""),
 ("der Montag","die Montage","Monday","Isniin","","zeit",0,""),
 ("der Dienstag","die Dienstage","Tuesday","Talaado","","zeit",0,""),
 ("der Mittwoch","die Mittwoche","Wednesday","Arbaco","","zeit",0,""),
 ("der Donnerstag","die Donnerstage","Thursday","Khamiis","","zeit",0,""),
 ("der Freitag","die Freitage","Friday","Jimco","","zeit",0,""),
 ("der Samstag","die Samstage","Saturday","Sabti","","zeit",0,""),
 ("der Sonntag","die Sonntage","Sunday","Axad","","zeit",0,""),
 ("heute","","today","maanta","","zeit",0,""),("morgen","","tomorrow","berri","","zeit",0,""),
 ("gestern","","yesterday","shalay","","zeit",0,""),
 ("die Woche","die Wochen","week","toddobaad","","zeit",0,""),
 ("der Monat","die Monate","month","bil","","zeit",0,""),
 ("das Jahr","die Jahre","year","sannad","","zeit",0,""),
 ("der Arzt","die Ã„rzte","doctor (m)","dhakhtar","","gesundheit",0,""),
 ("die Ã„rztin","die Ã„rztinnen","doctor (f)","dhakhtarad","","gesundheit",0,""),
 ("das Krankenhaus","die KrankenhÃ¤user","hospital","isbitaal","","gesundheit",0,""),
 ("die Krankenkasse","die Krankenkassen","health insurance","caymiska caafimaadka","","gesundheit",0,""),
 ("das Medikament","die Medikamente","medicine","dawo","","gesundheit",0,""),
 ("der Schmerz","die Schmerzen","pain","xanuun","","gesundheit",0,""),
 ("die Familie","die Familien","family","qoys","","familie",0,""),
 ("die Mutter","die MÃ¼tter","mother","hooyo","","familie",0,""),
 ("der Vater","die VÃ¤ter","father","aabbe","","familie",0,""),
 ("der Bruder","die BrÃ¼der","brother","walaal","","familie",0,"walaal ist geschlechtsneutral â€” wie unterscheidet man?"),
 ("die Schwester","die Schwestern","sister","walaashiis","","familie",0,""),
 ("das Kind","die Kinder","child","ilmo","","familie",0,""),
 ("die Wohnung","die Wohnungen","flat","guri","","familie",0,""),
 ("der Bahnhof","die BahnhÃ¶fe","train station","saldhigga tareenka","","weg",0,"Korrektur ggÃ¼. 'garoonka tareenka' â€” garoon heiÃŸt eher Feld."),
 ("die Haltestelle","die Haltestellen","bus stop","joogsiga baska","","weg",0,""),
 ("die StraÃŸe","die StraÃŸen","street","waddo","","weg",0,""),
 ("links","","left","bidix","","weg",0,""),("rechts","","right","midig","","weg",0,""),
 ("geradeaus","","straight ahead","toos u soco","","weg",0,"'toos u' allein ist unvollstÃ¤ndig."),
 ("die Arbeit","die Arbeiten","work","shaqo","","arbeit",0,""),
 ("der Beruf","die Berufe","profession","xirfad","","arbeit",0,""),
 ("der Vertrag","die VertrÃ¤ge","contract","heshiis","","arbeit",0,""),
 ("der Lohn","die LÃ¶hne","wage","mushahar","","arbeit",0,""),
 ("die Schule","die Schulen","school","dugsi","","arbeit",0,""),
 ("der Lehrer","die Lehrer","teacher (m)","macallin","","arbeit",0,""),
 ("die Hausaufgabe","die Hausaufgaben","homework","hawsha guriga","","arbeit",0,""),
]

DEMAP = {"hand":"die Hand","tongue":"die Zunge","fish":"der Fisch","bone":"der Knochen",
 "liver":"die Leber","ear":"das Ohr","eye":"das Auge","nose":"die Nase","tooth":"der Zahn",
 "blood":"das Blut","water":"das Wasser","stone":"der Stein","tree":"der Baum","name":"der Name",
 "person":"die Person","skin":"die Haut","horn":"das Horn","knee":"das Knie","breast":"die Brust",
 "louse":"die Laus","leaf":"das Blatt","root":"die Wurzel","fire":"das Feuer","path":"der Weg",
 "mountain":"der Berg","night":"die Nacht","sun":"die Sonne","star":"der Stern","full":"voll",
 "new":"neu","dog":"der Hund","one":"eins","two":"zwei","die":"sterben","come":"kommen",
 "drink":"trinken","see":"sehen","hear":"hÃ¶ren","we":"wir","you":"du","I":"ich"}

POSK = {"noun":"substantive","verb":"verben","adj":"adjektive","num":"zahlwoerter",
 "pron":"pronomen","adv":"adverbien","prep":"praepositionen","conj":"konjunktionen",
 "particle":"partikeln","det":"artikelwoerter","intj":"interjektionen","suffix":"suffixe",
 "name":"eigennamen","character":"buchstaben"}


def asjp_holen():
    """Af-Maxaa und Af-Maay aus der ASJP-Datenbank, direkt vergleichbar."""
    def lade(code):
        try:
            with hole(f"https://asjp.clld.org/languages/{code}.json", 40) as r:
                d = json.load(r)
        except Exception as e:
            print(f"  ASJP {code}: {e}"); return {}
        out = {}
        for line in d.get("txt", "").split("\n"):
            if "\t" not in line: continue
            links, rechts = line.split("\t", 1)
            m = re.match(r"\s*(\d+)\s+(.+)", links)
            if not m: continue
            woerter = [w.strip() for w in rechts.replace("//", "").split(",") if w.strip()]
            out[int(m.group(1))] = (m.group(2).strip(), woerter)
        return out

    def lesbar(w):
        return w.replace("X","x").replace("T","dh").replace("S","sh").replace("~","").replace("8","\u2019")

    maxaa, maay = lade("SOMALI"), lade("MAAY")
    if not maxaa: maxaa = lade("SOMALI_2")
    paare = []
    for nr in sorted(set(maxaa) | set(maay)):
        a = maxaa.get(nr, (None, []))[1]
        m = maay.get(nr, (None, []))[1]
        if not (a and m): continue
        begriff = (maxaa.get(nr) or maay.get(nr))[0]
        paare.append({
            "en": begriff,
            "so": ", ".join(lesbar(x) for x in a),
            "ymm": ", ".join(lesbar(x) for x in m),
        })
    return paare


def wiktionary_holen():
    """VollstÃ¤ndiger Somali-Extrakt aus dem englischen Wiktionary."""
    try:
        with hole("https://kaikki.org/dictionary/Somali/kaikki.org-dictionary-Somali.jsonl", 240) as r:
            roh = r.read().decode("utf-8", "replace")
    except Exception as e:
        print("  Wiktionary:", e); return []

    gruppen = {}
    for line in roh.split("\n"):
        if not line.strip(): continue
        try: e = json.loads(line)
        except Exception: continue
        w, pos = e.get("word"), e.get("pos")
        if not w: continue
        key = (w, pos)
        if key not in gruppen:
            ipa = next((s.get("ipa") for s in e.get("sounds", []) if s.get("ipa")), None)
            gruppen[key] = {"so": w, "pos": pos, "en": [], "ipa": ipa}
        for s in e.get("senses", []):
            for g in s.get("glosses", []) or []:
                gl = g.lower()
                if any(x in gl for x in ("singular of","plural of","person ","past of","form of","inflection")):
                    continue
                if g not in gruppen[key]["en"] and len(gruppen[key]["en"]) < 3:
                    gruppen[key]["en"].append(g)
    return [v for v in gruppen.values() if v["en"]]


def tatoeba_holen():
    """SÃ¤tze mit englischer und teils deutscher Ãœbersetzung."""
    alle = {}
    for seite in range(1, 14):
        try:
            u = f"https://tatoeba.org/en/api_v0/search?from=som&query=&limit=10&page={seite}"
            with hole(u, 30) as r:
                d = json.load(r)
        except Exception:
            break
        res = d.get("results", [])
        if not res: break
        for s in res:
            en = de = None
            for grp in s.get("translations", []):
                for t in grp:
                    if t.get("lang") == "eng" and not en: en = t.get("text")
                    if t.get("lang") == "deu" and not de: de = t.get("text")
            alle[s["id"]] = {"so": s.get("text"), "en": en, "de": de}
        time.sleep(0.3)
    return list(alle.values())


def main():
    eintraege = []

    print("1/4  KernwÃ¶rter â€¦")
    for n, (de, pl, en, so, ymm, kat, uns, notiz) in enumerate(KERN):
        eintraege.append({"i": f"k{n}", "de": de, "pl": pl, "en": en,
                          "so": so, "ymm": ymm, "k": kat, "u": uns, "n": notiz})
    print(f"     {len(KERN)}")

    print("2/4  ASJP â€” beide VarietÃ¤ten â€¦")
    paare = asjp_holen()
    for n, v in enumerate(paare):
        eintraege.append({"i": f"ns{n}", "de": DEMAP.get(v["en"], ""), "pl": "",
                          "en": v["en"], "so": v["so"], "ymm": v["ymm"],
                          "k": "nordsued", "u": 0,
                          "n": "Beide VarietÃ¤ten aus ASJP (Max-Planck-Institut)"})
    print(f"     {len(paare)}")

    print("3/4  Wiktionary (kann 1â€“2 Minuten dauern) â€¦")
    wikt = wiktionary_holen()
    for n, w in enumerate(wikt):
        notiz = f"IPA {w['ipa']}" if w.get("ipa") else ""
        eintraege.append({"i": f"w{n}", "de": "", "pl": "",
                          "en": "; ".join(w["en"])[:80], "so": w["so"], "ymm": "",
                          "k": POSK.get(w["pos"], "sonstige"), "u": 0, "n": notiz})
    print(f"     {len(wikt)}")

    print("4/4  Tatoeba-SÃ¤tze â€¦")
    saetze = tatoeba_holen()
    for n, s in enumerate(saetze):
        if not s.get("so"): continue
        eintraege.append({"i": f"s{n}", "de": s.get("de") or "", "pl": "",
                          "en": s.get("en") or "", "so": s["so"], "ymm": "",
                          "k": "saetze", "u": 0, "n": "Satz aus Tatoeba"})
    print(f"     {len(saetze)}")

    ziel = os.path.join(HIER, "daten.json")
    with open(ziel, "w", encoding="utf-8") as f:
        json.dump(eintraege, f, ensure_ascii=False, separators=(",", ":"))

    print()
    print(f"Fertig: {len(eintraege)} EintrÃ¤ge  ->  {ziel}")
    print(f"GrÃ¶ÃŸe : {os.path.getsize(ziel)/1024:.0f} KB")


if __name__ == "__main__":
    main()
