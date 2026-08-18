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

