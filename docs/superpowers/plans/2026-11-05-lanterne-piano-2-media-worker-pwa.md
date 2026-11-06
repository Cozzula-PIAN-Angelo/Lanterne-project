# Lanterne — Piano 2: media, worker e PWA

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere a Lanterne vocali e foto su storage privato, il worker per notifiche e pulizia, l'eliminazione dell'account, l'installazione come PWA, le notifiche push e l'invio dei vocali rimasti offline.

**Architecture:** I file passano direttamente dal browser a uno storage compatibile S3 con URL firmati. Tutte le regole restano in `lib/access`, che riceve `db`, `storage` e `now`. Un worker pg-boss separato chiama funzioni di `lib/access` testabili senza pg-boss, e un suo ritardo non cambia mai la visibilità. Il service worker gestisce push e pagina offline, senza mettere in cache le pagine autenticate.

**Tech Stack:** Next.js 16.4 con `cacheComponents`, PostgreSQL 18, Drizzle, MinIO (S3), `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `pg-boss` 12, `web-push`, `idb`, `concurrently`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-02-lanterne-design.md`

**Fuori da questo piano (Piano 3):** il lago e le fasi del cielo, suncalc, Ricordi rifiniti, pagine Privacy e "Se stai male", README definitivo, CI.

## Decisioni già prese con l'utente

- **iPhone:** la verifica si fa su Chrome desktop e su Android. iPhone resta dichiarato "non verificato"; la conversione con ffmpeg si aggiunge solo se un test futuro la richiede. Il primo task del piano quindi non è più la prova su Safari.
- **Chiusura:** resta il comportamento attuale (spariscono tutte le lanterne non conservate). Cambiano il testo dell'interfaccia e la spec.
- **Branch:** `piano-2`, partito da `main` dopo il merge della PR del Piano 1.
- **Niente Docker né permessi di amministratore:** MinIO e `adb` si installano con Scoop.

## Decisioni tecniche di questo piano

- **Limite di dimensione sugli upload:** PUT firmato con `content-length` e `content-type` nella firma, più controllo con `HeadObject` alla conferma. Il POST firmato con `content-length-range` non è supportato da Cloudflare R2, che la spec indica come possibile destinazione.
- **Cancellazione dei file:** un trigger Postgres su `lanterns` scrive ogni `media_key` eliminata in `storage_deletions`, e il worker svuota la tabella. Così nessun percorso può dimenticare un file, nemmeno le cascate da `user` o `connections`. Differenza dalla spec §8: la riga sparisce prima dell'oggetto, che però resta in coda finché la cancellazione non riesce.
- **Prova su telefono:** `adb reverse` espone `localhost` su Android via USB. Chrome considera `localhost` un contesto sicuro, quindi microfono, service worker e push funzionano senza HTTPS e senza rete locale.
- **Notifiche:** prima si marca `notifiedAt` con un `UPDATE … RETURNING`, poi si invia. Una notifica può andare persa se l'invio fallisce, ma non può mai arrivare due volte.
- **Durata dichiarata dal client:** il server controlla che `durationSec` sia tra 1 e 600, ma non decodifica l'audio. Il limite di byte resta comunque imposto dallo storage.

## Global Constraints

- Lingua dell'interfaccia: **italiano**. Tono dei messaggi calmo e senza colpe.
- Prima di scrivere codice Next leggere la guida in `node_modules/next/dist/docs/`; per la PWA: `01-app/02-guides/progressive-web-apps.md`.
- Nessuna chiamata a `new Date()` senza argomenti fuori da `lib/clock`. Il worker usa `systemClock` e ignora il cookie del viaggio nel tempo.
- Le regole di visibilità ricevono `now` come parametro. Ogni pagina nuova sotto `app/(app)` ha il suo `loading.tsx`.
- **Vocale:** massimo **10 minuti** e **25 MB**. Tetto di **60 minuti di audio al giorno per connessione** per mittente, nel giorno locale del mittente. Messaggio: "Per oggi il lago è pieno".
- **Foto:** una per lanterna, massimo **10 MB**, ricompressa sul telefono a **massimo 2048 px**, senza metadati EXIF.
- **URL firmati:** validi **5 minuti**, in upload e in lettura. Bucket privato, chiavi casuali non indovinabili.
- **Formati vocali, in ordine:** `audio/mp4;codecs=mp4a.40.2`, `audio/mp4`, `audio/webm;codecs=opus`, `audio/webm`.
- **Worker:** notifiche ogni minuto; pulizia delle scadute e degli upload abbandonati ogni 15 minuti; `uploading` da più di **un'ora** viene eliminata.
- **Testo della notifica:** "Le lanterne di Giulia sono arrivate". Mai il contenuto della lanterna. Nessuna notifica per l'assenza.
- **Sottoscrizioni push:** rimosse quando il servizio risponde 404 o 410.
- **Log:** non contengono mai i contenuti delle lanterne.
- Ogni task aggiorna `docs/sviluppo.md` nello stesso commit.

## Review Focus

1. **File caricato diverso da quanto dichiarato** (più grande, più piccolo, altro tipo) → la conferma lo rifiuta ed elimina lanterna e oggetto. *Test nel Task 2.*
2. **`.env` di chi ha già fatto il setup del Piano 1**, senza le variabili nuove → `pnpm run setup` le aggiunge senza toccare i valori esistenti. *Test nel Task 1.*
3. **Connessione chiusa o bloccata mentre un upload è in corso, o mentre un vocale aspetta la rete** → nessuna lanterna compare, l'oggetto viene eliminato e la coda mostra un messaggio invece di riprovare all'infinito. *Test nei Task 2 e 11.*
4. **Uscita dall'account con vocali ancora in coda su un dispositivo condiviso** → l'app avvisa e poi cancella la coda: il prossimo utente non può né vederli né inviarli a nome di altri. *Test nel Task 11.*
5. **Sottoscrizione push con `endpoint` non HTTPS** → rifiutata, perché il worker farebbe richieste verso un indirizzo scelto dal client. *Test nel Task 10.*

---

## Struttura dei file

```
docker-compose.yml, .env.example, scripts/setup.ts   + MinIO, S3, VAPID
lib/setup/env-file.ts           aggiunge le chiavi mancanti, genera i segreti vuoti
lib/storage/s3.ts               MediaStorage: firma, stat, rimozione
lib/storage/client.ts           istanza condivisa, server-only
lib/lanterns/media.ts           limiti e tipi ammessi
lib/lanterns/recorder-mime.ts   scelta del formato (pura)
lib/lanterns/photo-size.ts      calcolo delle dimensioni (puro)
lib/access/media.ts             createMediaLantern, confirmMediaLantern, getMediaUrl
lib/access/cleanup.ts           cleanupExpired, cleanupAbandoned, drainStorageDeletions
lib/access/account.ts           deleteAccount
lib/access/push.ts              savePushSubscription, removePushSubscription, notifyArrivals
lib/push/sender.ts              PushSender con web-push
lib/client/upload-media.ts      request → PUT → confirm, lato browser
lib/client/outbox.ts            coda offline (logica)
lib/client/outbox-store.ts      coda offline (IndexedDB con idb)
worker/index.ts, worker/jobs.ts processo pg-boss
app/(app)/actions/media.ts, push.ts, account.ts
app/manifest.ts, app/offline/page.tsx, public/sw.js, public/icon-*.png
components/audio-recorder.tsx, photo-picker.tsx, media-player.tsx
components/outbox-panel.tsx, push-toggle.tsx, delete-account-form.tsx, pwa-register.tsx
```

---

# Blocco A — Media

### Task 1: Storage S3 e variabili d'ambiente

**Files:**
- Create: `lib/storage/s3.ts`, `lib/storage/client.ts`, `tests/integration/storage.test.ts`
- Modify: `lib/setup/env-file.ts`, `lib/setup/env-file.test.ts`, `scripts/setup.ts`, `.env.example`, `docker-compose.yml`, `vitest.config.ts`, `tests/helpers/global-setup.ts`, `e2e/global-setup.ts`, `playwright.config.ts`, `README.md`, `docs/sviluppo.md`, `package.json`

**Interfaces:**
- Produces:
  ```ts
  export type MediaStorage = {
    signUpload(input: { key: string; mime: string; bytes: number }): Promise<{ url: string; headers: Record<string, string> }>;
    signRead(key: string): Promise<string>;
    stat(key: string): Promise<{ bytes: number; mime: string } | null>;
    remove(key: string): Promise<void>;
    ensureBucket(): Promise<void>;
  };
  export function createStorage(env: NodeJS.ProcessEnv): MediaStorage;
  // lib/setup/env-file.ts
  export function prepareEnvFile(example: string, existing: string | undefined, generated: Record<string, string>): string;
  ```

- [ ] **Step 1: Installa i servizi**

Run: `scoop install minio`, `pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner web-push` e `pnpm add -D @types/web-push cross-env`.
Aggiungi a `package.json` lo script `"minio": "cross-env MINIO_ROOT_USER=lanterne MINIO_ROOT_PASSWORD=lanterne-dev minio server .minio-data --address :9000 --console-address :9001"` e `.minio-data/` a `.gitignore`, poi lancia `pnpm minio`.
Expected: `curl -s -o /dev/null -w "%{http_code}" http://localhost:9000/minio/health/live` stampa `200`.

Aggiungi a `.env.example`: `S3_ENDPOINT=http://localhost:9000`, `S3_PUBLIC_ENDPOINT=http://localhost:9000`, `S3_REGION=us-east-1`, `S3_ACCESS_KEY=lanterne`, `S3_SECRET_KEY=lanterne-dev`, `S3_BUCKET=lanterne`, `S3_BUCKET_TEST=lanterne-test`, `S3_BUCKET_E2E=lanterne-e2e`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY=`, `VAPID_PRIVATE_KEY=`, `VAPID_SUBJECT=mailto:ciao@lanterne.local`.

- [ ] **Step 2: Scrivi i test che falliscono**

In `lib/setup/env-file.test.ts`:
```ts
test("aggiunge le chiavi nuove a un .env esistente senza toccare le altre", () => {
  const result = prepareEnvFile("A=1\nS3_BUCKET=lanterne\n", "A=personale\n", {});
  expect(result).toContain("A=personale");
  expect(result).toContain("S3_BUCKET=lanterne");
});
test("genera solo i segreti vuoti", () => {
  const result = prepareEnvFile("BETTER_AUTH_SECRET=\nVAPID_PRIVATE_KEY=\n", "BETTER_AUTH_SECRET=gia\nVAPID_PRIVATE_KEY=\n", { BETTER_AUTH_SECRET: "x", VAPID_PRIVATE_KEY: "y" });
  expect(result).toContain("BETTER_AUTH_SECRET=gia");
  expect(result).toContain("VAPID_PRIVATE_KEY=y");
});
```

In `tests/integration/storage.test.ts`, su `S3_BUCKET_TEST`:
- `"un PUT con la dimensione firmata riesce e stat la legge"`: firma `{ key, mime: "audio/webm", bytes: 4 }`, `fetch` PUT di 4 byte con `headers`, poi `stat(key)` uguale a `{ bytes: 4, mime: "audio/webm" }`.
- `"un PUT con un'altra dimensione viene rifiutato"`: firma 4 byte, PUT di 5 byte, `res.ok` è `false`, `stat(key)` è `null`.
- `"un PUT con un altro tipo viene rifiutato"`: firma `audio/webm`, PUT con `image/jpeg`, `res.ok` è `false`.
- `"senza firma l'oggetto non si legge"`: dopo un upload, `fetch` dell'URL senza query dà `403`.
- `"la lettura firmata funziona"` e `"remove è idempotente"`: due `remove` consecutive non lanciano, `stat` poi è `null`.

- [ ] **Step 3: Verifica che falliscano**

Run: `pnpm test:unit lib/setup/env-file.test.ts` e `pnpm test:int tests/integration/storage.test.ts`
Expected: FAIL, `createStorage` non esiste e le chiavi nuove mancano.

- [ ] **Step 4: Implementa**

`createStorage` crea due `S3Client`: uno su `S3_ENDPOINT` per le chiamate del server, uno su `S3_PUBLIC_ENDPOINT` per firmare gli URL usati dal browser. Entrambi con `forcePathStyle: true` e `requestChecksumCalculation: "WHEN_REQUIRED"`, altrimenti l'SDK aggiunge all'URL un checksum che il browser non può rispettare. `signUpload` usa `getSignedUrl(client, new PutObjectCommand({ Bucket, Key, ContentType, ContentLength }), { expiresIn: 300, signableHeaders: new Set(["content-type", "content-length"]) })` e restituisce `headers: { "Content-Type": mime }`: `Content-Length` lo imposta il browser. `stat` restituisce `null` su `NotFound`.

`prepareEnvFile` riempie i valori vuoti da `generated` e appende le chiavi dell'esempio assenti da `existing`. Conserva CRLF: i test esistenti devono restare verdi.

`scripts/setup.ts` genera `BETTER_AUTH_SECRET` e la coppia VAPID con `webPush.generateVAPIDKeys()`, e chiama `ensureBucket()` per i tre bucket. `tests/helpers/global-setup.ts` e `e2e/global-setup.ts` creano il proprio bucket. Vitest passa `S3_BUCKET: env.S3_BUCKET_TEST` al progetto `integration`; Playwright passa `S3_BUCKET_E2E` al web server.

Aggiungi a `docker-compose.yml` il servizio `minio` con le stesse credenziali e porte 9000 e 9001.

- [ ] **Step 5: Verifica che passino**

Run: `pnpm test:unit` e `pnpm test:int`
Expected: PASS, compresi i test già esistenti. Se il test "altra dimensione" passa senza rifiuto, la firma non copre l'header: correggi la firma, non il test.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add S3 media storage with signed size and type"
```

### Task 2: Lanterne multimediali in `lib/access`

**Files:**
- Create: `lib/lanterns/media.ts`, `lib/lanterns/media.test.ts`, `lib/access/media.ts`, `tests/integration/media.test.ts`, migrazioni in `lib/db/migrations/`
- Modify: `lib/db/schema.ts`, `lib/access/errors.ts`, `lib/access/lanterns.ts`, `lib/lanterns/constants.ts`, `lib/lanterns/content.ts`, `lib/messages.ts`, `tests/helpers/db.ts`, `docs/sviluppo.md`

**Interfaces:**
- Consumes: `MediaStorage` (Task 1), `computeRevealAt`, `computeExpiresAt`, `checkRateLimit`
- Produces:
  ```ts
  // lib/lanterns/media.ts
  export const AUDIO_MAX_SEC = 600, AUDIO_MAX_BYTES = 25 * 1024 * 1024, PHOTO_MAX_BYTES = 10 * 1024 * 1024;
  export const DAILY_AUDIO_SEC = 3600, PHOTO_MAX_PX = 2048;
  export const AUDIO_MIMES = ["audio/mp4", "audio/webm"] as const, PHOTO_MIMES = ["image/jpeg"] as const;
  export function baseMime(mime: string): string; // "audio/mp4;codecs=opus" → "audio/mp4"
  // lib/access/media.ts
  export type MediaInput = { connectionId: string; senderId: string; type: "audio" | "photo"; mime: string; bytes: number; durationSec?: number; now: Date };
  export function createMediaLantern(db: Db, storage: MediaStorage, input: MediaInput): Promise<AccessResult<{ lanternId: string; uploadUrl: string; uploadHeaders: Record<string, string>; revealAt: Date }>>;
  export function confirmMediaLantern(db: Db, storage: MediaStorage, input: { lanternId: string; userId: string }): Promise<AccessResult<void>>;
  export function getMediaUrl(db: Db, storage: MediaStorage, input: { lanternId: string; userId: string; now: Date }): Promise<AccessResult<{ url: string; mime: string }>>;
  ```
  Nuovi `AccessErrorCode`: `audio_cap_reached`, `upload_missing`, `upload_invalid`. `RATE_LIMITS.upload = { limit: 120, windowSec: 3600 }`. `LanternView` aggiunge `mediaMime` e `durationSec`, mai `mediaKey`. Tabella `storage_deletions(key text primary key, created_at timestamptz not null default now())`.

- [ ] **Step 1: Scrivi i test che falliscono**

In `tests/integration/media.test.ts`, con un `MediaStorage` reale su MinIO:

```ts
test("il vocale nasce uploading e diventa ready solo dopo la conferma")
test("arrivo e scadenza si calcolano alla creazione, nel fuso del destinatario")
test("rifiuta tipo, dimensione o durata fuori limite con invalid_input") // 26 MB, 601 s, 0 s, video/mp4, foto da 11 MB
test("rifiuta su connessione pending o ended con connection_not_active")
test("un estraneo riceve not_found")
test("il tetto vale 60 minuti al giorno per connessione e mittente") // 3000 s + 700 s → audio_cap_reached
test("il tetto riparte a mezzanotte del mittente e non conta gli altri")
test("una lanterna eliminata restituisce i suoi minuti")
test("gli upload abbandonati da oltre 5 minuti non consumano il tetto")
test("120 richieste all'ora, poi rate_limited")
test("confirm senza file: upload_missing, la lanterna resta uploading")
test("confirm con dimensione o tipo diversi: upload_invalid, riga eliminata e chiave in coda") // Review Focus 1
test("confirm due volte è idempotente; un altro utente riceve not_found")
test("connessione chiusa durante l'upload: confirm dà not_found e la chiave è in coda") // Review Focus 3
test("eliminare user o connessione mette in coda le chiavi a cascata")
test("getMediaUrl: destinatario solo da revealAt a expiresAt, oppure se conservata")
test("getMediaUrl: mittente fino a expiresAt, estraneo not_found, uploading not_found")
test("getChannel non espone mai mediaKey e nasconde le uploading")
```

In `lib/lanterns/media.test.ts`: `baseMime` con e senza parametri, maiuscole comprese.

- [ ] **Step 2: Verifica che falliscano**

Run: `pnpm test:int tests/integration/media.test.ts`
Expected: FAIL, `createMediaLantern` non esiste.

- [ ] **Step 3: Aggiungi tabella e trigger**

Aggiungi `storageDeletions` allo schema e a `TABLES` in `tests/helpers/db.ts`. Esegui `pnpm db:generate`, poi `pnpm drizzle-kit generate --custom --name=storage_deletion_trigger` con questo SQL:

```sql
CREATE FUNCTION enqueue_storage_deletion() RETURNS trigger AS $$
BEGIN
  INSERT INTO storage_deletions (key) VALUES (OLD.media_key) ON CONFLICT DO NOTHING;
  RETURN OLD;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER lanterns_media_deleted AFTER DELETE ON lanterns
FOR EACH ROW WHEN (OLD.media_key IS NOT NULL)
EXECUTE FUNCTION enqueue_storage_deletion();
```

- [ ] **Step 4: Implementa `lib/access/media.ts`**

Estrai da `createLantern` di `lib/access/lanterns.ts` un helper `openConnectionForSender(tx, connectionId, senderId)` con il lock `FOR SHARE`, riusato da entrambi i percorsi.

`createMediaLantern`, in quest'ordine: limite di frequenza; validazione di tipo, byte e durata con `baseMime`; transazione con il lock; per l'audio, somma di `durationSec` delle righe del mittente sulla connessione con `createdAt` dalla mezzanotte locale del mittente, contando `ready` e `uploading` create negli ultimi 5 minuti; inserimento `uploading` con `mediaKey = "media/" + randomUUID()` e `savable` dal mittente. La firma avviene dopo il commit.

`confirmMediaLantern`: la riga deve essere del mittente. Se è già `ready`, restituisce ok. `stat` nullo → `upload_missing`. Dimensione o tipo diversi da `mediaBytes` e `mediaMime` → elimina la riga e restituisce `upload_invalid`. Altrimenti `status = "ready"`.

`getMediaUrl`: per il destinatario riusa `findVisibleForRecipient`, che va esportata; per il mittente, riga propria `ready` con `now < expiresAt`. In ogni altro caso `not_found`, senza firmare nulla.

Aggiungi a `lib/messages.ts`: `audio_cap_reached: "Per oggi il lago è pieno."`, `upload_missing: "Il file non è arrivato, riproviamo."`, `upload_invalid: "Questo file non si può inviare."`. `lanternContent` restituisce `"Vocale, N minuti"` e `"Foto"` per i tipi nuovi.

- [ ] **Step 5: Verifica che passino**

Run: `pnpm test:int` e `pnpm test:unit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: media lanterns with confirmed uploads, audio cap and deletion queue"
```

### Task 3: Registrazione e ascolto dei vocali

**Files:**
- Create: `lib/lanterns/recorder-mime.ts`, `lib/lanterns/recorder-mime.test.ts`, `lib/lanterns/labels.ts`, `lib/lanterns/labels.test.ts`, `lib/client/upload-media.ts`, `app/(app)/actions/media.ts`, `components/audio-recorder.tsx`, `components/media-player.tsx`, `e2e/media.spec.ts`
- Modify: `components/lantern-composer.tsx`, `components/lantern-item.tsx`, `playwright.config.ts`, `docs/sviluppo.md`

**Interfaces:**
- Consumes: `createMediaLantern`, `confirmMediaLantern`, `getMediaUrl` (Task 2)
- Produces:
  ```ts
  export function pickRecorderMime(isTypeSupported: (mime: string) => boolean): string | null;
  export function lanternLabel(input: { type: LanternView["type"]; senderName: string; durationSec: number | null; createdAt: Date; viewerTz: string }): string;
  // app/(app)/actions/media.ts
  export type UploadTicket = { lanternId: string; uploadUrl: string; uploadHeaders: Record<string, string>; revealAt: string };
  export function requestUploadAction(input: { connectionId: string; type: "audio" | "photo"; mime: string; bytes: number; durationSec?: number }): Promise<{ error: string } | UploadTicket>;
  export function confirmUploadAction(input: { connectionId: string; lanternId: string }): Promise<ActionResult>;
  export function mediaUrlAction(input: { lanternId: string }): Promise<{ error: string } | { url: string; mime: string }>;
  // lib/client/upload-media.ts
  export type UploadOutcome = { kind: "sent"; revealAt: string } | { kind: "network" } | { kind: "rejected"; message: string };
  export function uploadMedia(input: { connectionId: string; type: "audio" | "photo"; blob: Blob; durationSec?: number }): Promise<UploadOutcome>;
  ```

- [ ] **Step 1: Scrivi i test che falliscono**

In `recorder-mime.test.ts`: preferisce `audio/mp4;codecs=mp4a.40.2`; ripiega su `audio/mp4`, poi `audio/webm;codecs=opus`, poi `audio/webm`; restituisce `null` se non ce n'è nessuno.

In `labels.test.ts`: `"Vocale di Giulia, 3 minuti, delle 9:14"`, `"Vocale di Giulia, meno di un minuto, delle 9:14"`, `"Foto di Giulia, delle 9:14"`, `"Testo di Giulia, delle 9:14"`.

In `e2e/media.spec.ts`, con Chromium avviato da `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`:

```ts
test("un vocale si registra, parte all'orario e si ascolta", async ({ browser }) => {
  // connectPair, Giulia tocca "Registra", dopo 1 s "Ferma e invia".
  // Vede "Vocale" tra le sue lanterne, sigillata e riascoltabile.
  // Marco non lo vede; setClockOffset oltre l'orario; Marco tocca "Ascolta".
  // L'elemento <audio> ha un src firmato; page.request.get(src) risponde 200 con byte > 0.
});
test("senza permesso del microfono restano testo e pensieri", async ({ browser }) => {
  // Context senza fake UI: stubba getUserMedia con un NotAllowedError.
  // Vede la spiegazione per riattivarlo; il campo di testo resta utilizzabile.
});
test("il browser senza MediaRecorder avvisa e nasconde il pulsante", async ({ browser }) => { /* addInitScript: delete window.MediaRecorder */ });
```

- [ ] **Step 2: Verifica che falliscano**

Run: `pnpm test:unit lib/lanterns` e `pnpm test:e2e e2e/media.spec.ts`
Expected: FAIL, moduli e pulsanti mancanti.

- [ ] **Step 3: Implementa**

Le azioni usano `requestContext` come `actions/lanterns.ts`, validano con Zod e chiamano `revalidatePath` alla conferma. `uploadMedia` chiama `requestUploadAction`, fa il PUT con `fetch` e poi `confirmUploadAction`. Un `TypeError` di rete o una risposta 5xx diventano `{ kind: "network" }`; un `{ error }` diventa `{ kind: "rejected", message }`. Il blob si invia come `new Blob([blob], { type: baseMime(blob.type) })`.

`AudioRecorder` è il gesto principale del composer. Si ferma da solo a `AUDIO_MAX_SEC`, mostra il tempo trascorso, libera il microfono con `track.stop()` allo stop e all'unmount, e calcola `durationSec` arrotondando per eccesso. Messaggio sul permesso negato: "Per registrare, riattiva il microfono dalle impostazioni del browser. Intanto puoi scrivere."

`MediaPlayer` chiede l'URL al tocco e monta `<audio controls>` o `<img>`, con `lanternLabel` come etichetta del pulsante. Se l'URL scade dopo 5 minuti, un nuovo tocco ne chiede un altro. `ArrivedLantern`, `SentLantern` e `MemoryLantern` lo usano per i tipi `audio` e `photo`.

- [ ] **Step 4: Verifica che passino**

Run: `pnpm test:unit`, `pnpm test:int`, `pnpm test:e2e`, `pnpm typecheck`, `pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: record, send and play voice lanterns"
```

### Task 4: Foto

**Files:**
- Create: `lib/lanterns/photo-size.ts`, `lib/lanterns/photo-size.test.ts`, `lib/client/compress-photo.ts`, `components/photo-picker.tsx`, `e2e/fixtures/photo-exif.jpg`
- Modify: `components/lantern-composer.tsx`, `e2e/media.spec.ts`, `docs/sviluppo.md`

**Interfaces:**
- Consumes: `uploadMedia` (Task 3), `PHOTO_MAX_PX`, `PHOTO_MAX_BYTES`
- Produces:
  ```ts
  export function scaledSize(width: number, height: number, max: number): { width: number; height: number };
  export function compressPhoto(file: File): Promise<Blob>; // image/jpeg
  ```

- [ ] **Step 1: Scrivi i test che falliscono**

`photo-size.test.ts`: `4000×3000` → `2048×1536`; `3000×4000` → `1536×2048`; `800×600` resta uguale; `5000×5000` → `2048×2048`.

La fixture `e2e/fixtures/photo-exif.jpg` è un piccolo JPEG con un segmento APP1 `Exif` inserito subito dopo i byte iniziali `FF D8`, generato una tantum e committato. Prima dell'upload, il test verifica che il file contenga davvero `Exif`.

In `e2e/media.spec.ts`:
```ts
test("una foto arriva ricompressa e senza EXIF", async ({ browser }) => {
  // setInputFiles con una foto che contiene EXIF GPS; dopo l'orario Marco tocca "Apri".
  // I byte scaricati dall'URL firmato non contengono la stringa "Exif" e iniziano con FF D8.
});
test("un file che non è un'immagine dà un messaggio calmo", async ({ browser }) => { /* setInputFiles con un .txt */ });
```

- [ ] **Step 2: Verifica che falliscano**

Run: `pnpm test:unit lib/lanterns/photo-size.test.ts` e `pnpm test:e2e e2e/media.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implementa**

`compressPhoto` usa `createImageBitmap(file, { imageOrientation: "from-image" })`, disegna su un canvas alle dimensioni di `scaledSize` ed esporta con `toBlob("image/jpeg", 0.85)`. Se il risultato supera `PHOTO_MAX_BYTES`, riprova una volta con qualità 0.7, poi lancia un errore. Un formato non decodificabile, come HEIC su alcuni browser, mostra: "Questa foto non si riesce ad aprire: provane un'altra."

- [ ] **Step 4: Verifica che passino**

Run: `pnpm test:unit` e `pnpm test:e2e`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: send photos recompressed on the device"
```

### Task 5: Prova reale su Android

Questo task richiede il telefono dell'utente: va fatto insieme.

**Files:**
- Modify: `docs/notes/audio-format.md`, `README.md`, `docs/superpowers/specs/2026-11-02-lanterne-design.md`, `docs/sviluppo.md`, eventuali bug trovati

- [ ] **Step 1: Collega il telefono**

Run: `scoop install adb`, attiva il debug USB sul telefono, poi `adb devices`.
Expected: il dispositivo compare come `device`.

Run: `adb reverse tcp:3000 tcp:3000` e `adb reverse tcp:9000 tcp:9000`.
Expected: `adb reverse --list` mostra entrambe le porte.

- [ ] **Step 2: Prova incrociata**

Con Chrome Android su `http://localhost:3000` e Chrome desktop, tra due account demo:

| Da | A | Controllo |
|---|---|---|
| Android | Desktop | Il vocale si registra e si riascolta |
| Desktop | Android | Il vocale si ascolta |
| Android | Desktop | Una foto scattata dal telefono arriva dritta |

Expected: tutte le righe riuscite. Un fallimento va trattato come bug, con un test che lo riproduce quando possibile.

- [ ] **Step 3: Registra l'esito**

Scrivi in `docs/notes/audio-format.md` i formati osservati e l'esito. Aggiorna la spec, §10 e §12: la verifica incrociata copre Android e desktop, iPhone resta non verificato. Scrivi lo stesso limite nel README.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: record real device media check on Android"
```

---

# Blocco B — Worker e cancellazioni

### Task 6: Pulizia e cancellazione dei file

**Files:**
- Create: `lib/access/cleanup.ts`, `tests/integration/cleanup.test.ts`
- Modify: `docs/sviluppo.md`

**Interfaces:**
- Consumes: `MediaStorage.remove`, tabella `storage_deletions` (Task 2)
- Produces:
  ```ts
  export function cleanupExpired(db: Db, input: { now: Date }): Promise<{ deleted: number }>;
  export function cleanupAbandoned(db: Db, input: { now: Date }): Promise<{ deleted: number }>;
  export function drainStorageDeletions(db: Db, storage: Pick<MediaStorage, "remove">, input: { now: Date; limit?: number }): Promise<{ removed: number; failed: number }>;
  ```

- [ ] **Step 1: Scrivi i test che falliscono**

```ts
test("cleanupExpired elimina le scadute non conservate, di ogni tipo")
test("cleanupExpired conserva le salvate e quelle con expiresAt uguale a now")
test("cleanupAbandoned elimina le uploading create da più di un'ora, non quelle più recenti né le ready")
test("drain rimuove l'oggetto e poi la riga della coda")
test("se remove fallisce la chiave resta in coda e le altre proseguono")
test("drain rispetta limit; il default è 100")
test("drain lascia in coda le chiavi accodate da meno di un'ora")
test("una lanterna già scaduta resta invisibile anche se la pulizia non è mai girata")
```

- [ ] **Step 2: Verifica che falliscano**

Run: `pnpm test:int tests/integration/cleanup.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementa**

Delete mirate su `lanterns`; il trigger accoda i file. `drainStorageDeletions` legge le chiavi accodate da almeno un'ora in ordine di `createdAt`, chiama `remove` una alla volta ed elimina la riga solo dopo il successo. Il margine serve perché un PUT già iniziato può finire dopo la cancellazione della riga: toglierlo prima lascerebbe un file privato per sempre, senza riga e senza coda. Non logga il contenuto di nessuna lanterna.

- [ ] **Step 4: Verifica che passino**

Run: `pnpm test:int`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: cleanup for expired lanterns, abandoned uploads and stored files"
```

### Task 7: Processo worker con pg-boss

**Files:**
- Create: `worker/index.ts`, `worker/jobs.ts`, `tests/integration/worker.test.ts`
- Modify: `package.json`, `playwright.config.ts`, `README.md`, `docs/sviluppo.md`

**Interfaces:**
- Consumes: funzioni del Task 6
- Produces:
  ```ts
  export type WorkerDeps = { db: Db; storage: MediaStorage; clock: Clock };
  export const JOBS: readonly { name: string; cron: string; run: (deps: WorkerDeps) => Promise<unknown> }[];
  export function registerJobs(boss: PgBoss, deps: WorkerDeps): Promise<void>;
  ```
  Job iniziali: `cleanup-expired` e `cleanup-abandoned` con `*/15 * * * *`, `drain-storage` con `* * * * *`. Script: `dev:web` = `next dev`, `dev:worker` = `tsx watch worker/index.ts`, `dev` = `concurrently -k` dei due, `worker` = `tsx worker/index.ts`.

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
test("registerJobs pianifica tutti i job con il loro cron", async () => {
  // PgBoss reale su DATABASE_URL_TEST, schema dedicato "pgboss_test".
  // boss.getSchedules() contiene ogni voce di JOBS; boss.stop() alla fine.
});
test("un job che fallisce non ferma gli altri", async () => {
  // run di un job finto che lancia: l'errore viene registrato col solo nome del job.
});
```

- [ ] **Step 2: Verifica che fallisca**

Run: `pnpm test:int tests/integration/worker.test.ts`
Expected: FAIL, `registerJobs` non esiste.

- [ ] **Step 3: Implementa**

Run: `pnpm add pg-boss` e `pnpm add -D concurrently`. Controlla l'API sui tipi in `node_modules/pg-boss`, perché la versione 12 richiede `createQueue` prima di `schedule` e `work`.

`worker/index.ts` carica `dotenv/config`, usa `systemClock`, chiude `boss` su `SIGINT` e `SIGTERM`. `playwright.config.ts` passa a `pnpm dev:web --port ${PORT}`, così gli e2e non avviano il worker.

- [ ] **Step 4: Prova reale**

Run: `pnpm worker`. Inserisci una lanterna scaduta con un `media_key` di prova e attendi fino a 15 minuti, oppure lancia il job con `boss.send`.
Expected: la riga sparisce e l'oggetto non esiste più su MinIO.

- [ ] **Step 5: Verifica e commit**

Run: `pnpm test:int`, `pnpm test:e2e`, `pnpm typecheck`, `pnpm lint`
Expected: PASS.

```bash
git add -A
git commit -m "feat: background worker for scheduled cleanup"
```

### Task 8: Eliminazione dell'account e testo sulla chiusura

**Files:**
- Create: `lib/access/account.ts`, `app/(app)/actions/account.ts`, `components/delete-account-form.tsx`, `tests/integration/account.test.ts`
- Modify: `app/(app)/impostazioni/page.tsx`, `components/connection-menu.tsx`, `e2e/manage.spec.ts`, `docs/superpowers/specs/2026-11-02-lanterne-design.md`, `docs/sviluppo.md`

**Interfaces:**
- Produces: `export function deleteAccount(db: Db, input: { userId: string; confirmation: string }): Promise<AccessResult<void>>;`

- [ ] **Step 1: Scrivi i test che falliscono**

```ts
test("elimina utente, sessioni, connessioni e lanterne, e accoda i file")
test("senza la parola ELIMINA restituisce invalid_input e non tocca nulla")
test("non tocca gli altri utenti, che vedono la persona sparire dalle connessioni")
```

In `e2e/manage.spec.ts`:
```ts
test("eliminare l'account chiede conferma, esce e non permette di rientrare nella sessione", ...);
test("chiudere una connessione avvisa che spariscono le lanterne non conservate", ...);
```

- [ ] **Step 2: Verifica che falliscano**

Run: `pnpm test:int tests/integration/account.test.ts` e `pnpm test:e2e e2e/manage.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implementa**

`deleteAccount` elimina la riga `user` e lascia lavorare le cascate. In `/impostazioni`, la sezione "Elimina l'account" dice: "Spariscono il tuo profilo, le tue connessioni e tutte le lanterne, anche quelle che altri avevano conservato. Non si può annullare." L'utente scrive ELIMINA per confermare. Dopo il successo, ricarica completa verso `/accedi`, come per l'uscita.

In `components/connection-menu.tsx` il testo di chiusura diventa: "Le lanterne non conservate verranno eliminate, anche quelle già arrivate. I ricordi restano." Allinea la spec, §3: "Le lanterne non conservate vengono eliminate".

- [ ] **Step 4: Verifica che passino**

Run: `pnpm test:int` e `pnpm test:e2e`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: account deletion and honest wording on closing a connection"
```

---

# Blocco C — PWA, notifiche e offline

### Task 9: Manifest, icone e pagina offline

**Files:**
- Create: `app/manifest.ts`, `app/offline/page.tsx`, `public/sw.js`, `public/icon.svg`, `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`, `scripts/icons.ts`, `components/pwa-register.tsx`, `e2e/pwa.spec.ts`
- Modify: `next.config.ts`, `app/layout.tsx`, `playwright.config.ts`, `README.md`, `docs/sviluppo.md`

**Interfaces:**
- Produces: `public/sw.js` con scope `/`, precache di `/offline`; `<PwaRegister />` nel layout radice. Il Task 10 aggiunge a `sw.js` gli handler `push` e `notificationclick`.

- [ ] **Step 1: Scrivi i test che falliscono**

`e2e/pwa.spec.ts`, con `serviceWorkers: "allow"` solo in questo file; negli altri `playwright.config.ts` usa `"block"`:
```ts
test("il manifest descrive un'app installabile", ...); // name "Lanterne", display "standalone", start_url "/", icone 192 e 512 raggiungibili
test("/sw.js ha gli header giusti", ...); // Cache-Control con no-cache, Content-Type JavaScript
test("senza rete, una navigazione mostra la pagina offline", ...); // attende il service worker, context.setOffline(true), goto("/")
test("le pagine autenticate non finiscono nella cache", ...); // dopo il login, caches.match("/") è undefined
```

- [ ] **Step 2: Verifica che falliscano**

Run: `pnpm test:e2e e2e/pwa.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implementa**

Segui `01-app/02-guides/progressive-web-apps.md` per `manifest.ts` e per gli header di `/sw.js` in `next.config.ts`: `Content-Type: application/javascript; charset=utf-8`, `Cache-Control: no-cache, no-store, must-revalidate`, `Content-Security-Policy: default-src 'self'; script-src 'self'`.

`sw.js` gestisce solo le richieste `mode === "navigate"`: rete prima, `/offline` se la rete fallisce. Non mette in cache nessun'altra risposta. `install` precarica `/offline`; `activate` rimuove le cache di versioni precedenti.

`scripts/icons.ts` genera i PNG da `public/icon.svg` con Playwright, una tantum; i PNG si committano. La pagina offline dice: "Sei offline. I vocali registrati partiranno al ritorno della rete." e funziona senza sessione, fuori da `(app)`.

- [ ] **Step 4: Verifica che passino**

Run: `pnpm test:e2e`, `pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: installable PWA with offline page"
```

### Task 10: Notifiche push

**Files:**
- Create: `lib/access/push.ts`, `lib/push/sender.ts`, `app/(app)/actions/push.ts`, `components/push-toggle.tsx`, `tests/integration/push.test.ts`, migrazione
- Modify: `lib/db/schema.ts`, `tests/helpers/db.ts`, `worker/jobs.ts`, `public/sw.js`, `app/(app)/impostazioni/page.tsx`, `docs/sviluppo.md`

**Interfaces:**
- Consumes: `JOBS` (Task 7), `sw.js` (Task 9)
- Produces:
  ```ts
  export type PushMessage = { title: string; body: string; url: string };
  export type PushSubscriptionRow = { endpoint: string; p256dh: string; auth: string };
  export type PushSender = (sub: PushSubscriptionRow, message: PushMessage) => Promise<"sent" | "gone" | "failed">;
  export function savePushSubscription(db: Db, input: PushSubscriptionRow & { userId: string }): Promise<AccessResult<void>>;
  export function removePushSubscription(db: Db, input: { userId: string; endpoint: string }): Promise<AccessResult<void>>;
  export function notifyArrivals(db: Db, input: { now: Date; send: PushSender }): Promise<{ groups: number }>;
  ```
  Tabella `push_subscriptions(id, user_id → user cascade, endpoint unique, p256dh, auth, created_at)`. Job `notify-arrivals` con `* * * * *`.

- [ ] **Step 1: Scrivi i test che falliscono**

```ts
test("una notifica per destinatario e connessione, con il nome del mittente")
  // 3 lanterne da Marco → 1 invio: body "Le lanterne di Marco sono arrivate", url "/persone/<id>"
test("il messaggio non contiene mai il testo della lanterna")
test("due esecuzioni, anche simultanee, non mandano doppioni") // Promise.all di due notifyArrivals
test("ignora sigillate, uploading, scadute e già notificate")
test("chi non ha sottoscrizioni viene comunque marcato")
test("gone rimuove la sottoscrizione; failed la tiene")
test("ogni dispositivo dello stesso utente riceve la notifica")
test("rifiuta un endpoint non https con invalid_input") // Review Focus 5: http://, file://, testo
test("lo stesso endpoint passa all'ultimo utente che lo registra")
test("non si può rimuovere la sottoscrizione di un altro")
```

- [ ] **Step 2: Verifica che falliscano**

Run: `pnpm test:int tests/integration/push.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementa**

`notifyArrivals` marca con un solo `UPDATE lanterns SET notified_at = now WHERE status = 'ready' AND reveal_at <= now AND expires_at > now AND notified_at IS NULL RETURNING …`, poi raggruppa per destinatario e connessione e invia. In `lib/push/sender.ts`, gli status 404 e 410 di `web-push` diventano `"gone"`; ogni altro errore diventa `"failed"`.

`sw.js` riceve il JSON del push e mostra `showNotification`; `notificationclick` apre o mette a fuoco `url`, accettando solo percorsi interni.

`PushToggle` chiede il permesso solo al tocco. Copre i casi: non supportato ("Le notifiche non sono disponibili qui: l'app funziona comunque"), negato (spiega come riattivarle), iOS non installata (guida "Aggiungi alla schermata Home").

- [ ] **Step 4: Verifica che passino**

Run: `pnpm test:int`, `pnpm test:e2e`, `pnpm typecheck`, `pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: web push when lanterns arrive"
```

### Task 11: Coda offline per i vocali

**Files:**
- Create: `lib/client/outbox.ts`, `lib/client/outbox.test.ts`, `lib/client/outbox-store.ts`, `components/outbox-panel.tsx`, `e2e/offline.spec.ts`
- Modify: `lib/access/lanterns.ts`, `app/(app)/persone/[id]/page.tsx`, `components/audio-recorder.tsx`, `components/photo-picker.tsx`, `components/sign-out-button.tsx`, `tests/integration/lanterns.test.ts`, `docs/sviluppo.md`

**Interfaces:**
- Consumes: `uploadMedia` e `UploadOutcome` (Task 3)
- Produces:
  ```ts
  export type OutboxItem = { id: string; userId: string; connectionId: string; type: "audio" | "photo"; blob: Blob; durationSec?: number; expectedRevealAt: string; status: "waiting" | "rejected"; message?: string };
  export type OutboxStore = { list(userId: string): Promise<OutboxItem[]>; put(item: OutboxItem): Promise<void>; remove(id: string): Promise<void>; clear(userId: string): Promise<void> };
  export function flushOutbox(store: OutboxStore, userId: string, upload: typeof uploadMedia): Promise<{ sent: { id: string; late: boolean }[] }>;
  ```
  `getChannel` aggiunge `nextDepartureAt: Date | null`, calcolato con `computeRevealAt` nel fuso del partner.

- [ ] **Step 1: Scrivi i test che falliscono**

In `outbox.test.ts`, con uno store in memoria:
```ts
test("un invio riuscito toglie l'elemento")
test("un errore di rete lascia l'elemento in attesa e ferma il giro")
test("un rifiuto segna rejected con il messaggio e non riprova da solo") // Review Focus 3
test("late è true se revealAt supera expectedRevealAt")
test("due flush simultanei non inviano due volte")
test("se il file è già caricato ripete solo la conferma, senza creare una seconda lanterna") // la risposta alla conferma può perdersi anche se il server l'ha registrata
test("un PUT bloccato scade e diventa errore di rete")
test("legge solo gli elementi dell'utente corrente")
```

In `tests/integration/lanterns.test.ts`: `"nextDepartureAt usa il fuso del partner ed è null se la connessione non è attiva"`.

In `e2e/offline.spec.ts`:
```ts
test("un vocale registrato offline parte al ritorno della rete", ...);
  // setOffline(true), registra: "in attesa di rete". setOffline(false): compare tra le lanterne.
test("riprova e scarta funzionano dopo un rifiuto", ...); // la connessione viene chiusa nel frattempo
test("uscendo con vocali in coda l'app avvisa e li cancella", ...); // Review Focus 4
```

- [ ] **Step 2: Verifica che falliscano**

Run: `pnpm test:unit lib/client/outbox.test.ts`, `pnpm test:int tests/integration/lanterns.test.ts`, `pnpm test:e2e e2e/offline.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implementa**

`outbox-store.ts` usa `idb` con un database `lanterne-outbox`. `OutboxPanel` nel layout di `(app)` chiama `flushOutbox` al mount e sull'evento `online`, e mostra per ogni elemento "in attesa di rete", "Riprova" e "Scarta". Testi e pensieri non passano dalla coda.

Quando `late` è vero mostra: "Era in attesa di rete: partirà la sera dopo." Se IndexedDB non è disponibile, il composer mostra l'errore invece di perdere il vocale in silenzio e tiene il blob in memoria finché la pagina resta aperta.

`SignOutButton` controlla la coda: se non è vuota, chiede conferma ("Hai N lanterne non ancora partite: uscendo verranno cancellate") e poi chiama `clear`. Anche `DeleteAccountForm` svuota la coda.

- [ ] **Step 4: Verifica che passino**

Run: `pnpm test:unit`, `pnpm test:int`, `pnpm test:e2e`, `pnpm typecheck`, `pnpm lint`, `pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: keep recordings on the device until the network returns"
```

### Task 12: Prova finale su Android e documenti

Questo task richiede il telefono dell'utente: va fatto insieme.

**Files:**
- Modify: `README.md`, `docs/sviluppo.md`, `docs/notes/audio-format.md`, eventuali bug trovati

- [ ] **Step 1: Prova su Android, con `adb reverse` e il worker acceso**

| Controllo | Atteso |
|---|---|
| Installazione da Chrome | L'icona compare e l'app si apre a schermo intero |
| Attivazione delle notifiche, poi orario raggiunto | Arriva "Le lanterne di … sono arrivate" entro un paio di minuti |
| Tocco sulla notifica | Si apre il canale giusto |
| Modalità aereo durante un vocale | "In attesa di rete", poi invio al ritorno |
| Navigazione in modalità aereo | Compare la pagina offline |

Per l'orario, usa una connessione con l'orario più vicino: il viaggio nel tempo non vale per il worker.

Expected: tutte le righe riuscite.

- [ ] **Step 2: Aggiorna i documenti**

Il README copre: avvio di MinIO e del worker, prova su telefono con `adb reverse`, limite iPhone non verificato. Da questo momento "PWA" nel README è corretto. Aggiorna lo stato in `docs/sviluppo.md`.

- [ ] **Step 3: Verifica completa**

Run: `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:int && pnpm build && pnpm test:e2e`
Expected: tutto verde.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: finish plan 2 with real device checks"
```
