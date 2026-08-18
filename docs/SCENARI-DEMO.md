# Scenari della demo

Il catalogo esteso comprende 25 casi operativi nella pagina Wiki
`casi-operativi.md`. Questa selezione costituisce il percorso dimostrativo
principale.

## Domande documentali

1. Qual è la differenza tra articolo e lotto?
2. Che cosa significa prima patina?
3. Quando nasce un lotto?
4. Come si calcola il margine su un articolo?
5. Quali passaggi portano dal preventivo all'incasso?

## Domande numeriche

1. Qual è il fatturato mensile e come sta cambiando?
2. Quale categoria genera il margine maggiore?
3. Quali prodotti hanno la rotazione più lenta?
4. Quanto capitale è fermo nei lotti più vecchi?
5. Quali clienti anonimi hanno importi scaduti?
6. Quali ordini hanno una consegna frazionata e quanto resta da evadere?
7. Quali fornitori concentrano il maggior valore di acquisto?
8. Qual è l'esposizione aperta per cliente?
9. Quali lotti in quarantena hanno ancora quantità positiva?
10. Quanti eventi di ogni tipo sono avvenuti mese per mese?

## Consultazione e azioni sui preventivi

1. «Abbiamo preventivi recenti?» deve usare `quote_recent_list`, mostrare gli
   ultimi preventivi in chat e offrire il collegamento a ciascun dettaglio nel
   gestionale demo.
2. «Mostrami le bozze dei preventivi» deve applicare il filtro `bozza` sullo
   stesso archivio strutturato.
3. «Crea un preventivo per Atelier Arco: 20 m² di Tavola abete prima patina»
   deve cercare catalogo e cliente prima di salvare una nuova bozza.

L'oracolo del primo scenario richiede che la risposta non dichiari i dati
indisponibili e non usi Wiki o RAG. L'elenco combina `preventivi.csv` con
`runtime/demo-quote-drafts.json`, ordinato per data decrescente.

## Domande ibride

1. Quali articoli hanno margine sotto la soglia indicativa e quale regola devo
   consultare prima di modificare il prezzo?
2. Quali lotti sono fermi da più di 180 giorni e cosa suggerisce la procedura
   commerciale?
3. Il prodotto con più vendite rispetta le indicazioni di prezzo della Wiki?
4. Quali clienti hanno scaduto e quale controllo è previsto prima di un nuovo ordine?
5. Quale capitale è fermo nei lotti in quarantena e come va trattato?
6. Quali sconti oltre l'8% riducono maggiormente il margine e chi li approva?
7. Quali consegne hanno cambiato lotto e quali verifiche servono?

## Confronto RAG/Wiki

Usare le stesse cinque domande documentali sui due percorsi e registrare
correttezza, fonte, completezza, allucinazioni, latenza e token quando disponibili.

## Oracolo minimo

Per ogni domanda si registra: intent atteso, strumento atteso, file o pagina
fonte, formula, filtri, risultato numerico tollerato, citazione e avvisi. Le
risposte devono dichiarare che i dati sono sintetici e non rappresentano
l'andamento reale di WoodRevive.
