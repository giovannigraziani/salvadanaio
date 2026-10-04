# Salvadanaio

App web per gestire le finanze personali partendo dallo stipendio: si decide in anticipo che compito dare a ogni euro (la **teoria**), si registra cosa succede davvero (la **pratica**) e si confrontano le due cose per ridistribuire meglio il budget e raggiungere gli obiettivi.

I dati restano **solo nel browser** (localStorage): niente server, niente account. Dalle Impostazioni si esporta e importa un backup JSON e si scaricano le spese in CSV.

## Usarla senza installare nulla

L'app viene pubblicata automaticamente su GitHub Pages a ogni push sul branch predefinito:

**https://giovannigraziani.github.io/salvadanaio/**

Serve una sola configurazione, da fare una volta: su GitHub apri **Settings → Pages** e in *Build and deployment → Source* scegli **GitHub Actions** (non *Deploy from a branch*: in quel caso GitHub pubblica il codice sorgente e la pagina mostra solo un avviso). Dopo il push successivo (o rilanciando il workflow "Pubblica su GitHub Pages" dalla scheda *Actions*) l'indirizzo è attivo. Da telefono si può aggiungere alla schermata Home.

Il codice è pubblico, i dati no: restano nel browser di chi usa l'app. Usando sempre lo stesso browser e dispositivo i dati si ritrovano; per passare a un altro dispositivo esporta e importa il backup.

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

Il flusso segue quello dello stipendio:

```
Stipendio ─┬─► quota al conto cointestato     (spese comuni con la compagna)
           ├─► quota al conto risparmi
           ├─► quote verso obiettivi           (auto, casa, PAC…)
           └─► spese personali ─┬─ pianificate (ricorrenze, visite, impegni noti)
                                └─ estemporanee
```

| Sezione | A cosa serve |
|---|---|
| **Panoramica** | Quanto puoi ancora spendere nel mese (e al giorno), cosa resta da versare o pagare, categorie vicine al limite, avanzamento obiettivi. |
| **Piano mensile** | La teoria del mese: entrate, quote da versare (con spunta "versato"), budget per categoria, spese previste (generate dalle ricorrenze più quelle aggiunte a mano). Si crea dal modello o copiando il mese precedente. |
| **Spese** | Registro delle spese effettive, filtrabile per mese, categoria e tipo. Ogni spesa può essere collegata a una spesa prevista: se non lo è, è *estemporanea*. Il pulsante "+ Spesa" è sempre disponibile. |
| **Conto cointestato** | Le spese comuni con la compagna: regola di ripartizione (a metà, in proporzione allo stipendio o percentuale fissa), quote calcolate ogni mese, budget e spese ricorrenti comuni (affitto, bollette…), spese anticipate da rimborsare, saldo del conto e analisi di chi ha versato cosa. |
| **Analisi** | Dove vanno le entrate, budget e speso per categoria, pianificato o estemporaneo, andamento mensile, tasso di risparmio e **suggerimenti per ridistribuire il budget** (applicabili con un clic). |
| **Obiettivi** | Obiettivi con importo, scadenza e priorità: quanto manca, quanto serve al mese per rispettare la scadenza, quando lo raggiungi al ritmo attuale. Calcolo guidato per anticipo casa e rata del mutuo e per il fondo emergenza. |
| **Impostazioni** | Modello mensile, spese ricorrenti, categorie (essenziali o discrezionali), conti, tema, backup. |

### Collegamenti automatici

- Le **spese ricorrenti** (mensili, bimestrali, … annuali) entrano da sole nel piano dei mesi in cui cadono.
- "Segna pagata" su una spesa prevista crea la spesa effettiva collegata; eliminando la spesa il collegamento si annulla.
- Una **quota del piano diretta a un obiettivo**, spuntata come versata, registra il versamento sull'obiettivo (e lo toglie se la spunta viene rimossa).
- Il **mio versamento al conto cointestato** è la quota verso quel conto nel piano personale: "Allinea alle quote" la porta all'importo calcolato dalla regola, e la spunta "versato" vale in entrambe le sezioni.

### Il conto cointestato

- **Quote**: ogni mese il budget comune (comprese le spese ricorrenti del mese) viene diviso secondo la regola scelta e arrotondato per eccesso (es. a 10 €).
- **Saldo**: parte dal saldo iniziale impostato; entrano i versamenti segnati come eseguiti, escono le spese pagate dal conto e i rimborsi.
- **Spese anticipate**: una spesa comune pagata di tasca propria non tocca il conto finché non viene segnata come rimborsata; nel frattempo compare tra le spese da rimborsare.

### Come vengono calcolati i suggerimenti

Per ogni categoria il budget del modello viene confrontato con il **fabbisogno mensile**: la media delle spese estemporanee degli ultimi mesi conclusi più il costo mensile equivalente delle ricorrenze (un'assicurazione trimestrale da 95 € vale 31,67 €/mese). Si propone di aumentare il budget se il fabbisogno lo supera di oltre il 10%, di ridurlo se resta sotto di oltre il 25%. Il margine liberato viene suggerito per gli obiettivi in ritardo.

## Struttura del codice

```
src/
  domain/      logica pura, senza React (testata in domain.test.ts)
    types.ts     modello dati — importi sempre in centesimi interi
    plan.ts      creazione piano, riepiloghi, righe per categoria
    recurring.ts ricorrenze
    analysis.ts  statistiche, flusso delle entrate, suggerimenti
    goals.ts     proiezioni obiettivi, mutuo, fondo emergenza
    joint.ts     conto cointestato: quote, saldo, rimborsi, statistiche
    money.ts / month.ts  formattazione e parsing (formato italiano)
    demo.ts      dati di esempio
  store/       stato globale, salvataggio su localStorage, azioni
  ui/          componenti, grafici SVG, editor condivisi
  pages/       una pagina per sezione
```

Lo schema dei dati ha un numero di versione (`AppData.version`); le migrazioni vanno aggiunte in `store/store.ts` (`migrate`).

## Roadmap

Già previsto nel modello dati (i conti hanno un tipo: `cointestato`, `risparmio`, `investimenti`, `personale`) e da sviluppare:

1. ~~**Conto cointestato nel dettaglio**~~ — fatto. Possibili sviluppi: entrate extra sul conto (rimborsi, regali), più persone, accantonamenti comuni (vacanze, mobili).
2. **Conto risparmi nel dettaglio** — saldo reale, suddivisione del saldo tra gli obiettivi ("buste"), storico dei movimenti.
3. **Investimenti** — strumenti (ETF, fondi, obbligazioni), PAC, valore di mercato e rendimento, asset allocation e simulazioni ("quanto e come investire").
4. Possibili miglioramenti trasversali: import CSV dall'home banking, sincronizzazione tra dispositivi, funzionamento offline (service worker), entrate variabili e rimborsi.
