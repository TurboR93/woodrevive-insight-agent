# Compatibilità con la copia WoodRevive Manager

## Confine del progetto

La cartella `apps/woodrevive-manager` è una copia autonoma inclusa in questa
repository. Il WoodRevive Manager originale rimane fuori dal progetto e non
viene modificato, avviato o usato come archivio dati.

Nella copia non sono stati importati:

- repository Git e cronologia del progetto originale;
- `node_modules`, build e cache locali;
- file `.env`, configurazioni Wrangler e credenziali;
- backup, esportazioni Easyfatt, cartelle clienti e file `dati-reali.*`.

Sono presenti soltanto sorgenti dell'interfaccia, configurazioni necessarie,
test e asset del marchio. Le eventuali seed già contenute nei sorgenti sono
sintetiche; all'avvio l'archivio attivo viene comunque sostituito dal dataset
demo condiviso con l'agente.

## Un'unica fonte dati demo

La fonte canonica è `datasets/demo/`. L'orchestratore espone
`GET /api/demo/manager-data`, che trasforma i CSV in una busta compatibile con
la versione 8 del modello Manager. La copia la verifica e la importa in locale
prima di montare l'interfaccia.

Questo evita di mantenere due dataset demo separati:

| Concetto | Contratto condiviso |
|---|---|
| Identificativi | stringhe stabili (`cli-001`, `art-001`, UUID per nuove bozze) |
| Importi | interi in centesimi |
| Quantità | interi in millesimi dell'unità di misura |
| Date | ISO `YYYY-MM-DD`; timestamp in millisecondi |
| IVA e sconti | percentuali numeriche |
| Righe documento | snapshot di codice, descrizione, prezzo, quantità e aliquota |
| Tracciabilità demo | `id_esterno`, sorgente busta e note non identificative |

Il bridge mappa oggi clienti, fornitori, articoli, lotti, movimenti, preventivi,
ordini, DDT, acquisti, pagamenti e scadenze. Fatture, fatture di acquisto e
schede di lavorazione restano collezioni vuote finché non viene definito il
relativo caso demo.

## Creazione preventivo

Il flusso conversazionale è separato in due strumenti:

1. ricerca di cliente e articoli nel catalogo condiviso;
2. creazione di una bozza validata con gli ID trovati.

Il backend, non l'LLM, calcola totale riga, sconti, imponibile, IVA per aliquota,
totale e margine. Controlla quantità positive, applica un limite agli sconti e
segnala disponibilità insufficiente o necessità di approvazione. Le bozze sono
salvate in `runtime/demo-quote-drafts.json`, cartella esclusa da Git.

La chat mostra una scheda preventivo e collega direttamente a
`http://localhost:5174/preventivi/:id`. Al caricamento, la copia Manager legge
anche le nuove bozze e può visualizzarle insieme allo storico sintetico.

## Aggancio futuro ai dati reali

Il punto di sostituzione è il provider che oggi legge i CSV, non l'interfaccia e
non il contratto del tool. Un adattatore futuro potrà leggere API o database
reali e produrre la stessa busta versione 8. Prima dell'attivazione serviranno
autenticazione, autorizzazioni per ruolo, audit delle azioni, idempotenza,
gestione concorrenza e conferma esplicita prima di qualunque scrittura reale.

Fino ad allora il sistema resta intenzionalmente demo: non invia preventivi, non
contatta clienti e non scrive nel gestionale originale.
