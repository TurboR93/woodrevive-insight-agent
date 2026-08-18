---
title: Manuale operativo completo WoodRevive Insight
version: 2
updated: 2026-08-18
source: wiki-canonical
synthetic: true
---

# Corpus RAG parallelo alla Wiki

Questo file è generato dalle pagine canoniche della Wiki. Consente di confrontare
RAG vettoriale e Wiki lessicale sullo stesso contenuto, senza vantaggi di copertura.
Le regole e le soglie descritte sono scenari didattici e non policy aziendali reali.

<!-- source: knowledge/wiki/dominio-legno-antico.md; slug: dominio-legno-antico -->

---
title: Dominio del legno antico
version: 1
updated: 2026-08-18
tags: [legno, essenza, patina, lotto, provenienza]
---

# Dominio del legno antico

## Modello commerciale

WoodRevive compra e rivende legno antico di recupero già lavorato. Il materiale
non viene trasformato internamente: tra acquisto e vendita cambiano proprietà,
disponibilità e prezzo.

## Articolo e lotto

L'**articolo** descrive che cosa viene venduto: categoria, essenza, misure,
unità di misura e prezzo. Il **lotto**, o partita, descrive da dove proviene una
specifica fornitura: edificio, località, periodo stimato, qualità e storia.

Articolo e lotto sono dimensioni parallele. La giacenza attribuita alla coppia
articolo-lotto permette di ricostruire la provenienza del materiale consegnato.

## Patina

La patina è l'aspetto acquisito dalla superficie nel tempo. La prima patina è la
faccia originale mai rilavorata ed è in genere la più rara. Altre descrizioni
comuni sono seconda patina, grigio, bruciato dal sole, spazzolato e naturale.

## Quando nasce un lotto

Il lotto nasce alla ricezione della merce, non quando viene emesso l'ordine di
acquisto. Prima della ricezione esiste una fornitura attesa, ma non una giacenza.

## Voci correlate

- [Ciclo commerciale](ciclo-commerciale.md)
- [Margini e prezzi](margini-e-prezzi.md)

---

<!-- source: knowledge/wiki/ruoli-e-responsabilita.md; slug: ruoli-e-responsabilita -->

---
title: Ruoli e responsabilità
version: 2
updated: 2026-08-18
tags: [ruoli, approvazioni, responsabilità, audit]
---

# Ruoli e responsabilità

## Principio generale

La documentazione demo descrive responsabilità funzionali, non persone reali. Chi inserisce un dato conserva la responsabilità della fonte; chi approva controlla coerenza economica e documentale; chi analizza non modifica i documenti originari.

## Matrice operativa

| Attività | Responsabile | Verifica minima |
|---|---|---|
| Anagrafica cliente | Commerciale | dati fiscali, canale, contatto e indirizzo |
| Preventivo | Commerciale | quantità, lotto ipotizzato, validità e sconto |
| Sconto oltre l'8% | Responsabile commerciale | margine previsto e motivazione |
| Ordine acquisto | Acquisti | fornitore, costo, trasporto e data attesa |
| Ricezione e lotto | Magazzino | quantità, qualità, provenienza e fotografie |
| DDT | Logistica | disponibilità articolo-lotto e destinazione |
| Fattura | Amministrazione | riferimenti a ordine/DDT, imponibile e IVA |
| Rettifica inventario | Magazzino + responsabile | causale, conteggio e documento di rettifica |

## Separazione dei compiti

Una rettifica non deve essere usata per nascondere un DDT mancante. Uno sconto eccezionale non deve essere approvato dalla stessa persona che lo propone. Un pagamento è registrato come fatto contabile; una scadenza è invece un'aspettativa e può restare aperta o parziale.

## Evidenze di audit

Ogni eccezione deve lasciare data, autore applicativo, motivo, documento collegato e valore prima/dopo. Nel dataset demo gli identificativi `DEMO-*` sostituiscono qualsiasi dato reale.

---

<!-- source: knowledge/wiki/acquisti-e-ricezione.md; slug: acquisti-e-ricezione -->

---
title: Acquisti e ricezione
version: 2
updated: 2026-08-18
tags: [fornitore, ordine acquisto, ricezione, trasporto]
---

# Acquisti e ricezione

## Prima dell'ordine

L'acquirente identifica essenza, patina, categoria, misure, quantità attesa, origine dichiarata e condizioni di trasporto. Il fornitore può essere recuperante, demolitore, segheria, commerciante, ferramenta o trasportatore. Le essenze tipiche sono un'indicazione, non una garanzia sul singolo lotto.

## Ordine di acquisto

L'ordine contiene righe articolo, prezzi in centesimi, quantità in millesimi, IVA, costo di trasporto e data prevista. Lo stato `bozza` non genera impegni; `confermato` indica merce attesa; `ricevuto` richiede data di ricezione e successivo carico.

## Ricezione

Alla consegna si confrontano quantità attesa e ricevuta, essenza, patina, misure, umidità, difetti e documenti di provenienza. Solo la quantità accettata viene caricata. Se il controllo non è concluso, il lotto nasce in `quarantena`: è fisicamente presente, ma non vendibile.

## Costo completo

Il costo del lotto include prezzo della merce e trasporto attribuibile. Se un trasporto riguarda più righe, la ripartizione consigliata è proporzionale al valore imponibile, documentando l'eventuale criterio diverso.

## Eccezioni

- quantità inferiore: ricezione parziale e residuo atteso esplicito;
- materiale difforme: lotto in quarantena, foto e nota di non conformità;
- provenienza mancante: nessuna promessa al cliente finché il controllo non è chiuso;
- costo trasporto noto dopo la ricezione: rettifica del costo, non della quantità.

---

<!-- source: knowledge/wiki/lotti-e-tracciabilita.md; slug: lotti-e-tracciabilita -->

---
title: Lotti e tracciabilità
version: 2
updated: 2026-08-18
tags: [lotto, provenienza, qualità, foto]
---

# Lotti e tracciabilità

## Identità del lotto

Il lotto rappresenta una specifica partita ricevuta. Conserva fornitore, ordine di acquisto, data, provenienza dichiarata, periodo stimato, essenza, patina, qualità, costo attribuito, ubicazione, note storiche e fotografie.

## Articolo e lotto non coincidono

L'articolo risponde a “che cosa vendiamo”; il lotto risponde a “da quale partita proviene”. Lo stesso articolo può essere presente in più lotti con storie e costi diversi. Una consegna deve indicare entrambi per mantenere la catena acquisto → lotto → movimento → DDT → cliente.

## Stati

- `disponibile`: verificato e utilizzabile;
- `quarantena`: presente ma bloccato per controllo;
- `esaurito`: saldo fisico pari a zero;
- `bloccato`: indisponibile per decisione commerciale o documentale.

## Provenienza e dichiarazioni

La provenienza è quella documentata dal fornitore. Se anno o località sono stime, devono essere qualificate come tali. Le affermazioni commerciali non possono essere più precise delle evidenze conservate.

## Cambio lotto

Sostituire il lotto promesso richiede verifica di essenza, patina, qualità, misure, costo e accettazione del cliente quando il cambio altera l'aspetto. Il cambio va tracciato sull'ordine o sul DDT, mai soltanto in una nota informale.

---

<!-- source: knowledge/wiki/catalogo-misure-unita.md; slug: catalogo-misure-unita -->

---
title: Catalogo, misure e unità
version: 2
updated: 2026-08-18
tags: [articolo, categoria, misure, udm]
---

# Catalogo, misure e unità

## Classificazione

Le categorie previste sono tavola, perlinato, pannello, lamella, travatura, pavimento, rivestimento e mobile. Essenza, patina e dimensioni sono fotografate anche nelle righe documento per conservare lo stato storico dell'offerta.

## Unità ammesse

`mq` per superfici, `ml` per lunghezze, `mc` per volumi, `pz` per elementi, `kg`, `ora` e `corpo`. Le quantità sono interi in millesimi: `18500` significa 18,5 unità. I millimetri sono interi e non vanno convertiti in centesimi.

## Regole di conversione

Una conversione tra `mq`, `ml` e `mc` è valida solo se tutte le misure necessarie sono note. Non si sommano quantità con unità diverse. Il campo `mc_per_unita_milli` supporta stime logistiche, ma non sostituisce il conteggio fisico.

## Snapshot documentale

Codice, descrizione, essenza, patina e spessore sono copiati nella riga di preventivo, ordine, DDT o fattura. Così una successiva modifica del catalogo non riscrive la storia.

## Controlli

Un articolo gestito a magazzino richiede unità, ubicazione e costo medio. Quantità zero è ammessa sulle righe descrittive, non sulle righe merce. Unità della riga e dell'articolo devono essere coerenti.

---

<!-- source: knowledge/wiki/preventivi-e-sconti.md; slug: preventivi-e-sconti -->

---
title: Preventivi e sconti
version: 2
updated: 2026-08-18
tags: [preventivo, validità, sconto, campione]
---

# Preventivi e sconti

## Contenuto minimo

Un preventivo contiene cliente, oggetto, righe, quantità, unità, prezzo, sconto, IVA, validità, condizioni di pagamento, tempi di consegna e note. La riga può indicare un lotto, ma prima dell'ordine questa associazione resta una proposta.

## Validità e disponibilità

Il preventivo non riserva automaticamente il materiale. Alla conversione si ricontrollano giacenza disponibile, stato del lotto e tempi. Se l'offerta è scaduta, prezzo e disponibilità devono essere rivalidati.

## Sconti demo

Le soglie sono solo regole di test: fino al 5% gestione ordinaria; dal 5,01% all'8% motivazione; oltre l'8% approvazione del responsabile e controllo del margine. Nessuna soglia è presentata come policy reale WoodRevive.

## Campioni e patina

Per materiali con forte variabilità estetica, l'offerta può essere subordinata all'approvazione di un campione. L'approvazione identifica essenza, patina e lotto; non garantisce identità perfetta tra ogni tavola.

## Conversione

Il preventivo accettato genera un ordine con riferimento al documento originario. Eventuali differenze di quantità, prezzo o lotto devono essere esplicite e non cancellano lo storico del preventivo.

---

<!-- source: knowledge/wiki/ciclo-commerciale.md; slug: ciclo-commerciale -->

---
title: Ciclo commerciale
version: 1
updated: 2026-08-18
tags: [preventivo, ordine, ddt, incasso, procedura]
---

# Ciclo commerciale

## Flusso principale

Il percorso di vendita è: **preventivo → ordine cliente → DDT → incasso**. Il
percorso di approvvigionamento è: **ordine di acquisto → ricezione → lotto e
carico di magazzino**.

## Preventivo

Il preventivo congela descrizione, quantità, prezzo, sconto e validità. Se viene
accettato, genera un ordine mantenendo il riferimento alla proposta originaria.

## Ordine e disponibilità

L'ordine impegna la quantità promessa al cliente. Impegnare non significa
scaricare: la merce rimane fisicamente in magazzino fino all'emissione del DDT.

## DDT

L'emissione del DDT registra l'uscita. Ogni riga dovrebbe indicare articolo e
lotto, così la provenienza resta collegata alla consegna.

## Incasso

Acconti, saldi e note di credito vengono associati all'ordine. Il residuo è il
totale dovuto meno gli importi contabilizzati; una scadenza passata con residuo
positivo viene classificata come scaduta.

## Regola di controllo

Nessun DDT può scaricare una quantità superiore alla disponibilità del relativo
articolo-lotto senza una rettifica esplicita e tracciata.

---

<!-- source: knowledge/wiki/ordini-ddt-consegne.md; slug: ordini-ddt-consegne -->

---
title: Ordini, DDT e consegne
version: 2
updated: 2026-08-18
tags: [ordine, impegno, ddt, consegna, trasporto]
---

# Ordini, DDT e consegne

## Impegno e disponibilità

L'ordine confermato impegna la quantità. La disponibilità commerciale è `giacenza - impegnato`; lo scarico fisico avviene soltanto col DDT. Un lotto in quarantena o bloccato non è disponibile anche se il saldo è positivo.

## DDT

Il DDT identifica cliente, ordine, data, destinazione, causale, vettore, colli, peso e righe articolo-lotto. Ogni riga genera uno scarico con quantità positiva e tipo movimento `scarico`.

## Consegna frazionata

Più DDT possono evadere lo stesso ordine. La somma consegnata non deve superare la quantità ordinata. L'ordine è `evaso` solo quando tutte le righe sono complete oppure quando il residuo viene annullato con motivazione.

## Sostituzione e reso

Un lotto alternativo richiede un controllo tecnico-estetico e una traccia. Un reso genera un movimento di carico distinto; il materiale rientrato resta in quarantena finché non viene verificato.

## Controlli prima dell'emissione

Verificare destinazione, accesso del vettore, quantità, unità, stato lotto, disponibilità e riferimenti. Se manca un dato critico, il DDT resta in bozza e non si corregge la giacenza manualmente.

---

<!-- source: knowledge/wiki/fatture-incassi-scadenze.md; slug: fatture-incassi-scadenze -->

---
title: Fatture, incassi e scadenze
version: 2
updated: 2026-08-18
tags: [fattura, acconto, saldo, scadenza, credito]
---

# Fatture, incassi e scadenze

## Documenti e fatti

La fattura di vendita deriva da ordine e DDT e conserva gli snapshot delle righe. La fattura di acquisto deriva dal documento del fornitore e dall'ordine di acquisto. Gli importi sono in centesimi interi.

## Pagamenti e scadenze

Il pagamento è un fatto registrato con data, importo, mezzo e riferimento. La scadenza è un importo atteso con data prevista. Sono entità separate: una scadenza può essere aperta, parziale o saldata da più pagamenti.

## Residuo e scaduto

`residuo = importo dovuto - pagamenti attribuiti`. Lo scaduto è il residuo positivo di una scadenza con data precedente alla data di analisi. La data odierna e il perimetro devono essere dichiarati nella risposta.

## Acconto

Un acconto riduce il residuo dell'ordine o della fattura collegata, ma non prova la consegna. Un saldo non chiude automaticamente una contestazione di qualità; lo stato commerciale e quello finanziario restano distinti.

## Controlli credito

Prima di confermare nuove forniture, il responsabile può verificare esposizione totale, scaduto, giorni medi di ritardo e concentrazione per cliente. Nel progetto demo le eventuali soglie sono scenari didattici, non limiti reali.

---

<!-- source: knowledge/wiki/magazzino-e-qualita.md; slug: magazzino-e-qualita -->

---
title: Magazzino e qualità
version: 2
updated: 2026-08-18
tags: [giacenza, quarantena, inventario, scarto]
---

# Magazzino e qualità

## Giacenza derivata

La giacenza non è un numero libero: è la somma dei carichi meno scarichi per coppia articolo-lotto. Gli ordini influenzano l'impegnato, non il saldo fisico.

## Quarantena

Il materiale con difformità, umidità da verificare, provenienza incompleta o reso cliente viene posto in quarantena. Può avere saldo positivo ma non deve entrare nella disponibilità commerciale.

## Rettifiche

La rettifica inventariale richiede conteggio, causale, data e approvazione. Lo scarto è uno scarico con origine `scarto`; un ritrovamento è un carico con origine `inventario`. La rettifica non può riferirsi a un lotto inesistente.

## Lenta rotazione

Un lotto è lento se resta in giacenza oltre la soglia selezionata. L'età si misura dalla data di carico, non dalla data dell'ordine di acquisto. Il capitale fermo è quantità residua per costo medio attribuito.

## Non conformità

La nota deve distinguere difetto estetico accettabile, difetto strutturale, errore di misura e documentazione mancante. La decisione può essere accettazione, sconto fornitore, reso, riclassificazione o scarto.

---

<!-- source: knowledge/wiki/margini-e-prezzi.md; slug: margini-e-prezzi -->

---
title: Margini e prezzi
version: 1
updated: 2026-08-18
tags: [margine, ricarico, prezzo, costo, listino]
---

# Margini e prezzi

## Margine

Il margine in valore è `prezzo di vendita - costo`. La percentuale di margine
si calcola sul prezzo di vendita:

`margine % = (prezzo di vendita - costo) / prezzo di vendita × 100`

## Ricarico

Il ricarico usa invece il costo come base:

`ricarico % = (prezzo di vendita - costo) / costo × 100`

Margine e ricarico non sono intercambiabili. Un prodotto comprato a 60 e venduto
a 100 ha un margine del 40% e un ricarico del 66,7%.

## Costo completo

Il costo deve includere le spese direttamente attribuibili all'acquisto, incluso
il trasporto ripartito sulle righe. Escluderle sovrastima la redditività.

## Uso delle soglie

Le fasce di marginalità presenti nei dati demo sono esempi didattici, non una
policy commerciale approvata da WoodRevive. Prima di trasformare una soglia in
un alert operativo serve validazione aziendale.

---

<!-- source: knowledge/wiki/kpi-e-qualita-dati.md; slug: kpi-e-qualita-dati -->

---
title: KPI e qualità dei dati
version: 2
updated: 2026-08-18
tags: [kpi, formula, qualità dati, periodo]
---

# KPI e qualità dei dati

## Regola di risposta

Ogni insight numerico indica periodo, dataset, filtri, unità, formula e limiti. L'agente non deve trasformare correlazioni in cause e non deve confrontare quantità con unità incompatibili.

## KPI commerciali

- fatturato imponibile: somma delle righe fatturate, al netto dell'IVA;
- margine: ricavo imponibile meno costo attribuito;
- margine percentuale: margine diviso ricavo imponibile;
- conversione: preventivi accettati e convertiti diviso preventivi inviati validi;
- evasione: quantità consegnata diviso quantità ordinata, a parità di unità;
- ticket medio: fatturato diviso ordini fatturati distinti.

## KPI operativi e finanziari

- valore giacenza: quantità residua × costo medio;
- stock lento: valore dei lotti oltre N giorni;
- esposizione cliente: fatture meno incassi attribuiti;
- scaduto: residuo positivo oltre data scadenza;
- puntualità fornitore: ricezioni entro data prevista / ricezioni totali.

## Controlli automatici

Chiavi esterne valide, totali testata-righe, IVA, date coerenti, nessuna giacenza negativa, nessun DDT oltre l'ordinato, saldo pagamenti non superiore al dovuto e codici univoci.

## Dati demo

I risultati del progetto non descrivono WoodRevive reale. Le aziende hanno nomi inventati, recapiti `.example`, identificativi `DEMO-*` e importi generati deterministicamente.

---

<!-- source: knowledge/wiki/casi-operativi.md; slug: casi-operativi -->

---
title: Casi operativi di prova
version: 2
updated: 2026-08-18
tags: [scenari, eccezioni, test, ibrido]
---

# Casi operativi di prova

Questi casi verificano routing documentale, analisi numerica e risposte ibride. Le soglie sono parametri di test.

1. **Preventivo scaduto ma materiale disponibile.** Recuperare la regola di rivalidazione e misurare la variazione del costo rispetto all'offerta.
2. **Sconto al 12%.** Citare il percorso di approvazione e calcolare il margine dopo lo sconto.
3. **Campione non approvato.** Individuare i preventivi con nota campione e spiegare perché non vanno convertiti automaticamente.
4. **Ordine confermato con cliente esposto.** Sommare residuo e scaduto del cliente e richiamare il controllo credito.
5. **Consegna frazionata.** Ricostruire quantità ordinata, DDT emessi e residuo da consegnare.
6. **DDT oltre quantità ordinata.** Rilevare l'anomalia e indicare che il documento va bloccato prima dello scarico.
7. **Cambio lotto prima della consegna.** Confrontare essenza, patina, qualità, costo e disponibilità dei due lotti.
8. **Lotto in quarantena.** Escluderlo dalla disponibilità e spiegare quali evidenze chiudono il controllo.
9. **Provenienza incompleta.** Trovare lotti privi di località o anno e limitare le affermazioni commerciali.
10. **Ricezione parziale da fornitore.** Calcolare quantità mancante, valore atteso e impatto sugli ordini clienti.
11. **Trasporto arrivato dopo la fattura.** Ricalcolare il costo completo senza modificare la quantità ricevuta.
12. **Scarto per difetto.** Collegare rettifica, lotto, costo perso e procedura di non conformità.
13. **Rettifica positiva d'inventario.** Mostrare saldo prima/dopo e richiedere causale e approvazione.
14. **Stock oltre 180 giorni.** Ordinare i lotti per capitale fermo e proporre l'azione prevista dalla procedura commerciale.
15. **Articolo sotto scorta.** Separare giacenza, impegnato e disponibile e suggerire quali ordini acquisto verificare.
16. **Margine per categoria.** Confrontare ricavo, costo e margine senza confondere margine e ricarico.
17. **Concentrazione cliente.** Calcolare la quota dei primi cinque clienti e segnalare il rischio senza attribuire cause.
18. **Concentrazione fornitore.** Misurare la quota acquisti e verificare dipendenza per essenza.
19. **Scadenza parzialmente incassata.** Distinguere importo fattura, pagamenti registrati, residuo e giorni di ritardo.
20. **Fattura saldata ma contestazione aperta.** Non confondere stato finanziario e qualità del lotto.
21. **Unità incompatibili.** Bloccare la somma diretta tra `mq`, `ml` e `pz` e spiegare quali misure servono per convertire.
22. **Catalogo modificato dopo l'ordine.** Usare gli snapshot delle righe per ricostruire il documento storico.
23. **Prestazione del canale commerciale.** Confrontare fatturato e margine per canale, dichiarando periodo e numero ordini.
24. **Previsione di incasso.** Usare le scadenze aperte come attese, senza presentarle come cassa certa.
25. **Domanda ambigua “quanto legno abbiamo?”.** Chiedere unità, categoria, disponibilità fisica o commerciale e data di riferimento.

## Criterio di superamento

Una risposta è valida solo se cita la pagina documentale corretta, usa i CSV pertinenti, mostra formula e periodo, e segnala che i dati sono sintetici. Nei casi 4, 7, 8, 11, 14, 19 e 24 è obbligatoria una risposta ibrida.
