# Stato del progetto

Aggiornato al 2026-08-18.

## Sintesi

La fase di fondazione di **WoodRevive Insight** è completata. Esiste una base
locale verificata per un agente ibrido Sales & Operations con Claude Haiku,
retrieval sul corpus RAG, Wiki strutturata e analisi CSV con pandas.

## Cosa funziona

- interfaccia React responsive con logo e favicon WoodRevive;
- selettore Automatico, RAG, Wiki e Dati;
- conversazione reale con streaming delle attività, indicazione di modello,
  strumenti, fonti e pulsante di interruzione;
- rendering sicuro di Markdown e risultati pandas con KPI, grafici responsivi,
  tabelle espandibili e metodo di calcolo;
- orchestratore Node.js con Claude Haiku 4.5 e ciclo di tool use multi-pass;
- contratto strutturato per routing e risposte;
- router euristico conservato come riferimento deterministico;
- navigazione Wiki intelligente con ricerca indice e lettura pagine;
- sette funzioni pandas collegate all'orchestratore tramite FastAPI;
- 23 CSV sintetici e relazionali con 24 clienti aziendali, 10 fornitori,
  24 articoli, 16 lotti e 190 eventi;
- generatore deterministico, manifest e controlli di coerenza;
- 13 pagine Wiki, 25 casi operativi e corpus RAG completo generato dalle stesse
  fonti;
- schema dati, lineage, regole KPI e limiti documentati.
- creazione di bozze preventivo tramite Haiku con calcoli deterministici;
- scheda preventivo interattiva in chat e apertura diretta del dettaglio;
- copia isolata del gestionale in questa repository, servita su porta 5174 e
  alimentata dal medesimo dataset sintetico tramite bridge locale;
- memoria chat persistente nel browser con cronologia multi-conversazione,
  ripristino al ritorno dal gestionale e audit dell'utente demo;

## Cosa è ancora dimostrativo

- ChromaDB, embedding e pipeline di ingestione non sono ancora configurati;
- i grafici sono visualizzazioni web interattive derivate dai risultati pandas;
  non sono ancora esportabili come file PNG o PDF;
- la modalità di confronto usa già corpus RAG e Wiki, ma il lato RAG non è
  ancora vettoriale.
- l'identità attiva è ancora un utente demo locale; login, ruoli e memoria
  sincronizzata fra dispositivi richiedono il backend utenti descritto nel piano.

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
| Chiamata reale Claude Haiku | superata |
| Navigazione Wiki ricerca → lettura | superata |
| Domanda ibrida Wiki + pandas | superata |
| Ricerca credenziali e dati reali | nessun contenuto sensibile trovato |
| Build copia Manager | superata |
| Test copia Manager | 146 su 146 superati |
| Bridge dataset → Manager v8 | superato |
| Preventivo agente → dettaglio Manager | coperto da test automatico |
| Persistenza chat dopo navigazione | localStorage versionato |

## Prossimo incremento consigliato

Costruire il set di valutazione RAG/Wiki/dati e aggiungere ChromaDB con un
modello di embedding, mantenendo identico il corpus già sincronizzato.

## Pubblicazione

- nome repository: `woodrevive-insight-agent`;
- visibilità: pubblica;
- URL: `https://github.com/TurboR93/woodrevive-insight-agent`;
- branch predefinito: `main`;
- stato: pubblicata il 2026-08-18;
- contenuti: codice, documentazione, branding locale e soli dati demo;
- dati reali WoodRevive: esclusi.
