# Piano di sviluppo

## Fase 0 — Fondazioni (completata)

- [x] scegliere l'ambito Sales & Operations;
- [x] isolare il progetto dai repository esistenti;
- [x] usare soltanto dati dimostrativi anonimi;
- [x] definire il parallelo RAG/Wiki;
- [x] creare la prima interfaccia conversazionale;
- [x] definire architettura, contratti e struttura delle cartelle;
- [x] validare il perimetro della prima demo;
- [x] applicare il branding ufficiale WoodRevive;
- [x] verificare build, lint, rendering, TypeScript e analisi pandas;
- [x] preparare il progetto per una repository GitHub pubblica.

**Uscita:** struttura comprensibile, avviabile e senza dipendenze da dati reali.

## Fase 1 — Knowledge base Wiki (prossima)

- definire template e front matter delle pagine;
- completare 10–15 pagine su dominio, prodotti e procedure;
- generare indice di titoli, tag, sinonimi e collegamenti;
- implementare ricerca lessicale e selezione della sezione;
- aggiungere citazioni verificabili.

**Uscita:** domande documentali funzionanti senza ChromaDB.

## Fase 2 — Data analyst

- ampliare i CSV demo mantenendo coerenza referenziale;
- aggiungere validazione e pulizia dati;
- implementare KPI, trend, ranking e anomalie;
- generare grafici e tabelle;
- collegare il servizio Python all'orchestratore.

**Uscita:** almeno dieci domande numeriche riproducibili con formula esposta.

## Fase 3 — RAG custom

- scegliere modello di embedding;
- avviare ChromaDB locale;
- implementare ingestione, chunking, metadati e versionamento;
- tarare risultati e soglie;
- implementare risposte grounded con citazioni.

**Uscita:** percorso RAG interrogabile sullo stesso dominio della Wiki.

## Fase 4 — Orchestrazione LLM

- scegliere provider e modello;
- implementare output strutturato del router;
- gestire richieste documentali, numeriche e ibride;
- aggiungere memoria conversazionale limitata;
- introdurre fallback, timeout e gestione errori.

**Uscita:** modalità Automatica realmente decisionale.

## Fase 5 — Confronto ed evaluation

- costruire un set di almeno 50 domande con risposta attesa;
- misurare accuratezza del routing e dei calcoli;
- confrontare RAG e Wiki su correttezza, copertura, citazioni e latenza;
- aggiungere modalità affiancata nell'interfaccia;
- documentare i casi in cui ciascun metodo è preferibile.

**Uscita:** confronto dimostrabile, non soltanto impressionistico.

## Fase 6 — Hardening e consegna

- test end-to-end e accessibilità;
- logging senza dati sensibili;
- limiti su file, prompt e output;
- documentazione di avvio con un solo comando;
- scenario demo guidato e relazione tecnica.

## Criteri di successo

| Area | Obiettivo iniziale |
|---|---:|
| Accuratezza routing | almeno 90% sul set di test |
| Risposte documentali con citazione | 100% |
| Correttezza KPI deterministici | 100% |
| Domande demo supportate | almeno 20 |
| Dati personali o reali nel repository | 0 |
| Tempo risposta Wiki | meno di 2 s, escluso LLM |
| Tempo risposta analisi base | meno di 5 s |
