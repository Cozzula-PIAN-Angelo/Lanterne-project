# Lanterne — Piano 3: il lago, le pagine e la CI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trasformare il canale in un lago che segue il cielo, con le fasi del giorno calcolate in ora locale e, a scelta, il tramonto reale. Aggiungere i Ricordi rifiniti, le pagine Privacy e "Se stai male", la CI su GitHub Actions e il README definitivo, e chiudere i difetti minori rimasti dal Piano 2.

**Architecture:** Le fasi del cielo sono una funzione pura in `lib/time/sky.ts`, che riceve `now`, il fuso, gli istanti di arrivo e, se c'è, una posizione. Il server passa gli istanti di arrivo; il client calcola la fase con l'orologio del server corretto per la differenza col dispositivo, come già fa `Countdown`. La posizione esiste solo nel `localStorage` del dispositivo, arrotondata. La disposizione delle lanterne sul lago è una funzione pura e deterministica: le lanterne non saltano da un aggiornamento all'altro.

**Tech Stack:** Next.js 16.4 con `cacheComponents`, React 19.3, Tailwind 4, `suncalc` 1.9, `next/font/google` (Fraunces), Vitest, Playwright, GitHub Actions; per la GIF del README `gifenc` e `pngjs`.

**Spec:** `docs/superpowers/specs/2026-11-02-lanterne-design.md` (§6.5, §6.6, §9, §10, §12, §13).

**Riferimento visivo:** `.superpowers/brainstorm/1811-1793568907/content/lago-giorno.html`, il mockup scelto dall'utente il 2026-11-01 (lanterne luminose sul lago, la propria riva in basso, quella dell'altra persona in alto). È fuori da git: si legge, non si copia nel repository.

## Decisioni già prese con l'utente

- **Minori rinviati dal Piano 2:** si correggono tutti e cinque, in un task dedicato (Task 7), ognuno partendo da un test che fallisce.
- **Tasto dev "Fai arrivare adesso":** non si fa. L'utente lo vuole solo se un test ne ha bisogno, e nessun test di questo piano ne ha: e2e e GIF del README usano il Viaggio nel tempo, che sposta già l'orologio delle pagine. Resta un'idea annotata nel diario.
- **Testo del blocco:** la conferma dice anche che spariscono le lanterne non ancora arrivate, in entrambe le direzioni (Task 7).
- **Branch:** `piano-3`, da `main` dopo il merge della PR #2.
- **Niente Docker né permessi di amministratore in locale.** La CI invece usa `docker compose`, che su GitHub Actions c'è già.
- **Niente push senza richiesta:** il Task 8 si ferma e chiede all'utente prima di pubblicare il branch per vedere girare la CI.

## Decisioni tecniche di questo piano

- **Animazioni con CSS, senza Motion.** La spec cita Motion, ma servono solo un'oscillazione, una deriva e un arrivo dall'alto: bastano `@keyframes` e `@media (prefers-reduced-motion)`. Una dipendenza in meno nel bundle del canale. La spec si aggiorna nel Task 9.
- **Fasi con la posizione.** `suncalc` fornisce `goldenHour` (sole a 6° sull'orizzonte) e `sunset`. Il tramonto va da `goldenHour` a `sunset`, il crepuscolo da `sunset` all'apertura. Se il tramonto cade all'apertura o dopo, o non esiste (giorno o notte polare: `suncalc` restituisce date non valide), valgono le regole senza posizione.
- **Il tramonto si cerca nel giorno della sera di apertura:** il giorno locale dell'istante `nextArrivalAt − 1 minuto`. Con apertura a mezzanotte è il giorno prima, cioè la sera giusta.
- **Notte fino alle 06:00 locali**, anche quando la scadenza delle lanterne è più tardi (apertura a mezzanotte: notte fino alle 06:00, lanterne visibili fino alle 08:00). È solo il colore del cielo.
- **Posizione:** arrotondata a **un decimale** (circa 11 km), salvata in `localStorage` con la chiave `lanterne:sky-location`, cancellata quando si spegne l'opzione e all'uscita dall'account. Non entra mai in una richiesta.
- **Lanterna aperta:** toccando una lanterna sul lago si apre il suo pannello **sotto il lago**, non in una finestra modale. Il pannello riusa `ArrivedLantern`, `SentLantern` e `MemoryLantern`. Il focus passa al pannello.
- **Le proprie lanterne già partite** stanno piccole sulla riva dell'altra persona, accese, finché non scadono: da lì si apre il pannello con reazione e "l'ha conservata".
- **Aggiornamento all'arrivo:** il lago programma un `router.refresh()` al prossimo istante che cambia cosa si vede (arrivo, partenza di una propria lanterna, 06:00), così chi tiene la pagina aperta vede arrivare le lanterne senza ricaricare.
- **GIF del README:** uno script Playwright fotografa il canale demo a orari diversi con il cookie del Viaggio nel tempo, e `gifenc` compone la GIF. Niente ffmpeg.
- **Limite di età della coda offline:** **24 ore**. Un elemento più vecchio non parte più: resta nella coda come rifiutato, si può solo scartare.
- **Timeout delle Server Actions del caricamento:** **30 secondi** per richiesta e conferma. Allo scadere l'esito è `network` e la coda riprova. Una conferma scaduta ma in realtà riuscita si ripete senza danni, perché è idempotente; una richiesta scaduta ma riuscita lascia una lanterna `uploading` che la pulizia toglie dopo un'ora.

## Global Constraints

- Lingua dell'interfaccia: **italiano**. Tono sempre calmo e senza colpe.
- Prima di scrivere codice Next leggere la guida pertinente in `node_modules/next/dist/docs/`.
- Nessuna chiamata a `new Date()` senza argomenti fuori da `lib/clock`. Le funzioni di `lib/time` ricevono `now` come parametro.
- Ogni pagina nuova sotto `app/(app)` ha il suo `loading.tsx`.
- Carattere **Fraunces**. Palette naturale: blu inchiostro di notte, chiaro nebbioso di giorno, colori personali caldi. **Niente gradienti viola o effetti al neon.**
- **Codifica visiva:** colore = persona; forma = tipo (tonda: vocale, quadrata: foto, ovale: testo, puntino: pensiero); dimensione = lunghezza del contenuto.
- **Fasi senza posizione:** giorno → tramonto da **un'ora prima dell'apertura** → notte dall'apertura **fino alle 06:00** → giorno.
- **Le proprie lanterne si accendono nell'ultima ora prima della partenza**, con o senza posizione.
- Ogni lanterna è un pulsante con l'etichetta di `lanternLabel` ("Vocale di Giulia, 3 minuti, delle 9:14").
- Con `prefers-reduced-motion` le lanterne **stanno ferme in fila**.
- Contrasti **WCAG AA**, testi ridimensionabili.
- La posizione **non viene mai inviata al server**.
- Messaggio di assenza invariato: "Stasera l'acqua è tranquilla: Giulia non ha lasciato lanterne".
- Mezzanotte nell'interfaccia: "stanotte a mezzanotte", mai "00:00".
- Ogni task aggiorna `docs/sviluppo.md` nello stesso commit.
- `set -e` non ferma gli script nella shell Bash di questo ambiente: ogni comando di verifica si controlla con `|| exit 1`.

## Review Focus

1. **Pagina del canale lasciata aperta mentre arriva l'orario** → il lago passa alla notte e le lanterne arrivate compaiono senza ricaricare. *Test nel Task 3.*
2. **Posizione in un luogo senza tramonto** (giorno o notte polare) → nessun errore, valgono le fasi senza posizione. *Test nel Task 1.*
3. **Apertura a mezzanotte e notte del cambio d'ora** → la notte finisce alle 06:00 locali, non un'ora prima o dopo. *Test nel Task 1.*
4. **Posizione attiva** → nessuna richiesta dell'app, URL o corpo, contiene le coordinate. *Test nel Task 4.*
5. **Molte lanterne in una sera** (la spec non pone limiti: 40) → tutte dentro la scena e tutte raggiungibili come pulsanti. *Test nel Task 2.*

---

## Struttura dei file

```
lib/time/sky.ts                  skyPhase, isLanternLit, nextSkyChange (pure)
lib/lanterns/lake-layout.ts      forma, dimensione, posizione delle lanterne (pure)
lib/access/lanterns.ts           getChannel aggiunge lastArrivalAt; getMemories
lib/client/sky-location.ts       posizione arrotondata in localStorage
lib/client/sign-out.ts           sequenza di uscita testabile
lib/client/outbox.ts             età massima, etichetta di stato, partnerName
lib/client/upload-media.ts       withTimeout sulle Server Actions
components/lake/lake-scene.tsx   la scena (client)
components/lake/lake-lantern.tsx una lanterna come pulsante
components/lake/use-server-clock.ts  ora del server corretta, aggiornamento ai confini
components/sky-location-toggle.tsx
app/(app)/persone/[id]/page.tsx  il canale diventa il lago
app/(app)/persone/[id]/ricordi/page.tsx + loading.tsx
app/privacy/page.tsx, app/se-stai-male/page.tsx
app/globals.css, app/layout.tsx  Fraunces e palette
.github/workflows/ci.yml, docker-compose.yml (healthcheck)
scripts/readme-media.ts, docs/media/
README.md, docs/sviluppo.md, spec
```

---

### Task 1: Le fasi del cielo

**Files:**
- Create: `lib/time/sky.ts`, `lib/time/sky.test.ts`
- Modify: `package.json` (`suncalc`, `@types/suncalc`), `docs/sviluppo.md`

**Interfaces:**
- Consumes: `nextOccurrence`, `localDateOf`, `localInstant` da `lib/time/reveal-time.ts`.
- Produces:
  - `type SkyPhase = "day" | "sunset" | "dusk" | "night"`
  - `type SkyLocation = { lat: number; lng: number }`
  - `skyPhase(input: { now: Date; tz: string; lastArrivalAt: Date | null; nextArrivalAt: Date | null; location?: SkyLocation | null }): SkyPhase`
  - `isLanternLit(now: Date, departureAt: Date): boolean`
  - `nextSkyChange(input: same as skyPhase, departures: Date[]): Date | null` — il primo istante dopo `now` in cui cambia la fase o si accende o parte una propria lanterna.

- [ ] **Step 1: Crea il branch e installa `suncalc`**

Run: `git checkout -b piano-3 main && pnpm add suncalc@1.9.0 && pnpm add -D @types/suncalc`
Expected: `package.json` con le due dipendenze.

- [ ] **Step 2: Scrivi i test che falliscono**

Tutti gli istanti sono scritti in ora locale con un helper `local("2026-12-15 16:20", "Europe/Rome")` costruito su `localInstant`. Per ogni istante il test ricava `lastArrivalAt` con `previousOccurrence` (che include l'istante stesso) e `nextArrivalAt` con `nextOccurrence` (strettamente dopo), come farà il server. Le asserzioni:

```ts
describe("senza posizione, apertura 21:30 a Roma", () => {
  test.each([
    ["2026-11-12 20:29", "day"],
    ["2026-11-12 20:30", "sunset"],
    ["2026-11-12 21:29", "sunset"],
    ["2026-11-12 21:30", "night"],
    ["2026-11-13 05:59", "night"],
    ["2026-11-13 06:00", "day"],
  ])("%s → %s", ...);
});
test("apertura a mezzanotte: tramonto dalle 23, notte fino alle 06", ...);       // 22:59 day, 23:00 sunset, 00:00 night, 05:59 night, 06:00 day
test("notte del passaggio all'ora legale, mezzanotte a Roma", ...);              // 2026-03-29: 03:59Z night, 04:00Z day
test("con posizione a Roma il 15 dicembre: tramonto reale, poi crepuscolo", ...); // 41.9/12.5: 15:00 day, 16:20 sunset, 18:00 dusk, 21:29 dusk, 21:30 night
test("con posizione a Roma il 21 giugno", ...);                                   // 19:30 day, 20:30 sunset, 21:00 dusk, 21:30 night
test("tramonto dopo l'apertura: vince l'apertura", ...);                          // Roma 21 giugno, apertura 17:00: 15:59 day, 16:00 sunset, 17:00 night
test("sole di mezzanotte a Tromsø: si usano le fasi senza posizione", ...);       // 69.65/18.96, Europe/Oslo, 21 giugno, 21:30: 20:29 day, 20:30 sunset, 21:30 night, nessuna eccezione
test("senza orario concordato è sempre giorno", ...);                             // lastArrivalAt e nextArrivalAt null → "day"
test("una propria lanterna si accende un'ora prima della partenza", ...);         // isLanternLit: −61 min false, −60 min true, dopo la partenza true
test("nextSkyChange trova il primo confine", ...);                                // apertura 21:30, una partenza alle 21:00: alle 19:50 → 20:00 (accensione) ; alle 20:10 → 20:30 (tramonto) ; alle 21:45 → 06:00 del giorno dopo
```

- [ ] **Step 3: Esegui i test e verifica che falliscano**

Run: `pnpm test:unit lib/time/sky.test.ts`
Expected: FAIL, `skyPhase` non esiste.

- [ ] **Step 4: Implementa `lib/time/sky.ts`**

Notte se `lastArrivalAt ≤ now < nextOccurrence("06:00", tz, lastArrivalAt)`. Altrimenti si guarda `nextArrivalAt`: con una posizione valida, `SunCalc.getTimes` a mezzogiorno locale del giorno di `nextArrivalAt − 1 minuto`; se `goldenHour` e `sunset` sono date valide e `sunset < nextArrivalAt`, le soglie sono quelle; altrimenti tramonto da `nextArrivalAt − 1 ora`. `nextSkyChange` raccoglie i candidati (soglie della fase, `nextArrivalAt`, le 06:00, ogni `departure − 1 ora` e ogni `departure`) e restituisce il minimo strettamente maggiore di `now`.

- [ ] **Step 5: Esegui i test e verifica che passino**

Run: `pnpm test:unit lib/time/sky.test.ts`
Expected: PASS.

- [ ] **Step 6: Aggiorna il diario e fai il commit**

```bash
git add lib/time/sky.ts lib/time/sky.test.ts package.json pnpm-lock.yaml docs/sviluppo.md
git commit -m "feat: sky phases in local time with optional real sunset"
```

---

### Task 2: I dati del lago

**Files:**
- Create: `lib/lanterns/lake-layout.ts`, `lib/lanterns/lake-layout.test.ts`
- Modify: `lib/access/lanterns.ts` (`getChannel`), `tests/integration/lanterns.test.ts`, `docs/sviluppo.md`

**Interfaces:**
- Consumes: `LanternView` da `lib/access/lanterns.ts`.
- Produces:
  - `getChannel` restituisce in più `lastArrivalAt: Date | null`: l'ultimo arrivo per chi guarda, nel suo fuso (il `last` già calcolato per `partnerLeftNothing`); `null` se la connessione non è attiva o non ha orario. Il prossimo arrivo per chi guarda è già `connection.nextArrivalAt`.
  - `type LanternShape = "round" | "square" | "oval" | "dot"`
  - `lanternShape(type: LanternView["type"]): LanternShape`
  - `lanternSize(l: Pick<LanternView, "type" | "text" | "durationSec">): { w: number; h: number }` in px
  - `type LakeArea = "near" | "water" | "far"`
  - `lanternSpot(id: string, index: number, count: number, area: LakeArea): { x: number; y: number }` in percentuale della scena
  - `lanternRow(index: number, count: number, area: LakeArea): { x: number; y: number }` per `prefers-reduced-motion`

Valori: vocale tondo da **14 px** (1 s) a **26 px** (600 s), lineare; testo ovale largo da **12** a **22 px** con `text.length` da 1 a 1000, alto la metà; foto quadrata **14 px**; pensiero puntino **7 px**. Aree verticali: `far` 34–40 %, `water` 46–74 %, `near` 76–86 %; orizzontale 6–94 %.

- [ ] **Step 1: Scrivi i test che falliscono**

```ts
test("forma per tipo", ...);           // audio→round, photo→square, text→oval, thought→dot
test("dimensione per lunghezza", ...); // audio 1 s → 14, 600 s → 26, 300 s → 20 (arrotondato); testo 1000 caratteri → w 22, h 11; durata null → 14
test("la posizione dipende solo dall'id", ...);   // stesso id, index e count → stesso punto; due chiamate identiche
test("40 lanterne restano tutte dentro la loro area", ...); // per ogni area e per i da 0 a 39: x in [6, 94], y nell'intervallo dell'area
test("in fila: stessa altezza, ordine da sinistra", ...);   // lanternRow: y uguale per tutti, x crescente, dentro [6, 94]
```

In `tests/integration/lanterns.test.ts`, accanto al test esistente di `nextDepartureAt`:

```ts
test("lastArrivalAt è l'ultimo arrivo nel fuso di chi guarda", async () => {
  // now = 2026-11-02T22:00:00Z, apertura 21:30
  // Giulia (Roma): "2026-11-02T20:30:00.000Z" ; Marco (New York): "2026-11-02T02:30:00.000Z"
  // pending ed ended: null
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `pnpm test:unit lib/lanterns/lake-layout.test.ts` e `pnpm test:int tests/integration/lanterns.test.ts`
Expected: FAIL per funzioni e campo mancanti.

- [ ] **Step 3: Implementa** `lib/lanterns/lake-layout.ts` (posizione da un hash stabile dell'id, per esempio FNV-1a, sparso nell'area; `index` e `count` servono solo a `lanternRow`) e il campo `lastArrivalAt` in `getChannel`.

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: gli stessi due comandi. Expected: PASS.

- [ ] **Step 5: Aggiorna il diario e fai il commit**

```bash
git add lib/lanterns/lake-layout.ts lib/lanterns/lake-layout.test.ts lib/access/lanterns.ts tests/integration/lanterns.test.ts docs/sviluppo.md
git commit -m "feat: lantern layout on the lake and last arrival for the viewer"
```

---

### Task 3: Il lago

**Files:**
- Create: `components/lake/lake-scene.tsx`, `components/lake/lake-lantern.tsx`, `components/lake/use-server-clock.ts`
- Modify: `app/(app)/persone/[id]/page.tsx`, `app/layout.tsx`, `app/globals.css`, `components/lantern-item.tsx`, `e2e/helpers.ts`, `e2e/channel.spec.ts`, `e2e/full-flow.spec.ts`, `e2e/media.spec.ts`, `e2e/manage.spec.ts`, `e2e/offline.spec.ts` dove usano le sezioni del canale, `docs/sviluppo.md`
- Create: `e2e/lake.spec.ts`

**Interfaces:**
- Consumes: Task 1 (`skyPhase`, `isLanternLit`, `nextSkyChange`), Task 2 (`lanternShape`, `lanternSize`, `lanternSpot`, `lanternRow`, `getChannel().lastArrivalAt`), `lanternLabel`.
- Produces:
  - `LakeScene` (client) con props `{ serverNow: string; tz: string; lastArrivalAt: string | null; nextArrivalAt: string | null; me: { name: string; color: string }; partner: { name: string; color: string }; sent: LanternView[]; arrived: LanternView[]; partnerLeftNothing: boolean; connectionId: string }`. Le date arrivano serializzate come stringhe ISO. Il Task 4 aggiunge la posizione dentro `LakeScene`, senza cambiare le props.
  - `useServerClock(serverNow: string, nextChange: (now: Date) => Date | null): Date` — ora corretta per lo scarto col dispositivo, aggiornata ogni 30 s e al confine; al confine chiama `router.refresh()`.
  - Nel DOM: la scena è `role="region"` con nome "Il lago" e attributo `data-phase` uguale alla fase. Le lanterne sono pulsanti in due liste: "Le tue lanterne" (le proprie) e "Arrivate" (dell'altra persona). Ogni pulsante ha `aria-label` da `lanternLabel` e `data-lit="true|false"`. Il pannello aperto è `role="region"` con nome "Lanterna aperta".
  - Helper e2e `openLantern(page: Page, list: "Le tue lanterne" | "Arrivate", name: string | RegExp): Promise<Locator>` che tocca il pulsante e restituisce il pannello.

Palette (token CSS in `globals.css`, usati dalla scena):

| Token | Giorno | Tramonto | Crepuscolo | Notte |
|---|---|---|---|---|
| cielo alto → basso | `#e6ebee` → `#d6e0e5` | `#e9d3bd` → `#d9a98c` | `#4a4f66` → `#2e3448` | `#121a26` → `#1a2433` |
| acqua | `#b9cbd4` → `#a6bbc6` | `#a9b4bd` → `#8d98a3` | `#262c3d` → `#1c2232` | `#0f1720` → `#0c131b` |
| riva lontana | `#8fa3ae` | `#7f8a96` | `#1b2131` | `#0a1017` |
| riva vicina | `#e9e4d8` | `#ddd2c2` | `#2a2e3a` | `#1a1f27` |
| testo | `#26323a` | `#2f2a26` | `#ece7df` | `#ece7df` |

Il tramonto scalda il cielo senza viola. Il testo sulla scena deve restare AA in ogni fase: se uno di questi valori non lo raggiunge, si scurisce o schiarisce il fondo, non si abbassa il requisito.

- [ ] **Step 1: Scrivi `e2e/lake.spec.ts` (deve fallire)**

```ts
test("il lago segue il cielo e la pagina aperta vede arrivare le lanterne", async ({ browser }) => {
  // connectPair(…); Anna lascia un testo per Luca.
  // Luca con offset a 2 ore prima dell'apertura di New York: data-phase="day", lista "Arrivate" assente.
  // Offset a 30 min prima: data-phase="sunset".
  // Offset a 5 s prima, pagina caricata e NON ricaricata: entro 20 s data-phase="night"
  //   e nella lista "Arrivate" compare il pulsante /^Testo di Anna/.
  // openLantern(luca, "Arrivate", /^Testo di Anna/) mostra il testo, 💛 e Conserva.
  // Anna con offset a 30 min dalla partenza: il suo pulsante in "Le tue lanterne" ha data-lit="true";
  //   a 2 ore: data-lit="false".
});
test("con meno movimento le lanterne stanno ferme in fila", async ({ browser }) => {
  // contesto con reducedMotion: "reduce"; tre lanterne di Anna: i loro pulsanti hanno la stessa y (boundingBox)
  //   e x crescente; nessuna animazione attiva (getAnimations().length === 0 su ogni pulsante).
});
test("ogni lanterna ha un'etichetta leggibile", ...); // vocale finto: pulsante con nome /^Vocale di Anna, / ; foto: /^Foto di Anna, / ; testo: /^Testo di Anna, /
```

- [ ] **Step 2: Esegui e verifica che fallisca**

Run: `pnpm test:e2e e2e/lake.spec.ts`
Expected: FAIL, nessuna regione "Il lago".

- [ ] **Step 3: Fraunces e palette.** In `app/layout.tsx` sostituisci Geist con `Fraunces` di `next/font/google` (`subsets: ["latin"]`, asse `opsz`, `display: "swap"`), usato come `--font-sans` di tutta l'app; tieni Geist Mono per il codice. In `globals.css` aggiungi i token della tabella e le `@keyframes` `bob`, `drift`, `arrive` del mockup, tutte spente sotto `@media (prefers-reduced-motion: reduce)`. I colori di base dell'app (`--background`, `--foreground`) diventano quelli del giorno.

- [ ] **Step 4: Implementa `useServerClock`, `LakeLantern` e `LakeScene`.** La scena segue il mockup: riva dell'altra persona in alto con il suo nome ("la riva di Giulia"), acqua, la propria riva in basso. Proprie lanterne sigillate in `near`, già partite in `far`, arrivate in `water` con il riflesso di notte e l'animazione `arrive` dall'alto. Con `prefers-reduced-motion` (`matchMedia`, ascoltando i cambi) si usa `lanternRow` invece di `lanternSpot`. Colore = persona: `me.color` per le proprie, `partner.color` per le altre. Una lanterna spenta è grigio-lilla chiaro con bordo, come nel mockup; accesa ha il colore della persona e un alone. Senza lanterne arrivate di notte, la scena mostra il messaggio di assenza se `partnerLeftNothing`. Toccando una lanterna si apre sotto la scena il pannello "Lanterna aperta" con `ArrivedLantern` o `SentLantern`, e il focus va al pannello; ritoccando la stessa lanterna si chiude.

- [ ] **Step 5: Riscrivi la pagina del canale.** Ordine: intestazione, `LakeScene`, riga della partenza con `formatDepartureLabel` e `Countdown` (come oggi), `LanternComposer`, sezione Ricordi com'è oggi (il Task 5 la sostituisce con un link), `ConnectionMenu`. Le sezioni "Arrivate" e "Le tue lanterne" come liste spariscono: ora sono dentro la scena.

- [ ] **Step 6: Aggiorna gli e2e esistenti.** Aggiungi `openLantern` a `e2e/helpers.ts`. Dove un test cercava un testo nelle regioni "Arrivate" o "Le tue lanterne", apre la lanterna con `openLantern` e cerca nel pannello. Le asserzioni restano le stesse: cambia solo come si arriva al contenuto.

- [ ] **Step 7: Verifica**

Run: `pnpm typecheck || exit 1; pnpm lint || exit 1; pnpm test:unit || exit 1; pnpm test:e2e`
Expected: tutto verde, `lake.spec.ts` compreso.

- [ ] **Step 8: Guarda la scena.** Con `pnpm dev`, entra come Giulia e apri il canale con Marco; con il Viaggio nel tempo passa per giorno, tramonto, notte e mattina. Fai uno screenshot di ogni fase a 390 px di larghezza e controlla a occhio: nessun testo illeggibile, nessuna lanterna tagliata, niente viola. Annota nel diario cosa hai corretto.

- [ ] **Step 9: Aggiorna il diario e fai il commit**

```bash
git add app components e2e docs/sviluppo.md
git commit -m "feat: the channel becomes a lake that follows the sky"
```

---

### Task 4: Il cielo reale, con la posizione

**Files:**
- Create: `lib/client/sky-location.ts`, `lib/client/sky-location.test.ts`, `components/sky-location-toggle.tsx`
- Modify: `components/lake/lake-scene.tsx`, `app/(app)/impostazioni/page.tsx`, `components/sign-out-button.tsx`, `e2e/lake.spec.ts`, `docs/sviluppo.md`

**Interfaces:**
- Consumes: `SkyLocation` dal Task 1.
- Produces:
  - `roundCoord(n: number): number` — un decimale.
  - `readSkyLocation(storage?: Storage): SkyLocation | null` — `null` se manca, se il JSON è rotto, se i numeri sono fuori da ±90 / ±180, o se `localStorage` lancia.
  - `saveSkyLocation(loc: SkyLocation, storage?: Storage): void` — salva già arrotondato.
  - `clearSkyLocation(storage?: Storage): void`
  - `SKY_LOCATION_CHANGED = "lanterne:sky-location-changed"`, evento su `window` dopo ogni salvataggio o cancellazione.

- [ ] **Step 1: Scrivi i test che falliscono**

```ts
test("arrotonda a un decimale", ...);             // 41.9028 → 41.9 ; 12.4964 → 12.5 ; -0.04 → -0
test("salva e rilegge solo valori arrotondati", ...); // save {41.9028, 12.4964} → storage contiene "41.9" e "12.5", nessun "41.90"
test("dati rotti o fuori intervallo → null", ...);    // "{", {lat: 91}, {lat: "a"} → null
test("storage che lancia → null, nessuna eccezione", ...);
```

In `e2e/lake.spec.ts`:

```ts
test("con la posizione il cielo segue il tramonto vero, e la posizione non lascia il telefono", async ({ browser }) => {
  // contesto con geolocation {latitude: 41.9028, longitude: 12.4964} e permesso "geolocation".
  // Registra ogni richiesta (url + postData) dall'inizio del test.
  // Impostazioni → attiva "Usa la mia posizione per il cielo" → messaggio di conferma.
  // Nel canale di Anna (Roma), col Viaggio nel tempo a metà tra il tramonto reale di oggi (calcolato nel test con suncalc)
  //   e l'apertura delle 21:30: data-phase="dusk". Senza posizione, alla stessa ora, sarebbe "day" o "sunset", mai "dusk".
  // Nessuna richiesta registrata contiene "41.9", "12.5", "41.90", "12.49".
  // Spegni l'opzione: localStorage non ha più "lanterne:sky-location"; la fase torna quella senza posizione.
});
```

- [ ] **Step 2: Esegui e verifica che falliscano**

Run: `pnpm test:unit lib/client/sky-location.test.ts`, poi `pnpm test:e2e e2e/lake.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implementa** `sky-location.ts`; `SkyLocationToggle` nelle Impostazioni, con il testo "Usa la mia posizione per il cielo" e la spiegazione "Il tramonto sul lago segue quello vero. La posizione resta su questo telefono, arrotondata a circa 10 km, e non viene mai inviata." Se il permesso è negato: "Il browser non dà la posizione: il cielo segue l'orario di apertura." `LakeScene` legge la posizione con `useSyncExternalStore` (snapshot del server: `null`) e la passa a `skyPhase` e `nextSkyChange`. All'uscita riuscita dall'account si chiama `clearSkyLocation`, accanto alla pulizia della coda.

- [ ] **Step 4: Esegui e verifica che passino**

Run: gli stessi comandi. Expected: PASS.

- [ ] **Step 5: Aggiorna il diario e fai il commit**

```bash
git add lib/client/sky-location.ts lib/client/sky-location.test.ts components app e2e docs/sviluppo.md
git commit -m "feat: optional real sunset with the location kept on the device"
```

---

### Task 5: I Ricordi

**Files:**
- Create: `app/(app)/persone/[id]/ricordi/page.tsx`, `app/(app)/persone/[id]/ricordi/loading.tsx`, `e2e/memories.spec.ts`
- Modify: `lib/access/lanterns.ts`, `tests/integration/lanterns.test.ts`, `components/lantern-item.tsx` (`MemoryLantern`), `app/(app)/persone/[id]/page.tsx`, `app/(app)/page.tsx`, `e2e/channel.spec.ts`, `docs/sviluppo.md`

**Interfaces:**
- Produces: `getMemories(db: Db, input: { connectionId: string; userId: string; now: Date }): Promise<AccessResult<{ partner: ConnectionSummary["partner"]; status: ConnectionSummary["status"]; evenings: { date: string; lanterns: LanternView[] }[] }>>` — solo le lanterne conservate da `userId` in quella connessione, raggruppate per sera: il giorno locale di `revealAt − 1 minuto` nel fuso di chi guarda, così un arrivo a mezzanotte appartiene alla sera prima (`date` come `YYYY-MM-DD`), dalla sera più recente. Stesso esito `not_found` di `getChannel` per chi non è membro.

- [ ] **Step 1: Scrivi i test che falliscono**

Integrazione:

```ts
test("getMemories raggruppa per sera, dalla più recente", ...); // due lanterne conservate in due sere diverse → due gruppi, il primo è la sera più recente
test("getMemories mostra solo ciò che ho conservato io", ...);  // una conservata da Marco, una da Giulia: ognuno vede solo la sua
test("getMemories funziona anche a connessione chiusa", ...);   // status "ended" → stessi ricordi
test("un estraneo riceve not_found", ...);
```

E2e in `e2e/memories.spec.ts`:

```ts
test("una lanterna conservata si ritrova nei Ricordi, anche dopo la chiusura", ...);
// Luca conserva un testo di Anna; il canale mostra il link "Ricordi (1)"; la pagina Ricordi ha il titolo "Ricordi con Anna",
// l'intestazione della sera in lettere (per esempio "2 novembre", calcolata nel test dalla data dell'arrivo) e il testo; Luca chiude la connessione;
// dalla home, in "Connessioni chiuse", il link porta ai Ricordi, che mostrano ancora il testo.
```

- [ ] **Step 2: Esegui e verifica che falliscano**

Run: `pnpm test:int tests/integration/lanterns.test.ts`, `pnpm test:e2e e2e/memories.spec.ts`. Expected: FAIL.

- [ ] **Step 3: Implementa** `getMemories` e la pagina: intestazione con link al canale, titolo "Ricordi con {nome}", una sezione per sera con la data in lettere nel fuso di chi guarda (`format(…, "d MMMM", { locale: it })`), `MemoryLantern` con player, reazione data e ora d'arrivo. Senza ricordi: "Qui finiscono le lanterne che conservi." Il canale sostituisce la sezione Ricordi con il link "Ricordi ({n})", mostrato solo se n > 0. La home porta le connessioni chiuse ai Ricordi. Una connessione chiusa aperta da `/persone/[id]` reindirizza ai Ricordi.

- [ ] **Step 4: Verifica.** Gli stessi comandi, più `pnpm test:e2e e2e/channel.spec.ts` (usava la regione "Ricordi" nel canale: ora segue il link). Expected: PASS.

- [ ] **Step 5: Aggiorna il diario e fai il commit**

```bash
git add lib/access/lanterns.ts tests app components e2e docs/sviluppo.md
git commit -m "feat: memories page grouped by evening"
```

---

### Task 6: Privacy e "Se stai male"

**Files:**
- Create: `app/privacy/page.tsx`, `app/se-stai-male/page.tsx`, `components/info-footer.tsx`, `e2e/info.spec.ts`
- Modify: `app/(auth)/accedi/page.tsx`, `app/(app)/impostazioni/page.tsx`, `docs/sviluppo.md`

**Interfaces:**
- Produces: `InfoFooter`, con i link "Privacy" e "Se stai male", usato in `/accedi` e nelle Impostazioni.

Le due pagine sono pubbliche, fuori da `(app)`: si leggono senza account. Testo semplice, frasi brevi, nessun allarmismo.

**Privacy** deve dire, una voce per paragrafo:
- cosa viene salvato: email, nome, colore, fuso orario; le lanterne e i loro file; le reazioni; le sottoscrizioni alle notifiche; le sessioni di accesso;
- per quanto: una lanterna sparisce alle 6 del mattino di chi la riceve, con almeno 8 ore per ascoltarla, e viene cancellata davvero dal database e dallo storage; restano solo quelle conservate;
- chi la vede: solo chi la riceve dopo l'orario, e chi l'ha mandata; nessun altro;
- la posizione, se attivata, resta sul telefono, arrotondata, e non viene mai inviata;
- nessuna analisi di terze parti, nessuna pubblicità; i log non contengono mai i contenuti;
- le foto perdono i metadati, compresa la posizione GPS, prima di partire;
- eliminando l'account si cancellano dati, file e connessioni;
- è un progetto dimostrativo, non ancora pubblicato online: questa pagina non è un'informativa legale completa.

**Se stai male** deve dire:
- Lanterne non è un servizio di supporto e non è seguito da nessuno in tempo reale;
- in pericolo immediato: **112**;
- per parlare con qualcuno: **Telefono Amico Italia**, con numero e orari presi dal sito ufficiale `telefonoamico.it` il giorno dell'implementazione, e la data della verifica scritta nel diario;
- fuori dall'Italia: `findahelpline.com`, che raccoglie i servizi di ascolto per paese;
- una frase gentile finale, senza imperativi: parlarne con una persona di fiducia può aiutare.

Numeri e orari si scrivono come link `tel:` e si verificano sul sito. Se il sito non è raggiungibile, il task si ferma e chiede all'utente: un numero sbagliato su questa pagina è il difetto peggiore del piano.

- [ ] **Step 1: Scrivi `e2e/info.spec.ts` (deve fallire)**

```ts
test("Privacy e Se stai male si leggono senza account", ...);
// contesto nuovo, nessun login: /accedi ha i link "Privacy" e "Se stai male";
// /privacy: titolo "Privacy", testo /resta sul telefono/ e /6 del mattino/;
// /se-stai-male: link con href "tel:112"; un link tel: per Telefono Amico; link a https://findahelpline.com
test("le Impostazioni portano alle due pagine", ...);
```

- [ ] **Step 2: Esegui e verifica che fallisca.** Run: `pnpm test:e2e e2e/info.spec.ts`. Expected: FAIL.

- [ ] **Step 3: Verifica numero e orari** su `telefonoamico.it` e scrivili nel diario con la data.

- [ ] **Step 4: Implementa** le due pagine e `InfoFooter`.

- [ ] **Step 5: Esegui e verifica che passi.** Stesso comando. Expected: PASS.

- [ ] **Step 6: Aggiorna il diario e fai il commit**

```bash
git add app components e2e docs/sviluppo.md
git commit -m "feat: privacy and support pages"
```

---

### Task 7: I minori del Piano 2 e il testo del blocco

Ogni punto parte da un test che fallisce, poi la correzione, poi il test verde. Un solo commit alla fine, oppure uno per punto se il diff lo rende più leggibile.

**Files:**
- Create: `lib/client/sign-out.ts`, `lib/client/sign-out.test.ts`
- Modify: `components/sign-out-button.tsx`, `lib/client/push.ts`, `lib/client/outbox.ts`, `lib/client/outbox.test.ts`, `lib/client/outbox-store.ts`, `components/outbox-panel.tsx`, `components/lantern-composer.tsx`, `components/audio-recorder.tsx`, `components/photo-picker.tsx`, `lib/client/upload-media.ts`, `lib/client/upload-media.test.ts`, `components/connection-menu.tsx`, `e2e/offline.spec.ts`, `e2e/manage.spec.ts`, `docs/sviluppo.md`, ledger del Piano 2

**Interfaces:**
- Produces:
  - `signOutDevice(deps: { forgetPushOnServer(): Promise<PushSubscription | null>; restorePushOnServer(sub: PushSubscription): Promise<void>; unsubscribeBrowser(sub: PushSubscription): Promise<void>; signOut(): Promise<{ ok: boolean }>; clearLocalData(): Promise<void> }): Promise<boolean>`
  - `OutboxItem` aggiunge `queuedAt: string` (ISO) e `partnerName?: string`; `enqueue` li riceve dal chiamante.
  - `OUTBOX_MAX_AGE_MS = 24 * 60 * 60 * 1000`
  - `flushOutbox(store, userId, upload, nowMs: number)`: il quarto parametro è nuovo.
  - `outboxRowLabel(item: Pick<OutboxItem, "type" | "status" | "partnerName">, state: { sending: boolean; online: boolean; failedOnce: boolean }): string`
  - `ACTION_TIMEOUT_MS = 30_000` e `withTimeout<T>(promise: Promise<T>, ms: number): Promise<T>` in `lib/client/upload-media.ts`.

- [ ] **Step 1: Uscita fallita, notifiche spente.** Test in `sign-out.test.ts` con dipendenze finte:
  - `signOut` fallisce → `restorePushOnServer` chiamato con la stessa sottoscrizione, `unsubscribeBrowser` e `clearLocalData` mai chiamati, esito `false`;
  - `signOut` riesce → `unsubscribeBrowser` e `clearLocalData` chiamati, esito `true`;
  - nessuna sottoscrizione → `signOut` chiamato lo stesso, niente da ripristinare.

  Poi implementa: prima si toglie la riga sul server (serve la sessione), ma la sottoscrizione resta nel browser; a uscita fallita si risalva con `savePushAction`; a uscita riuscita si fa `unsubscribe`. `SignOutButton` usa `signOutDevice`; `clearLocalData` svuota la coda e la posizione del cielo.

- [ ] **Step 2: Coda senza limite di età.** Test in `outbox.test.ts`:
  - un elemento con `queuedAt` di 24 ore e 1 minuto prima di `nowMs` → `upload` non chiamato, stato `rejected`, messaggio "È rimasta in attesa più di un giorno e non è partita.";
  - 23 ore e 59 minuti → inviato;
  - un elemento salvato prima di questa modifica, senza `queuedAt` → trattato come appena accodato, inviato.

- [ ] **Step 3: Righe della coda senza destinatario.** Test su `outboxRowLabel`:
  - `{type: "audio", status: "waiting", partnerName: "Giulia"}`, offline → "Vocale per Giulia: in attesa di rete";
  - senza `partnerName` → "Vocale: in attesa di rete";
  - `sending: true` → "Vocale per Giulia: invio in corso…".

  L'avviso di ritardo nomina la persona: "La lanterna per Giulia era in attesa di rete: partirà la sera dopo." e sparisce al cambio di pagina (`usePathname`). `LanternComposer` riceve `partnerName` e lo passa a registratore e foto. In `e2e/offline.spec.ts`, l'asserzione sulla riga in coda diventa `/^Vocale per Luca: in attesa di rete$/`.

- [ ] **Step 4: "In attesa di rete" a rete funzionante.** Test su `outboxRowLabel`: `online: true, failedOnce: true, sending: false` → "Vocale per Giulia: nuovo tentativo tra poco". Il pannello tiene `failedOnce` per elemento dopo un esito `network`.

- [ ] **Step 5: Server Actions senza timeout.** Test in `upload-media.test.ts` con timer finti: `requestUploadAction` che non risponde mai → dopo 30 s l'esito è `{ kind: "network" }`; `confirmUploadAction` che non risponde mai, con `uploaded` già presente → `network`, e la conferma si può ripetere. Implementa `withTimeout` attorno alle due chiamate.

- [ ] **Step 6: Testo del blocco.** In `connection-menu.tsx` il testo della conferma diventa:
  `` `La connessione si chiude e le lanterne non ancora arrivate vengono eliminate, in entrambe le direzioni. ${partnerName} non potrà più invitarti e le tue lanterne che ha conservato verranno eliminate.` ``
  Aggiorna l'asserzione in `e2e/manage.spec.ts`, se c'è.

- [ ] **Step 7: Verifica completa**

Run: `pnpm typecheck || exit 1; pnpm lint || exit 1; pnpm test:unit || exit 1; pnpm test:int || exit 1; pnpm test:e2e`
Expected: tutto verde.

- [ ] **Step 8: Segna i minori come corretti** nel ledger del Piano 2, aggiorna il diario e fai il commit

```bash
git add lib components e2e docs/sviluppo.md
git commit -m "fix: deferred minors from plan 2 and clearer block warning"
```

---

### Task 8: CI con GitHub Actions

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `docker-compose.yml` (healthcheck), `README.md` (badge), `docs/sviluppo.md`

Workflow `CI`, su `push` e `pull_request` verso `main`, un solo job su `ubuntu-latest`, con `timeout-minutes: 30`:

1. `actions/checkout`, `pnpm/action-setup` (versione da `packageManager`), `actions/setup-node` con Node LTS e cache pnpm;
2. `docker compose up -d --wait` (per questo il servizio `postgres` riceve un healthcheck `pg_isready -U lanterne`, intervallo 2 s, 30 tentativi);
3. `pnpm install --frozen-lockfile`;
4. `pnpm run setup` (crea `.env`, chiavi VAPID, bucket, migrazioni, dati demo);
5. `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:int`;
6. `pnpm exec playwright install --with-deps chromium`, poi `pnpm test:e2e` con `CI=true`;
7. a errore, carica `test-results/` come artifact.

Se `pnpm run setup` chiede qualcosa o assume Windows, la correzione va in `scripts/setup.ts` con un test in `lib/setup/env-file.test.ts`, non nel workflow.

- [ ] **Step 1: Scrivi workflow e healthcheck.**

- [ ] **Step 2: Controlla la sintassi in locale.** Run: `pnpm dlx @action-validator/cli .github/workflows/ci.yml`. Expected: nessun errore.

- [ ] **Step 3: Chiedi all'utente** il permesso di pubblicare `piano-3` su GitHub per vedere la CI girare. Senza permesso il task si ferma qui e lo scrive nel ledger.

- [ ] **Step 4: Con il permesso,** `git push -u origin piano-3` e controlla l'esito dalla pagina Actions del repository (non c'è `gh`: si usa l'API pubblica con `curl` sull'elenco dei run del branch). Expected: run verde. Se fallisce, si corregge partendo dal log e si ripete.

- [ ] **Step 5: Badge nel README, diario e commit**

```bash
git add .github docker-compose.yml README.md docs/sviluppo.md
git commit -m "ci: lint, typecheck, unit, integration and e2e on GitHub Actions"
```

---

### Task 9: Il README definitivo

**Files:**
- Create: `scripts/readme-media.ts`, `docs/media/lago.gif`, `docs/media/giorno.png`, `docs/media/tramonto.png`, `docs/media/notte.png`, `docs/media/home.png`
- Modify: `README.md`, `package.json` (`gifenc`, `pngjs`, `@types/pngjs`, script `readme:media`), spec (stato e §4 Motion), `docs/sviluppo.md`

**Interfaces:**
- Consumes: il pannello e il cookie del Viaggio nel tempo (`lanterne-dev-offset`), i dati demo, il login demo.

`pnpm readme:media`, con `pnpm dev` acceso: entra come Giulia, apre il canale con Marco a 390 × 844, e scatta un fotogramma ogni 20 minuti simulati da tre ore prima dell'apertura a un'ora dopo, più `home.png`. La GIF dura circa 6 secondi, sta sotto i **3 MB**, e la palette di `gifenc` si calcola su tutti i fotogrammi insieme per evitare sfarfallii.

Il README contiene, in quest'ordine:
- una frase su cos'è Lanterne e la GIF del lago;
- tre screenshot affiancati: giorno, tramonto, notte;
- avvio rapido (quello attuale, riverificato da zero su una copia pulita del repository: `git clone` in una cartella temporanea, `pnpm install`, `pnpm run setup`, `pnpm dev`, login demo, cronometrato; il tempo va nel diario);
- un diagramma dell'architettura in Mermaid: browser e service worker, Next.js con `lib/access`, PostgreSQL, storage S3, worker pg-boss, servizio push;
- **"Scelte di design"**, un paragrafo ciascuna: perché niente chat, perché effimero, perché l'ora locale, perché niente reciprocità obbligatoria, perché la posizione resta sul telefono;
- sicurezza e privacy in breve, con il rimando alla pagina Privacy; la crittografia end-to-end come sviluppo futuro;
- prova su Android, test, CI, limiti noti (iPhone non verificato).

La spec passa da "in revisione" a "implementata", e §4 dice che le animazioni sono in CSS.

- [ ] **Step 1: Installa le dipendenze e scrivi lo script.** Run: `pnpm add -D gifenc pngjs @types/pngjs`.
- [ ] **Step 2: Genera i file.** Run: `pnpm readme:media`. Expected: i cinque file in `docs/media/`, la GIF sotto i 3 MB (`ls -l docs/media`).
- [ ] **Step 3: Guarda la GIF e gli screenshot.** Nessun pannello di sviluppo nell'inquadratura, nessun dato che non sia demo.
- [ ] **Step 4: Scrivi il README e aggiorna la spec.**
- [ ] **Step 5: Verifica l'avvio rapido da zero** su un clone pulito, come sopra.
- [ ] **Step 6: Diario e commit**

```bash
git add scripts/readme-media.ts docs/media README.md package.json pnpm-lock.yaml docs
git commit -m "docs: final README with the lake, architecture and design choices"
```

---

### Task 10: Prova sul telefono e verifica finale

**Files:**
- Modify: `docs/sviluppo.md`, `README.md` se emergono limiti, eventuali bug trovati

Con l'utente e il Nothing A024, via `adb reverse`, sulla build di produzione (`pnpm build && pnpm start`):

- [ ] **Step 1: Il lago nelle quattro fasi**, con il Viaggio nel tempo: leggibile, nessuna lanterna tagliata, le lanterne arrivate si toccano bene col dito.
- [ ] **Step 2: Posizione vera:** attiva l'opzione, accetta il permesso, controlla che la fase corrisponda al tramonto di quel giorno; spegnila.
- [ ] **Step 3: Meno movimento:** con "Rimuovi animazioni" attivo nelle impostazioni di Android le lanterne stanno ferme in fila.
- [ ] **Step 4: Pagina aperta all'orario:** lascia il canale aperto a pochi secondi dall'arrivo e guarda arrivare le lanterne senza toccare niente.
- [ ] **Step 5: Verifica finale.** Run: `pnpm typecheck || exit 1; pnpm lint || exit 1; pnpm test:unit || exit 1; pnpm test:int || exit 1; pnpm build || exit 1; pnpm test:e2e`. Expected: tutto verde; i numeri vanno nel diario.
- [ ] **Step 6: Diario e commit**

```bash
git add docs README.md
git commit -m "docs: finish plan 3 with device checks"
```
