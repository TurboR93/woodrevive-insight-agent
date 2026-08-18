# Skill aziendali

## Obiettivo

Le skill rendono Haiku più disciplinato nei passaggi dove un errore operativo è
più costoso, senza inserire tutte le procedure in ogni prompt. Non sono nuovi
tool e non eseguono codice: sono istruzioni specialistiche brevi, selezionate dal
backend prima della chiamata al modello.

## Catalogo

| ID | Skill | Quando si attiva | Vincolo principale |
|---|---|---|---|
| `quote-draft` | Preventivo controllato | preventivi, offerte, quotazioni | catalogo prima della bozza; nessun invio reale |
| `margin-review` | Controllo marginalità | margine, ricarico, redditività, sconti | formula, costo e IVA distinti |
| `inventory-delivery` | Disponibilità e consegne | stock, lotti, DDT, consegne, evasione | giacenza, impegnato e disponibile separati |
| `customer-credit` | Crediti e incassi | scadenze, esposizione, residui, pagamenti | aperto e scaduto non sono sinonimi |
| `sales-kpi` | KPI commerciali | vendite, fatturato, trend, categorie | periodo, perimetro e unità espliciti |
| `wiki-procedure` | Procedura aziendale | policy, regole, manuali, “come si…” | ricerca e lettura Wiki prima della risposta |

## Controllo dei costi

La selezione usa espressioni regolari e priorità nel backend:

- zero chiamate LLM aggiuntive;
- massimo 2 skill per richiesta;
- nessuna skill per una domanda generica;
- prompt combinato verificato sotto 1.100 caratteri;
- istruzioni della skill, non documentazione completa;
- dati e policy continuano ad arrivare dai tool, non dalla skill.

Questo evita che una domanda sui crediti riceva anche regole di magazzino,
preventivi e procedure. Se una domanda è davvero trasversale, vengono scelte le
due specializzazioni con punteggio maggiore e il normale orchestratore può
comunque combinare Wiki e pandas.

## Osservabilità

L'attivazione produce un evento nella traccia “Come ho costruito la risposta”.
La risposta conserva inoltre ID, etichetta e descrizione delle skill attive;
questi dati entrano nella memoria locale della conversazione insieme a fonti e
artefatti. Le istruzioni interne complete non vengono mostrate nel browser.

## Evoluzione

Una skill va aggiunta solo quando esiste un errore ricorrente misurabile o una
procedura aziendale stabile. Prima di aumentarne il numero è preferibile creare
un caso di valutazione, misurare precisione e token e verificare che un tool o
una pagina Wiki non risolvano già il problema.
