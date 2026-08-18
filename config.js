/* ===========================================================================
   Lingua Bridge — Zugangsdaten
   ---------------------------------------------------------------------------
   Solange hier nichts eingetragen ist, arbeitet das Werkzeug NUR im jeweiligen
   Browser. Jedes Gerät fängt dann von vorn an.

   Für geräteübergreifendes Arbeiten:
     1. supabase.com  ->  kostenloses Konto  ->  neues Projekt (Region Frankfurt)
     2. Im Projekt: SQL Editor  ->  supabase-schema.sql einfügen  ->  Run
     3. Settings -> API  ->  "Project URL" und "anon public" hier eintragen
     4. Datei speichern, ins Repo hochladen — fertig

   Der anon-Schlüssel gehört in den Browser, das ist so vorgesehen.
   Er erlaubt nur, was die RLS-Richtlinien im Schema zulassen.
   ========================================================================= */

const CONFIG = {
  // Beispiel: "https://abcdefghijkl.supabase.co"
  SUPABASE_URL: "",

  // Beispiel: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  SUPABASE_KEY: "",

  // Gemeinsames Kennwort fürs Team. Frei wählbar, aber überall gleich.
  // Hält Zufallsbesucher fern — ist KEIN echter Zugangsschutz.
  TEAM_CODE: "lingua-bridge-2026",
};
