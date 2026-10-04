# Salvadanaio

App web per gestire le finanze personali partendo dallo stipendio: si decide in anticipo che compito dare a ogni euro (la **teoria**), si registra cosa succede davvero (la **pratica**) e si confrontano le due cose per ridistribuire meglio il budget e raggiungere gli obiettivi.

I dati restano **solo nel browser** (localStorage): niente server, niente account. Dalle Impostazioni si esporta e importa un backup JSON e si scaricano le spese in CSV.

## Usarla senza installare nulla

L'app viene pubblicata automaticamente su GitHub Pages a ogni push sul branch predefinito:

**https://giovannigraziani.github.io/salvadanaio/**

Serve una sola configurazione, da fare una volta: su GitHub apri **Settings → Pages** e in *Build and deployment → Source* scegli **GitHub Actions** (non *Deploy from a branch*: in quel caso GitHub pubblica il codice sorgente e la pagina mostra solo un avviso). Dopo il push successivo (o rilanciando il workflow "Pubblica su GitHub Pages" dalla scheda *Actions*) l'indirizzo è attivo. Da telefono si può aggiungere alla schermata Home.

Il codice è pubblico, i dati no: restano nel browser di chi usa l'app. Usando sempre lo stesso browser e dispositivo i dati si ritrovano; per passare a un altro dispositivo esporta e importa il backup.

- **Offline**: dopo la prima apertura l'app viene salvata sul dispositivo (service worker) e si apre anche senza connessione; quando è online scarica da sola le nuove versioni.
- **Archivio protetto**: l'app chiede al browser di non cancellare i suoi dati per liberare spazio. Su iPhone conviene aggiungerla alla schermata Home: Safari altrimenti cancella i dati dei siti non visitati da 7 giorni.
- **Backup**: in panoramica compare un promemoria se l'ultimo backup ha più di 30 giorni.
- Aggiornando da una versione precedente i dati vengono convertiti in automatico; una copia dei dati originali resta nel browser (chiave `salvadanaio:data:v2`).

## Sviluppo

```bash
npm install
npm run dev        # sviluppo su http://localhost:5173
npm test           # test della logica di dominio (vitest)
npm run build      # typecheck + build statica in dist/
npm run build:anteprima  # un unico file HTML con dati di esempio (dist-anteprima/)
```

La build è statica e usa percorsi relativi: `dist/` si può pubblicare così com'è (GitHub Pages, Netlify, una cartella qualsiasi). Su telefono si può aggiungere alla schermata Home.

## Come funziona

L'app è organizzata per **conti**. Ogni conto (il mio, quello della mia compagna, il cointestato, i risparmi…) ha una sua scheda con tre sezioni:

| Sezione del conto | A cosa serve |
|---|---|
| **Piano** – vista *Mese* | La teoria del mese: entrate, versamenti in arrivo da altri conti, quote da versare (scegliendo il conto o l'obiettivo di destinazione, con spunta "versato"), budget per categoria, spese previste in elenco o **calendario**. Si crea dal modello o copiando il mese precedente. |
| **Piano** – vista *Modello* | Il "preset" del conto da cui nasce ogni mese: impostazioni (nome, tipo, titolare, giorno dello stipendio, saldo iniziale), entrate, quote, budget, spese ricorrenti, categorie e, per il cointestato, la regola di ripartizione. |
| **Spese** | Registro delle spese effettive del conto. Ogni spesa può essere collegata a una spesa prevista: se non lo è, è *estemporanea*. |
| **Analisi** | Dove vanno le entrate, budget e speso per categoria, pianificato o estemporaneo, andamento mensile, saldo stimato mese per mese, tasso di risparmio, chi ha messo cosa (conti condivisi) e **suggerimenti per ridistribuire il budget**. |

Le altre sezioni:

| Sezione | A cosa serve |
|---|---|
| **Panoramica** | Riepilogo di tutti i conti: saldo totale stimato, entrate e spese del mese, una scheda per conto, cose da fare (quote da versare, spese previste dei prossimi giorni), categorie vicine al limite, obiettivi. |
| **Obiettivi** | Auto, casa, investimenti, fondo emergenza: quanto manca, quanto serve al mese per la scadenza, quando lo raggiungi al ritmo attuale. Calcolo guidato per anticipo casa, rata del mutuo e fondo emergenza. |
| **Impostazioni** | Aggiungi, ordina, archivia ed elimina i conti; tema; backup, protezione dell'archivio, dati di esempio. |

Il pulsante **"+ Spesa"** è sempre disponibile e propone il conto della scheda aperta.

### Collegamenti automatici

- Le **spese ricorrenti** entrano da sole nel piano dei mesi in cui cadono: settimanali, ogni 2 o 4 settimane (stesso giorno della settimana: una visita a giovedì alterni capita 2 o 3 volte al mese), mensili, bimestrali… annuali.
- "Segna pagata" su una spesa prevista crea la spesa effettiva collegata; eliminando la spesa il collegamento si annulla.
- Una **quota verso un altro conto** compare tra i "versamenti in arrivo" di quel conto; la spunta vale per entrambi.
- Una **quota verso un obiettivo**, spuntata come versata, registra il versamento sull'obiettivo e arriva sul conto in cui vive l'obiettivo.

### Conti condivisi (cointestato)

- **Quote**: ogni mese il budget del conto (comprese le spese ricorrenti del mese) viene diviso tra i conti partecipanti: in parti uguali, **in proporzione alle entrate** del modello di ciascun conto, o con percentuali fisse; arrotondato per eccesso (es. a 10 €). "Allinea alle quote" aggiorna la quota nel piano di ogni partecipante.
- **Spese anticipate**: una spesa comune pagata con un conto personale non tocca il cointestato finché non viene segnata come rimborsata; nel frattempo compare tra le spese anticipate di entrambi i conti.

### Saldo stimato

Ogni conto parte dal suo saldo iniziale (nel modello). Entrano le entrate proprie (dal giorno dello stipendio), i versamenti ricevuti e i rimborsi; escono le quote versate, le spese pagate e quelle anticipate per altri conti.

### Come vengono calcolati i suggerimenti

Per ogni categoria il budget del modello viene confrontato con il **fabbisogno mensile**: la media delle spese estemporanee degli ultimi mesi conclusi più il costo mensile equivalente delle ricorrenze (un'assicurazione trimestrale da 95 € vale 31,67 €/mese). Si propone di aumentare il budget se il fabbisogno lo supera di oltre il 10%, di ridurlo se resta sotto di oltre il 25%. Il margine liberato viene suggerito per gli obiettivi in ritardo.

## Struttura del codice

```
src/
  domain/      logica pura, senza React (testata nei file *.test.ts)
    types.ts     modello dati — importi sempre in centesimi interi
    analysis.ts  statistiche, flusso delle entrate, suggerimenti
    goals.ts     proiezioni obiettivi, mutuo, fondo emergenza
    ledger.ts    calcoli su un conto: piano, versamenti tra conti, saldo, quote condivise
    schedule.ts  ricorrenze (mesi o settimane) e loro occorrenze
    migrate.ts   conversione dei dati delle versioni precedenti
    money.ts / month.ts  formattazione e parsing (formato italiano)
    demo.ts      dati di esempio
  store/       stato globale, salvataggio su localStorage, azioni
  ui/          componenti, grafici SVG, editor condivisi
  pages/       Panoramica, Obiettivi, Impostazioni e la scheda Conto (conto/: Mese, Modello, Analisi)
```

Lo schema dei dati ha un numero di versione (`AppData.version`); le migrazioni vanno aggiunte in `domain/migrate.ts`.

## Roadmap

Già previsto nel modello dati (i conti hanno un tipo: `cointestato`, `risparmio`, `investimenti`, `personale`) e da sviluppare:

1. ~~**Conto cointestato nel dettaglio**~~ — fatto, ora come conto con la sua scheda e regola di ripartizione tra più conti.
2. **Conto risparmi nel dettaglio** — c'è la scheda con saldo e versamenti; da sviluppare la suddivisione del saldo tra gli obiettivi ("buste").
3. **Investimenti** — strumenti (ETF, fondi, obbligazioni), PAC, valore di mercato e rendimento, asset allocation e simulazioni ("quanto e come investire").
4. Possibili miglioramenti trasversali: sincronizzazione tra dispositivi (per condividere i conti con la compagna), import CSV dall'home banking.
