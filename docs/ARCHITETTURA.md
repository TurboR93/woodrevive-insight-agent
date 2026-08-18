# Architettura

## Contesto aziendale

WoodRevive compra e rivende legno antico di recupero già lavorato. L'ambito
scelto è **Sales & Operations**, perché collega naturalmente:

- conoscenza testuale: prodotti, essenze, patine, lotti, provenienze, prezzi,
  procedure di preventivo, ordine, DDT e incasso;
- dati strutturati: vendite, margini, giacenze, rotazione, clienti e scadenze.

## Vista generale

```text
Interfaccia React
       |
       | POST /api/chat
       v
Orchestratore Node.js
  |-- memoria conversazione
  |-- router LLM -> documenti | dati | ibrido
  |-- controllo fonti e risposta finale
  |
  |-- RAG engine ------> ChromaDB locale
  |       `-----------> knowledge/rag-source
  |
  |-- Wiki engine -----> indice + pagine Markdown
  |       `-----------> knowledge/wiki
  |
  `-- Data tool -------> servizio Python/FastAPI
                          |-- pandas
                          |-- CSV in sola lettura
                          `-- grafici PNG/JSON
```

## Decisione dell'orchestratore

Per ogni messaggio, il modello deve produrre un piano strutturato e validabile:

```json
{
  "intent": "documents | data | hybrid",
  "documentStrategy": "rag | wiki | compare | none",
  "question": "domanda riscritta senza ambiguità",
  "dataOperation": "trend | ranking | aggregation | anomaly | none",
  "filters": {},
  "confidence": 0.0
}
```

Se la confidenza è bassa, il backend può chiedere un chiarimento. Il modello non
sceglie URL, percorsi locali o codice da eseguire: sceglie solo strumenti e
parametri ammessi dal contratto.

## Percorso RAG

1. I documenti canonici vengono normalizzati e divisi in sezioni.
2. Le sezioni vengono spezzate in chunk con sovrapposizione controllata.
3. Un provider di embedding, ancora da scegliere, genera i vettori.
4. ChromaDB conserva vettori e metadati: documento, sezione, versione e data.
5. La query recupera i chunk migliori e applica una soglia di rilevanza.
6. L'LLM risponde esclusivamente sul contesto recuperato e cita le fonti.

## Percorso Wiki, senza RAG vettoriale

La Wiki usa pagine Markdown brevi e curate, ciascuna con titolo, sommario, tag,
sinonimi e collegamenti. Il motore:

1. cerca titoli, tag, sinonimi e testo con ricerca lessicale;
2. seleziona pagine o sezioni attraverso l'indice strutturato;
3. passa al modello la sezione completa, non chunk vettoriali isolati;
4. restituisce sempre pagina e intestazione consultate.

Tecnicamente anche questo fornisce contesto a un modello, ma nel progetto viene
chiamato **Wiki lookup** per distinguerlo dal RAG con embedding e vector store.

## Modalità di confronto

In modalità `compare` la stessa domanda viene eseguita in parallelo su RAG e
Wiki. L'interfaccia mostra risposta, fonti, tempo di risposta, divergenze e una
valutazione finale. Le due evidenze non vengono fuse silenziosamente.

## Percorso dati

Il servizio Python riceve una richiesta strutturata, carica soltanto dataset
registrati e restituisce sintesi, metriche, tabella, grafico, metodo e avvisi.
L'LLM può proporre il piano analitico, ma l'esecuzione resta limitata a funzioni
Python approvate. I CSV sono in sola lettura e non è ammesso codice arbitrario.

## Richieste ibride

Esempio: «Quali articoli hanno un margine sotto la soglia consigliata e cosa
prevede la policy?» Il router esegue sia Data tool sia Wiki/RAG; il backend
unisce le evidenze citando separatamente formula numerica e regola documentale.

## Provider LLM e ciclo strumenti

Il provider attivo è Anthropic con `claude-haiku-4-5-20251001`. Node invia
soltanto domanda, cronologia limitata e definizioni dei tool. Haiku restituisce
blocchi `tool_use`; l'orchestratore esegue localmente gli strumenti e rimanda i
risultati come `tool_result`. Il modello può proseguire la navigazione fino a
cinque passaggi prima della sintesi.

La Wiki usa due tool distinti: ricerca nell'indice e lettura delle pagine per
slug. Questo permette al modello di orientarsi attraverso tag, sinonimi,
sezioni e collegamenti senza ricevere l'intero manuale nel prompt.
