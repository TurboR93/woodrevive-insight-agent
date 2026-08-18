# Memoria chat e sistema utenti

## Cosa funziona nel demo

La chat usa una memoria locale versionata nella chiave
`woodrevive.insight.chat-memory.v1`. Memorizza fino a 12 conversazioni e 80
messaggi per conversazione, inclusi risposta formattata, fonti, attività dei
tool, risultati pandas e schede preventivo.

Ogni conversazione ha:

- un ID stabile;
- titolo ricavato dalla prima richiesta;
- data di creazione e ultimo aggiornamento;
- attore demo (`demo-user-local` / `Utente demo`);
- sequenza dei messaggi con autore e timestamp.

La testata permette di aprire la cronologia, riprendere una chat precedente o
iniziarne una nuova. Poiché la memoria vive nel browser, il passaggio alla copia
Manager e il ritorno all'agente non la cancellano.

Quando l'agente crea una bozza, invia al backend anche `conversationId` e
identità demo. La bozza salvata contiene quindi un piccolo audit con ID e nome
dell'attore e origine `demo-local`. È tracciabilità dimostrativa, non una prova
d'identità.

## Limiti di localStorage

`localStorage` è adatto al prototipo perché è immediato e non contiene dati
reali. Non è sufficiente per un prodotto multiutente:

- è legato a un singolo browser e profilo;
- si può cancellare o modificare dal client;
- non sincronizza dispositivi;
- non applica permessi o conservazione centralizzata;
- non deve contenere token, segreti o dati aziendali sensibili.

Per questo il client limita la dimensione della cronologia e tratta la memoria
locale come cache dell'esperienza, non come archivio aziendale.

## Evoluzione con login

Il contratto attuale consente di sostituire l'attore demo con l'identità della
sessione senza cambiare l'interfaccia dei tool. Il backend futuro dovrà ignorare
l'identità dichiarata dal browser e ricavarla da una sessione autenticata.

Il modello dati consigliato comprende:

| Entità | Scopo |
|---|---|
| `users` | identità, stato e profilo |
| `roles` / `memberships` | accesso per azienda e reparto |
| `conversations` | proprietario, titolo, stato e date |
| `messages` | autore, contenuto e ordine dei turni |
| `tool_runs` | strumento, esito, durata e fonti usate |
| `actions` | preventivo creato/modificato, attore e correlazione |
| `artifacts` | grafici, tabelle e snapshot dei preventivi |

Il percorso previsto è:

1. autenticazione e sessione HTTP-only;
2. autorizzazione server-side per conversazione e azione;
3. persistenza transazionale di messaggi, tool run e audit;
4. API per elenco, ricerca, rinomina e archiviazione delle chat;
5. sincronizzazione nel client, mantenendo `localStorage` come cache;
6. policy di retention, esportazione e cancellazione;
7. log immutabile per le azioni che incidono sul gestionale reale.

Prima del collegamento a dati reali sarà inoltre necessaria una conferma
esplicita per le scritture, con ruoli distinti almeno per consultazione,
commerciale e amministrazione.
