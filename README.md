# Lanterne

Una PWA per restare vicini a poche persone: lasci una lanterna durante il giorno e arriva alla sera,
all'orario che avete concordato, nell'ora locale di chi la riceve.

> Questo è il Piano 1 (fondamenta): l'interfaccia è volutamente schematica. Il diario tecnico è in
> [`docs/sviluppo.md`](docs/sviluppo.md).

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

## Utenti demo

Da `http://localhost:3000/accedi`, con i pulsanti "Entra come…": **Giulia**, **Marco** e **Sara**.
Per gli account nuovi, il magic link arriva su Mailpit: `http://localhost:8025`.

In sviluppo, in fondo alle pagine c'è il pannello **Viaggio nel tempo**, per vedere le lanterne
arrivare senza aspettare la sera.

## Test

```bash
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:int      # richiede il database
pnpm test:e2e      # richiede database e Mailpit
```
