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

