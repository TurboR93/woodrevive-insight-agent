# Dataset e KPI

## Dataset dimostrativi

### `vendite.csv`

Una riga per riga d'ordine evasa: data, documento, cliente anonimo, canale,
articolo, categoria, essenza, quantità, unità di misura, ricavo e costo.

### `magazzino.csv`

Fotografia per articolo e lotto: giacenza, impegnato, costo medio, prezzo di
listino, data di carico, provenienza sintetica e ubicazione.

### `incassi.csv`

Scadenze anonime: ordine, cliente, data scadenza, importo, incassato e stato.

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

Ogni risposta numerica deve riportare periodo, filtri, unità e formula.
