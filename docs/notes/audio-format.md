# Verifica formato audio (Piano 1, Task 2)

**Data:** 2026-11-02 · spike con pagina usa e getta, poi eliminata.

## Risultati

| Dispositivo | Registra | Formato scelto da `MediaRecorder` | Riproduce il proprio file |
|---|---|---|---|
| Chrome desktop (Windows) | sì | `audio/mp4;codecs=opus` | sì |
| Chrome Android | non testato: il telefono non raggiungeva il PC in rete locale | (stesso motore di Chrome desktop: atteso uguale) | — |
| Safari iPhone | non testato: dispositivo non disponibile | — | — |

## Cosa significa

- Chrome registra in contenitore **MP4** ma con codec **Opus**, non AAC.
- AAC in MP4 si riproduce ovunque. Opus in MP4 su Safari/iOS **non è garantito**.
- La riproduzione incrociata Chrome → iPhone resta **da verificare**.

## Decisione per il Piano 2

1. Ordine dei formati in `MediaRecorder.isTypeSupported`:
   1. `audio/mp4;codecs=mp4a.40.2` (AAC)
   2. `audio/mp4`
   3. `audio/webm;codecs=opus`
2. **Primo task del Piano 2:** verificare su un iPhone vero (o Safari macOS) la riproduzione di un file registrato da Chrome, usando il deploy locale con HTTPS.
3. Se Safari non lo riproduce: conversione in AAC/MP4 con ffmpeg nel worker, prima di segnare la lanterna come `ready`.

## Prova reale su Android (Piano 2, Task 5)

**Data:** 2026-11-05 · Nothing A024, Android 17, Chrome 156, e Chrome desktop su Windows.

| Da | A | Controllo | Esito |
|---|---|---|---|
| Android | Android | Il vocale si registra e si riascolta | ok |
| Android | Desktop | Il vocale si ascolta | ok |
| Android | Desktop | La foto scattata in verticale arriva dritta | ok |
| Desktop | Android | Il vocale si ascolta | ok |

I file salvati durante la prova sono `audio/mp4` per i vocali e `image/jpeg`, da circa 800 KB, per le foto.

**iPhone non verificato:** il dispositivo non è disponibile. Per scelta del progetto la riproduzione su Safari resta da provare, e la conversione con ffmpeg si aggiunge solo se quella prova la richiede.
