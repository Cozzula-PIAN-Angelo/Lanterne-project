# Lanterne — Design

**Data:** 2026-11-02
**Stato:** in revisione
**Nome:** "Lanterne" è provvisorio, non definitivo.

---

## 1. Scopo

Lanterne aiuta amici e conoscenti che si sentono poco (una settimana o più) a restare vicini, senza chiamate e senza i soliti messaggi di circostanza sulle piattaforme esistenti. Durante il giorno ognuno lascia frammenti della propria giornata (vocali, foto, testi); la sera, a un orario concordato, li si **ascolta**.

Non è una chat e non vuole sostituire WhatsApp o altri social: è un **rituale serale di ascolto e condivisione**.

**Contesto del progetto:** progetto full-stack da portfolio, pubblicato su GitHub. È pensato per utenti reali (qualità, privacy, cura) ma per ora non è ospitato online: deve essere facile da avviare in locale e pronto per un eventuale deploy futuro senza riscritture.

### Criteri di successo

- Chi clona il repository avvia l'app in locale in circa 5 minuti e prova il flusso completo con utenti demo.
- Il codice dimostra competenze full-stack reali: autenticazione, gestione dei media, logica legata al tempo e ai fusi orari, autorizzazioni lato server, test.
- Il README racconta le scelte di design e il loro perché.

---

## 2. Principi

1. **L'ora locale dell'utente è sempre il riferimento.** Nel database i tempi sono in UTC; tutto ciò che l'utente vede o imposta è espresso e calcolato nella sua ora locale.
2. **Nessuna pressione.** Niente reciprocità obbligatoria, niente serie, contatori o notifiche che facciano sentire in colpa.
3. **Ascoltare, non conversare.** Nessuna risposta né chat: al massimo una reazione.
4. **Effimero per default.** Le lanterne spariscono la mattina dopo, salvo quelle conservate.
5. **La correttezza non dipende da un timer.** Apertura e scadenza le decide il server nella query, a ogni richiesta.
6. **Privacy by design.** Minimizzazione dei dati, media privati, nessun tracciamento, posizione mai inviata al server.

---

## 3. Concetti e regole di prodotto

### Connessioni
- Ogni utente ha al massimo **5 connessioni** (attive + in attesa).
- Ogni connessione è un canale separato tra due persone.
- Una connessione nasce da un **invito** (link o codice) che l'altra persona accetta.

### Orario di apertura
- È un orario "da orologio" (es. `21:30`) **concordato dalla coppia**, scelto tra **17:00 e 00:00 (mezzanotte) compresa**.
- Ognuno lo vive **nella propria ora locale**: le lanterne per Marco (New York) arrivano alle 21:30 di New York, quelle per Giulia (Roma) alle 21:30 di Roma. Tra fusi diversi l'ascolto non è contemporaneo.
- Un **cambio d'orario** è una proposta che l'altra persona deve accettare. Vale **dal giorno dopo** (vedi §6.3). Una nuova proposta sostituisce quella ancora in attesa.
- Nell'interfaccia mezzanotte si scrive "stanotte a mezzanotte", non "00:00".

### Lanterne
- **Tipi:** `audio` (vocale), `photo`, `text`, `thought` (pensiero).
- **Vocale:** fino a **10 minuti** per lanterna. È il gesto principale dell'interfaccia.
- **Testo:** fino a 1000 caratteri.
- **Pensiero:** una frase breve scelta da un set predefinito ("ti penso", "giornata pesante, ci sono", …), per esserci con un tocco senza raccontare.
- **Foto:** una per lanterna, ricompressa sul telefono (max 2048 px, senza metadati EXIF).
- **Nessun limite al numero di lanterne**, solo un tetto di sicurezza di **60 minuti di audio al giorno per connessione** per mittente.
- Una lanterna inviata **dopo** l'orario di apertura del destinatario parte alla **sua apertura successiva**.

### Apertura senza reciprocità
- All'orario si apre sempre tutto, a prescindere da chi ha inviato.
- Se l'altra persona non ha mandato niente: "Stasera l'acqua è tranquilla: Giulia non ha lasciato lanterne". Nessuna notifica per l'assenza.
- È normale che in una coppia uno condivida di più e l'altro ascolti di più.

### Reazioni
- Una reazione per lanterna, dal set 💛 🫂 😂 😮 🌙, modificabile. Solo il destinatario può reagire.

### Effimere ma salvabili
- Una lanterna resta visibile fino alle **6:00 del mattino nel fuso del destinatario**, con una **finestra minima di 8 ore** dall'apertura.
- Il destinatario può **conservarla**; il mittente vede "Marco l'ha conservata".
- Ogni utente può impostare "le mie lanterne non si possono salvare". L'impostazione vale per le lanterne inviate **da quel momento in poi**: ogni lanterna memorizza `savable` all'invio.
- Le lanterne conservate finiscono nei **Ricordi** della connessione.

### Chiusura, blocco, eliminazione
- **Chiusura di una connessione:** chiunque dei due, in qualsiasi momento. Le lanterne non ancora aperte vengono eliminate; i ricordi già salvati restano a chi li ha salvati.
- **Blocco:**
  - chiude la connessione;
  - elimina le lanterne non aperte in entrambe le direzioni;
  - **elimina le lanterne del bloccante salvate dal bloccato**;
  - rifiuta i futuri inviti del bloccato.
  - È silenzioso: il bloccato vede solo la connessione chiusa, e i suoi inviti risultano "non validi".
  - Si può sbloccare dalle impostazioni, ma per ricollegarsi serve un nuovo invito.
- **Eliminazione dell'account:** cancella dati, file e connessioni dell'utente.

---

## 4. Architettura

**Approccio scelto:** monolite Next.js + PostgreSQL + storage compatibile S3, più un worker separato nello stesso repository.

| Parte | Tecnologia |
|---|---|
| Frontend + backend | Next.js (App Router), TypeScript, Server Components, Server Actions, Route Handlers |
| Database | PostgreSQL + Drizzle ORM |
| Media | Storage compatibile S3: **SeaweedFS** in locale, Cloudflare R2 / AWS S3 in un eventuale deploy |
| Autenticazione | Better Auth (plugin magic link, adattatore Drizzle), sessioni nel database |
| Email in locale | Mailpit |
| Lavori pianificati | Processo worker Node con **pg-boss** (coda su PostgreSQL, niente Redis) |
| Notifiche | Web Push (VAPID) tramite service worker |
| UI | Tailwind CSS, shadcn/ui, Motion; carattere Fraunces |
| Tempo e fusi | `date-fns` + `@date-fns/tz` (fusi IANA); `suncalc` sul client per il tramonto |
| Validazione | Zod su tutti gli input lato server |
| Package manager | pnpm |

**Perché questo approccio:** mostra un backend scritto a mano (autorizzazioni, logica sul tempo, media), gira interamente in locale senza account esterni e si può spostare su qualunque hosting cambiando solo la configurazione. Alternative scartate: Supabase (nasconde troppo backend, dipendenza dal fornitore) e un'API separata in NestJS/Fastify (sovradimensionata per questa app).

### Struttura del repository

```
lanterne/
  app/              pagine e API (Next.js)
  components/       interfaccia (lago, lanterne, form)
  lib/
    clock/          orologio iniettabile (Clock)
    time/           logica sul tempo: funzioni pure
    access/         unico modulo che decide "chi vede cosa"
    db/             schema Drizzle + migrazioni
    storage/        S3, URL firmati
    push/           web push
  worker/           lavori pg-boss
  e2e/              test Playwright
  docker-compose.yml
```

### Confini tra le unità

- **`lib/time`**: funzioni pure, senza I/O. Ricevono `now` e i fusi come parametri e restituiscono istanti (`computeRevealAt`, `computeExpiresAt`, `skyPhase`, …). Si testano senza database.
- **`lib/clock`**: unica fonte di "adesso". Il codice non chiama mai `new Date()` direttamente.
- **`lib/access`**: unico punto che legge e scrive le lanterne e applica tutte le regole di visibilità e autorizzazione. Pagine, Server Actions e Route Handlers passano sempre da qui. Le query ricevono `now` come parametro, non usano `now()` di SQL, così l'orologio resta iniettabile.
- **`lib/storage`**: genera gli URL firmati e verifica gli oggetti caricati. Non conosce le regole di prodotto.
- **`worker/`**: usa `lib/access` e `lib/storage`, non contiene regole di visibilità proprie.

---

## 5. Modello dei dati

Tempi in UTC (`timestamptz`); orari "da orologio" come `time` o stringa `HH:MM`.

**`users`**
- `id`, `email` (unico), `name`, `image`
- `color`: il colore personale; le lanterne dell'utente hanno questo colore
- `timezone`: fuso IANA, es. `Europe/Rome`
- `allowSaving` (bool, default `true`), `createdAt`
- più le tabelle standard di Better Auth (`user` esteso con i campi sopra, `session`, `account`, `verification`)

**`connections`**
- `id`, `userAId`, `userBId`, `status` (`pending` | `active` | `ended`)
- `revealTime` (`HH:MM`, 17:00–00:00; nullo finché non è concordato)
- `previousRevealTime`, `revealTimeChangedAt`: servono a far valere il cambio "dal giorno dopo"
- `proposedRevealTime`, `proposedBy`, `proposedAt`: proposta in attesa
- `createdAt`, `endedAt`
- vincolo: una sola connessione non terminata per coppia di utenti

**`invites`**
- `id`, `inviterId`, `code` (unico, casuale ad alta entropia), `proposedRevealTime`
- `expiresAt` (7 giorni), `acceptedAt`, `acceptedBy`, `createdAt`
- monouso, garantito da una transazione e da un vincolo

**`lanterns`**
- `id`, `connectionId`, `senderId`, `recipientId`
- `type` (`audio` | `photo` | `text` | `thought`)
- `text`, `mediaKey`, `mediaMime`, `mediaBytes`, `durationSec`
- `status` (`uploading` | `ready`)
- `revealAt`, `expiresAt`
- `savable`, `savedAt`
- `reaction`, `reactedAt`
- `notifiedAt`, `createdAt`

**`blocks`**
- `blockerId`, `blockedId`, `createdAt` (chiave primaria sulla coppia)

**`push_subscriptions`**
- `id`, `userId`, `endpoint` (unico), `p256dh`, `auth`, `createdAt`

**`rate_limits`**
- `key`, `windowStart`, `count`: limiti su login, inviti e upload

Le tabelle di pg-boss sono gestite dalla libreria.

**Dati calcolati e non salvati:** il messaggio "non ha lasciato lanterne", le fasi del cielo e i conti alla rovescia.

---

## 6. Logica del tempo

### 6.1 `revealAt`
Quando il server crea la lanterna, cioè alla richiesta dell'URL di upload o all'invio di un testo o pensiero:
1. si prende l'orario di apertura effettivo della connessione per quel giorno (§6.3);
2. si calcola la **prossima occorrenza** di quell'orario **nel fuso del destinatario** (`users.timezone` al momento dell'invio) successiva a `now`.

Esempi:
- Giulia (Roma) invia alle 23:00 di Roma, cioè le 17:00 di New York: Marco la riceve alle 21:30 di New York della stessa sera.
- Apertura a mezzanotte, invio alle 23:50: arriva 10 minuti dopo. Invio alle 00:10: arriva la mezzanotte successiva.

Il fuso del destinatario è quello al momento dell'invio. Se il destinatario cambia fuso, la modifica vale per le lanterne successive.

### 6.2 `expiresAt`
La prima occorrenza delle **06:00 nel fuso del destinatario** dopo `revealAt`, con un minimo di `revealAt + 8 ore`. Con apertura a mezzanotte la scadenza è quindi alle 08:00.

### 6.3 Cambio d'orario "dal giorno dopo"
Quando una proposta viene accettata: `previousRevealTime ← revealTime`, `revealTime ← proposto`, `revealTimeChangedAt ← now`. Per una lanterna creata in un istante `t` si usa `previousRevealTime` se `t` cade nello **stesso giorno locale del destinatario** di `revealTimeChangedAt`, altrimenti `revealTime`. Le lanterne già create non cambiano mai il loro `revealAt`.

### 6.4 Visibilità (applicata in `lib/access`)
- **Destinatario:** lanterne `ready` con `revealAt ≤ now < expiresAt`, più quelle con `savedAt` non nullo.
- **Mittente:** le proprie lanterne `ready` fino a `expiresAt` (sigillate prima di `revealAt`, aperte dopo, con l'eventuale reazione); può eliminarle solo prima di `revealAt`.
- **Nessun altro** vede alcuna lanterna. Nessun URL dei media viene emesso fuori da queste regole.
- Il mittente vede la partenza delle proprie lanterne **nella propria ora locale** (es. "partono alle 3:30, le 21:30 di Marco").

### 6.5 Fasi del cielo (solo client, solo visuale)
Calcolate per connessione, nel fuso dell'utente che guarda, rispetto al **suo** orario di arrivo:
- **Senza posizione** (default): giorno → **tramonto** da un'ora prima dell'apertura → **notte** dall'apertura fino alle 06:00 → giorno.
- **Con posizione** (facoltativa): giorno → **tramonto reale** (calcolato con `suncalc`) → **crepuscolo** fino all'apertura → notte all'apertura. Se il tramonto reale cade dopo l'apertura, vince l'apertura.
- **Le proprie lanterne si accendono nell'ultima ora prima della partenza**, con o senza posizione.
- La posizione è usata solo sul dispositivo, eventualmente salvata arrotondata in locale, e **mai inviata al server**.

### 6.6 Ora del server
Il client calcola i conti alla rovescia dai `revealAt` restituiti dal server, corretti per la differenza tra il proprio orologio e quello del server.

---

## 7. Flussi principali

1. **Accesso:**
   - email → magic link (monouso, valido 15 minuti);
   - al primo accesso si scelgono nome, avatar e **colore**, e il fuso viene rilevato in automatico;
   - in sviluppo, un endpoint attivo solo con `NODE_ENV=development` crea una sessione per un utente demo ("Entra come utente demo").
2. **Invito:**
   - Giulia crea un invito proponendo un orario e condivide link o codice;
   - Marco accede e accetta, oppure propone un altro orario (la connessione resta `pending` finché Giulia non accetta);
   - prima di creare la connessione si verificano limite di 5, scadenza, uso singolo, blocchi, auto-invito e connessione già esistente.
3. **Invio di un vocale o di una foto:**
   - il client chiede un URL firmato;
   - il server crea la lanterna con `status = uploading`, calcola `revealAt` e `expiresAt` e restituisce un URL di upload valido 5 minuti, con vincoli su tipo e dimensione;
   - il client carica il file direttamente su S3 e conferma;
   - il server verifica l'oggetto (esistenza, dimensione, tipo) e imposta `ready`.
4. **Invio di testo o pensiero:** creazione diretta con `ready`.
5. **Arrivo:**
   - il worker notifica "Le lanterne di Giulia sono arrivate";
   - il client mostra il lago di notte;
   - toccando una lanterna il server emette URL di lettura firmati validi 5 minuti.
6. **Reazione e salvataggio:** solo il destinatario, solo su lanterne visibili; "Conserva" solo se `savable`.
7. **Gestione:** proposta di cambio orario, chiusura connessione, blocco e sblocco, eliminazione account.

---

## 8. Worker (pg-boss)

Il worker serve solo per notifiche e pulizia; un suo ritardo non altera mai la visibilità.

- **Notifiche di arrivo** (ogni minuto):
  - trova le lanterne `ready` con `revealAt ≤ now` e `notifiedAt` nullo;
  - le raggruppa per destinatario e connessione, invia una push per gruppo e imposta `notifiedAt`;
  - è idempotente: una doppia esecuzione non manda notifiche doppie.
- **Pulizia delle scadute** (ogni 15 minuti): per le lanterne con `expiresAt < now` e `savedAt` nullo, elimina prima l'oggetto S3 e poi la riga, con tentativi ripetuti.
- **Upload abbandonati** (ogni 15 minuti): lanterne `uploading` create da più di un'ora, eliminate insieme all'eventuale oggetto.
- **Cancellazioni a cascata:** chiusura di connessioni, blocchi ed eliminazione account accodano la cancellazione dei relativi oggetti S3, con tentativi ripetuti.
- Le sottoscrizioni push che rispondono 404 o 410 vengono rimosse.

---

## 9. Sicurezza e privacy

- **Sessioni:** Better Auth nel database, cookie `httpOnly` e `secure`. Rate limit su login, creazione e accettazione inviti, upload.
- **Autorizzazione:** centralizzata in `lib/access`, che è il modulo più testato. Tutti gli input sono validati con Zod.
- **Media:**
  - bucket privato;
  - chiavi casuali non indovinabili;
  - URL firmati validi 5 minuti, sia in upload sia in lettura;
  - limiti di tipo e dimensione imposti nella firma (audio ≤ 25 MB, foto ≤ 10 MB) e verificati dopo l'upload;
  - foto ricompresse sul client, che così rimuove i metadati EXIF (posizione GPS).
- **Minimizzazione:** le lanterne sono effimere e vengono cancellate davvero, sia dal database sia dallo storage. Nessun analytics di terze parti. I log non contengono mai i contenuti delle lanterne.
- **Pagina Privacy** in linguaggio semplice: cosa viene salvato, per quanto, e che la posizione resta sul telefono.
- **Pagina "Se stai male":** chiarisce che Lanterne non è un servizio di supporto in caso di crisi e indica i contatti utili (112, Telefono Amico Italia, risorse internazionali). Tono semplice, senza allarmismi.
- **Fuori scope:** crittografia end-to-end (citata nel README come sviluppo futuro); segnalazioni e moderazione, non necessarie perché ci si collega solo su invito ed esistono chiusura e blocco.

---

## 10. Interfaccia e PWA

### Stile
- Tutta l'app (home, inviti, impostazioni) è semplice e schematica.
- Il canale con una persona è il **lago**.
- Palette naturale: blu inchiostro di notte, chiaro nebbioso di giorno, colori personali caldi (ambra, terracotta, salvia, lilla…). Niente gradienti viola o effetti al neon. Carattere Fraunces.

### Schermate
- **Home "Le tue persone":** fino a 5 card con lo stato in ora locale ("Hai preparato 3 lanterne per Giulia · partono alle 21:30" / "Le lanterne di Giulia sono arrivate"), più gli slot "Invita qualcuno".
- **Il lago** (canale con una persona), in tre fasi che seguono il cielo (§6.5):
  - **Giorno · preparazione:**
    - lago chiaro e nebbioso; la riva dell'amico è lontana in alto, la propria in basso;
    - le proprie lanterne sono **spente** sulla propria riva, si possono riascoltare o eliminare;
    - conto alla rovescia;
    - grande pulsante di registrazione, con testo, foto e pensiero subito sotto.
  - **Tramonto:** il cielo si scalda e le proprie lanterne si accendono una alla volta; si possono ancora aggiungere.
  - **Notte · arrivo:**
    - le lanterne dell'amico arrivano dalla sua riva e galleggiano accese con il loro riflesso nell'acqua;
    - toccandone una si apre vocale, foto o testo, con reazione e "Conserva" sotto;
    - se non ci sono lanterne: lago calmo e messaggio gentile.
  - **Codifica visiva delle lanterne:** colore = persona; forma = tipo (tonda: vocale, quadrata: foto, ovale: testo, puntino: pensiero); dimensione = lunghezza del contenuto.
- **Ricordi:** le lanterne conservate della connessione.
- **Impostazioni:** profilo e colore, fuso, posizione per il cielo reale (facoltativa), "permetti di salvare le mie lanterne", notifiche, utenti bloccati, Privacy, "Se stai male", eliminazione account.

### Accessibilità
- Con `prefers-reduced-motion` le lanterne stanno ferme in fila.
- Ogni lanterna è un pulsante con etichetta leggibile dallo screen reader ("Vocale di Giulia, 3 minuti, delle 9:14").
- Contrasti WCAG AA, testi ridimensionabili.

### PWA
- Manifest e icone; service worker per push e app shell offline.
- Su iOS le push funzionano solo con l'app installata sulla schermata Home: guida "Aggiungi alla schermata Home".

### Formato audio
- Registrazione con `MediaRecorder`, preferendo `audio/mp4` (AAC) quando supportato, altrimenti `audio/webm`.
- **Primo passo dell'implementazione:** verifica di registrazione e riproduzione incrociata tra Android e iPhone.
- Solo se emergono incompatibilità si aggiunge la conversione con ffmpeg nel worker.

---

## 11. Errori e casi limite

- **Offline o upload fallito:**
  - la lanterna registrata viene salvata in **IndexedDB** sul dispositivo e l'invio riparte al ritorno della rete;
  - etichetta "in attesa di rete" e pulsante "riprova";
  - `revealAt` si calcola quando il server crea la lanterna; se nel frattempo l'orario è passato, l'app avvisa che partirà la sera dopo.
- **Permessi negati** per microfono o fotocamera: spiegazione su come riattivarli; testo e pensiero restano disponibili.
- **Browser senza registrazione audio:** restano testo, foto e pensiero, con un avviso.
- **Tetto audio giornaliero raggiunto:** "Per oggi il lago è pieno".
- **Inviti:** scaduto, già usato, auto-invito, già collegati, limite raggiunto: messaggi chiari. Per un blocco il messaggio resta generico ("invito non valido").
- **Accettazioni concorrenti:** transazione e vincolo di unicità garantiscono l'uso singolo.
- **Notifiche negate o non supportate:** l'app funziona comunque.
- **Worker fermo:** visibilità corretta; notifiche in ritardo; la pulizia recupera al riavvio.
- **Tono:** sempre calmo e senza colpe.

---

## 12. Test

Sviluppo guidato dai test (TDD).

- **Unit (Vitest) su `lib/time`:** tabelle di casi con fusi diversi (Roma/New York), mezzanotte, cambio d'ora legale, invio un minuto prima o dopo l'apertura, finestra minima di 8 ore, cambio d'orario "dal giorno dopo", fasi del cielo con e senza posizione, tramonto reale dopo l'apertura.
- **Integrazione su `lib/access`** contro PostgreSQL reale in Docker. Ad esempio: il destinatario non vede prima di `revealAt`; un esterno non vede mai nulla; il mittente non può eliminare dopo `revealAt`; dopo il blocco spariscono le lanterne salvate; una lanterna non `savable` non si può conservare; limite di 5 connessioni.
- **Integrazione** su Server Actions, Route Handlers e lavori del worker, con PostgreSQL e SeaweedFS reali.
- **End-to-end (Playwright)** con viewport mobile: invito → accettazione → invio testo e vocale (microfono finto di Chromium) → avanzamento dell'orologio → arrivo → reazione → salvataggio.
- **`Clock` iniettabile** in tutti i livelli di test.
- **CI con GitHub Actions:** lint, typecheck, unit, integrazione, e2e.

---

## 13. Setup locale e documentazione

- `docker compose up` avvia PostgreSQL, SeaweedFS (con il bucket creato automaticamente) e Mailpit.
- `pnpm setup` installa, crea `.env` da `.env.example`, genera le chiavi VAPID, esegue le migrazioni e carica i dati demo.
- `pnpm dev` avvia insieme app e worker.
- **Dati demo:** Giulia, Marco e Sara, con connessioni e lanterne in stati diversi (in preparazione, arrivate, conservate).
- **Pannello "viaggio nel tempo"**, solo in sviluppo:
  - sposta l'orologio dell'app tramite un offset per richiesta, per vedere subito giorno → tramonto → notte → arrivo;
  - il worker lo ignora.
- **README:**
  - GIF del lago dal giorno alla notte, screenshot, avvio rapido, diagramma dell'architettura;
  - sezione **"Scelte di design"**: perché niente chat, perché effimero, perché l'ora locale, perché niente reciprocità obbligatoria, perché la posizione resta sul telefono.

---

## 14. Fuori scope (possibili sotto-progetti futuri)

- Mood tracker, abitudini di benessere, esercizi guidati (le altre idee iniziali).
- Abbinamento con sconosciuti, community e moderazione.
- Crittografia end-to-end.
- App nativa.
- Deploy pubblico e relativi adempimenti (privacy policy legale completa, GDPR operativo).
- Nome definitivo e identità visiva finale.
