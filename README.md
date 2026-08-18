# WoodRevive Insight

Agente AI ibrido e multi-tool per l'area **Sales & Operations** di WoodRevive.
Da un'unica conversazione risponde a domande sulla documentazione aziendale e
analizza dati commerciali anonimi in formato CSV.

Il progetto è autonomo e vive interamente in questa cartella. Non importa codice
e non modifica i progetti WoodRevive esistenti.

## Obiettivo

L'agente riconosce quattro tipi di richiesta:

1. **documentale RAG** — retrieval sul corpus canonico, predisposto per la
   successiva indicizzazione semantica in ChromaDB;
2. **documentale Wiki** — pagine strutturate, indice, tag e ricerca lessicale,
   senza embeddings o vector database;
3. **numerica** — delega a un servizio Python che usa pandas sui CSV demo;
4. **ibrida** — combina regole/documentazione e numeri nella stessa risposta.

La Wiki non è soltanto un fallback. È un percorso parallelo che permette di
confrontare RAG e navigazione strutturata per qualità, fonti, latenza e costo.

## Stato attuale

- interfaccia React responsive con branding ufficiale WoodRevive e modalità
  Automatico, RAG, Wiki e Dati;
- architettura e contratti API definiti;
- 13 pagine Wiki operative e corpus RAG generato dalle stesse fonti canoniche;
- archivio demo relazionale: 24 clienti aziendali, 10 fornitori, 24 articoli,
  16 lotti e 190 eventi fra acquisti, preventivi, ordini, DDT, fatture,
  pagamenti e scadenze;
- 23 CSV con chiavi collegate, più viste compatibili per vendite, magazzino e
  incassi;
- orchestratore Node.js collegato alla Messages API Anthropic con Claude Haiku
  4.5 e vero ciclo di tool use;
- navigazione Wiki multi-pass: indice, tag, sinonimi, sezioni, link e lettura
  autonoma delle pagine scelte da Haiku;
- microservizio FastAPI/pandas collegato con sette operazioni ammesse;
- chat progressiva con attività degli strumenti in tempo reale, Markdown
  formattato, fonti espandibili e interruzione della richiesta;
- risultati pandas multimodali con KPI, grafici responsivi, tabelle esplorabili
  e metodo di calcolo;
- servizio Python/pandas con riepilogo vendite, margine per categoria e analisi
  dei lotti a lenta rotazione;
- build, lint, test di rendering, controllo TypeScript e funzioni pandas
  verificati;
- retrieval RAG locale operativo sul corpus canonico; ChromaDB vettoriale resta
  il prossimo incremento.

La conversazione nell'interfaccia chiama l'orchestratore reale via event stream.
La traccia mostra azioni e strumenti, senza esporre ragionamenti interni del
modello. La chiave API
resta esclusivamente nel backend locale e `.env.local` è ignorato da Git.

## Repository e dati

La repository è pubblica: [TurboR93/woodrevive-insight-agent](https://github.com/TurboR93/woodrevive-insight-agent).
Contiene esclusivamente dati dimostrativi sintetici. Non contiene esportazioni,
anagrafiche, credenziali o documenti provenienti dal gestionale reale.

I file grafici sotto `public/brand/` sono copie locali del marchio WoodRevive
usate nell'interfaccia; i progetti aziendali esistenti non sono dipendenze e non
sono stati modificati.

## Struttura

```text
app/                         interfaccia React
server/                      orchestratore Node.js
analytics-service/           servizio Python e pandas
knowledge/wiki/              knowledge base strutturata
knowledge/rag-source/        corpus destinato a ChromaDB
datasets/demo/               CSV sintetici e anonimi
scripts/                     generatori e controlli riproducibili
outputs/                     workbook di audit del dataset
docs/                        architettura, piano e decisioni
```

## Documenti principali

- [Architettura](docs/ARCHITETTURA.md)
- [Piano di sviluppo](docs/PIANO.md)
- [Decisioni](docs/DECISIONI.md)
- [Dataset e KPI](docs/DATI-E-KPI.md)
- [Schema dati demo](docs/SCHEMA-DATI-DEMO.md)
- [Scenari di prova](docs/SCENARI-DEMO.md)
- [Stato del progetto](docs/STATO-PROGETTO.md)
- [Agente reale con Claude Haiku](docs/AGENTE-HAIKU.md)

## Avvio dell'agente completo

Richiede Node.js 22.13 o successivo.

Creare `.env.local` con `ANTHROPIC_API_KEY`, preparare l'ambiente Python come
descritto in [Agente reale con Claude Haiku](docs/AGENTE-HAIKU.md), quindi:

```bash
npm install
npm run dev:agent
```

Per lavorare soltanto sull'interfaccia resta disponibile `npm run dev`.

## Verifiche disponibili

```bash
npm run build
npm run lint
npm test
./node_modules/.bin/tsc -p server/tsconfig.json --noEmit
node scripts/generate_demo_data.mjs --check
node scripts/build_rag_corpus.mjs --check
```

## Rigenerazione dei dati demo

Il generatore è deterministico: non legge il gestionale e non contiene dati
esportati. Per ricreare i CSV e poi verificarli:

```bash
node scripts/generate_demo_data.mjs
node scripts/generate_demo_data.mjs --check
```

Il file `datasets/demo/manifest.json` riporta conteggi, convenzioni e controlli
superati. Il corpus RAG viene rigenerato dalle 13 pagine Wiki per mantenere
equivalente la base informativa dei due percorsi documentali.
