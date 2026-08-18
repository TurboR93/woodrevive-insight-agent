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

