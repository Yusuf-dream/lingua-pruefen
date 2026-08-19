import json, os, korpus, themen
HIER = os.path.dirname(os.path.abspath(__file__))
e = json.load(open(os.path.join(HIER, "daten.json"), encoding="utf-8")) if os.path.exists(os.path.join(HIER,"daten.json")) else []
if not e:
    import glob
    for f in sorted(glob.glob(os.path.join(HIER,"daten*.json")), key=lambda x:int(''.join(c for c in os.path.basename(x) if c.isdigit()) or 0)):
        e += json.load(open(f, encoding="utf-8"))
print("Basis:", len(e))
vorhanden = {x["i"] for x in e}
e = [x for x in e if not x["i"].startswith(("t_","alpha","num"))]
print("Nach Bereinigung:", len(e))
print("Themen, Alphabet, Zahlen ergaenzen ...")
e = themen.ergaenze(e)
korpus.schreibeBloecke(e)