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
- tre CSV sintetici e anonimi;
- tre pagine Wiki e un primo documento per l'ingestione RAG.

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
| Ricerca credenziali e dati reali | nessun contenuto sensibile trovato |

## Prossimo incremento consigliato

Implementare per prima la **Wiki operativa**, perché non richiede ancora la
scelta del provider LLM: indicizzazione lessicale, ricerca per titolo/tag,
selezione delle sezioni e citazioni. In parallelo si può collegare il servizio
pandas all'orchestratore. La scelta di LLM ed embedding arriva subito dopo.

## Pubblicazione

- nome repository: `woodrevive-insight-agent`;
- visibilità: pubblica;
- contenuti: codice, documentazione, branding locale e soli dati demo;
- dati reali WoodRevive: esclusi.
