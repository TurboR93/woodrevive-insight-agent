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

