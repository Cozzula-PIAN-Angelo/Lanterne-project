# Lanterne — Piano 1: Fondamenta e ciclo base

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un'app Next.js funzionante in locale in cui due persone si registrano, si collegano tramite invito, si scambiano lanterne di **testo** e **pensiero** che arrivano all'orario concordato nell'ora locale di chi le riceve, e possono reagire, conservare, chiudere o bloccare.

**Architecture:** Monolite Next.js (App Router) con PostgreSQL via Drizzle. La logica del tempo è fatta di funzioni pure in `lib/time`. Tutte le regole su "chi vede cosa" stanno in `lib/access`, che riceve `db` e `now` come parametri. Server Actions sottili validano con Zod e chiamano `lib/access`. L'interfaccia è volutamente schematica: il lago animato arriva nel Piano 3.

**Tech Stack:** Next.js (ultima stabile), React, TypeScript strict, PostgreSQL 17, Drizzle ORM + drizzle-kit, Better Auth (plugin magic link, adattatore Drizzle), Nodemailer → Mailpit, Zod, date-fns + @date-fns/tz, Tailwind CSS + shadcn/ui, Vitest, Playwright, pnpm, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-11-02-lanterne-design.md`

**Fuori da questo piano:**
- **Piano 2:** audio e foto, MinIO/S3, IndexedDB offline, worker pg-boss, notifiche push, PWA, tetto audio, eliminazione dell'account (richiede la cancellazione dei file su S3).
- **Piano 3:** il lago e le fasi del cielo, suncalc, Ricordi rifiniti, pagine Privacy e "Se stai male", README, CI.

## Global Constraints

- Lingua dell'interfaccia: **italiano**. Tono dei messaggi di errore calmo e senza colpe.
- Nel database tutti gli istanti sono `timestamptz` (UTC). Tutto ciò che l'utente vede o imposta è nella **sua ora locale**.
- Nessuna chiamata a `new Date()` senza argomenti fuori da `lib/clock` (imposto da ESLint, Task 1).
- Orario di apertura: formato `HH:MM`, consentito **dalle 17:00 alle 00:00 comprese**.
- Scadenza: prima occorrenza delle **06:00 nel fuso del destinatario** dopo `revealAt`, minimo **`revealAt` + 8 ore**.
- Massimo **5 connessioni** per utente, contando quelle `active` e `pending`.
- Testo di una lanterna: 1–1000 caratteri (dopo trim).
- Inviti: validi **7 giorni**, monouso, codice da 16 byte casuali in `base64url`.
- Magic link valido **15 minuti** (`expiresIn: 900`).
- Reazioni consentite: `💛` `🫂` `😂` `😮` `🌙`.
- Fuso orario valido = accettato da `Intl.DateTimeFormat` (stringa IANA).
- Le query non usano `now()` di SQL: `now` arriva sempre come parametro.

## Review Focus

1. **Utente che non ha completato l'onboarding** (senza colore e con fuso di default `UTC`) che crea o accetta un invito → rifiutato con `onboarding_required`, altrimenti le sue lanterne arriverebbero all'ora UTC. *Test nel Task 9.*
2. **Fuso orario inventato** inviato dal client (es. `Mars/Base`) in onboarding o impostazioni → rifiutato con `invalid_input`. *Test nei Task 5 e 7.*
3. **Lanterna inviata su una connessione `pending`** (orario non ancora concordato) o `ended` → rifiutata con `connection_not_active`. *Test nel Task 11.*
4. **URL di una connessione altrui** (`/persone/<id>` di altri) → 404, senza rivelare se esiste. *Test nel Task 11 (`not_found`) e nel Task 13 (e2e).*
5. **Limite raggiunto dall'invitante dopo aver creato l'invito** → l'accettazione fallisce con `connection_limit_other`. *Test nel Task 9.*

---

## File Structure

```
docker-compose.yml                 postgres + mailpit
docker/postgres-init.sql           crea lanterne_test e lanterne_e2e
.env.example
drizzle.config.ts
vitest.config.ts                   progetti "unit" e "integration"
playwright.config.ts
eslint.config.mjs                  + regola no new Date() fuori da lib/clock
scripts/setup.ts                   env, migrazioni, seed
scripts/seed.ts                    dati demo
lib/clock/clock.ts                 Clock, systemClock, fixedClock, offsetClock, parseDevOffset
lib/clock/request.ts               getRequestClock() (server-only)
lib/time/reveal-time.ts            parsing, validazione, occorrenze locali
lib/time/lantern-times.ts          computeRevealAt, computeExpiresAt
lib/time/timezone.ts               isValidTimeZone, cityFromTimeZone
lib/time/format.ts                 etichette e conti alla rovescia in italiano
lib/db/client.ts                   db, Db
lib/db/auth-schema.ts              generato dalla CLI di Better Auth
lib/db/schema.ts                   tabelle dell'app
lib/db/migrations/                 generate da drizzle-kit
lib/auth/auth.ts                   configurazione Better Auth
lib/auth/auth-client.ts            client React
lib/auth/session.ts                requireUser(), requireOnboardedUser()
lib/mail/mailer.ts                 sendMail() via SMTP
lib/rate-limit.ts                  checkRateLimit()
lib/access/errors.ts               AccessResult, AccessErrorCode
lib/access/invites.ts
lib/access/connections.ts
lib/access/blocks.ts
lib/access/lanterns.ts
lib/lanterns/constants.ts          THOUGHTS, REACTIONS, COLORS, limiti
lib/messages.ts                    errorMessage(code) in italiano
app/api/auth/[...all]/route.ts
app/(auth)/accedi/page.tsx
app/(app)/layout.tsx               protegge le pagine, banner fuso, pannello dev
app/(app)/benvenuto/page.tsx       onboarding
app/(app)/page.tsx                 home "Le tue persone"
app/(app)/invita/page.tsx
app/(app)/invito/[code]/page.tsx
app/(app)/persone/[id]/page.tsx    canale (versione schematica)
app/(app)/impostazioni/page.tsx
app/(app)/actions/*.ts             Server Actions
components/...                     componenti UI
tests/helpers/db.ts                getTestDb, resetDb, makeUser, makeConnection, makeLantern
tests/integration/*.test.ts
lib/**/*.test.ts                   test unit accanto al codice
e2e/*.spec.ts
docs/notes/audio-format.md         esito della verifica audio
```

---

### Task 1: Scaffold del progetto, tooling e Docker

**Files:**
- Create: progetto Next.js nella root, `docker-compose.yml`, `docker/postgres-init.sql`, `.env.example`, `vitest.config.ts`, `lib/sanity.test.ts`
- Modify: `eslint.config.mjs`, `package.json`, `.gitignore`

**Interfaces:**
- Produces:
  - script `pnpm dev`, `pnpm typecheck` (`tsc --noEmit`), `pnpm lint`, `pnpm test:unit`, `pnpm test:int`;
  - servizi Docker `postgres` (porta 5432, utente/password `lanterne`, db `lanterne`) e `mailpit` (SMTP 1025, UI e API 8025);
  - variabili `.env.example`: `DATABASE_URL=postgres://lanterne:lanterne@localhost:5432/lanterne`, `DATABASE_URL_TEST=…/lanterne_test`, `DATABASE_URL_E2E=…/lanterne_e2e`, `BETTER_AUTH_SECRET=`, `BETTER_AUTH_URL=http://localhost:3000`, `SMTP_HOST=localhost`, `SMTP_PORT=1025`, `MAIL_FROM=Lanterne <ciao@lanterne.local>`, `DEMO_LOGIN=true`.

- [ ] **Step 1:** Crea l'app nella root esistente con `pnpm create next-app@latest . --ts --app --tailwind --eslint --src-dir=false --import-alias "@/*" --use-pnpm`, mantenendo i file già presenti (`docs/`, `.gitignore`). In `tsconfig.json` imposta `"strict": true`. Inizializza shadcn/ui con `pnpm dlx shadcn@latest init`.
- [ ] **Step 2:** Scrivi `docker-compose.yml` con `postgres:17-alpine` (volume nominato, `docker/postgres-init.sql` montato in `/docker-entrypoint-initdb.d/`, che esegue `CREATE DATABASE lanterne_test; CREATE DATABASE lanterne_e2e;`) e `axllent/mailpit`. Esegui `docker compose up -d`. Atteso: `docker compose ps` mostra entrambi i servizi `running`.
- [ ] **Step 3:** Installa Vitest e configura due progetti in `vitest.config.ts`:
  - `unit`: `lib/**/*.test.ts`, ambiente node;
  - `integration`: `tests/integration/**/*.test.ts`, `fileParallelism: false`, `globalSetup: tests/helpers/global-setup.ts` (creato nel Task 6; fino ad allora il progetto non trova file).
  Script: `"test:unit": "vitest run --project unit"`, `"test:int": "vitest run --project integration"`.
- [ ] **Step 4:** Scrivi `lib/sanity.test.ts` con `expect(1 + 1).toBe(2)` ed esegui `pnpm test:unit`. Atteso: 1 test PASS.
- [ ] **Step 5:** In `eslint.config.mjs` aggiungi `no-restricted-syntax` con il selettore `NewExpression[callee.name='Date'][arguments.length=0]` e il messaggio `"Usa il Clock (lib/clock) invece di new Date()"`, disattivato per `lib/clock/**`. Verifica: aggiungi temporaneamente `new Date()` in un file, `pnpm lint` deve segnalare l'errore; poi rimuovilo.
- [ ] **Step 6:** Esegui `pnpm typecheck && pnpm lint && pnpm test:unit` (tutti verdi) e `pnpm dev`: `http://localhost:3000` risponde.
- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app, Docker services, Vitest and lint rules"
```

---

### Task 2: Verifica del formato audio (spike, codice da buttare)

È il primo passo previsto dalla spec (§10, "Formato audio"). L'output è una **risposta**, non codice da tenere.

**Files:**
- Create (temporaneo): `app/dev/audio-check/page.tsx`
- Create (da tenere): `docs/notes/audio-format.md`

**Interfaces:**
- Produces: `docs/notes/audio-format.md`, con il formato scelto (`audio/mp4` o fallback `audio/webm`) e la matrice dispositivo → registra/riproduce. Il Piano 2 lo legge.

- [ ] **Step 1:** Crea una pagina client con:
  - un pulsante "Registra 5 secondi" che usa `MediaRecorder` con il primo tipo supportato tra `audio/mp4` e `audio/webm;codecs=opus` (`MediaRecorder.isTypeSupported`);
  - un `<audio controls>` per riascoltare;
  - un link per scaricare il file;
  - il tipo usato e la dimensione mostrati a schermo.
- [ ] **Step 2:** Avvia con `pnpm dev --experimental-https` (il microfono richiede HTTPS sui telefoni) e apri la pagina dall'IP di rete sul PC.
- [ ] **Step 3:** Registra su **Android (Chrome)** e su **iPhone (Safari)**. Poi scambia i file scaricati e verifica che ognuno si riproduca sull'altro dispositivo. Se l'iPhone non è disponibile, annotalo e prova almeno Safari su macOS.
- [ ] **Step 4:** Scrivi `docs/notes/audio-format.md` con la matrice dei risultati e la decisione: "registra in `audio/mp4` dove supportato", oppure "serve conversione ffmpeg nel worker (Piano 2)".
- [ ] **Step 5:** Elimina `app/dev/audio-check/` e fai commit solo della nota.

```bash
git add docs/notes/audio-format.md
git commit -m "docs: record cross-device audio format check"
```

---

### Task 3: Orologio iniettabile (`lib/clock`)

**Files:**
- Create: `lib/clock/clock.ts`, `lib/clock/request.ts`
- Test: `lib/clock/clock.test.ts`

**Interfaces:**
- Produces:
  - `interface Clock { now(): Date }`
  - `const systemClock: Clock`
  - `fixedClock(at: Date): Clock`
  - `offsetClock(base: Clock, offsetMs: number): Clock`
  - `parseDevOffset(raw: string | undefined, nodeEnv: string | undefined): number`
  - `const DEV_OFFSET_COOKIE = "lanterne-dev-offset"`
  - `getRequestClock(): Promise<Clock>` in `request.ts` (con `import "server-only"`): legge il cookie con `cookies()` di `next/headers` e restituisce `offsetClock(systemClock, parseDevOffset(valore, process.env.NODE_ENV))`

- [ ] **Step 1: Scrivi i test che falliscono**

```ts
test("fixedClock restituisce sempre lo stesso istante", () => {
  const c = fixedClock(new Date("2026-11-02T10:00:00Z"));
  expect(c.now().toISOString()).toBe("2026-11-02T10:00:00.000Z");
});
test("offsetClock sposta in avanti", () => {
  const c = offsetClock(fixedClock(new Date("2026-11-02T10:00:00Z")), 3_600_000);
  expect(c.now().toISOString()).toBe("2026-11-02T11:00:00.000Z");
});
test("parseDevOffset vale solo in development", () => {
  expect(parseDevOffset("3600000", "development")).toBe(3_600_000);
  expect(parseDevOffset("3600000", "production")).toBe(0);
  expect(parseDevOffset("3600000", "test")).toBe(0);
  expect(parseDevOffset("abc", "development")).toBe(0);
  expect(parseDevOffset(undefined, "development")).toBe(0);
});
```

- [ ] **Step 2:** Esegui `pnpm test:unit lib/clock`. Atteso: FAIL (moduli mancanti).
- [ ] **Step 3:** Implementa le funzioni dell'Interfaces block. `offsetClock` calcola `new Date(base.now().getTime() + offsetMs)` a ogni chiamata.
- [ ] **Step 4:** Esegui `pnpm test:unit lib/clock`. Atteso: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: add injectable clock"`

---

### Task 4: Orari di apertura e calcolo di `revealAt`

**Files:**
- Create: `lib/time/reveal-time.ts`, `lib/time/lantern-times.ts`
- Test: `lib/time/reveal-time.test.ts`, `lib/time/lantern-times.test.ts`

**Interfaces:**
- Produces (`reveal-time.ts`):
  - `parseRevealTime(s: string): { hour: number; minute: number }`: lancia un errore se il formato non è `HH:MM` con due cifre per parte
  - `isAllowedRevealTime(s: string): boolean`
  - `localInstant(localDate: { year: number; month: number; day: number }, time: string, tz: string): Date`
  - `localDateOf(at: Date, tz: string): { year: number; month: number; day: number }`
  - `nextOccurrence(time: string, tz: string, after: Date): Date`: primo istante **strettamente successivo** ad `after`
  - `previousOccurrence(time: string, tz: string, atOrBefore: Date): Date`: ultimo istante `≤ atOrBefore`
- Produces (`lantern-times.ts`):
  - `type RevealSchedule = { revealTime: string; previousRevealTime: string | null; revealTimeChangedAt: Date | null }`
  - `computeRevealAt(schedule: RevealSchedule, recipientTz: string, now: Date): Date`

- [ ] **Step 1: Scrivi i test che falliscono**

```ts
// reveal-time.test.ts
test.each([
  ["17:00", true], ["16:59", false], ["23:59", true], ["00:00", true],
  ["00:01", false], ["24:00", false], ["9:30", false], ["21:3", false],
])("isAllowedRevealTime(%s) = %s", (s, ok) => expect(isAllowedRevealTime(s)).toBe(ok));

test("21:30 a Roma: stesso giorno se prima, giorno dopo se all'orario esatto", () => {
  expect(nextOccurrence("21:30", "Europe/Rome", new Date("2026-11-02T20:29:59Z")).toISOString()).toBe("2026-11-02T20:30:00.000Z");
  expect(nextOccurrence("21:30", "Europe/Rome", new Date("2026-11-02T20:30:00Z")).toISOString()).toBe("2026-11-03T20:30:00.000Z");
});
test("mezzanotte a Roma", () => {
  expect(nextOccurrence("00:00", "Europe/Rome", new Date("2026-11-02T22:50:00Z")).toISOString()).toBe("2026-11-02T23:00:00.000Z");
  expect(nextOccurrence("00:00", "Europe/Rome", new Date("2026-11-02T23:10:00Z")).toISOString()).toBe("2026-11-03T23:00:00.000Z");
});
test("cambio d'ora legale a Roma (25 ottobre 2026)", () => {
  expect(nextOccurrence("21:30", "Europe/Rome", new Date("2026-10-24T20:00:00Z")).toISOString()).toBe("2026-10-25T20:30:00.000Z");
});
test("previousOccurrence", () => {
  expect(previousOccurrence("21:30", "Europe/Rome", new Date("2026-11-02T22:00:00Z")).toISOString()).toBe("2026-11-02T20:30:00.000Z");
  expect(previousOccurrence("21:30", "Europe/Rome", new Date("2026-11-02T10:00:00Z")).toISOString()).toBe("2026-11-01T20:30:00.000Z");
});

// lantern-times.test.ts
const plain = { revealTime: "21:30", previousRevealTime: null, revealTimeChangedAt: null };
test("esempio della spec: Giulia (Roma) alle 23:00 → Marco (New York) alle sue 21:30", () => {
  expect(computeRevealAt(plain, "America/New_York", new Date("2026-11-02T22:00:00Z")).toISOString()).toBe("2026-11-03T02:30:00.000Z");
});
const changed = { revealTime: "20:00", previousRevealTime: "21:30", revealTimeChangedAt: new Date("2026-11-02T09:00:00Z") };
test("il cambio d'orario vale dal giorno dopo", () => {
  expect(computeRevealAt(changed, "Europe/Rome", new Date("2026-11-02T12:00:00Z")).toISOString()).toBe("2026-11-02T20:30:00.000Z");
  expect(computeRevealAt(changed, "Europe/Rome", new Date("2026-11-02T21:00:00Z")).toISOString()).toBe("2026-11-03T19:00:00.000Z");
  expect(computeRevealAt(changed, "Europe/Rome", new Date("2026-11-03T08:00:00Z")).toISOString()).toBe("2026-11-03T19:00:00.000Z");
});
```

- [ ] **Step 2:** Esegui `pnpm test:unit lib/time`. Atteso: FAIL.
- [ ] **Step 3:** Implementa con `TZDate` di `@date-fns/tz` (`localInstant` costruisce `new TZDate(y, m-1, d, h, min, tz)`; `localDateOf` legge le componenti in `tz`). `isAllowedRevealTime` accetta `minuti ≥ 17*60` oppure `00:00`. `nextOccurrence` e `computeRevealAt` seguono questo algoritmo:

```
computeRevealAt(schedule, tz, now):
  changeDay = schedule.revealTimeChangedAt ? localDateOf(changedAt, tz) : null
  for offset in [0, 1]:
    day  = localDateOf(now, tz) + offset giorni (calendario in tz)
    time = (changeDay && day == changeDay && schedule.previousRevealTime) ? previousRevealTime : revealTime
    candidate = localInstant(day, time, tz)
    if candidate > now: return candidate
  # irraggiungibile con orari validi: lancia un errore

nextOccurrence(time, tz, after) = computeRevealAt({revealTime: time, previousRevealTime: null, revealTimeChangedAt: null}, tz, after)
previousOccurrence(time, tz, at): stesso schema con offset [0, -1] e condizione candidate <= at
```

  "Mezzanotte" funziona da sola: le 00:00 del giorno corrente sono già passate, quindi si prende quelle del giorno dopo, cioè stanotte.
- [ ] **Step 4:** Esegui `pnpm test:unit lib/time`. Atteso: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: compute lantern reveal instants in recipient local time"`

---

### Task 5: Scadenza, fusi orari ed etichette in italiano

**Files:**
- Create: `lib/time/timezone.ts`, `lib/time/format.ts`
- Modify: `lib/time/lantern-times.ts`
- Test: `lib/time/lantern-times.test.ts`, `lib/time/timezone.test.ts`, `lib/time/format.test.ts`

**Interfaces:**
- Consumes: `localDateOf`, `localInstant` (Task 4)
- Produces:
  - `computeExpiresAt(revealAt: Date, recipientTz: string): Date`
  - `isValidTimeZone(tz: string): boolean`
  - `cityFromTimeZone(tz: string): string`: `"America/New_York"` → `"New York"`
  - `formatRevealLabel(revealAt: Date, viewerTz: string, now: Date): string`
  - `formatDepartureLabel(revealAt: Date, viewerTz: string, recipientTz: string, recipientName: string, now: Date): string`
  - `formatCountdown(ms: number): string`

- [ ] **Step 1: Scrivi i test che falliscono**

```ts
test.each([
  ["2026-11-02T20:30:00Z", "Europe/Rome", "2026-11-03T05:00:00.000Z"],      // 21:30 → 06:00
  ["2026-11-02T22:00:00Z", "Europe/Rome", "2026-11-03T06:00:00.000Z"],      // 23:00 → minimo 8 ore
  ["2026-11-02T23:00:00Z", "Europe/Rome", "2026-11-03T07:00:00.000Z"],      // mezzanotte → 08:00
  ["2026-11-03T02:30:00Z", "America/New_York", "2026-11-03T11:00:00.000Z"], // 06:00 a New York
  ["2026-10-24T19:30:00Z", "Europe/Rome", "2026-10-25T05:00:00.000Z"],      // notte del cambio d'ora
])("computeExpiresAt(%s, %s)", (r, tz, exp) => expect(computeExpiresAt(new Date(r), tz).toISOString()).toBe(exp));

test("isValidTimeZone", () => {
  expect(isValidTimeZone("Europe/Rome")).toBe(true);
  expect(isValidTimeZone("Mars/Base")).toBe(false);
  expect(isValidTimeZone("")).toBe(false);
});
test("cityFromTimeZone", () => expect(cityFromTimeZone("America/New_York")).toBe("New York"));

test("formatRevealLabel", () => {
  const now = new Date("2026-11-02T10:00:00Z");
  expect(formatRevealLabel(new Date("2026-11-02T20:30:00Z"), "Europe/Rome", now)).toBe("stasera alle 21:30");
  expect(formatRevealLabel(new Date("2026-11-02T23:00:00Z"), "Europe/Rome", now)).toBe("stanotte a mezzanotte");
  expect(formatRevealLabel(new Date("2026-11-03T20:30:00Z"), "Europe/Rome", now)).toBe("domani alle 21:30");
});
test("formatDepartureLabel mostra l'ora del destinatario se il fuso è diverso", () => {
  const now = new Date("2026-11-02T10:00:00Z");
  expect(formatDepartureLabel(new Date("2026-11-03T02:30:00Z"), "Europe/Rome", "America/New_York", "Marco", now))
    .toBe("partono domani alle 3:30, le 21:30 di Marco");
  expect(formatDepartureLabel(new Date("2026-11-02T20:30:00Z"), "Europe/Rome", "Europe/Rome", "Giulia", now))
    .toBe("partono stasera alle 21:30");
});
test.each([
  [30_000, "tra meno di un minuto"], [60_000, "tra 1 minuto"], [25 * 60_000, "tra 25 minuti"],
  [60 * 60_000, "tra 1 ora"], [4.5 * 3_600_000, "tra 4 ore"],
])("formatCountdown(%d)", (ms, s) => expect(formatCountdown(ms)).toBe(s));
```

- [ ] **Step 2:** Esegui `pnpm test:unit lib/time`. Atteso: FAIL.
- [ ] **Step 3:** Implementa:
  - `computeExpiresAt`: prima delle 06:00 locali strettamente successive a `revealAt` (giorno locale di `revealAt`, altrimenti quello dopo), poi `max` con `revealAt + 8h`.
  - Etichette: "stasera" se il giorno locale coincide con quello di `now`; "stanotte a mezzanotte" se l'ora locale è 00:00 del giorno successivo; "domani alle …" se è il giorno successivo; altrimenti `"il {d MMMM} alle {H:mm}"` con locale `it` di date-fns. Le ore sono senza zero iniziale (`H:mm`).
  - `formatDepartureLabel` antepone `"partono "` e aggiunge `", le {H:mm} di {nome}"` solo se l'ora locale del destinatario all'istante `revealAt` è diversa da quella di chi guarda.
- [ ] **Step 4:** Esegui `pnpm test:unit lib/time`. Atteso: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: add expiry rule, timezone helpers and Italian time labels"`

---

### Task 6: Schema del database, migrazioni e configurazione Better Auth

**Files:**
- Create: `drizzle.config.ts`, `lib/db/client.ts`, `lib/db/schema.ts`, `lib/db/auth-schema.ts` (generato), `lib/auth/auth.ts`, `lib/mail/mailer.ts`, `app/api/auth/[...all]/route.ts`, `tests/helpers/db.ts`, `tests/helpers/global-setup.ts`
- Test: `tests/integration/schema.test.ts`

**Interfaces:**
- Produces:
  - `db`, `type Db` (`lib/db/client.ts`, drizzle con `postgres-js` su `DATABASE_URL`); `createDb(url: string): Db`.
  - Tabelle in `schema.ts` (id `text` con `crypto.randomUUID()` di default, FK `text` verso `user.id` con `onDelete: "cascade"`):
    - **`connections`**: `id`, `userAId`, `userBId`, `status` (`pgEnum`: `pending | active | ended`), `revealTime` text null, `previousRevealTime` text null, `revealTimeChangedAt` timestamptz null, `proposedRevealTime` text null, `proposedBy` text null, `proposedAt` timestamptz null, `createdAt`, `endedAt` null. **Normalizzazione: `userAId < userBId` (confronto tra stringhe).** CHECK `user_a_id < user_b_id`. Indice unico parziale su `(userAId, userBId) WHERE status <> 'ended'`.
    - **`invites`**: `id`, `inviterId`, `code` unico, `proposedRevealTime` text, `expiresAt`, `acceptedAt` null, `acceptedBy` null, `createdAt`.
    - **`lanterns`**: `id`, `connectionId` (FK cascade), `senderId`, `recipientId`, `type` (`pgEnum`: `audio | photo | text | thought`), `text` null, `mediaKey` null, `mediaMime` null, `mediaBytes` integer null, `durationSec` integer null, `status` (`pgEnum`: `uploading | ready`), `revealAt`, `expiresAt`, `savable` boolean, `savedAt` null, `reaction` text null, `reactedAt` null, `notifiedAt` null, `createdAt`. Indici su `(recipientId, revealAt)` e `(connectionId, createdAt)`.
    - **`blocks`**: `blockerId`, `blockedId`, `createdAt`; PK `(blockerId, blockedId)`.
    - **`rateLimits`**: `key` PK, `windowStart` timestamptz, `count` integer.
  - `auth` (`lib/auth/auth.ts`) con: `drizzleAdapter(db, { provider: "pg" })`; `user.additionalFields` = `color` (string, opzionale), `timezone` (string, default `"UTC"`), `allowSaving` (boolean, default `true`); `emailAndPassword: { enabled: process.env.DEMO_LOGIN === "true" && process.env.NODE_ENV !== "production" }` (il login demo non deve mai essere attivo in produzione); plugin `magicLink({ expiresIn: 900, sendMagicLink })` e `nextCookies()`; `rateLimit: { enabled: true, storage: "database" }`.
  - `sendMail({ to, subject, text, html }): Promise<void>` (Nodemailer su `SMTP_HOST` e `SMTP_PORT`).
  - Helper di test: `getTestDb(): Db` (su `DATABASE_URL_TEST`), `resetDb(db): Promise<void>` (TRUNCATE di tutte le tabelle app e auth con CASCADE), `makeUser(db, overrides?)` → riga `user` con default `{ name: "Utente", email: random, color: "#E8A75C", timezone: "Europe/Rome", allowSaving: true }`, `makeConnection(db, a, b, overrides?)` → connessione `active` con `revealTime: "21:30"` e id normalizzati, `makeLantern(db, overrides)` → riga `lanterns` con default `status: "ready"`, `type: "text"`.
  - `global-setup.ts` esegue le migrazioni drizzle su `DATABASE_URL_TEST`.

- [ ] **Step 1:** Installa `drizzle-orm postgres drizzle-kit better-auth nodemailer zod` (+ `@types/nodemailer`). Scrivi `lib/auth/auth.ts` e `lib/mail/mailer.ts`. Genera lo schema auth con `pnpm dlx @better-auth/cli generate --config lib/auth/auth.ts --output lib/db/auth-schema.ts`. Atteso: il file contiene `user`, `session`, `account`, `verification`, `rateLimit`, con `color`, `timezone` e `allowSaving` su `user`.
- [ ] **Step 2:** Scrivi `lib/db/schema.ts` come da Interfaces e `drizzle.config.ts` (schema: entrambi i file, output `lib/db/migrations`). Script: `"db:generate": "drizzle-kit generate"`, `"db:migrate": "drizzle-kit migrate"`. Esegui `pnpm db:generate && pnpm db:migrate`. Atteso: migrazione creata e applicata senza errori.
- [ ] **Step 3:** Monta l'handler in `app/api/auth/[...all]/route.ts` con `toNextJsHandler(auth)` da `better-auth/next-js`.
- [ ] **Step 4: Scrivi i test di integrazione che falliscono**

```ts
beforeEach(() => resetDb(db));
test("una sola connessione non terminata per coppia", async () => {
  const [a, b] = [await makeUser(db), await makeUser(db)];
  await makeConnection(db, a, b);
  await expect(makeConnection(db, a, b)).rejects.toThrow();
});
test("dopo la chiusura ci si può ricollegare", async () => {
  const [a, b] = [await makeUser(db), await makeUser(db)];
  await makeConnection(db, a, b, { status: "ended" });
  await expect(makeConnection(db, a, b)).resolves.toBeDefined();
});
test("CHECK user_a_id < user_b_id", async () => {
  const [a, b] = [await makeUser(db), await makeUser(db)];
  const [lo, hi] = [a.id, b.id].sort();
  await expect(db.insert(connections).values({ userAId: hi, userBId: lo, status: "active" })).rejects.toThrow();
});
```

- [ ] **Step 5:** Esegui `pnpm test:int`. Atteso: FAIL finché helper e global setup non esistono, poi PASS dopo averli scritti.
- [ ] **Step 6: Commit** — `git commit -m "feat: add database schema, migrations and Better Auth config"`

---

### Task 7: Accesso, onboarding e Playwright

**Files:**
- Create: `lib/access/errors.ts`, `lib/access/profile.ts`, `lib/auth/auth-client.ts`, `lib/auth/session.ts`, `lib/lanterns/constants.ts`, `app/(auth)/accedi/page.tsx`, `app/(app)/layout.tsx`, `app/(app)/benvenuto/page.tsx`, `app/(app)/actions/profile.ts`, `playwright.config.ts`, `e2e/helpers.ts`, `e2e/auth.spec.ts`
- Test: `tests/integration/profile.test.ts`, `e2e/auth.spec.ts`

**Interfaces:**
- Consumes: `auth`, `db`, `isValidTimeZone`
- Produces:
  - `authClient` (`createAuthClient` da `better-auth/react` con `magicLinkClient()`)
  - `requireUser(): Promise<User>`: legge la sessione con `auth.api.getSession({ headers: await headers() })`, altrimenti `redirect("/accedi")`
  - `requireOnboardedUser(): Promise<User>`: come sopra, ma reindirizza a `/benvenuto` se `color` è nullo
  - `isOnboarded(user: { color: string | null }): boolean`
  - `COLORS` in `constants.ts`: `[{ id: "ambra", hex: "#E8A75C" }, { id: "terracotta", hex: "#C9694F" }, { id: "salvia", hex: "#8FAE8B" }, { id: "lilla", hex: "#A99BD1" }, { id: "blu-polvere", hex: "#7D9CC0" }, { id: "rosa-antico", hex: "#C98B9B" }, { id: "oro", hex: "#D8BB6A" }, { id: "verde-acqua", hex: "#6FA8A0" }]`
  - `profileSchema` (Zod): `{ name: 1–40 caratteri dopo trim, color: uno degli hex di COLORS, timezone: refine(isValidTimeZone) }`
  - `AccessResult`, `AccessErrorCode`, `ok`, `fail` in `lib/access/errors.ts`, esattamente come definiti nell'Interfaces block del Task 9 (vengono creati qui perché servono già a `saveProfile`)
  - `saveProfile(db, userId, input: unknown): Promise<AccessResult<void>>` in `lib/access/profile.ts`, e la Server Action `updateProfileAction(formData)` in `app/(app)/actions/profile.ts` che la chiama
  - e2e: `loginWithMagicLink(page, email)` (legge l'ultimo messaggio da `http://localhost:8025/api/v1/messages`, estrae il link e lo apre) e `loginAsDemo(page, email)` (form email + password `lanterne-demo`)

- [ ] **Step 1: Scrivi i test di integrazione che falliscono** per `saveProfile`

```ts
test("salva nome, colore e fuso validi", async () => {
  const u = await makeUser(db, { color: null, timezone: "UTC" });
  expect(await saveProfile(db, u.id, { name: "Giulia", color: "#E8A75C", timezone: "Europe/Rome" })).toEqual({ ok: true, value: undefined });
});
test("rifiuta un fuso inventato", async () => {
  const u = await makeUser(db);
  expect(await saveProfile(db, u.id, { name: "Giulia", color: "#E8A75C", timezone: "Mars/Base" })).toEqual({ ok: false, error: "invalid_input" });
});
test("rifiuta un colore fuori palette", async () => {
  const u = await makeUser(db);
  expect(await saveProfile(db, u.id, { name: "Giulia", color: "#FF00FF", timezone: "Europe/Rome" })).toEqual({ ok: false, error: "invalid_input" });
});
```

- [ ] **Step 2:** Esegui `pnpm test:int`. Atteso: FAIL. Implementa `saveProfile`, poi PASS.
- [ ] **Step 3:** Pagine:
  - `/accedi`: campo email → `authClient.signIn.magicLink({ email, callbackURL: "/" })`, poi il messaggio "Ti abbiamo mandato un link: controlla la posta.". Se `DEMO_LOGIN=true`, compaiono anche i pulsanti "Entra come Giulia / Marco / Sara" che chiamano `authClient.signIn.email` con password `lanterne-demo`.
  - `(app)/layout.tsx`: chiama `requireUser()`.
  - `/benvenuto`: nome, scelta colore (8 tondi), fuso precompilato da `Intl.DateTimeFormat().resolvedOptions().timeZone` e modificabile (select su `Intl.supportedValuesOf("timeZone")`), che chiama `updateProfileAction`.
  - Le pagine dell'app, tranne `/benvenuto`, usano `requireOnboardedUser()`.
- [ ] **Step 4:** Configura Playwright:
  - progetto `mobile` con `devices["Pixel 7"]`;
  - `webServer`: `pnpm dev --port 3100` con env `DATABASE_URL=$DATABASE_URL_E2E`, `BETTER_AUTH_URL=http://localhost:3100`, `DEMO_LOGIN=true`;
  - `globalSetup`: migrazioni e TRUNCATE su `lanterne_e2e`, più `DELETE http://localhost:8025/api/v1/messages`.
  Script `"test:e2e": "playwright test"`.
- [ ] **Step 5: Scrivi il test e2e**: `e2e/auth.spec.ts`, "nuovo utente entra con magic link e completa l'onboarding". `loginWithMagicLink(page, "anna@test.local")` porta a `/benvenuto`; dopo nome "Anna", colore ambra e fuso `Europe/Rome` si arriva a `/` con il testo "Le tue persone".
- [ ] **Step 6:** Esegui `pnpm test:e2e e2e/auth.spec.ts`. Atteso: PASS.
- [ ] **Step 7: Commit** — `git commit -m "feat: magic link login, onboarding and Playwright setup"`

---

### Task 8: Rate limit

**Files:**
- Create: `lib/rate-limit.ts`
- Test: `tests/integration/rate-limit.test.ts`

**Interfaces:**
- Produces: `checkRateLimit(db: Db, input: { key: string; limit: number; windowSec: number; now: Date }): Promise<{ ok: true } | { ok: false; retryAfterSec: number }>`, a finestra fissa: se `now ≥ windowStart + windowSec` la finestra si azzera. Upsert atomico con `INSERT … ON CONFLICT (key) DO UPDATE`.
- Costanti in `lib/lanterns/constants.ts`: `RATE_LIMITS = { inviteCreate: { limit: 10, windowSec: 3600 }, inviteAccept: { limit: 20, windowSec: 3600 } }`

- [ ] **Step 1: Scrivi i test che falliscono**

```ts
test("consente fino al limite, poi blocca con retryAfter", async () => {
  const now = new Date("2026-11-02T10:00:00Z");
  for (let i = 0; i < 3; i++) expect(await checkRateLimit(db, { key: "k", limit: 3, windowSec: 60, now })).toEqual({ ok: true });
  expect(await checkRateLimit(db, { key: "k", limit: 3, windowSec: 60, now: new Date("2026-11-02T10:00:20Z") })).toEqual({ ok: false, retryAfterSec: 40 });
});
test("la finestra si azzera", async () => {
  for (let i = 0; i < 3; i++) await checkRateLimit(db, { key: "k", limit: 3, windowSec: 60, now: new Date("2026-11-02T10:00:00Z") });
  expect(await checkRateLimit(db, { key: "k", limit: 3, windowSec: 60, now: new Date("2026-11-02T10:01:00Z") })).toEqual({ ok: true });
});
```

- [ ] **Step 2:** Esegui `pnpm test:int rate-limit`. Atteso: FAIL. Implementa, poi PASS.
- [ ] **Step 3: Commit** — `git commit -m "feat: add Postgres-backed rate limiter"`

---

### Task 9: Inviti e creazione delle connessioni

**Files:**
- Create: `lib/access/invites.ts`, `lib/access/blocks.ts` (solo `isBlockedEitherWay`), `lib/access/connections.ts` (solo `countOpenConnections`)
- Modify: `lib/access/errors.ts` (solo se manca qualche codice)
- Test: `tests/integration/invites.test.ts`

**Interfaces:**
- Consumes: `isAllowedRevealTime`, `checkRateLimit`, `RATE_LIMITS`, `isOnboarded`
- Produces (`errors.ts`, creato nel Task 7; qui l'elenco completo dei codici):
  - `type AccessErrorCode = "not_found" | "forbidden" | "invalid_input" | "onboarding_required" | "invalid_reveal_time" | "invite_invalid" | "invite_expired" | "invite_used" | "self_invite" | "already_connected" | "connection_limit_self" | "connection_limit_other" | "connection_not_active" | "too_late" | "not_savable" | "rate_limited"`
  - `type AccessResult<T> = { ok: true; value: T } | { ok: false; error: AccessErrorCode }`
  - `ok<T>(value: T)`, `fail(error: AccessErrorCode)`
- Produces (`invites.ts`):
  - `createInvite(db, { userId: string; proposedRevealTime: string; now: Date }): Promise<AccessResult<{ code: string; expiresAt: Date }>>`
  - `getInvitePreview(db, { code: string; viewerId: string; now: Date }): Promise<AccessResult<{ inviterName: string; proposedRevealTime: string; expiresAt: Date }>>`
  - `acceptInvite(db, { code: string; userId: string; counterProposal?: string; now: Date }): Promise<AccessResult<{ connectionId: string; status: "active" | "pending" }>>`
- Produces (`connections.ts`): `countOpenConnections(db, userId): Promise<number>` (connessioni `active` + `pending`)
- Produces (`blocks.ts`): `isBlockedEitherWay(db, a: string, b: string): Promise<boolean>`
- `MAX_CONNECTIONS = 5` e `INVITE_TTL_DAYS = 7` in `constants.ts`

**Regole** (in quest'ordine dentro `acceptInvite`, tutto in una transazione con `SELECT … FOR UPDATE` sull'invito):
1. rate limit `invite-accept:{userId}`;
2. invito inesistente → `invite_invalid`;
3. utente non onboarded → `onboarding_required`;
4. `inviterId == userId` → `self_invite`;
5. blocco in **qualsiasi** direzione tra i due → `invite_invalid`;
6. `acceptedAt` valorizzato → `invite_used`;
7. `expiresAt ≤ now` → `invite_expired`;
8. connessione non terminata già esistente → `already_connected`;
9. `countOpenConnections(userId) ≥ 5` → `connection_limit_self`; per l'invitante → `connection_limit_other`;
10. `counterProposal` presente e non valido → `invalid_reveal_time`.

Esito: senza controproposta si crea una connessione `active` con `revealTime = invite.proposedRevealTime`; con controproposta una connessione `pending` con `revealTime = null`, `proposedRevealTime = counterProposal`, `proposedBy = userId`, `proposedAt = now`. In entrambi i casi l'invito viene segnato con `acceptedAt` e `acceptedBy`.

`createInvite`: rate limit `invite-create:{userId}`, poi `onboarding_required`, `invalid_reveal_time`, `connection_limit_self`. Il codice è `randomBytes(16).toString("base64url")`.

- [ ] **Step 1: Scrivi i test che falliscono** (un test per regola, più i casi felici):
  - `createInvite` restituisce un codice di 22 caratteri con `expiresAt` uguale a `now` + 7 giorni;
  - `createInvite` con `"16:00"` → `invalid_reveal_time`; da un utente con `color: null` → `onboarding_required`;
  - `acceptInvite` senza controproposta → `{ status: "active" }` e la connessione ha `revealTime: "21:30"`;
  - con `counterProposal: "22:00"` → `{ status: "pending" }`, con `proposedBy` uguale all'invitato;
  - stesso invito accettato due volte (da due utenti diversi) → il secondo riceve `invite_used`;
  - due `acceptInvite` concorrenti con `Promise.all` → esattamente uno `ok`;
  - invito scaduto (`now` = creazione + 7 giorni) → `invite_expired`;
  - accettazione del proprio invito → `self_invite`;
  - blocco invitato → invitante e blocco invitante → invitato → `invite_invalid` in entrambi i casi;
  - già collegati → `already_connected`;
  - **invitante arrivato a 5 connessioni dopo aver creato l'invito** → `connection_limit_other` (Review Focus 5); invitato con 5 connessioni → `connection_limit_self`;
  - **invitato con `color: null`** → `onboarding_required` (Review Focus 1);
  - `getInvitePreview` su un invito valido restituisce `inviterName` e `proposedRevealTime`.
- [ ] **Step 2:** Esegui `pnpm test:int invites`. Atteso: FAIL.
- [ ] **Step 3:** Implementa secondo le regole sopra.
- [ ] **Step 4:** Esegui `pnpm test:int invites`. Atteso: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: invites and connection creation with limits and blocks"`

---

### Task 10: Proposte d'orario, chiusura e blocco

**Files:**
- Modify: `lib/access/connections.ts`, `lib/access/blocks.ts`
- Test: `tests/integration/connections.test.ts`, `tests/integration/blocks.test.ts`

**Interfaces:**
- Consumes: `AccessResult`, `isAllowedRevealTime`, `computeRevealAt`, `isBlockedEitherWay`
- Produces (`connections.ts`):
  - `type ConnectionSummary = { id: string; status: "pending" | "active" | "ended"; revealTime: string | null; proposedRevealTime: string | null; proposedByMe: boolean; nextArrivalAt: Date | null; partner: { id: string; name: string; color: string; timezone: string } }`
  - `nextArrivalAt` = `computeRevealAt(schedule della connessione, me.timezone, now)`, cioè l'orario **effettivo**, che rispetta il cambio "dal giorno dopo"; `null` se `revealTime` è nullo o la connessione non è `active`
  - `listConnections(db, { userId, now }): Promise<ConnectionSummary[]>`: solo `active` e `pending`
  - `getConnectionForMember(db, { connectionId, userId, now }): Promise<AccessResult<ConnectionSummary>>`: anche `ended`; se l'utente non è membro → `not_found`
  - `proposeRevealTime(db, { connectionId, userId, time, now }): Promise<AccessResult<void>>`: sostituisce l'eventuale proposta in attesa
  - `acceptProposal(db, { connectionId, userId, now }): Promise<AccessResult<void>>`: solo l'**altra** persona può accettare (`forbidden` se `proposedBy == userId`)
  - `rejectProposal(db, { connectionId, userId, now }): Promise<AccessResult<void>>`
  - `endConnection(db, { connectionId, userId, now }): Promise<AccessResult<void>>`
- Produces (`blocks.ts`):
  - `blockUser(db, { blockerId, blockedId, now }): Promise<AccessResult<void>>`
  - `unblockUser(db, { blockerId, blockedId }): Promise<AccessResult<void>>`
  - `listBlocked(db, blockerId): Promise<{ id: string; name: string }[]>`

**Regole:**
- `acceptProposal` su una connessione **pending**: `revealTime ← proposed`, `status ← active`, nessun `previousRevealTime`.
- `acceptProposal` su una connessione **active**: `previousRevealTime ← revealTime`, `revealTime ← proposed`, `revealTimeChangedAt ← now`.
- In entrambi i casi la proposta viene azzerata.
- `rejectProposal`: su una connessione `active` azzera la proposta; su una `pending` chiude la connessione.
- `endConnection`: `status ← ended`, `endedAt ← now`, ed elimina le lanterne della connessione con `savedAt` nullo.
- `blockUser`:
  - inserisce il blocco (idempotente);
  - chiude l'eventuale connessione non terminata, con le stesse regole di `endConnection`;
  - elimina **tutte** le lanterne con `senderId = blocker` e `recipientId = blocked`, comprese quelle salvate.

- [ ] **Step 1: Scrivi i test che falliscono:**
  - proposta su una connessione active seguita da `acceptProposal` dell'altro → `revealTime` nuovo, `previousRevealTime: "21:30"`, `revealTimeChangedAt` uguale a `now`;
  - accettazione della propria proposta → `forbidden`;
  - una nuova proposta sostituisce la precedente;
  - proposta `"16:30"` → `invalid_reveal_time`;
  - `rejectProposal` su una connessione pending → `status: "ended"`;
  - `getConnectionForMember` da un non membro → `not_found`;
  - `endConnection` → le lanterne non salvate spariscono e quelle salvate restano;
  - `blockUser` → connessione `ended`, lanterne del bloccante salvate dal bloccato eliminate, lanterne del bloccato salvate dal bloccante mantenute, `isBlockedEitherWay` vero;
  - `unblockUser` → `isBlockedEitherWay` falso, e la connessione resta `ended`.
- [ ] **Step 2:** Esegui `pnpm test:int connections blocks`. Atteso: FAIL.
- [ ] **Step 3:** Implementa, ogni operazione di scrittura in una transazione.
- [ ] **Step 4:** Esegui `pnpm test:int connections blocks`. Atteso: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: reveal time proposals, ending connections and blocking"`

---

### Task 11: Lanterne di testo e pensiero, visibilità, reazioni e salvataggio

**Files:**
- Create: `lib/access/lanterns.ts`
- Modify: `lib/lanterns/constants.ts`
- Test: `tests/integration/lanterns.test.ts`

**Interfaces:**
- Consumes: `computeRevealAt`, `computeExpiresAt`, `previousOccurrence`, `getConnectionForMember`, `ConnectionSummary`
- Produces (`constants.ts`):
  - `THOUGHTS = [{ id: "ti-penso", text: "ti penso" }, { id: "giornata-pesante", text: "giornata pesante, ci sono" }, { id: "niente-da-raccontare", text: "oggi niente da raccontare, ma ci sono" }, { id: "abbraccio", text: "ti mando un abbraccio" }, { id: "sorriso", text: "un sorriso a caso per te" }]`
  - `REACTIONS = ["💛", "🫂", "😂", "😮", "🌙"]`
  - `TEXT_MAX = 1000`
- Produces (`lanterns.ts`):
  - `type LanternView = { id: string; type: "audio" | "photo" | "text" | "thought"; text: string | null; senderId: string; revealAt: Date; expiresAt: Date; sealed: boolean; savable: boolean; savedAt: Date | null; reaction: string | null; createdAt: Date }`. Per `thought`, `text` contiene l'id del preset.
  - `createTextLantern(db, { connectionId, senderId, text, now }): Promise<AccessResult<LanternView>>`
  - `createThoughtLantern(db, { connectionId, senderId, thoughtId, now }): Promise<AccessResult<LanternView>>`
  - `getChannel(db, { connectionId, userId, now }): Promise<AccessResult<{ connection: ConnectionSummary; sent: LanternView[]; arrived: LanternView[]; memories: LanternView[]; partnerLeftNothing: boolean }>>` (la prossima apertura è `connection.nextArrivalAt`)
  - `deleteLantern(db, { lanternId, userId, now }): Promise<AccessResult<void>>`
  - `reactToLantern(db, { lanternId, userId, reaction: string | null, now }): Promise<AccessResult<void>>`
  - `saveLantern(db, { lanternId, userId, now }): Promise<AccessResult<void>>`

**Regole:**
- **Creazione:**
  - membro + connessione `active`, altrimenti `connection_not_active` (o `not_found` per un non membro);
  - `recipientId` = l'altro membro;
  - `revealAt = computeRevealAt(schedule della connessione, recipient.timezone, now)` e `expiresAt = computeExpiresAt(revealAt, recipient.timezone)`;
  - `savable = sender.allowSaving` e `status = "ready"`;
  - testo trimmato tra 1 e `TEXT_MAX` caratteri, altrimenti `invalid_input`; `thoughtId` non presente in `THOUGHTS` → `invalid_input`.
- **`getChannel`**, tutte le query filtrate per `status = 'ready'`:
  - `sent`: `senderId = me` e `expiresAt > now`, con `sealed = revealAt > now`;
  - `arrived`: `recipientId = me` e `revealAt ≤ now < expiresAt`;
  - `memories`: `recipientId = me` e `savedAt` non nullo;
  - per una connessione `ended`, `sent` e `arrived` sono vuote e si restituiscono solo i `memories`;
  - `partnerLeftNothing = true` se, posto `last = previousOccurrence(revealTime, me.timezone, now)`, vale `now < computeExpiresAt(last, me.timezone)` e non ci sono lanterne ricevute con `revealAt == last`.
- **`deleteLantern`**: solo il mittente (`not_found` per gli altri); se `now ≥ revealAt` → `too_late`.
- **`reactToLantern`** e **`saveLantern`**: solo il destinatario, solo su una lanterna visibile (arrivata e non scaduta, oppure salvata), altrimenti `not_found`. Reazione fuori da `REACTIONS` → `invalid_input`; `null` la rimuove. Salvataggio con `savable = false` → `not_savable`.

- [ ] **Step 1: Scrivi i test che falliscono.** Con Giulia (`Europe/Rome`) e Marco (`America/New_York`), connessione `21:30`, `now = 2026-11-02T22:00:00Z`:
  - `createTextLantern` di Giulia → `revealAt` `2026-11-03T02:30:00.000Z`, `expiresAt` `2026-11-03T11:00:00.000Z`, `sealed: true`;
  - `getChannel` di Marco a `2026-11-03T02:29:00Z` → `arrived` vuoto; a `2026-11-03T02:30:00Z` → 1 lanterna; a `2026-11-03T11:00:00Z` → vuoto;
  - `getChannel` di Giulia a `2026-11-03T03:00:00Z` → la lanterna è in `sent` con `sealed: false`;
  - un **terzo utente** → `not_found` su `getChannel`, `reactToLantern`, `saveLantern` e `deleteLantern` (Review Focus 4);
  - **connessione `pending`** o `ended` → `createTextLantern` dà `connection_not_active` (Review Focus 3);
  - testo vuoto, solo spazi o lungo 1001 caratteri → `invalid_input`; lungo 1000 → ok;
  - `thoughtId: "inventato"` → `invalid_input`;
  - `deleteLantern` del mittente prima di `revealAt` → ok, dopo → `too_late`;
  - `reactToLantern` di Marco con `"💛"` → ok; con `"👍"` → `invalid_input`; dal mittente → `not_found`; prima dell'arrivo → `not_found`;
  - `saveLantern` con `savable: false` → `not_savable`; con `savable: true` → la lanterna compare in `memories` ed è ancora visibile dopo `expiresAt`;
  - `allowSaving` messo a false **dopo** l'invio → la lanterna già inviata resta salvabile;
  - `partnerLeftNothing`: Marco a `2026-11-03T03:00:00Z` senza lanterne di Giulia → `true`; con una lanterna arrivata → `false`; alle `2026-11-02T15:00:00Z` (pomeriggio a New York, la finestra della sera prima è scaduta) → `false`.
- [ ] **Step 2:** Esegui `pnpm test:int lanterns`. Atteso: FAIL.
- [ ] **Step 3:** Implementa.
- [ ] **Step 4:** Esegui `pnpm test:int lanterns`. Atteso: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: text and thought lanterns with server-side visibility rules"`

---

### Task 12: Home e inviti nell'interfaccia

**Files:**
- Create: `lib/messages.ts`, `app/(app)/actions/invites.ts`, `app/(app)/page.tsx`, `app/(app)/invita/page.tsx`, `app/(app)/invito/[code]/page.tsx`, `components/connection-card.tsx`, `components/reveal-time-select.tsx`
- Test: `lib/messages.test.ts`, `e2e/invite.spec.ts`

**Interfaces:**
- Consumes: `listConnections`, `createInvite`, `getInvitePreview`, `acceptInvite`, `getRequestClock`, `requireOnboardedUser`, `formatRevealLabel`
- Produces:
  - `errorMessage(code: AccessErrorCode): string`
  - Server Actions `createInviteAction(formData)`, `acceptInviteAction(formData)`: validano con Zod, chiamano `lib/access` con `(await getRequestClock()).now()`, poi `revalidatePath("/")`. Restituiscono `{ error: string } | { redirectTo: string }`.
  - `<RevealTimeSelect name defaultValue />`: opzioni ogni 15 minuti dalle 17:00 alle 23:45, più "mezzanotte" (valore `00:00`)

**Testi esatti in `errorMessage`:**

| Codice | Testo |
|---|---|
| `invite_invalid` | "Questo invito non è valido." |
| `invite_expired` | "Questo invito è scaduto. Chiedi a chi te l'ha mandato di crearne uno nuovo." |
| `invite_used` | "Questo invito è già stato usato." |
| `self_invite` | "Questo è un tuo invito: mandalo alla persona con cui vuoi collegarti." |
| `already_connected` | "Siete già collegati." |
| `connection_limit_self` | "Hai già 5 persone collegate: per aggiungerne una, chiudi prima una connessione." |
| `connection_limit_other` | "Questa persona ha già 5 connessioni." |
| `connection_not_active` | "Prima dovete mettervi d'accordo sull'orario." |
| `too_late` | "Questa lanterna è già partita." |
| `not_savable` | "Chi l'ha inviata ha scelto di non farla conservare." |
| `rate_limited` | "Piano piano: riprova tra qualche minuto." |
| `invalid_reveal_time` | "Scegli un orario tra le 17:00 e mezzanotte." |
| tutti gli altri | "Qualcosa non è andato, riproviamo tra poco." |

**Pagine:**
- **Home** "Le tue persone": una card per connessione.
  - Una connessione `active` mostra nome, pallino del colore e `formatRevealLabel(nextArrivalAt)`.
  - Una connessione `pending` mostra "In attesa: proposta delle {orario}", con il pulsante "Accetta" se la proposta non è tua.
  - Gli slot liberi, fino a 5, mostrano "Invita qualcuno".
- **`/invita`**: scelta dell'orario, poi il link completo `{BETTER_AUTH_URL}/invito/{code}` con un pulsante "Copia" e la scadenza ("valido 7 giorni").
- **`/invito/[code]`**: "{nome} ti invita: le lanterne arrivano alle {orario}", con "Accetta" e "Proponi un altro orario" (che apre `RevealTimeSelect`). Se non sei loggato, `/accedi?next=/invito/{code}`, e dopo il login si torna all'invito.

- [ ] **Step 1:** Scrivi `lib/messages.test.ts`, che verifica tre righe della tabella e il fallback. Implementa `errorMessage`. Esegui `pnpm test:unit`: PASS.
- [ ] **Step 2: Scrivi il test e2e** `e2e/invite.spec.ts` con due contesti browser:
  - Anna (nuova, `Europe/Rome`) crea un invito alle 21:30 e legge il link;
  - Luca (nuovo, `America/New_York`) apre il link, vede "Anna ti invita", accetta e trova Anna in home;
  - un secondo utente che apre lo stesso link vede "Questo invito è già stato usato.".
- [ ] **Step 3:** Esegui `pnpm test:e2e e2e/invite.spec.ts`. Atteso: FAIL. Implementa pagine e azioni, poi PASS.
- [ ] **Step 4: Commit** — `git commit -m "feat: home, invite creation and acceptance UI"`

---

### Task 13: Il canale (versione schematica)

**Files:**
- Create: `app/(app)/persone/[id]/page.tsx`, `app/(app)/actions/lanterns.ts`, `components/countdown.tsx`, `components/lantern-composer.tsx`, `components/lantern-item.tsx`
- Test: `e2e/channel.spec.ts`

**Interfaces:**
- Consumes: `getChannel`, `createTextLantern`, `createThoughtLantern`, `deleteLantern`, `reactToLantern`, `saveLantern`, `formatDepartureLabel`, `formatCountdown`, `THOUGHTS`, `REACTIONS`
- Produces:
  - Server Actions `sendTextAction`, `sendThoughtAction`, `deleteLanternAction`, `reactAction`, `saveAction`, che seguono lo schema del Task 12 e fanno `revalidatePath("/persone/{id}")`
  - `<Countdown target={iso} serverNow={iso} />`: al mount calcola `skew = serverNow - Date.now()` e ogni 30 secondi mostra `formatCountdown(target - (Date.now() + skew))`

**Contenuto della pagina**, che riceve `serverNow` dal clock della richiesta:
1. Intestazione con il nome dell'amico e il pallino del suo colore. Se `getChannel` dà `not_found` → `notFound()`.
2. **"Arrivate"** (se `arrived` non è vuoto): elenco con contenuto (testo o frase del pensiero), ora di invio nell'ora locale di chi guarda, reazioni (5 pulsanti, quella attiva evidenziata) e "Conserva" se `savable`.
3. Se `partnerLeftNothing`, il testo: "Stasera l'acqua è tranquilla: {nome} non ha lasciato lanterne."
4. **"Le tue lanterne"**: le lanterne di `sent`. Quelle sigillate hanno il pulsante "Elimina"; quelle aperte mostrano la reazione ricevuta e "{nome} l'ha conservata" se `savedAt` è valorizzato. In cima `formatDepartureLabel(…)` per la prossima partenza e il `<Countdown>`.
5. **Composer**: textarea (max 1000 caratteri, con contatore) e "Lascia la lanterna", più una riga di pulsanti per i 5 pensieri.
6. **"Ricordi"**: le lanterne in `memories`.
7. Per una connessione `ended`, solo i Ricordi, con il testo "Questa connessione è chiusa.".

- [ ] **Step 1: Scrivi il test e2e** `e2e/channel.spec.ts` (Anna e Luca collegati tramite gli helper del Task 12):
  - Anna invia il testo "il tramonto dal tram oggi era assurdo" e il pensiero "ti penso", e li vede in "Le tue lanterne" con l'etichetta di partenza;
  - Luca, prima dell'arrivo, non vede "Arrivate";
  - Luca imposta il cookie `lanterne-dev-offset` per portarsi a 1 minuto dopo il `revealAt` (calcolato nel test con `computeRevealAt` sui dati dell'utente), ricarica e vede entrambe le lanterne;
  - Luca reagisce con 💛 e conserva il testo; Anna, con lo stesso offset, vede "Luca l'ha conservata";
  - **un terzo utente che apre `/persone/{id}` riceve 404** (Review Focus 4).
- [ ] **Step 2:** Esegui `pnpm test:e2e e2e/channel.spec.ts`. Atteso: FAIL. Implementa, poi PASS.
- [ ] **Step 3: Commit** — `git commit -m "feat: schematic channel page with sending, arrival, reactions and memories"`

---

### Task 14: Impostazioni, gestione della connessione e banner del fuso

**Files:**
- Create: `app/(app)/impostazioni/page.tsx`, `app/(app)/actions/settings.ts`, `app/(app)/actions/connections.ts`, `components/timezone-banner.tsx`, `components/connection-menu.tsx`
- Modify: `lib/access/profile.ts`, `app/(app)/layout.tsx`, `app/(app)/persone/[id]/page.tsx`
- Test: `tests/integration/profile.test.ts`, `e2e/manage.spec.ts`

**Interfaces:**
- Consumes: `saveProfile`, `proposeRevealTime`, `acceptProposal`, `rejectProposal`, `endConnection`, `blockUser`, `unblockUser`, `listBlocked`, `cityFromTimeZone`, `isValidTimeZone`
- Produces:
  - `setAllowSaving(db, userId, value: boolean): Promise<AccessResult<void>>` in `lib/access/profile.ts`
  - `updateTimezone(db, userId, tz: string): Promise<AccessResult<void>>`: `invalid_input` se il fuso non è valido
  - Server Actions corrispondenti, più `proposeTimeAction`, `acceptProposalAction`, `rejectProposalAction`, `endConnectionAction`, `blockAction`, `unblockAction`

**Pagine:**
- **`/impostazioni`**: nome, colore, fuso (con `profileSchema`); interruttore "Permetti di conservare le mie lanterne" con la nota "Vale per le lanterne che invierai da ora in poi"; elenco "Persone bloccate" con "Sblocca"; "Esci" (`authClient.signOut`).
- **Menu della connessione** nella pagina del canale:
  - "Cambia orario", con il testo "Il nuovo orario varrà da domani, se {nome} accetta";
  - accetta o rifiuta una proposta in attesa;
  - "Chiudi la connessione", con conferma inline (niente `window.confirm`) e il testo "Le lanterne non ancora arrivate verranno eliminate. I ricordi restano.";
  - "Blocca", con conferma inline e il testo "{nome} non potrà più invitarti e le tue lanterne che ha conservato verranno eliminate.".
- **`<TimezoneBanner userTz>`** nel layout:
  - se `Intl.DateTimeFormat().resolvedOptions().timeZone !== userTz`, mostra "Sei a {cityFromTimeZone(tz)}? Aggiorno il tuo fuso orario?" con "Sì" (chiama `updateTimezoneAction`) e "No";
  - il "No" viene ricordato in `localStorage` (con try/catch) sulla chiave `lanterne-tz-dismissed:{tz}`.

- [ ] **Step 1: Scrivi i test di integrazione che falliscono:** `updateTimezone` con `"Mars/Base"` → `invalid_input` (Review Focus 2) e con `"Asia/Tokyo"` → ok; `setAllowSaving(false)` → le lanterne create dopo hanno `savable: false`.
- [ ] **Step 2:** Esegui `pnpm test:int profile`. Atteso: FAIL. Implementa, poi PASS.
- [ ] **Step 3: Scrivi il test e2e** `e2e/manage.spec.ts`:
  - prima di tutto, entrambi impostano il cookie `lanterne-dev-offset` in modo che l'ora simulata sia le 10:00 di Roma di oggi, così il test non dipende da quando gira;
  - Anna propone 22:00, Luca accetta e la home di Anna mostra ancora "stasera alle 21:30" (il nuovo orario vale da domani);
  - Anna blocca Luca e la connessione sparisce dalla home di entrambi;
  - Luca crea un nuovo invito e Anna, aprendolo, vede "Questo invito non è valido.".
  - Usa `page.emulateTimezone` (o l'opzione `timezoneId` del contesto) con `Asia/Tokyo` per verificare che compaia il banner "Sei a Tokyo?".
- [ ] **Step 4:** Esegui `pnpm test:e2e e2e/manage.spec.ts`. Atteso: FAIL. Implementa, poi PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: settings, connection management and timezone banner"`

---

### Task 15: Dati demo, setup in un comando e pannello "viaggio nel tempo"

**Files:**
- Create: `scripts/seed.ts`, `scripts/setup.ts`, `components/dev-time-panel.tsx`, `app/(app)/actions/dev.ts`, `e2e/full-flow.spec.ts`, `README.md` (versione minima)
- Modify: `app/(app)/layout.tsx`, `package.json`

**Interfaces:**
- Consumes: `auth.api.signUpEmail`, `computeRevealAt`, `computeExpiresAt`, `DEV_OFFSET_COOKIE`, `parseDevOffset`
- Produces:
  - `pnpm db:seed` (`tsx scripts/seed.ts`): idempotente, cancella e ricrea i dati demo;
  - `pnpm setup` (`tsx scripts/setup.ts`): copia `.env.example` in `.env` se manca, genera `BETTER_AUTH_SECRET` casuale se vuoto, esegue `db:migrate` e `db:seed`, poi stampa le istruzioni;
  - `setDevOffsetAction(ms: number)`: lancia un errore se `NODE_ENV !== "development"`; imposta il cookie `DEV_OFFSET_COOKIE`;
  - `<DevTimePanel offsetMs />`: renderizzato nel layout solo in development; pulsanti "+1 ora", "+6 ore", "Domani mattina" (prossime 08:00 locali), "Torna a ora", e l'ora corrente simulata.

**Dati demo** (password `lanterne-demo` per tutti, creati con `auth.api.signUpEmail`, poi aggiornati con colore e fuso):
- **Utenti:** Giulia `giulia@lanterne.local`, `Europe/Rome`, ambra; Marco `marco@lanterne.local`, `America/New_York`, lilla; Sara `sara@lanterne.local`, `Europe/Rome`, salvia.
- **Connessioni:** Giulia–Marco `active` alle `21:30`; Giulia–Sara `active` alle `22:00`; Marco–Sara `pending` con proposta `21:00` da Sara.
- **Lanterne** (scritte direttamente nel db, con istanti relativi all'esecuzione del seed):
  - Marco → Giulia: due testi e un pensiero **arrivati** (`revealAt = now − 1h`, `expiresAt = now + 7h`);
  - Giulia → Marco: un testo **sigillato** (`revealAt` = prossima apertura reale per Marco);
  - Sara → Giulia: un testo **conservato** (`savedAt` valorizzato, `expiresAt` nel passato).

- [ ] **Step 1:** Implementa `seed.ts` e `setup.ts`. Verifica: `docker compose up -d && pnpm setup && pnpm dev`. Entrando come Giulia, la home mostra Marco e Sara; il canale con Marco mostra 3 lanterne arrivate; i Ricordi del canale con Sara mostrano 1 lanterna.
- [ ] **Step 2:** Implementa il pannello e l'azione. Verifica manuale: entrando come Marco, "+6 ore" sposta il conto alla rovescia e, superata la sua apertura, il testo di Giulia compare in "Arrivate".
- [ ] **Step 3: Scrivi il test e2e** `e2e/full-flow.spec.ts`, il flusso completo della spec §12 per la parte di questo piano:
  - due nuovi utenti via magic link;
  - onboarding con fusi diversi (`Europe/Rome`, `America/New_York`);
  - invito e accettazione;
  - invio di testo e pensiero;
  - salto nel tempo con il pannello fino a dopo l'arrivo;
  - reazione e salvataggio;
  - il mittente vede reazione e "l'ha conservata".
- [ ] **Step 4:** Esegui `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:int && pnpm test:e2e`. Atteso: tutto verde.
- [ ] **Step 5:** Scrivi un `README.md` minimo: cos'è (2 righe), prerequisiti (Node LTS, pnpm, Docker), avvio rapido (`docker compose up -d`, `pnpm setup`, `pnpm dev`), utenti demo, Mailpit su `http://localhost:8025`, comandi di test. Il README completo arriva nel Piano 3.
- [ ] **Step 6: Commit** — `git commit -m "feat: demo data, one-command setup and dev time travel panel"`
