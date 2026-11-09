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

### Task 3 — Registrazione e ascolto dei vocali
- **Registrare è il gesto principale del canale:** `AudioRecorder` sceglie il formato più compatibile
  disponibile, si ferma da solo a 10 minuti e libera subito il microfono.
- **`uploadMedia`** distingue i problemi di rete dai rifiuti del server, una base che servirà alla coda
  offline. Per ora un errore di rete viene solo segnalato.
- **L'URL si chiede al tocco:** `MediaPlayer` chiama il server solo quando la persona preme "Ascolta".
  Se il collegamento scade dopo 5 minuti, un nuovo tocco ne chiede un altro.
- **Accessibilità:** il pulsante si legge come "Ascolta: Vocale di Anna, 3 minuti, delle 9:14".
- **Senza microfono l'app funziona lo stesso:** con il permesso negato o un browser senza
  `MediaRecorder` resta tutto il resto, con una spiegazione calma.
- **Nei test:** Chromium usa un microfono finto, e il vocale passa davvero dallo storage.

### Task 4 — Foto
- **La foto si prepara sul telefono:** `compressPhoto` la ridisegna su un canvas, al massimo a 2048 px.
  Questo toglie anche i metadati EXIF, compresa la posizione GPS. Il test usa una foto con EXIF vero e
  verifica i byte che arrivano al destinatario.
- **Orientamento e trasparenza:** il ridisegno rispetta l'orientamento di scatto e riempie di bianco le
  parti trasparenti, che in JPEG diventerebbero nere.
- **Formati non leggibili:** se il browser non riesce ad aprire il file, la persona riceve un messaggio
  calmo e può sceglierne un altro.

### Task 5 — Prova reale su Android
- **Esito:** vocali e foto funzionano tra un telefono Android e Chrome desktop, nei due sensi. iPhone resta
  non verificato per mancanza del dispositivo, come dice `docs/notes/audio-format.md`.
- **Come si collega il telefono:** il debug wireless e `adb reverse` espongono `localhost` sul telefono.
  Chrome lo considera un contesto sicuro, quindi il microfono funziona senza HTTPS. Il cavo USB
  richiederebbe un driver da installare come amministratore.

### Revisione del blocco A
La revisione indipendente non ha trovato problemi critici. Le correzioni riguardano quasi tutte `<Activity>`,
che nasconde la pagina lasciandola viva e che i test non avevano mai messo alla prova.
- **Registratore:** lasciando la pagina mentre si registra, al ritorno restava "Ferma e invia" con un pulsante
  che non faceva nulla. Ora torna pronto e dice che la registrazione si è interrotta.
- **Microfono:** se il permesso arrivava dopo aver lasciato la pagina, il microfono si accendeva senza un modo
  per spegnerlo. Ora si rilascia subito, anche quando `MediaRecorder` non riesce a partire.
- **Player:** `display: none` non ferma l'audio, quindi il vocale continuava a suonare in un'altra pagina. Ora
  si mette in pausa quando la pagina viene nascosta.
- **Test più stretti:** dimensione più grande, più piccola e tipo diverso sono casi separati, perché nel test
  unico togliere metà del controllo non faceva fallire nulla. Si aggiunge il blocco durante un upload.
- **Piano aggiornato:** la coda di cancellazione del Task 6 aspetterà un'ora, perché un PUT già iniziato può
  finire dopo la cancellazione della riga. Il Task 11 ripeterà solo la conferma se il file è già caricato.

### Task 6 — Pulizia e cancellazione dei file
- **Tre funzioni in `lib/access/cleanup.ts`:** `cleanupExpired` toglie le lanterne scadute e non conservate,
  `cleanupAbandoned` quelle rimaste in `uploading` da più di un'ora, `drainStorageDeletions` toglie i file.
  Per ora le chiama solo il test: le pianificherà il worker del Task 7.
- **Le prime due non toccano lo storage:** cancellano le righe e ci pensa il trigger ad accodare i file.
  Così esiste un solo percorso di cancellazione, comune a chiusure, blocchi ed eliminazione dell'account.
- **Un'ora di attesa in coda:** un upload già iniziato può finire dopo la cancellazione della riga. Togliendo
  il file subito, l'upload lo ricreerebbe senza che nessuno lo sappia più. Nel frattempo il file è
  irraggiungibile, perché per firmare un link di lettura serve la riga.
- **Se lo storage non risponde:** la riga della coda sparisce solo dopo la rimozione riuscita, e un fallimento
  non ferma le altre chiavi.
- **La scadenza non dipende dalla pulizia:** una lanterna scaduta è già invisibile anche se il worker è fermo.

### Task 7 — Worker
- **Un processo a parte:** `worker/index.ts` è un secondo processo Node accanto all'app. `pnpm dev` li avvia
  insieme con `concurrently`, mentre gli e2e usano `pnpm dev:web`: senza worker, le pulizie non cambiano i dati
  a metà di un test.
- **Job in `worker/jobs.ts`:** ogni 15 minuti `cleanup-expired` e `cleanup-abandoned`, ogni minuto
  `drain-storage`. Con pg-boss 12 ogni coda va creata prima di `schedule` e `work`.
- **pg-boss sta su Postgres:** niente Redis né altri servizi. Lo schedule vive in tabelle proprie, in uno
  schema dedicato `pgboss`.
- **I log non contengono dati:** se un job fallisce, si scrive solo il suo nome. pg-boss salva l'errore nelle
  sue tabelle, quindi anche a lui arriva un errore nuovo, senza la causa originale.
- **Prova reale:** `pnpm worker` sul database di test ha cancellato una lanterna scaduta. Scaduto il margine,
  il cron ha tolto da solo il file dallo storage e la riga dalla coda.

### Task 8 — Eliminazione dell'account e testo sulla chiusura
- **Una sola riga da cancellare:** `deleteAccount` elimina `user`, e le cascate del Piano 1 tolgono sessioni,
  connessioni, inviti e blocchi. Il trigger accoda i file delle lanterne, anche quelle conservate dall'altra
  persona: il testo lo dice prima di confermare.
- **Conferma scritta:** bisogna scrivere ELIMINA. Uno spazio dalla tastiera del telefono non conta. Una parola
  sbagliata riceve un messaggio specifico, non quello generico.
- **Uscita con ricarica vera:** come per "Esci", perché `<Activity>` terrebbe in memoria le pagine già visitate.
- **Testo sulla chiusura:** dice ora che spariscono tutte le lanterne non conservate, anche quelle già arrivate.
  È quello che il codice faceva già: il vecchio testo, e la spec, promettevano meno di quanto succede.

### Revisione del blocco B
La revisione indipendente non ha trovato problemi critici e conferma che i percorsi di cancellazione tengono.
- **Storage guasto:** il job `drain-storage` riusciva anche con tutti i file rimasti al loro posto, senza scrivere
  nulla. Ora il log dice quanti file non sono stati rimossi, mai quali.
- **Test del worker:** passavano anche con il worker rotto, perché le pianificazioni della corsa precedente
  restavano nel database e nessuno eseguiva davvero i job. Ora lo schema si azzera a ogni avvio, ogni job gira
  su dati veri e il test legge quel che pg-boss conserva. Ogni controllo è provato rompendo il codice apposta.
- **Connessione sparita:** chi aveva la pagina aperta quando l'altra persona elimina l'account leggeva "riproviamo
  tra poco", all'infinito. Ora legge "Questa connessione non c'è più", e il testo scritto resta nel campo.
- **Testo nei log:** gli errori di Drizzle riportano i parametri della query, quindi un insert fallito poteva
  scrivere il testo di una lanterna nei log del server, contro quanto promette la spec. Ora l'errore esce senza.

### Task 9 — App installabile e pagina offline
- **Manifest e icone:** `app/manifest.ts` descrive l'app; i PNG, compresa la variante maskable per Android, nascono
  da `public/icon.svg` con `scripts/icons.ts` e si committano.
- **Service worker minimo:** `public/sw.js` guarda solo le navigazioni: prima la rete, e `/offline` se la rete manca.
  L'unica cosa in cache è la pagina offline, perché le pagine dell'app contengono dati personali. Il test lo verifica
  elencando tutta la cache, ed è stato provato con un service worker modificato apposta per salvare le navigazioni.
- **Pagina offline autosufficiente:** senza rete non arrivano CSS e font, quindi gli stili sono in linea. Il link
  "Riprova" è un `<a>` normale, perché nemmeno il JavaScript è disponibile.
- **Test isolati:** il service worker è attivo solo in `e2e/pwa.spec.ts`; gli altri test lo bloccano.

### Task 10 — Notifiche push
- **Prima si marca, poi si invia:** `notifyArrivals` segna le lanterne arrivate con un solo `UPDATE ... RETURNING`.
  Due esecuzioni simultanee non possono prendere la stessa riga, quindi niente doppioni. Il prezzo è che, se il worker
  cade tra i due passi, quell'avviso si perde; la lanterna resta comunque visibile, perché la visibilità non dipende dal worker.
- **Una notifica per gruppo:** una per destinatario e connessione, su ogni suo dispositivo. Contiene solo il nome del
  mittente, mai il testo. Una connessione chiusa non produce avvisi, anche se una lanterna conservata è ancora lì.
- **Endpoint scelto dal client:** il worker fa una richiesta a quell'indirizzo, quindi si accetta solo HTTPS verso un
  nome di dominio. `localhost` e gli IP sono rifiutati, comprese scritture come `https://2130706433`.
- **Esiti:** 404 e 410 tolgono la sottoscrizione; ogni altro errore la tiene e finisce nel log come numero, senza dati.
- **Telefono condiviso:** uscire o eliminare l'account spegne anche l'iscrizione del browser, altrimenti chi entra dopo
  riceverebbe avvisi con i nomi delle persone di un altro.
- **Permesso solo al tocco:** l'interruttore gestisce anche browser non supportato, permesso negato e iPhone senza app
  installata, con la guida "Aggiungi alla schermata Home".
- **Limite dei test:** il Chromium headless non mostra notifiche e non raggiunge un servizio push. Gli e2e simulano quella
  parte del browser; la consegna reale si verifica sul telefono nel Task 12.

### Task 11 — Coda offline per vocali e foto
- **Un solo percorso:** registratore e selettore foto non inviano più direttamente. Scrivono il file in IndexedDB e
  avvisano `OutboxPanel`, che lo invia. Da quel momento un vocale sopravvive a rete assente, pagina chiusa o crash.
  Testi e pensieri restano fuori dalla coda: si riscrivono in un attimo.
- **Niente doppioni se si perde una risposta:** dopo il caricamento il biglietto (`lanternId`) si salva sull'elemento,
  prima di confermare. Se la risposta alla conferma si perde, il giro successivo ripete solo la conferma, che è
  idempotente. Se intanto la pulizia ha tolto un caricamento mai confermato, l'invio riparte dal file.
- **Più schede:** due schede aperte al ritorno della rete inviavano lo stesso vocale due volte, come ha dimostrato
  un e2e. Ora il giro passa dalla Web Locks API: la seconda scheda aspetta e rilegge una coda già svuotata. Anche la
  scheda che non ha inviato aggiorna la pagina, quando vede la coda accorciarsi.
- **Errori distinti:** la rete assente ferma il giro e si riprova da soli; un rifiuto, come una connessione chiusa,
  resta visibile con il suo messaggio e con "Riprova" e "Scarta", senza tentativi infiniti.
- **PUT bloccato:** un caricamento senza risposta scade dopo 10 minuti e diventa un errore di rete.
- **Partenza in ritardo:** `getChannel` espone `nextDepartureAt`, nel fuso di chi riceve. Se la lanterna parte dopo
  quell'orario, l'app avvisa che partirà la sera dopo.
- **Dispositivo condiviso:** uscendo, l'app dice quante lanterne non sono partite e chiede conferma prima di
  cancellarle. Anche l'eliminazione dell'account svuota la coda. Gli elementi sono legati all'utente che li ha creati.
- **Senza IndexedDB:** il file resta in memoria e il pannello chiede di non chiudere la pagina.
- **Un test instabile, risolto:** in `e2e/offline.spec.ts` la navigazione verso il canale a volte restava ferma su
  "Un attimo…" e il test scadeva. Il trace di Playwright ha mostrato la causa: l'URL cambia quando la risposta RSC è
  ancora in streaming, e il test spegneva la rete proprio in quel momento. Spegnendola apposta al cambio di URL, il
  blocco si è ripresentato in 5 tentativi su 8, e in tutti i casi la pagina si è completata da sola al ritorno della
  rete: per chi usa l'app il caricamento dura quanto l'assenza di rete. Ora il test aspetta il tasto "Registra" prima
  di andare offline. Prima della correzione falliva 5 suite complete su 8, dopo ne sono passate 6 su 6.

### Task 12 — Prova finale su Android

Gli e2e simulano le notifiche e la rete: alcune cose si vedono solo su un telefono vero. La prova è stata fatta su un
Nothing A024 collegato al PC con il debug wireless e `adb reverse`, con il worker acceso.

| Controllo | Esito |
|---|---|
| Installazione da Chrome | Icona nella schermata Home, l'app si apre a schermo intero |
| Notifica all'arrivo di una lanterna | Inviata dal worker 54 secondi dopo l'orario |
| Tocco sulla notifica | Si apre il canale di chi ha inviato la lanterna |
| Modalità aereo durante un vocale | "In attesa di rete", poi invio al ritorno senza toccare l'app |
| Navigazione in modalità aereo | Compare la pagina offline a tutto schermo |

Il pannello Viaggio nel tempo non vale per il worker, che segue l'ora reale: per non aspettare la sera, durante la prova
l'orario di arrivo di una lanterna è stato anticipato direttamente nel database di sviluppo. Il cavo USB resta escluso
su questo PC, perché Windows assegna al telefono il driver generico WinUSB e sostituirlo richiede i permessi di
amministratore. iPhone resta non verificato.

**Stato del Piano 2:** 167 test di integrazione, 113 unit e 45 e2e verdi, con typecheck, lint e build puliti. Prossimo
passo: la revisione del blocco finale, poi l'unione in `main`.
