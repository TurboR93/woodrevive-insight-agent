# Dataset e KPI

## Dataset dimostrativi

Il dataset completo comprende 23 CSV relazionali descritti in
`SCHEMA-DATI-DEMO.md`. I tre file seguenti sono viste analitiche compatibili
derivate dai documenti normalizzati.

### `vendite.csv`

Una riga per riga di fattura di vendita: data, ordine, cliente anonimo, canale,
articolo, categoria, essenza, quantità, unità di misura, ricavo e costo.

### `magazzino.csv`

Saldo per articolo e lotto: giacenza, costo medio, data di carico, ubicazione e
stato lotto. Impegnato e listino restano in `articoli.csv`.

### `incassi.csv`

Vista delle fatture cliente con importo, incassato, residuo e stato.

### `transazioni.csv`

Timeline unificata di 190 eventi. È utile per conteggi e andamenti documentali;
per margini, quantità e residui si usano sempre i file specialistici.

## Regole di qualità

- UTF-8, separatore virgola e intestazioni stabili;
- date ISO `YYYY-MM-DD`;
- denaro in centesimi interi;
- quantità in millesimi interi;
- identificativi sintetici senza riferimenti a persone reali;
- nessun valore negativo salvo note di credito esplicite;
- formule documentate e riproducibili.

## KPI della prima demo

| KPI | Formula |
|---|---|
| Fatturato | somma `ricavo_cents` |
| Costo del venduto | somma `costo_cents` |
| Margine | fatturato meno costo del venduto |
| Margine % | margine / fatturato × 100 |
| Ticket medio | fatturato / ordini distinti |
| Rotazione articolo | quantità venduta / giacenza media |
| Valore giacenza | giacenza × costo medio |
| Capitale fermo | valore dei lotti oltre la soglia giorni |
| Scaduto | importo meno incassato per scadenze passate |
| Conversione preventivi | preventivi convertiti / preventivi inviati |
| Evasione ordine | quantità consegnata / quantità ordinata |
| Esposizione cliente | fatturato lordo meno incassi attribuiti |
| Concentrazione top 5 | fatturato top 5 clienti / fatturato totale |
| Puntualità fornitore | ricezioni entro data prevista / ricezioni ricevute |

Ogni risposta numerica deve riportare periodo, filtri, unità, formula, file
sorgente e limiti. Quantità espresse in unità diverse non vengono sommate.
