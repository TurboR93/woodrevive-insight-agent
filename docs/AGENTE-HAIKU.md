# Agente reale con Claude Haiku

## Modello

L'orchestratore usa `claude-haiku-4-5-20251001`. La chiave vive soltanto in
`.env.local`, viene letta dal processo Node e non viene mai inviata al browser,
salvata nei log o inclusa nella repository.

## Ciclo agentico

1. l'interfaccia invia domanda, modalità e ultimi turni al backend Node;
2. Haiku riceve il catalogo degli strumenti e sceglie quali chiamare;
3. Node esegue localmente Wiki, corpus RAG o servizio pandas;
4. risultati e riferimenti tornano a Haiku come `tool_result`;
5. Haiku può usare altri strumenti oppure produrre la risposta finale;
6. il backend invia in tempo reale eventi sintetici su routing e strumenti;
7. l'interfaccia mostra risposta formattata, fonti, avvisi, risultati visuali ed
   eventuali preventivi strutturati.

Il ciclo è limitato a cinque passaggi per evitare loop e costi incontrollati.
Nessun codice proposto dal modello viene eseguito: può scegliere soltanto tool e
parametri dichiarati.

## Skill aziendali selettive

Prima della chiamata a Haiku, un selettore deterministico locale può attivare al
massimo due skill pertinenti. Le skill aggiungono regole operative brevi per
preventivi, marginalità, disponibilità e consegne, crediti e incassi, KPI
commerciali o procedure Wiki. Non viene effettuata una chiamata LLM aggiuntiva e
una domanda generica non carica nessuna skill.

La chat mostra le skill attivate sia nella traccia sia accanto alla risposta. Il
catalogo e i limiti sono descritti in [Skill aziendali](SKILL-AZIENDALI.md).

## Navigazione intelligente della Wiki

La Wiki non viene inserita interamente nel prompt. Haiku lavora in due fasi:

- `wiki_search` analizza titoli, tag, sinonimi, intestazioni, riassunti e link;
- `wiki_read` apre da una a quattro pagine scelte per slug e recupera le sezioni
  pertinenti al focus indicato dal modello.

Haiku può ripetere ricerca e lettura, seguire collegamenti o aprire più pagine.
L'orchestratore non accetta una risposta Wiki se il modello ha consultato solo
l'indice senza leggere almeno una pagina.

## Strumenti dati

`analyze_data` chiama il microservizio FastAPI/pandas. Le sette operazioni sono
riepilogo vendite, margine per categoria, stock lento, esposizione clienti,
volumi transazionali, concentrazione fornitori ed evasione ordini. Il modello
non può eseguire Python arbitrario né scegliere percorsi file.

## Strumenti preventivo

Haiku dispone di due strumenti separati. `quote_catalog_search` cerca clienti e
articoli nei CSV condivisi e restituisce ID, unità di misura, listino, IVA e
disponibilità. `quote_create_draft` accetta esclusivamente quegli ID e crea una
bozza: calcola imponibile, sconti, IVA, totale e margine usando centesimi e
quantità in millesimi.

La bozza non viene inviata al cliente e non diventa ordine. Se mancano dati
essenziali, l'agente chiede un chiarimento; sconti oltre l'8% o quantità sopra la
disponibilità vengono segnalati. Il risultato viene salvato nell'archivio demo
locale ignorato da Git e appare nella copia Manager al successivo caricamento.

## Esperienza conversazionale

L'endpoint `/api/chat/stream` usa Server-Sent Events su una richiesta `POST`.
Durante l'elaborazione comunica l'avvio e il completamento di routing, ricerca
Wiki, lettura pagine, retrieval RAG, calcoli pandas e composizione. Sono eventi
operativi sintetici: non contengono il ragionamento privato del modello.

Il client interpreta il Markdown senza inserire HTML prodotto dal modello e
presenta titoli, elenchi, enfasi e tabelle in modo accessibile. I risultati
pandas conservano inoltre il payload strutturato del microservizio per mostrare
KPI, grafici HTML/CSS, tabelle espandibili e metodo di calcolo. La richiesta può
essere interrotta dall'utente mentre è in corso.

## RAG

La modalità RAG recupera sezioni dal corpus canonico sincronizzato con la Wiki.
È operativa come retrieval locale lessicale, ma segnala esplicitamente che
ChromaDB ed embedding vettoriali non sono ancora configurati.

## Avvio

Richiede Node.js 22 e un ambiente Python con le dipendenze del servizio:

```bash
python3 -m venv .venv
./.venv/bin/python -m pip install --upgrade pip
./.venv/bin/pip install -e analytics-service
npm run dev:agent
```

L'ultimo comando avvia interfaccia su `localhost:3000`, copia Manager su
`localhost:5174`, orchestratore su `8787` e pandas su `8001`. Arrestando il
comando vengono chiusi tutti e quattro.

## Limiti e costi

Ogni domanda usa almeno una chiamata Haiku; la navigazione Wiki multi-pass e le
domande ibride possono usarne più di una. I risultati numerici descrivono solo
il dataset demo. Il backend limita cronologia, dimensione dei risultati, tempo
di rete e numero di iterazioni.
