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
