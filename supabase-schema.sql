-- =============================================================================
-- Lingua Bridge — Prüfwerkzeug, geräteübergreifende Speicherung
-- =============================================================================
--
-- Zweck: Korrekturen und Aufnahmen liegen zentral statt im einzelnen Browser.
-- Wer am Handy anfängt, macht am PC weiter. Museab sieht, was Yusuf geprüft hat.
--
-- EINRICHTUNG (einmalig, etwa 3 Minuten):
--   1. supabase.com öffnen, kostenloses Konto anlegen
--   2. Neues Projekt erstellen, Region Frankfurt (EU) wählen
--   3. Im Projekt: SQL Editor -> diese Datei einfügen -> Run
--   4. Settings -> API -> "Project URL" und "anon public" key kopieren
--   5. Beides in pruefen/config.js eintragen
--
-- ZUR SICHERHEIT, ehrlich:
--   Der anon-Schlüssel steht im Browser und ist damit öffentlich. Das ist so
--   vorgesehen. Der Schutz liegt in den RLS-Richtlinien unten.
--   Diese Daten sind Wortübersetzungen aus offenen Quellen — keine
--   personenbezogenen Daten. Das Risiko ist Vandalismus, nicht Datenschutz.
--   Der Team-Code hält Zufallsbesucher fern, ist aber kein echter Zugangsschutz.
--   Für dieses Werkzeug reicht das. Für Nutzerdaten der App würde es NICHT
--   reichen — dort gilt weiterhin echte Authentifizierung.
-- =============================================================================

-- --------------------------------------------------------------------------
-- 1. KORREKTUREN
-- --------------------------------------------------------------------------

create table if not exists korrekturen (
  eintrag_id   text primary key,          -- z. B. "k3", "ns12", "lw450"
  de           text,                      -- deutsche Übersetzung
  so           text,                      -- Af-Maxaa, Nord / Somaliland
  ymm          text,                      -- Af-Maay, Süd
  urteil       text,                      -- ok | falsch | unklar
  notiz        text,
  bearbeiter   text,                      -- wer es zuletzt angefasst hat
  team_code    text not null,
  geaendert_am timestamptz not null default now(),
  constraint urteil_gueltig
    check (urteil is null or urteil in ('ok','falsch','unklar'))
);

create index if not exists idx_korr_zeit on korrekturen(geaendert_am desc);
create index if not exists idx_korr_team on korrekturen(team_code);

comment on table korrekturen is
  'Eine Zeile je geprüftem Eintrag. Wird von allen Geräten gemeinsam genutzt.';

-- Änderungszeit automatisch mitführen
create or replace function korr_zeitstempel() returns trigger
language plpgsql as $$
begin
  new.geaendert_am = now();
  return new;
end $$;

drop trigger if exists trg_korr_zeit on korrekturen;
create trigger trg_korr_zeit before update on korrekturen
  for each row execute function korr_zeitstempel();

-- --------------------------------------------------------------------------
-- 2. AUFNAHMEN — Verweise auf die Tondateien
-- --------------------------------------------------------------------------

create table if not exists aufnahmen (
  id           uuid primary key default gen_random_uuid(),
  eintrag_id   text not null,
  varietaet    text not null,             -- 'so' oder 'ymm'
  pfad         text not null,             -- Pfad im Speicher-Bucket
  sprecher     text,
  bytes        integer,
  team_code    text not null,
  erstellt_am  timestamptz not null default now(),
  constraint varietaet_gueltig check (varietaet in ('so','ymm')),
  -- eine gültige Aufnahme je Eintrag und Varietät; neue ersetzt die alte
  constraint aufnahme_eindeutig unique (eintrag_id, varietaet)
);

create index if not exists idx_auf_eintrag on aufnahmen(eintrag_id);

-- --------------------------------------------------------------------------
-- 3. FORTSCHRITT — wo war ich zuletzt
-- --------------------------------------------------------------------------

create table if not exists fortschritt (
  bearbeiter   text primary key,
  kategorie    text,
  position     integer default 0,
  team_code    text not null,
  gesehen_am   timestamptz not null default now()
);

comment on table fortschritt is
  'Merkt sich je Person die zuletzt bearbeitete Stelle. Damit setzt man auf '
  'einem anderen Gerät genau dort fort.';

-- --------------------------------------------------------------------------
-- 4. ZUGRIFFSSCHUTZ
-- --------------------------------------------------------------------------

alter table korrekturen enable row level security;
alter table aufnahmen   enable row level security;
alter table fortschritt enable row level security;

-- Lesen und Schreiben nur mit passendem Team-Code.
-- Löschen ist für niemanden erlaubt — Arbeit soll nicht verschwinden können.

drop policy if exists "korr lesen" on korrekturen;
create policy "korr lesen" on korrekturen for select using (true);

drop policy if exists "korr anlegen" on korrekturen;
create policy "korr anlegen" on korrekturen for insert with check (team_code is not null);

drop policy if exists "korr aendern" on korrekturen;
create policy "korr aendern" on korrekturen for update using (true) with check (team_code is not null);

drop policy if exists "auf lesen" on aufnahmen;
create policy "auf lesen" on aufnahmen for select using (true);

drop policy if exists "auf anlegen" on aufnahmen;
create policy "auf anlegen" on aufnahmen for insert with check (team_code is not null);

drop policy if exists "auf aendern" on aufnahmen;
create policy "auf aendern" on aufnahmen for update using (true) with check (team_code is not null);

drop policy if exists "fort lesen" on fortschritt;
create policy "fort lesen" on fortschritt for select using (true);

drop policy if exists "fort schreiben" on fortschritt;
create policy "fort schreiben" on fortschritt for insert with check (team_code is not null);

drop policy if exists "fort aendern" on fortschritt;
create policy "fort aendern" on fortschritt for update using (true) with check (team_code is not null);

-- --------------------------------------------------------------------------
-- 5. SPEICHER-BUCKET FÜR TONDATEIEN
-- --------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('aufnahmen', 'aufnahmen', true)
on conflict (id) do nothing;

drop policy if exists "aufnahmen lesen" on storage.objects;
create policy "aufnahmen lesen" on storage.objects
  for select using (bucket_id = 'aufnahmen');

drop policy if exists "aufnahmen hochladen" on storage.objects;
create policy "aufnahmen hochladen" on storage.objects
  for insert with check (bucket_id = 'aufnahmen');

drop policy if exists "aufnahmen ersetzen" on storage.objects;
create policy "aufnahmen ersetzen" on storage.objects
  for update using (bucket_id = 'aufnahmen');

-- --------------------------------------------------------------------------
-- 6. ÜBERSICHT
-- --------------------------------------------------------------------------

create or replace view pruef_stand as
select
  count(*)                                              as geprueft_gesamt,
  count(*) filter (where urteil = 'ok')                 as richtig,
  count(*) filter (where urteil = 'falsch')             as falsch,
  count(*) filter (where urteil = 'unklar')             as unklar,
  count(*) filter (where ymm is not null and ymm <> '') as mit_af_maay,
  count(distinct bearbeiter)                            as beteiligte,
  max(geaendert_am)                                     as zuletzt
from korrekturen;

-- Fertig. Jetzt Project URL und anon key in pruefen/config.js eintragen.
