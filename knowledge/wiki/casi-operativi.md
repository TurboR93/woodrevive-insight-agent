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

