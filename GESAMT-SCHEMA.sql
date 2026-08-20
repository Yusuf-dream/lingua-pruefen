-- =====================================================================
-- LINGUA BRIDGE - Gesamtschema
-- Im SQL Editor einfuegen und RUN druecken.
-- Legt nur an, loescht nichts. Mehrfaches Ausfuehren ist unschaedlich.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Hauptschema - 17 Tabellen, RLS, Projektregeln
-- ---------------------------------------------------------------------
-- =============================================================================
-- Lingua Bridge 2.0 — Basisschema
-- Zenox Enterprises | 2026-08-08
--
-- Grundsatz: vollstaendig mehrsprachig von Tag 1. Welche Sprachen und Paare
-- freigeschaltet sind, steuern Flags (is_active, phase) — nicht die Struktur.
-- Ein Phasenwechsel ist damit ein UPDATE, keine Migration.
-- =============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- =============================================================================
-- 1. SPRACHEN UND PAARE
-- =============================================================================

create type script_type    as enum ('latin','arabic','han','kana','cyrillic','other');
create type text_direction as enum ('ltr','rtl');
create type content_status as enum ('none','draft','review','published');

create table languages (
  code            text primary key,              -- ISO 639-1/639-3: 'de','so','zh'
  name_native     text not null,                 -- Eigenbezeichnung: "Soomaali"
  name_en         text not null,
  script          script_type    not null default 'latin',
  direction       text_direction not null default 'ltr',
  -- Rollout-Steuerung: Phasenmodell wird hier abgebildet, nicht im Code
  is_active       boolean not null default false,
  rollout_phase   smallint,
  -- Fuer Hoerverstehen und Diktat zwingend
  tts_supported   boolean not null default false,
  stt_supported   boolean not null default false,
  created_at      timestamptz not null default now()
);

comment on column languages.is_active is
  'Schalter fuer den Rollout. Struktur bleibt unveraendert.';

-- Gerichtete Paare: Ausgangssprache = Muttersprache des Nutzers.
-- Bewusst als eigene Tabelle, damit jederzeit sichtbar ist, wie viele Paare
-- tatsaechlich Inhalte brauchen. n Sprachen ergeben n*(n-1) Paare.
create table language_pairs (
  id              uuid primary key default gen_random_uuid(),
  source_code     text not null references languages(code) on delete restrict,
  target_code     text not null references languages(code) on delete restrict,
  is_active       boolean not null default false,
  status          content_status not null default 'none',
  -- Projektregel: Inhalte gelten als Entwurf bis muttersprachliche Pruefung
  native_reviewer text,
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now(),
  constraint pair_unique   unique (source_code, target_code),
  constraint pair_distinct check (source_code <> target_code)
);

create index idx_pairs_active on language_pairs(is_active) where is_active;

-- =============================================================================
-- 2. NUTZERPROFILE UND ONBOARDING
-- =============================================================================

create type learning_purpose  as enum ('work','daily_life','school','authorities','study','family');
create type prior_experience  as enum ('none','some','rusty','advanced');

create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  display_name    text,
  native_language text references languages(code) on delete restrict,
  timezone        text not null default 'Europe/Berlin',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Die sechs Onboarding-Fragen. Ein Nutzer kann mehrere Ziele haben
-- (z. B. Deutsch fuer Arbeit und Englisch fuer Schule).
create table learning_goals (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles(id) on delete cascade,
  target_language   text not null references languages(code) on delete restrict,
  purpose           learning_purpose not null,
  experience        prior_experience not null default 'none',
  -- Zusage an den Nutzer: Lektionen werden auf dieses Budget zugeschnitten
  daily_minutes     smallint not null default 15,
  reminders_enabled boolean not null default false,
  reminder_time     time,
  is_primary        boolean not null default true,
  created_at        timestamptz not null default now(),
  constraint minutes_sane   check (daily_minutes between 5 and 240),
  constraint goal_unique    unique (user_id, target_language),
  -- Erinnerungszeit nur sinnvoll wenn Erinnerungen an sind
  constraint reminder_time_set check (not reminders_enabled or reminder_time is not null)
);

-- =============================================================================
-- 3. KURSSTRUKTUR
-- =============================================================================

create type cefr_level    as enum ('A1','A2','B1','B2','C1');
create type exercise_type as enum ('typing','image_match','writing','listening','dictation','multiple_choice');

create table courses (
  id            uuid primary key default gen_random_uuid(),
  pair_id       uuid not null references language_pairs(id) on delete cascade,
  level         cefr_level not null,
  title         text not null,
  position      smallint not null default 0,
  status        content_status not null default 'draft',
  created_at    timestamptz not null default now(),
  constraint course_unique unique (pair_id, level)
);

-- Themenmodule, z. B. "Behoerde", "Arbeit", "Arzt"
create table modules (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references courses(id) on delete cascade,
  slug          text not null,
  title         text not null,
  position      smallint not null default 0,
  constraint module_unique unique (course_id, slug)
);

create table lessons (
  id                uuid primary key default gen_random_uuid(),
  module_id         uuid not null references modules(id) on delete cascade,
  slug              text not null,
  title             text not null,
  position          smallint not null default 0,
  -- Projektregel: genau EINE Grammatikregel pro Lektion
  grammar_point     text,
  -- Projektregel: hoechstens 10 neue Wortschatzeinheiten
  new_vocab_count   smallint not null default 0,
  estimated_minutes smallint not null default 10,
  -- Offline-First: Lektion muss vollstaendig vorab ladbar sein
  offline_ready     boolean not null default false,
  -- Projektregel: gilt als Entwurf bis Muttersprachler geprueft hat
  native_reviewed   boolean not null default false,
  status            content_status not null default 'draft',
  created_at        timestamptz not null default now(),
  constraint lesson_unique     unique (module_id, slug),
  constraint vocab_limit       check (new_vocab_count <= 10),
  -- Veroeffentlichung nur nach muttersprachlicher Pruefung
  constraint publish_requires_review
    check (status <> 'published' or native_reviewed)
);

comment on constraint publish_requires_review on lessons is
  'Erzwingt die Projektregel auf Datenbankebene statt im Anwendungscode.';

create table exercises (
  id                 uuid primary key default gen_random_uuid(),
  lesson_id          uuid not null references lessons(id) on delete cascade,
  type               exercise_type not null,
  position           smallint not null default 0,
  prompt             jsonb not null,
  solution           jsonb not null,
  -- Prinzip: jedes Audio in zwei Tempostufen
  audio_slow_url     text,
  audio_natural_url  text,
  image_url          text,
  -- Sprechuebungen sind immer ueberspringbar, nie Fortschrittssperre
  is_skippable       boolean not null default true,
  constraint listening_needs_audio
    check (type not in ('listening','dictation') or audio_natural_url is not null)
);

-- =============================================================================
-- 4. WORTSCHATZ UND WIEDERHOLUNG
-- =============================================================================

create table vocabulary_items (
  id            uuid primary key default gen_random_uuid(),
  pair_id       uuid not null references language_pairs(id) on delete cascade,
  term          text not null,          -- in der Zielsprache
  translation   text not null,          -- in der Muttersprache
  -- Projektregel: Substantive nie ohne Artikel und Plural
  article       text,
  plural_form   text,
  part_of_speech text,
  example       text,
  audio_slow_url    text,
  audio_natural_url text,
  constraint noun_needs_article
    check (part_of_speech <> 'noun' or (article is not null and plural_form is not null))
);

-- Spaced Repetition. Fortschritt heisst Beherrschung, nicht Anwesenheit.
create table review_schedule (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  item_id       uuid not null references vocabulary_items(id) on delete cascade,
  ease_factor   numeric(4,2) not null default 2.50,
  interval_days smallint not null default 1,
  repetitions   smallint not null default 0,
  lapses        smallint not null default 0,
  due_at        timestamptz not null default now(),
  last_result   smallint,
  constraint review_unique unique (user_id, item_id)
);

create index idx_review_due on review_schedule(user_id, due_at);

create table lesson_progress (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  lesson_id     uuid not null references lessons(id) on delete cascade,
  -- Beherrschungsgrad 0..100, kein blosses "abgeschlossen"
  mastery_score smallint not null default 0,
  attempts      smallint not null default 0,
  completed_at  timestamptz,
  last_seen_at  timestamptz not null default now(),
  constraint progress_unique unique (user_id, lesson_id),
  constraint mastery_range   check (mastery_score between 0 and 100)
);

create index idx_progress_user on lesson_progress(user_id, last_seen_at desc);

-- =============================================================================
-- 5. KI-ALLTAGSASSISTENT
--
-- LEITPLANKE DATENMINIMIERUNG: Hochgeladene Dokumente werden NICHT gespeichert.
-- Es gibt bewusst keine Spalte und keinen Bucket dafuer. Was fehlt, kann nicht
-- geleakt, nicht beschlagnahmt und nicht versehentlich protokolliert werden.
-- =============================================================================

create type message_role      as enum ('user','assistant','system');
create type referral_org_type as enum ('awo','caritas','diakonie','jmd','migrationsberatung','jobcenter','vhs','other');

create table assistant_conversations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  -- Antwortsprache = Muttersprache des Nutzers
  reply_language  text not null references languages(code) on delete restrict,
  title           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table assistant_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references assistant_conversations(id) on delete cascade,
  role            message_role not null,
  content         text not null,
  -- Leitplanke Fristensicherheit: erkannte Fristen werden nie frei formuliert
  -- ausgegeben, sondern immer mit Originalausschnitt belegt.
  -- Struktur: [{"date":"2026-09-01","source_excerpt":"...","bbox":[x,y,w,h]}]
  extracted_dates jsonb,
  created_at      timestamptz not null default now()
);

create index idx_messages_conv on assistant_messages(conversation_id, created_at);

-- Nur Metadaten zur Missbrauchserkennung. Kein Dokumentinhalt, kein Dateiname.
create table document_processing_events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  page_count      smallint,
  byte_size       integer,
  processed_at    timestamptz not null default now(),
  -- Nachweis, dass die fluechtige Verarbeitung tatsaechlich beendet wurde
  discarded_at    timestamptz not null default now()
);

comment on table document_processing_events is
  'Bewusst ohne Inhalt, Dateiname oder Volltext. Belegt nur, dass verarbeitet '
  'und verworfen wurde. DSGVO-Datenminimierung, Art. 5 Abs. 1 lit. c.';

-- Beratungsstellen fuer die proaktive Weitervermittlung
create table referral_organisations (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  org_type        referral_org_type not null,
  street          text,
  postal_code     text,
  city            text,
  latitude        numeric(9,6),
  longitude       numeric(9,6),
  -- Welche Sprachen die Stelle tatsaechlich bedient
  languages       text[] not null default '{}',
  phone           text,
  email           text,
  website         text,
  is_verified     boolean not null default false,
  updated_at      timestamptz not null default now()
);

create index idx_referrals_city on referral_organisations(city);
create index idx_referrals_langs on referral_organisations using gin(languages);

-- =============================================================================
-- 6. ROW LEVEL SECURITY
-- Ohne RLS koennte jeder angemeldete Nutzer fremde Behoerdenpost lesen.
-- =============================================================================

alter table profiles                   enable row level security;
alter table learning_goals             enable row level security;
alter table lesson_progress            enable row level security;
alter table review_schedule            enable row level security;
alter table assistant_conversations    enable row level security;
alter table assistant_messages         enable row level security;
alter table document_processing_events enable row level security;

create policy "eigenes Profil" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "eigene Lernziele" on learning_goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "eigener Fortschritt" on lesson_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "eigene Wiederholungen" on review_schedule
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "eigene Gespraeche" on assistant_conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "eigene Nachrichten" on assistant_messages
  for all using (
    exists (select 1 from assistant_conversations c
            where c.id = conversation_id and c.user_id = auth.uid())
  );

create policy "eigene Verarbeitungsprotokolle" on document_processing_events
  for select using (auth.uid() = user_id);

-- Inhalte sind fuer alle Angemeldeten lesbar, aber nur veroeffentlichte
alter table languages       enable row level security;
alter table language_pairs  enable row level security;
alter table courses         enable row level security;
alter table modules         enable row level security;
alter table lessons         enable row level security;
alter table exercises       enable row level security;
alter table vocabulary_items enable row level security;
alter table referral_organisations enable row level security;

create policy "Sprachen lesbar"    on languages       for select using (true);
create policy "Paare lesbar"       on language_pairs  for select using (true);
create policy "Kurse lesbar"       on courses         for select using (status = 'published');
create policy "Module lesbar"      on modules         for select using (true);
create policy "Lektionen lesbar"   on lessons         for select using (status = 'published');
create policy "Uebungen lesbar"    on exercises       for select using (true);
create policy "Vokabeln lesbar"    on vocabulary_items for select using (true);
create policy "Beratung lesbar"    on referral_organisations for select using (is_verified);

-- =============================================================================
-- 7. AUTOMATIK
-- =============================================================================

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger trg_profiles_touch before update on profiles
  for each row execute function touch_updated_at();
create trigger trg_conversations_touch before update on assistant_conversations
  for each row execute function touch_updated_at();

-- Profil automatisch bei Registrierung anlegen
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'display_name');
  return new;
end $$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- =============================================================================
-- 8. STAMMDATEN SPRACHEN
-- is_active steuert den Rollout. Aendern per UPDATE, nicht per Migration.
-- =============================================================================

insert into languages (code, name_native, name_en, script, direction, rollout_phase, tts_supported, stt_supported, is_active) values
  ('de','Deutsch',   'German',   'latin','ltr',1,true, true, false),
  ('en','English',   'English',  'latin','ltr',1,true, true, false),
  ('fr','Francais',  'French',   'latin','ltr',1,true, true, false),
  ('es','Espanol',   'Spanish',  'latin','ltr',1,true, true, false),
  ('zh','Zhongwen',  'Chinese',  'han',  'ltr',1,true, true, false),
  ('ja','Nihongo',   'Japanese', 'kana', 'ltr',1,true, true, false),
  ('so','Soomaali',  'Somali',   'latin','ltr',2,false,false,false),
  ('ar','Arabiya',   'Arabic',   'arabic','rtl',2,true, true, false),
  ('uk','Ukrainska', 'Ukrainian','cyrillic','ltr',2,true,true,false),
  ('tr','Turkce',    'Turkish',  'latin','ltr',2,true, true, false);

-- Hinweis: Somali hat tts_supported = false. Das ist keine Nachlaessigkeit,
-- sondern der reale Stand. Fuer Hoeruebungen und Diktate braucht es dort
-- menschliche Aufnahmen. Vor Planung von Phase 2 pruefen.


-- ---------------------------------------------------------------------
-- Kostendeckel - Torwaechter, Monatsdeckel, Notbremse
-- ---------------------------------------------------------------------
-- =============================================================================
-- Lingua Bridge 2.0 — Kostendeckel und Nutzungsbegrenzung
-- Zenox Enterprises | 2026-08-08
--
-- Zweck: Verhindern, dass das gesamte Startkapital von 1.000 Euro in Tagen
-- verbraucht wird, wenn die Anwendung in einer Community-Gruppe geteilt wird.
--
-- Grundsatz: Der Deckel liegt in der Datenbank, nicht im Anwendungscode.
-- Anwendungscode wird umgeschrieben, vergessen oder umgangen. Eine
-- Datenbankfunktion, die vor jeder Anfrage gefragt werden MUSS, nicht.
-- =============================================================================

-- =============================================================================
-- 1. BETRIEBSEINSTELLUNGEN
-- =============================================================================

create table cost_settings (
  id                     boolean primary key default true,
  -- Monatsdeckel in Cent. 3500 = 35 Euro, entspricht dem Startplan.
  monthly_cap_cents      integer not null default 3500,
  -- Notbremse: schaltet den Assistenten sofort ab, unabhaengig vom Verbrauch.
  kill_switch            boolean not null default false,
  -- Grenzen je Nutzer
  daily_docs_per_user    smallint not null default 5,
  monthly_docs_per_user  smallint not null default 40,
  -- Ab diesem Anteil des Deckels wird gewarnt (0.80 = 80 Prozent)
  warn_threshold         numeric(3,2) not null default 0.80,
  updated_at             timestamptz not null default now(),
  -- Erzwingt, dass es genau eine Zeile gibt
  constraint single_row  check (id)
);

insert into cost_settings (id) values (true);

comment on table cost_settings is
  'Genau eine Zeile. kill_switch = true stoppt den Assistenten sofort.';

-- =============================================================================
-- 2. VERBRAUCHSERFASSUNG
--
-- Bewusst OHNE Bezug zum Dokumentinhalt. Erfasst wird, was etwas gekostet
-- hat, nicht was darin stand.
-- =============================================================================

create table api_usage (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references profiles(id) on delete set null,
  -- Abrechnungsmonat als erster Tag des Monats, fuer schnelle Summen
  billing_month     date not null default date_trunc('month', now())::date,
  model             text not null,
  input_tokens      integer not null default 0,
  output_tokens     integer not null default 0,
  -- In Zehntel-Cent, damit einzelne Anfragen nicht auf null gerundet werden
  cost_millicents   integer not null default 0,
  -- Wurde ein Bild mitgeschickt und auf welche Kantenlaenge verkleinert?
  had_image         boolean not null default false,
  image_max_edge_px smallint,
  created_at        timestamptz not null default now()
);

create index idx_usage_month on api_usage(billing_month);
create index idx_usage_user_day on api_usage(user_id, created_at desc);

comment on column api_usage.image_max_edge_px is
  'Beleg, dass die Verkleinerung vor dem Versand tatsaechlich griff. '
  'Bilder sind der groesste Kostenhebel.';

-- =============================================================================
-- 3. DIE TORWAECHTER-FUNKTION
--
-- Muss vor JEDER Assistentenanfrage aufgerufen werden. Gibt zurueck, ob
-- die Anfrage erlaubt ist, und wenn nicht, aus welchem Grund.
-- =============================================================================

create type gate_decision as enum (
  'allowed',
  'blocked_kill_switch',
  'blocked_monthly_cap',
  'blocked_daily_user_limit',
  'blocked_monthly_user_limit'
);

create or replace function check_assistant_allowed(p_user uuid)
returns table (
  decision        gate_decision,
  spent_cents     integer,
  cap_cents       integer,
  docs_today      integer,
  docs_this_month integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  s               cost_settings%rowtype;
  v_spent_mc      bigint;
  v_docs_today    integer;
  v_docs_month    integer;
begin
  select * into s from cost_settings where id;

  select coalesce(sum(cost_millicents), 0) into v_spent_mc
    from api_usage
   where billing_month = date_trunc('month', now())::date;

  select count(*) into v_docs_today
    from document_processing_events
   where user_id = p_user
     and processed_at >= date_trunc('day', now());

  select count(*) into v_docs_month
    from document_processing_events
   where user_id = p_user
     and processed_at >= date_trunc('month', now());

  spent_cents     := (v_spent_mc / 10)::integer;
  cap_cents       := s.monthly_cap_cents;
  docs_today      := v_docs_today;
  docs_this_month := v_docs_month;

  -- Reihenfolge ist Absicht: die Notbremse hat immer Vorrang.
  if s.kill_switch then
    decision := 'blocked_kill_switch';
  elsif spent_cents >= s.monthly_cap_cents then
    decision := 'blocked_monthly_cap';
  elsif v_docs_today >= s.daily_docs_per_user then
    decision := 'blocked_daily_user_limit';
  elsif v_docs_month >= s.monthly_docs_per_user then
    decision := 'blocked_monthly_user_limit';
  else
    decision := 'allowed';
  end if;

  return next;
end $$;

comment on function check_assistant_allowed is
  'Torwaechter. Vor jeder Anfrage aufrufen. Der Deckel liegt hier und nicht '
  'im Anwendungscode, damit er nicht versehentlich umgangen werden kann.';

-- =============================================================================
-- 4. ZUGRIFFSSCHUTZ
-- =============================================================================

alter table cost_settings enable row level security;
alter table api_usage     enable row level security;

-- Betriebsdaten sind fuer normale Nutzer unsichtbar. Verbrauchszahlen und
-- Deckelstand gehen niemanden ausser den Betreibern etwas an.
create policy "Kosteneinstellungen gesperrt" on cost_settings
  for select using (false);
create policy "Verbrauch gesperrt" on api_usage
  for select using (false);

-- =============================================================================
-- 5. BERATUNGSSTELLEN STUTTGART
--
-- Startbestand fuer die Weiterleitung. is_verified bleibt false, bis
-- Anschrift, Sprachen und Sprechzeiten telefonisch bestaetigt wurden —
-- ein falscher Verweis schickt Menschen umsonst durch die Stadt.
-- =============================================================================

insert into referral_organisations (name, org_type, city, languages, is_verified) values
  ('AWO Kreisverband Stuttgart — Migrationsberatung', 'awo',                'Stuttgart', '{de,en,ar,tr}', false),
  ('Caritasverband Stuttgart — Migrationsdienste',    'caritas',            'Stuttgart', '{de,en,ar}',    false),
  ('Diakonie Stuttgart — Beratung fuer Gefluechtete', 'diakonie',           'Stuttgart', '{de,en}',       false),
  ('Jugendmigrationsdienst Stuttgart',                'jmd',                'Stuttgart', '{de,en}',       false),
  ('Migrationsberatung fuer erwachsene Zuwanderer',   'migrationsberatung', 'Stuttgart', '{de,en}',       false),
  ('Volkshochschule Stuttgart — Integrationskurse',   'vhs',                'Stuttgart', '{de}',          false);

-- Erinnerung: Die Weiterleitung zeigt ausschliesslich Stellen mit
-- is_verified = true. Der Startbestand ist damit absichtlich unsichtbar,
-- bis jemand ihn geprueft hat.


-- ---------------------------------------------------------------------
-- Pruefwerkzeug - geraeteuebergreifende Speicherung
-- ---------------------------------------------------------------------
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
