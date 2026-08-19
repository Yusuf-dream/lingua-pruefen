# -*- coding: utf-8 -*-
"""
Lingo Check — Themenwortschatz und Zahlen ergänzen
Wird von bloecke.py aufgerufen.
"""

# ---------------------------------------------------------------- Themen
THEMEN = {
"tiere": [
 ("der Hund","die Hunde","dog","ey"),("die Katze","die Katzen","cat","bisad"),
 ("das Kamel","die Kamele","camel","geel"),("die Ziege","die Ziegen","goat","ari"),
 ("das Schaf","die Schafe","sheep","ido"),("die Kuh","die Kühe","cow","sac"),
 ("das Pferd","die Pferde","horse","faras"),("der Esel","die Esel","donkey","dameer"),
 ("das Huhn","die Hühner","chicken","digaag"),("der Vogel","die Vögel","bird","shimbir"),
 ("der Fisch","die Fische","fish","kalluun"),("die Schlange","die Schlangen","snake","mas"),
 ("der Löwe","die Löwen","lion","libaax"),("der Elefant","die Elefanten","elephant","maroodi"),
 ("die Maus","die Mäuse","mouse","jiir"),("die Fliege","die Fliegen","fly","duqsi"),
 ("die Mücke","die Mücken","mosquito","kaneeco"),("die Biene","die Bienen","bee","shinni"),
 ("die Spinne","die Spinnen","spider","caaro"),("der Affe","die Affen","monkey","daanyeer"),
 ("das Krokodil","die Krokodile","crocodile","yaxaas"),("die Giraffe","die Giraffen","giraffe","geri"),
 ("die Hyäne","die Hyänen","hyena","waraabe"),("der Wolf","die Wölfe","wolf","yey"),
 ("das Tier","die Tiere","animal","xayawaan"),
],
"essen": [
 ("das Essen","die Essen","food","cunto"),("das Brot","die Brote","bread","rooti"),
 ("der Reis","—","rice","bariis"),("das Fleisch","—","meat","hilib"),
 ("der Fisch","die Fische","fish (food)","kalluun"),("das Ei","die Eier","egg","ukun"),
 ("die Milch","—","milk","caano"),("die Butter","—","butter","subag"),
 ("der Käse","—","cheese","farmaajo"),("das Öl","die Öle","oil","saliid"),
 ("das Salz","—","salt","cusbo"),("der Zucker","—","sugar","sonkor"),
 ("das Mehl","—","flour","bur"),("die Kartoffel","die Kartoffeln","potato","baradho"),
 ("die Tomate","die Tomaten","tomato","yaanyo"),("die Zwiebel","die Zwiebeln","onion","basal"),
 ("die Banane","die Bananen","banana","moos"),("die Orange","die Orangen","orange","liin"),
 ("der Apfel","die Äpfel","apple","tufaax"),("die Dattel","die Datteln","date fruit","timir"),
 ("die Suppe","die Suppen","soup","maraq"),("die Nudel","die Nudeln","pasta","baasto"),
 ("die Bohne","die Bohnen","bean","digir"),("das Gemüse","—","vegetables","khudaar"),
 ("das Obst","—","fruit","miro"),("das Frühstück","—","breakfast","quraac"),
 ("das Mittagessen","—","lunch","qado"),("das Abendessen","—","dinner","casho"),
],
"getraenke": [
 ("das Getränk","die Getränke","drink","cabitaan"),("das Wasser","—","water","biyo"),
 ("der Tee","—","tea","shaah"),("der Kaffee","—","coffee","qaxwo"),
 ("der Saft","die Säfte","juice","casiir"),("die Milch","—","milk","caano"),
 ("die Limonade","—","lemonade","liin macaan"),("das Mineralwasser","—","mineral water","biyo macdan"),
],
"farben": [
 ("die Farbe","die Farben","colour","midab"),("rot","—","red","cas"),
 ("blau","—","blue","buluug"),("grün","—","green","cagaar"),
 ("gelb","—","yellow","jaalle"),("schwarz","—","black","madow"),
 ("weiß","—","white","caddaan"),("braun","—","brown","bunni"),
 ("grau","—","grey","cawlan"),
],
"koerper": [
 ("der Körper","die Körper","body","jidh"),("der Kopf","die Köpfe","head","madax"),
 ("das Haar","die Haare","hair","timo"),("das Gesicht","die Gesichter","face","weji"),
 ("das Auge","die Augen","eye","il"),("das Ohr","die Ohren","ear","dheg"),
 ("die Nase","die Nasen","nose","san"),("der Mund","die Münder","mouth","af"),
 ("der Zahn","die Zähne","tooth","ilig"),("die Zunge","die Zungen","tongue","carrab"),
 ("der Hals","die Hälse","neck","qoor"),("die Schulter","die Schultern","shoulder","garab"),
 ("der Arm","die Arme","arm","gacan"),("die Hand","die Hände","hand","gacan"),
 ("der Finger","die Finger","finger","far"),("der Bauch","die Bäuche","belly","calool"),
 ("der Rücken","die Rücken","back","dhabar"),("das Bein","die Beine","leg","lug"),
 ("der Fuß","die Füße","foot","cag"),("das Herz","die Herzen","heart","wadne"),
 ("das Blut","—","blood","dhiig"),("der Knochen","die Knochen","bone","laf"),
],
"kleidung": [
 ("die Kleidung","—","clothing","dhar"),("das Hemd","die Hemden","shirt","shaati"),
 ("die Hose","die Hosen","trousers","surwaal"),("der Rock","die Röcke","skirt","goono"),
 ("das Kleid","die Kleider","dress","dhar dumar"),("der Schuh","die Schuhe","shoe","kabo"),
 ("die Socke","die Socken","sock","sharabaad"),("die Jacke","die Jacken","jacket","jaakad"),
 ("der Mantel","die Mäntel","coat","koodh"),("der Schal","die Schals","scarf","masar"),
 ("die Mütze","die Mützen","cap","koofiyad"),
],
"haus": [
 ("das Haus","die Häuser","house","guri"),("die Tür","die Türen","door","albaab"),
 ("das Fenster","die Fenster","window","daaqad"),("das Zimmer","die Zimmer","room","qol"),
 ("die Küche","die Küchen","kitchen","jiko"),("das Bad","die Bäder","bathroom","musqul"),
 ("das Bett","die Betten","bed","sariir"),("der Tisch","die Tische","table","miis"),
 ("der Stuhl","die Stühle","chair","kursi"),("die Lampe","die Lampen","lamp","laambad"),
 ("der Schlüssel","die Schlüssel","key","fure"),("die Treppe","die Treppen","stairs","jaranjaro"),
 ("der Garten","die Gärten","garden","beer"),("die Miete","die Mieten","rent","kiro"),
 ("der Strom","—","electricity","koronto"),
],
"natur": [
 ("die Natur","—","nature","dabeecad"),("der Baum","die Bäume","tree","geed"),
 ("die Blume","die Blumen","flower","ubax"),("das Gras","—","grass","caws"),
 ("der Stein","die Steine","stone","dhagax"),("der Sand","—","sand","ciid"),
 ("das Meer","die Meere","sea","bad"),("der Fluss","die Flüsse","river","webi"),
 ("der Berg","die Berge","mountain","buur"),("der Himmel","—","sky","cir"),
 ("die Sonne","—","sun","qorrax"),("der Mond","—","moon","dayax"),
 ("der Stern","die Sterne","star","xiddig"),("die Wolke","die Wolken","cloud","daruur"),
 ("der Regen","—","rain","roob"),("der Wind","die Winde","wind","dabayl"),
 ("das Feuer","—","fire","dab"),("die Erde","—","earth","dhul"),
 ("der Wald","die Wälder","forest","kayn"),
],
"verkehr": [
 ("das Auto","die Autos","car","baabuur"),("der Bus","die Busse","bus","bas"),
 ("der Zug","die Züge","train","tareen"),("das Flugzeug","die Flugzeuge","plane","diyaarad"),
 ("das Fahrrad","die Fahrräder","bicycle","baaskiil"),("das Schiff","die Schiffe","ship","markab"),
 ("die Fahrkarte","die Fahrkarten","ticket","tikit"),("der Führerschein","die Führerscheine","driving licence","laysan wadista"),
],
"alltag": [
 ("die Zeit","—","time","waqti"),("das Geld","—","money","lacag"),
 ("der Preis","die Preise","price","qiimo"),("der Laden","die Läden","shop","dukaan"),
 ("der Markt","die Märkte","market","suuq"),("das Telefon","die Telefone","telephone","taleefan"),
 ("der Computer","die Computer","computer","kombuyuutar"),("das Internet","—","internet","internet"),
 ("das Papier","die Papiere","paper","warqad"),("das Buch","die Bücher","book","buug"),
 ("der Stift","die Stifte","pen","qalin"),("die Tasche","die Taschen","bag","boorso"),
 ("der Name","die Namen","name","magac"),("die Sprache","die Sprachen","language","luqad"),
 ("das Wort","die Wörter","word","eray"),("die Frage","die Fragen","question","su'aal"),
 ("die Antwort","die Antworten","answer","jawaab"),("die Hilfe","—","help","caawimo"),
],
"verben": [
 ("sein","—","to be","ahaan"),("haben","—","to have","haysasho"),
 ("gehen","—","to go","tagid"),("kommen","—","to come","imaansho"),
 ("essen","—","to eat","cunid"),("trinken","—","to drink","cabbid"),
 ("sehen","—","to see","arkid"),("hören","—","to hear","maqlid"),
 ("sprechen","—","to speak","hadlid"),("lesen","—","to read","akhrin"),
 ("schreiben","—","to write","qorid"),("lernen","—","to learn","baran"),
 ("arbeiten","—","to work","shaqayn"),("schlafen","—","to sleep","hurdid"),
 ("kaufen","—","to buy","iibsasho"),("verkaufen","—","to sell","iibin"),
 ("geben","—","to give","siin"),("nehmen","—","to take","qaadid"),
 ("machen","—","to do","samayn"),("helfen","—","to help","caawin"),
 ("warten","—","to wait","sugid"),("suchen","—","to search","raadin"),
 ("finden","—","to find","helid"),("verstehen","—","to understand","fahmid"),
 ("wissen","—","to know","ogaan"),("brauchen","—","to need","u baahnaan"),
],
}

# Somali-Alphabet mit Aussprache
ALPHABET = [
 ("'","Stimmabsatz wie in beachten","glottal stop","'"),
 ("B","wie deutsch b","B","b"),("T","wie deutsch t","T","t"),
 ("J","wie dsch","J","j"),("X","kehliges gepresstes h","X","x"),
 ("KH","wie ch in Bach","KH","kh"),("D","wie deutsch d","D","d"),
 ("R","gerollt","R","r"),("S","stimmloses s","S","s"),
 ("SH","wie sch","SH","sh"),("DH","retroflexes d","DH","dh"),
 ("C","kehliger Reibelaut, arabisches Ain","C","c"),("G","wie deutsch g","G","g"),
 ("F","wie deutsch f","F","f"),("Q","tiefes k im Rachen","Q","q"),
 ("K","wie deutsch k","K","k"),("L","wie deutsch l","L","l"),
 ("M","wie deutsch m","M","m"),("N","wie deutsch n","N","n"),
 ("W","wie englisch w","W","w"),("H","wie deutsch h","H","h"),
 ("Y","wie deutsch j","Y","y"),("A","kurzes a","A","a"),
 ("E","kurzes e","E","e"),("I","kurzes i","I","i"),
 ("O","kurzes o","O","o"),("U","kurzes u","U","u"),
]

# ------------------------------------------------------------ Zahlen
E = ["eber","kow","laba","saddex","afar","shan","lix","toddoba","siddeed","sagaal"]
Z = {10:"toban",20:"labaatan",30:"soddon",40:"afartan",50:"konton",
     60:"lixdan",70:"toddobaatan",80:"siddeetan",90:"sagaashan"}
DE_E = ["null","eins","zwei","drei","vier","fünf","sechs","sieben","acht","neun"]
DE_Z = {10:"zehn",20:"zwanzig",30:"dreißig",40:"vierzig",50:"fünfzig",
        60:"sechzig",70:"siebzig",80:"achtzig",90:"neunzig"}
DE_E2 = ["","ein","zwei","drei","vier","fünf","sechs","sieben","acht","neun"]

def so_zahl(n):
    """Somali-Zahlwort nach der Regel: Einer VOR Zehner, verbunden mit iyo."""
    if n < 10: return E[n]
    if n < 100:
        z, e = (n // 10) * 10, n % 10
        if e == 0: return Z[z]
        if z == 10: return f"{E[e]} iyo toban"
        return f"{E[e]} iyo {Z[z]}"
    if n < 1000:
        h, r = n // 100, n % 100
        kopf = "boqol" if h == 1 else f"{E[h]} boqol"
        return kopf if r == 0 else f"{kopf} iyo {so_zahl(r)}"
    if n < 1000000:
        k, r = n // 1000, n % 1000
        kopf = "kun" if k == 1 else f"{so_zahl(k)} kun"
        return kopf if r == 0 else f"{kopf} iyo {so_zahl(r)}"
    return str(n)

def de_zahl(n):
    if n < 10: return DE_E[n]
    if n == 10: return "zehn"
    if n == 11: return "elf"
    if n == 12: return "zwölf"
    if n < 20: return DE_E[n % 10] + ("zehn" if n % 10 != 6 and n % 10 != 7 else ("sechzehn" if n % 10 == 6 else "siebzehn"))
    if n < 100:
        z, e = (n // 10) * 10, n % 10
        return DE_Z[z] if e == 0 else f"{DE_E2[e]}und{DE_Z[z]}"
    if n < 1000:
        h, r = n // 100, n % 100
        kopf = "einhundert" if h == 1 else DE_E2[h] + "hundert"
        return kopf if r == 0 else kopf + de_zahl(r)
    if n < 1000000:
        k, r = n // 1000, n % 1000
        kopf = "eintausend" if k == 1 else de_zahl(k) + "tausend"
        return kopf if r == 0 else kopf + de_zahl(r)
    return str(n)


def ergaenze(eintraege):
    n0 = len(eintraege)
    bekannt = {e["so"].lower() for e in eintraege}

    # Themenwortschatz
    for kat, liste in THEMEN.items():
        for i, (de, pl, en, so) in enumerate(liste):
            eintraege.append({"i": f"t_{kat}_{i}", "de": de, "pl": pl if pl != "—" else "",
                              "en": en, "so": so, "ymm": "", "k": "thema_" + kat, "u": 0, "n": ""})
    print(f"     Themenwortschatz: {len(eintraege)-n0}")

    # Alphabet
    n1 = len(eintraege)
    for i, (b, erkl, en, so) in enumerate(ALPHABET):
        eintraege.append({"i": f"alpha{i}", "de": f"Buchstabe {b}", "pl": "", "en": en,
                          "so": so, "ymm": "", "k": "alphabet", "u": 0, "n": erkl})
    print(f"     Alphabet: {len(eintraege)-n1}")

    # Zahlen: 0 bis 1000 vollstaendig, danach runde Zahlen bis 100.000
    n2 = len(eintraege)
    zahlen = list(range(0, 1001))
    zahlen += list(range(1100, 10001, 100))
    zahlen += list(range(11000, 100001, 1000))
    for n in zahlen:
        eintraege.append({"i": f"num{n}", "de": de_zahl(n), "pl": "", "en": f"number {n:,}".replace(",", "."),
                          "so": so_zahl(n), "ymm": "", "k": "zahlen_alle", "u": 0,
                          "n": f"Zahl {n:,}".replace(",", ".") + " — nach der Regel gebildet, bitte prüfen"})
    print(f"     Zahlen: {len(eintraege)-n2}")

    return eintraege
