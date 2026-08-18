import json, os, re, glob, tarfile, urllib.request, io

HIER = os.path.dirname(os.path.abspath(__file__))
UA = {"User-Agent": "LinguaBridge/1.0"}

def korpus(name):
    url = f"https://downloads.wortschatz-leipzig.de/corpora/{name}.tar.gz"
    print(f"  lade {name} ...")
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r:
        roh = r.read()
    saetze, worte = [], {}
    with tarfile.open(fileobj=io.BytesIO(roh), mode="r:gz") as t:
        for m in t.getmembers():
            if m.name.endswith("-sentences.txt"):
                for z in t.extractfile(m).read().decode("utf-8","replace").split("\n"):
                    if "\t" in z:
                        nr, s = z.split("\t", 1); s = s.strip()
                        if 20 <= len(s) <= 260: saetze.append((nr, s))
            elif m.name.endswith("-words.txt"):
                for z in t.extractfile(m).read().decode("utf-8","replace").split("\n"):
                    p = z.rstrip().split("\t")
                    if len(p) >= 3 and re.fullmatch(r"[a-zA-Z'\u2019-]{2,24}", p[1].strip()):
                        try: worte[p[1].strip().lower()] = worte.get(p[1].strip().lower(),0)+int(p[2])
                        except: pass
    return saetze, worte

def ergaenze(eintraege):
    print("5/5  Leipzig Corpora (20.000 Saetze + Wortformen) ...")
    alleWorte = {}
    for name, kuerzel, quelle in [("som_wikipedia_2021_10K","lw","Wikipedia"),
                                   ("som_news_2020_10K","ln","Nachrichten")]:
        try:
            s, w = korpus(name)
        except Exception as e:
            print("    uebersprungen:", e); continue
        for nr, satz in s:
            eintraege.append({"i": f"{kuerzel}{nr}", "de":"", "pl":"", "en":"", "so":satz,
                              "ymm":"", "k":"korpus_saetze", "u":0,
                              "n": f"Satz aus {quelle} (Leipzig Corpora, CC BY)"})
        for k,v in w.items(): alleWorte[k] = alleWorte.get(k,0)+v
    bekannt = {e["so"].lower() for e in eintraege}
    for n,(w,f) in enumerate(sorted(alleWorte.items(), key=lambda x:-x[1])):
        if w in bekannt: continue
        eintraege.append({"i": f"lf{n}", "de":"", "pl":"", "en":"", "so":w, "ymm":"",
                          "k":"korpus_woerter", "u":0, "n": f"Haeufigkeit {f} im Korpus"})
    return eintraege

def schreibeBloecke(eintraege, block=4000):
    for f in glob.glob(os.path.join(HIER,"daten*.json")): os.remove(f)
    bl = [eintraege[i:i+block] for i in range(0,len(eintraege),block)]
    for n,b in enumerate(bl):
        json.dump(b, open(os.path.join(HIER,f"daten{n}.json"),"w",encoding="utf-8"),
                  ensure_ascii=False, separators=(",",":"))
    import collections
    json.dump({"bloecke":len(bl),"gesamt":len(eintraege),"proBlock":block,
               "kategorien":dict(collections.Counter(e["k"] for e in eintraege))},
              open(os.path.join(HIER,"verzeichnis.json"),"w",encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(f"\n{len(eintraege)} Eintraege in {len(bl)} Bloecken")