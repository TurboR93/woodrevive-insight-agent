# Schema dati demo

## Scopo e perimetro

L'archivio riproduce la forma logica del gestionale WoodRevive senza copiarne i
contenuti. Tutte le controparti, i recapiti, gli identificativi, le provenienze
e gli importi sono inventati. Il periodo simulato va dal 12 gennaio al 24 luglio
2025; la generazione è deterministica.

## Convenzioni

- denaro: interi in centesimi (`5945` = 59,45 euro);
- quantità: interi in millesimi (`18500` = 18,5 unità);
- misure: millimetri interi;
- date operative: ISO `YYYY-MM-DD`;
- timestamp tecnici: millisecondi Unix;
- booleani CSV: `true` e `false`;
- array CSV: valori separati da punto e virgola;
- chiavi sintetiche: prefissi come `cli-`, `art-`, `lot-`, `ord-`.

## Entità anagrafiche

| File | Granularità | Righe | Chiave |
|---|---|---:|---|
| `clienti.csv` | azienda cliente | 24 | `id` |
| `fornitori.csv` | azienda fornitrice | 10 | `id` |
| `articoli.csv` | articolo di catalogo | 24 | `id` |
| `lotti.csv` | partita fisica ricevuta | 16 | `id` |

Clienti e fornitori sono separati. L'articolo descrive categoria, essenza,
patina, misure e prezzi; il lotto conserva provenienza, qualità, fornitore,
ordine di acquisto e stato. La disponibilità reale richiede entrambi.

## Documenti commerciali

| Testata | Righe | Relazione principale |
|---|---|---|
| `ordini_acquisto.csv` | `righe_ordini_acquisto.csv` | fornitore → articolo → lotto |
| `preventivi.csv` | `righe_preventivi.csv` | cliente → articolo proposto |
| `ordini.csv` | `righe_ordini.csv` | preventivo → cliente → lotto impegnato |
| `ddt.csv` | `righe_ddt.csv` | ordine → articolo-lotto consegnato |
| `fatture_vendita.csv` | `righe_fatture_vendita.csv` | ordine/DDT → cliente |
| `fatture_acquisto.csv` | `righe_fatture_acquisto.csv` | ordine acquisto → fornitore |

Le testate conservano totali e stati. Le righe conservano quantità, unità,
prezzo, sconto, IVA e snapshot di essenza, patina e spessore. Lo snapshot evita
che una modifica futura del catalogo cambi lo storico.

## Magazzino e finanza

`movimenti_magazzino.csv` contiene carichi, scarichi e rettifiche. La giacenza
di ogni coppia articolo-lotto è la somma firmata dei movimenti. Il DDT produce
lo scarico; l'ordine produce soltanto l'impegnato.

`pagamenti.csv` registra incassi avvenuti. `scadenze.csv` registra attese di
incasso e pagamento, quindi può contenere righe aperte o parziali. Non si deve
dedurre la cassa dalle sole scadenze.

## Vista eventi e viste analitiche

`transazioni.csv` normalizza 190 eventi con data, tipo, direzione, documento,
controparte, importo, stato e file sorgente. Serve per timeline e volumi, non
sostituisce le tabelle dettagliate.

Le viste `vendite.csv`, `magazzino.csv` e `incassi.csv` mantengono la forma
attesa dal servizio pandas esistente. Sono derivate dagli stessi documenti e
non costituiscono una seconda fonte autonoma.

## Lineage essenziale

```text
ordine acquisto -> ricezione -> lotto -> carico
preventivo -> ordine cliente -> impegno
ordine cliente -> DDT -> scarico -> fattura
fattura -> scadenza -> uno o più pagamenti -> residuo
```

## Controlli automatici

Il generatore blocca l'output se non sono rispettati: almeno 20 clienti, almeno
60 eventi, chiavi esterne principali, giacenze non negative, totali di acquisto
e vendita, e residui ordine. Il manifest rende visibile l'esito di ciascun test.

## Limiti intenzionali

Il dataset non simula contabilità generale, numerazione fiscale ufficiale,
multi-valuta, più aliquote sulla stessa riga, lavorazioni interne o autenticità
storica certificata. Questi limiti vanno dichiarati nelle risposte che tentano
di inferire risultati oltre il perimetro.

