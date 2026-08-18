# Stato del progetto

Aggiornato al 2026-08-18.

## Sintesi

La fase di fondazione di **WoodRevive Insight** è completata. Esiste una base
locale verificata per un agente ibrido Sales & Operations con tre strumenti:
RAG su ChromaDB, Wiki strutturata e analisi CSV con pandas.

## Cosa funziona

- interfaccia React responsive con logo e favicon WoodRevive;
- selettore Automatico, RAG, Wiki e Dati;
- conversazione dimostrativa con indicazione dello strumento e delle fonti;
- orchestratore Node.js avviabile con endpoint `/health`;
- contratto strutturato per routing e risposte;
- router euristico usato come fallback temporaneo;
- funzioni pandas per riepilogo vendite, margini e giacenze lente;
- 23 CSV sintetici e relazionali con 24 clienti aziendali, 10 fornitori,
  24 articoli, 16 lotti e 190 eventi;
- generatore deterministico, manifest e controlli di coerenza;
- 13 pagine Wiki, 25 casi operativi e corpus RAG completo generato dalle stesse
  fonti;
- schema dati, lineage, regole KPI e limiti documentati.

## Cosa è ancora dimostrativo

- la chat non chiama ancora l'orchestratore Node.js;
- il router non usa ancora un LLM;
- la ricerca Wiki non è ancora implementata;
- ChromaDB, embedding e pipeline di ingestione non sono ancora configurati;
- il servizio pandas non genera ancora grafici e non è collegato alla chat;
- la modalità di confronto RAG/Wiki è definita ma non ancora eseguita.

## Verifiche completate

| Verifica | Esito |
|---|---|
| Build dell'interfaccia | superata |
| Lint | superato senza errori |
| Test del rendering | 2 su 2 superati |
| TypeScript orchestratore | superato |
| Funzioni pandas demo | superate |
| Riproducibilità dei 23 CSV | superata |
| Coerenza relazionale e totali | 11 controlli su 11 superati |
| Parità corpus RAG/Wiki | 13 pagine su 13 allineate |
| Ricerca credenziali e dati reali | nessun contenuto sensibile trovato |

## Prossimo incremento consigliato

Implementare la ricerca lessicale della **Wiki operativa** e collegare le nuove
operazioni pandas all'orchestratore. La base informativa e il dataset sono ora
abbastanza ricchi per costruire il set di valutazione RAG/Wiki/dati.

## Pubblicazione

- nome repository: `woodrevive-insight-agent`;
- visibilità: pubblica;
- URL: `https://github.com/TurboR93/woodrevive-insight-agent`;
- branch predefinito: `main`;
- stato: pubblicata il 2026-08-18;
- contenuti: codice, documentazione, branding locale e soli dati demo;
- dati reali WoodRevive: esclusi.
