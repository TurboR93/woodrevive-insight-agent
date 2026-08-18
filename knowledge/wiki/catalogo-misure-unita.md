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

