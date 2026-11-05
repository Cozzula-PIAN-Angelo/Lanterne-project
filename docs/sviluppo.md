# Lanterne — diario di sviluppo

Documento tecnico aggiornato a ogni task completata: cosa è stato costruito, come funziona e
perché si è scelto così. Il design completo è in
[`docs/superpowers/specs/2026-11-02-lanterne-design.md`](superpowers/specs/2026-11-02-lanterne-design.md),
il piano di lavoro in [`docs/superpowers/plans/`](superpowers/plans/).

## In breve

Lanterne è una PWA per restare vicini a chi si sente poco: durante il giorno si lasciano
"lanterne" (testi, pensieri, poi vocali e foto) e la sera, a un orario concordato, si accendono
**nel fuso orario di chi le riceve**. Ci si collega solo su invito, al massimo con 5 persone.

| Livello | Tecnologia |
|---|---|
| App | Next.js 16 (App Router, Server Actions, Cache Components), React 19, TypeScript |
| UI | Tailwind CSS 4, componenti shadcn/Base UI |
| Database | PostgreSQL 18, Drizzle ORM + drizzle-kit (migrazioni), driver postgres-js |
| Login | Better Auth: magic link via email, sessioni nel database |
| Email | Nodemailer; in sviluppo Mailpit (SMTP locale con interfaccia web) |
| Date e fusi | date-fns + @date-fns/tz |
| Validazione | Zod |
| Test | Vitest (unit + integrazione su Postgres reale), Playwright (e2e su viewport mobile) |

## Avvio in locale

Requisiti: Node 20+, pnpm, PostgreSQL e Mailpit (con Docker: `docker compose up -d`, oppure
installati a mano; il progetto usa la porta 5433 per Postgres).

```bash
pnpm install
cp .env.example .env          # poi imposta BETTER_AUTH_SECRET
pnpm db:migrate               # crea le tabelle
pnpm dev                      # http://localhost:3000 — le email arrivano su http://localhost:8025
```

Comandi utili:

| Comando | Cosa fa |
|---|---|
| `pnpm test:unit` | test delle funzioni pure (orari, fusi, etichette) |
| `pnpm test:int` | test di integrazione sul database `lanterne_test` |
| `pnpm test:e2e` | test end-to-end con Playwright (avvia il server sulla porta 3100) |
| `pnpm lint` / `pnpm typecheck` | ESLint e TypeScript |
| `pnpm db:generate` | genera una migrazione dopo una modifica allo schema |
| `pnpm drizzle-kit studio` | interfaccia web per guardare i dati |

## Architettura in una pagina

```
app/                     pagine e Server Actions (solo collegamento UI ↔ logica)
  (auth)/accedi          login con magic link
  (app)/…                pagine protette: richiedono la sessione
lib/access/              regole dell'app: inviti, connessioni, blocchi, lanterne, profilo
lib/time/                calcolo degli orari di apertura e scadenza, fusi, etichette
lib/clock/               orologio iniettabile (mai new Date() sparso nel codice)
lib/db/                  schema Drizzle, client, migrazioni
lib/auth/                configurazione Better Auth e helper di sessione
tests/integration/       test sul database reale
e2e/                     test Playwright
```

Principi che valgono ovunque:

- **Le regole vivono sul server, in `lib/access`.** Ogni funzione restituisce un
  `AccessResult` (`{ ok: true, value }` oppure `{ ok: false, error: "codice" }`) invece di
  lanciare eccezioni: la UI traduce il codice in un messaggio in italiano.
- **Il tempo è un parametro.** Le funzioni ricevono `now` invece di leggere l'orologio: i test
  possono "spostarsi" a qualsiasi ora del giorno, e il pannello dev "viaggio nel tempo" usa lo
  stesso meccanismo.
- **Istanti in UTC, orari nel fuso di chi guarda.** Nel database solo `timestamptz`; la
  conversione avviene in `lib/time`.
- **Il database è l'ultima difesa.** Vincoli e lock garantiscono le regole anche con richieste
  simultanee.

---

## Task completate

### Task 1 — Struttura del progetto e strumenti
- Progetto Next.js 16 con TypeScript, Tailwind e shadcn; Vitest con due progetti (`unit` e
  `integration`); `docker-compose.yml` con Postgres e Mailpit.
- Regola ESLint che vieta `new Date()` senza argomenti fuori da `lib/clock`: obbliga a passare
  dall'orologio iniettabile.

### Task 2 — Verifica del formato audio
- Spike per capire quale formato registra il browser con `MediaRecorder`: su Chrome desktop
  `audio/mp4;codecs=opus`. La riproduzione su iPhone sarà verificata all'inizio del piano 2
  (esito in [`docs/notes/audio-format.md`](notes/audio-format.md)).

### Task 3 — Orologio iniettabile (`lib/clock`)
- `Clock` con `systemClock`, `fixedClock` e `offsetClock`. In sviluppo un cookie può spostare
  l'orologio di un offset (`parseDevOffset`), per provare l'app "stasera" senza aspettare.

### Task 4 — Orari di apertura (`lib/time/reveal-time.ts`, `lantern-times.ts`)
- Orario di apertura tra le 17:00 e la mezzanotte. `computeRevealAt` calcola il prossimo arrivo
  **nel fuso del destinatario**.
- Un cambio d'orario vale **dalla sera dopo**: la sera del giorno del cambio usa ancora l'orario
  precedente. La mezzanotte appartiene alla sera prima.

### Task 5 — Scadenza, fusi ed etichette
- Una lanterna scade alla prima occorrenza delle 06:00 del destinatario dopo l'apertura, e
  comunque non prima di 8 ore.
- `isValidTimeZone` accetta solo nomi IANA reali (rifiuta `Mars/Base`, `+01:00`, `EST`).
- Etichette in italiano basate sull'ora di chi guarda: "stasera alle 21:30", "stanotte a
  mezzanotte", "domani alle 22:00"; la mezzanotte non viene mai scritta "0:00".

### Task 6 — Schema del database e Better Auth
- Tabelle dell'app: `connections`, `invites`, `lanterns`, `blocks`, `rate_limits`; tabelle di
  Better Auth (`user`, `session`, `account`, `verification`) generate dalla sua CLI.
- Vincoli nel database:
  - `CHECK` sull'ordine della coppia (`user_a_id < user_b_id`, con collation `C` per avere lo
    stesso ordine di JavaScript su qualsiasi server);
  - indice unico parziale: una sola connessione non chiusa per coppia, ma ci si può ricollegare
    dopo una chiusura;
  - chiavi esterne con `ON DELETE CASCADE`.
- Better Auth con magic link (valido 15 minuti) e login demo con password **solo in sviluppo e
  nei test**. I campi del profilo (`color`, `timezone`, `allowSaving`) sono marcati
  `input: false`: non si possono scrivere tramite le API di Better Auth, solo tramite il form
  del profilo, che li valida.

### Task 7 — Accesso, onboarding e Playwright
- `/accedi`: email → magic link (in sviluppo la mail arriva su Mailpit). Se il login demo è
  attivo compaiono i pulsanti "Entra come Giulia / Marco / Sara".
- `/benvenuto`: nome, colore (8 tonalità) e fuso orario, precompilato da quello del dispositivo.
  `saveProfile` valida tutto con Zod.
- Le pagine protette leggono la sessione dentro un `<Suspense>`: con Cache Components
  attivo Next.js lo richiede, e ogni segmento sotto `app/(app)` ha il suo `loading.tsx`.
- Primo test e2e su viewport Pixel 7: nuovo utente → magic link letto da Mailpit → onboarding →
  home.

### Task 8 — Limite di frequenza
- `checkRateLimit` a finestra fissa su Postgres, con un solo `INSERT … ON CONFLICT DO UPDATE`
  atomico. Limiti: 10 inviti creati e 20 accettati all'ora per utente.

### Task 9 — Inviti e connessioni
- Codice invito di 16 byte casuali (22 caratteri `base64url`), valido 7 giorni, monouso.
- `acceptInvite` applica le regole in ordine (limite di frequenza, invito valido, onboarding,
  auto-invito, blocchi, già usato, scaduto, già collegati, limite di 5 per entrambi,
  controproposta d'orario) dentro una transazione:
  - `SELECT … FOR UPDATE` sull'invito: due persone che accettano insieme → una sola vince;
  - lock sulle righe dei due utenti, in ordine di id: l'invitante non può superare 5
    connessioni con accettazioni simultanee di inviti diversi.
- Con una controproposta d'orario la connessione nasce `pending` finché l'altro non accetta.

### Task 10 — Proposte d'orario, chiusura e blocco
- Proposta di un nuovo orario: solo l'**altra** persona può accettarla. Se ne vengono accettate
  due nello stesso giorno, stasera vale ancora l'orario di prima di entrambe.
- Chiusura: la connessione diventa `ended` e le lanterne non salvate spariscono.
- Blocco silenzioso: chiude la connessione, elimina le lanterne che il bloccante aveva mandato
  (anche quelle salvate dall'altro) e fa risultare "non validi" i futuri inviti tra i due.

### Task 11 — Lanterne di testo e pensiero
- Creazione solo su connessioni `active`: l'apertura è calcolata nel fuso del destinatario e la
  lanterna è "salvabile" secondo la preferenza del mittente al momento dell'invio. La creazione
  aspetta un'eventuale chiusura in corso (lock `FOR SHARE`).
- `getChannel` restituisce, **filtrando sul server**:
  - le lanterne inviate (sigillate fino all'apertura);
  - quelle arrivate (visibili dall'apertura alla scadenza);
  - i ricordi salvati;
  - un'indicazione "stasera non ha lasciato lanterne", che non compare la prima sera se la
    connessione è nata dopo l'orario di apertura.
- Il mittente può cancellare solo prima dell'apertura. Il destinatario può reagire (💛 🫂 😂 😮
  🌙) e salvare. Per chiunque altro, ogni lanterna "non esiste" (`not_found`).

### Revisione del blocco B (Task 6–11)
Una revisione indipendente del codice ha trovato e fatto correggere, ciascuno con un test che
riproduce il problema:
- campi del profilo scrivibili dalle API di Better Auth (un fuso inventato bloccava il
  partner);
- superamento del limite di 5 connessioni con accettazioni simultanee;
- vincolo sulla coppia dipendente dalla collation del server;
- altri casi limite di concorrenza, indici mancanti e connessioni al DB moltiplicate dal
  ricaricamento in sviluppo.

### Task 12 — Home e inviti nell'interfaccia
- **Home "Le tue persone":** una card per connessione, con l'orario di arrivo nell'ora locale di
  chi guarda oppure "In attesa: proposta delle 21:30", più gli slot liberi fino a 5.
- **`/invita`:** si sceglie l'orario e si ottiene il link da copiare. Se gli appunti non sono
  disponibili, il link resta selezionabile a mano.
- **`/invito/[code]`:** si accetta o si propone un altro orario; ogni rifiuto di `lib/access`
  diventa un messaggio calmo in italiano (`errorMessage`).
- **Ritorno all'invito:** chi apre il link senza account passa da login e onboarding e torna
  all'invito grazie a un parametro `next`. Il parametro arriva dall'URL, quindi `safeNextPath`
  accetta solo percorsi interni: niente open redirect verso altri siti. La pagina sta nel gruppo
  `(inviti)` perché il layout di `(app)` manda a `/accedi` senza sapere da quale pagina arrivi.
- **Un bug trovato dall'e2e:** React riusava lo stesso `<button>` passando da `type="button"` a
  `type="submit"` durante il click, e il form partiva da solo con l'orario di default. Le `key`
  obbligano React a creare bottoni nuovi.
- **Effetti di Next.js sui test:** con `cacheComponents` le pagine già visitate restano nel DOM,
  nascoste da `<Activity>`, quindi i selettori di testo filtrano sugli elementi visibili. Il limite
  di 5 magic link al minuto per IP resta attivo: gli e2e azzerano il contatore prima di ogni test.

### Task 13 — Il canale
- **`/persone/[id]`** riunisce tutto ciò che riguarda una persona: lanterne arrivate, con reazioni
  e "Conserva"; lanterne inviate, con l'orario di partenza e il conto alla rovescia; il composer
  per testo e pensieri; i ricordi.
- **Il server decide cosa si vede:** la pagina mostra solo ciò che restituisce `getChannel`, quindi
  il testo di una lanterna sigillata non arriva mai al browser del destinatario.
- **Il conto alla rovescia usa l'orologio del server:** al mount calcola la differenza dal
  dispositivo, così un telefono con l'ora sbagliata non cambia il risultato.
- **Il "viaggio nel tempo" nei test:** un cookie di sviluppo sposta l'orologio del server. L'e2e
  porta Luca a un minuto dopo le 21:30 di New York e verifica che le lanterne si aprano.
- **Connessioni altrui:** un estraneo vede la stessa pagina "Qui non c'è niente." di un id
  inventato, con lo stesso status. Lo status è 200 e non 404: con Cache Components la sessione si
  legge in streaming e, secondo la documentazione di Next.js, a quel punto lo status non cambia
  più. Nessuna risposta rivela se la connessione esiste.

### Task 14 — Impostazioni, gestione della connessione e banner del fuso
- **`/impostazioni`:** profilo, permesso di conservare le proprie lanterne (vale solo per quelle
  future), persone bloccate e uscita.
- **Menu della connessione:** cambio d'orario, che vale dal giorno dopo se l'altra persona accetta,
  più chiusura e blocco con conferma nella pagina. Chi bloccare si ricava dalla connessione sul
  server: non è il browser a indicarlo.
- **Banner del fuso:** se il dispositivo è in un altro fuso, l'app chiede "Sei a Tokyo?". Il "no"
  resta in `localStorage`, e il banner funziona anche se `localStorage` non è disponibile.
- **Uscita con ricarica completa:** le pagine già visitate restano in memoria, nascoste da
  `<Activity>`, e su un dispositivo condiviso non devono sopravvivere al logout.
- **Un bug dell'interruttore:** dopo una `<form action>`, React chiama `form.reset()`, che riporta
  una checkbox all'attributo iniziale anche se è controllata. L'interruttore tornava indietro pur
  avendo salvato; ora l'azione parte da una transizione, senza form.
- **Test instabili, due cause vere:** `completeOnboarding` non aspettava il salvataggio, e una
  navigazione immediata lo interrompeva; `getByLabel("Nome")` cerca una sottostringa e trovava anche
  il select del fuso, perché il testo del suo label include "America/Menominee". Quattro esecuzioni
  consecutive della suite sono verdi.

### Task 15 — Dati demo, setup in un comando e viaggio nel tempo
- **`pnpm run setup`:** crea `.env` se manca, genera il segreto solo se è vuoto, migra il database e
  carica i dati demo. Va scritto per esteso perché `pnpm setup` è un comando interno di pnpm.
- **Dati demo:** Giulia, Marco e Sara, con connessioni attive, una proposta in attesa, lanterne
  arrivate, una sigillata e un ricordo, tutte con istanti relativi al momento del caricamento. Il
  seed è rilanciabile e cancella solo gli utenti demo: un test verifica che gli altri restino.
- **Pannello "viaggio nel tempo":** in sviluppo sposta l'orologio del server per quel browser (+1
  ora, +6 ore, domani mattina, torna a ora). L'azione si rifiuta di funzionare fuori dallo sviluppo,
  e anche `getRequestClock` ignora il cookie.
- **Flusso completo in e2e:** invito, invio, salto nel tempo fino all'arrivo, reazione e
  salvataggio, fino a ciò che vede il mittente.

### Revisione del blocco C (Task 12–15)
Una revisione indipendente non ha trovato problemi critici. Ha fatto correggere, ciascuno con un test
che riproduce il problema:
- `safeNextPath` accettava percorsi che, normalizzati, diventavano `//sito-esterno`;
- le connessioni chiuse non erano più raggiungibili, nonostante la promessa "i ricordi restano":
  ora la home le elenca, se contengono ricordi;
- il messaggio "non ha lasciato lanterne" poteva comparire accanto a lanterne arrivate;
- una proposta in attesa non si poteva sostituire e, su una connessione in attesa, "Rifiuta" la
  chiudeva senza avvisare;
- il conto alla rovescia non seguiva il viaggio nel tempo.

---

**Stato del Piano 1:** 83 test di integrazione, 78 unit e 13 e2e verdi, unito in `main`.

## Piano 2 — Media, worker e PWA

### Task 1 — Storage S3
- **`createStorage`** parla con qualunque storage compatibile S3: in locale SeaweedFS, sulla porta 9000.
  MinIO era la prima scelta, ma la versione attuale richiede una licenza anche in locale.
- **Il limite sta nella firma:** l'URL di upload include dimensione e tipo, quindi un file diverso da
  quello dichiarato viene rifiutato dallo storage. Non si usa il POST firmato perché Cloudflare R2,
  una possibile destinazione futura, non lo supporta.
- **Due client S3:** l'host fa parte della firma, quindi gli URL per il browser nascono con
  `S3_PUBLIC_ENDPOINT`, mentre il server può raggiungere lo storage da un altro indirizzo.
- **`pnpm run setup` aggiorna anche un `.env` esistente:** aggiunge le chiavi nuove, genera la coppia
  VAPID e crea i tre bucket, senza toccare i valori già impostati.

### Task 2 — Lanterne multimediali in `lib/access`
- **Tre passaggi:** `createMediaLantern` crea la riga `uploading` e firma l'upload, il browser carica il
  file direttamente sullo storage, `confirmMediaLantern` controlla il file e porta la riga a `ready`.
- **Il file viene controllato davvero:** se dimensione o tipo non corrispondono a quanto dichiarato,
  la lanterna viene eliminata. Il destinatario vede solo righe `ready`, mai un upload a metà.
- **Tetto dell'audio:** 60 minuti al giorno per connessione e mittente, nel giorno locale del mittente.
  Gli upload rimasti aperti contano per i 5 minuti in cui l'URL è valido, poi non consumano più.
- **Un trigger per i file:** ogni riga eliminata con un `media_key` finisce in `storage_deletions`,
  anche quando la cancellazione arriva a cascata da un utente o da una connessione. Nessun percorso
  può dimenticare un file, e la tabella è il lavoro che il worker dovrà svolgere.
- **La chiave del file resta sul server:** `LanternView` espone tipo e durata, mentre l'URL firmato si
  chiede con `getMediaUrl`, che applica le stesse regole di visibilità delle lanterne.
