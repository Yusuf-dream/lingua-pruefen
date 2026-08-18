import json, os, korpus
HIER = os.path.dirname(os.path.abspath(__file__))
e = json.load(open(os.path.join(HIER, "daten.json"), encoding="utf-8"))
print("Basis:", len(e))
e = korpus.ergaenze(e)
korpus.schreibeBloecke(e)