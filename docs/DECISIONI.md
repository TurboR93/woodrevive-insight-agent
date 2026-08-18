# Registro delle decisioni

## D-001 — Perimetro aziendale

**Decisione:** il progetto riguarda WoodRevive. Vintage Wood è un'altra azienda
e non è una fonte del progetto.

## D-002 — Isolamento

**Decisione:** tutti i file vengono creati nella cartella `AGENTEAI_RiccardoB`.
Gli altri progetti non vengono modificati, collegati come dipendenze o inclusi
come sottorepository.

## D-003 — Ambito

**Decisione:** Sales & Operations, con documentazione commerciale e dati su
vendite, magazzino e incassi.

## D-004 — Dati

**Decisione:** soltanto dataset sintetici e anonimi. Nomi, email, documenti e
importi del gestionale reale restano fuori dal repository.

## D-005 — Wiki parallela

**Decisione:** Wiki e RAG sono due strumenti di pari dignità. La Wiki usa
struttura editoriale e ricerca lessicale; il RAG usa embedding e ChromaDB.

## D-006 — Provider LLM

**Decisione:** rinviato. Si realizza prima un contratto indipendente dal
fornitore e un provider mock deterministico.

## D-007 — Sicurezza del pandas agent

**Decisione:** il modello non esegue direttamente codice Python libero. Produce
un piano validato che richiama operazioni pandas ammesse e dataset registrati.

## D-008 — Identità visiva

**Decisione:** l'interfaccia usa copie locali del logo e delle icone ufficiali
WoodRevive. Le copie vivono in `public/brand/`; nessun altro progetto viene
caricato o modificato a runtime.

## D-009 — Repository pubblica

**Decisione:** il progetto viene pubblicato come `woodrevive-insight-agent`.
La repository può essere pubblica perché contiene esclusivamente contenuti e
dati dimostrativi anonimi. File `.env`, output locali, build e dipendenze sono
esclusi dal versionamento.

## D-010 — Stato delle integrazioni

**Decisione:** il primo commit documenta chiaramente che Wiki, ChromaDB e pandas
non sono ancora collegati alla chat. L'interfaccia è un prototipo interattivo e
il router Node.js usa temporaneamente una strategia euristica.
