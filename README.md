# Lanterne

Una PWA per restare vicini a poche persone: lasci una lanterna durante il giorno e arriva alla sera,
all'orario che avete concordato, nell'ora locale di chi la riceve.

> Sono completi il Piano 1 (fondamenta) e il Piano 2 (vocali e foto, worker, PWA con notifiche e coda offline).
> L'interfaccia è volutamente schematica. Il diario tecnico è in [`docs/sviluppo.md`](docs/sviluppo.md).

## Prerequisiti

- Node LTS e pnpm
- PostgreSQL, Mailpit e uno storage S3 (SeaweedFS), con Docker (`docker compose up -d`) oppure installati a mano. Il
  database deve rispondere sulla porta **5433**, con gli utenti e i database di
  `docker/postgres-init.sql`. Senza Docker, installa `weed`
  dalle [release di SeaweedFS](https://github.com/seaweedfs/seaweedfs/releases) e avvialo con `pnpm s3`.

## Avvio rapido

```bash
docker compose up -d   # se usi Docker
pnpm install
pnpm run setup         # crea .env, migra il database e carica i dati demo
pnpm dev
```

Usa `pnpm run setup` per esteso: `pnpm setup` è un comando interno di pnpm, che non lancia lo script
del progetto.

`pnpm dev` avvia insieme l'app e il worker che pulisce lanterne scadute e file cancellati e manda le
notifiche push. Per avviarli separatamente ci sono `pnpm dev:web` e `pnpm dev:worker`. Senza il worker
l'app funziona lo stesso: le lanterne scadute restano comunque invisibili, ma nessuno le cancella dal
database e dallo storage, e non parte nessuna notifica.

## Utenti demo

Da `http://localhost:3000/accedi`, con i pulsanti "Entra come…": **Giulia**, **Marco** e **Sara**.
Per gli account nuovi, il magic link arriva su Mailpit: `http://localhost:8025`.

In sviluppo, in fondo alle pagine c'è il pannello **Viaggio nel tempo**, per vedere le lanterne
arrivare senza aspettare la sera. Sposta solo l'orologio delle pagine: il worker segue l'ora reale, quindi
per provare una notifica serve una lanterna che arrivi davvero.

## Provare su Android

Chrome considera sicuro `localhost`: il microfono funziona senza HTTPS, se il telefono raggiunge il PC
tramite `adb`.

1. Con Android 11 o successivi, attiva **Debug wireless** sul telefono, nella stessa rete Wi-Fi del PC.
2. La prima volta, associa il telefono: `adb pair <indirizzo>:<porta> <codice>`. Dopo, di solito si ricollega da
   solo; se `adb devices` non lo elenca, usa `adb connect <indirizzo>:<porta>` con i dati di quella schermata.
3. Collega le porte: `adb reverse tcp:3000 tcp:3000` e `adb reverse tcp:9000 tcp:9000`. Se il collegamento cade, per
   esempio con la modalità aereo, questo passaggio va ripetuto.
4. Apri `http://localhost:3000` sul telefono.

Su un Nothing A024 con Android sono stati provati vocali e foto, installazione, notifiche push, coda offline e pagina
offline. **Su iPhone non sono ancora stati verificati.**

## Installare l'app

Lanterne è una PWA: da Chrome su Android, apri il menu e scegli **Installa app**. Senza rete, ogni
navigazione mostra una pagina offline; il service worker non conserva nessuna pagina dell'app, perché
contengono dati personali. Le icone PNG si rigenerano da `public/icon.svg` con `pnpm tsx scripts/icons.ts`.

## Test

```bash
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:int      # richiede il database
pnpm test:e2e      # richiede database e Mailpit
```
