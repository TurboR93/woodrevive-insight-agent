import { resolve } from "node:path";
import { booleanValue, nullable, numberValue, readCsv, type CsvRow } from "./csv.js";
import { listStoredQuotes } from "./demo-quotes.js";

const projectRoot = resolve(import.meta.dirname, "../../..");
const dataRoot = resolve(projectRoot, "datasets/demo");

const file = (name: string) => readCsv(resolve(dataRoot, name));
const trace = (row: CsvRow) => ({
  id: row.id,
  id_esterno: null,
  created_at: numberValue(row.created_at, Date.now()),
  updated_at: numberValue(row.updated_at, numberValue(row.created_at, Date.now())),
});
const splitValues = (value: string) => value.split(/[|;]/).map((item) => item.trim()).filter(Boolean);

function headerFor(subject?: CsvRow) {
  return {
    nome: subject?.ragione_sociale || "Controparte demo",
    indirizzo: nullable(subject?.indirizzo), cap: nullable(subject?.cap), citta: nullable(subject?.citta),
    provincia: nullable(subject?.provincia), nazione: subject?.nazione || "IT",
    codice_fiscale: nullable(subject?.codice_fiscale), piva: nullable(subject?.piva),
  };
}

function salesLine(row: CsvRow) {
  return {
    id: row.id, tipo: row.tipo || "merce", articolo_id: nullable(row.articolo_id),
    codice_articolo: nullable(row.codice_articolo), descrizione: row.descrizione,
    lotto_id: nullable(row.lotto_id), lotto_codice: nullable(row.lotto_codice),
    quantita_milli: numberValue(row.quantita_milli), unita_misura: row.unita_misura || "corpo",
    prezzo_unitario_cents: numberValue(row.prezzo_unitario_cents),
    sconto_percentuale: numberValue(row.sconto_percentuale), aliquota_iva: numberValue(row.aliquota_iva),
    imponibile_cents: numberValue(row.imponibile_cents), essenza: nullable(row.essenza_snapshot),
    patina: nullable(row.patina_snapshot), spessore_mm: nullable(row.spessore_mm_snapshot) ? numberValue(row.spessore_mm_snapshot) : null,
    note: nullable(row.note),
  };
}

export async function buildManagerDemoEnvelope() {
  const [customers, suppliers, articles, lots, movements, quotes, quoteLines, orders, orderLines,
    ddt, ddtLines, purchases, purchaseLines, payments, deadlines] = await Promise.all([
    file("clienti.csv"), file("fornitori.csv"), file("articoli.csv"), file("lotti.csv"),
    file("movimenti_magazzino.csv"), file("preventivi.csv"), file("righe_preventivi.csv"),
    file("ordini.csv"), file("righe_ordini.csv"), file("ddt.csv"), file("righe_ddt.csv"),
    file("ordini_acquisto.csv"), file("righe_ordini_acquisto.csv"), file("pagamenti.csv"), file("scadenze.csv"),
  ]);
  const customerById = new Map(customers.map((row) => [row.id, row]));
  const savedQuotes = await listStoredQuotes();

  const dbCustomers = customers.map((row) => ({
    ...trace(row), codice: row.codice, tipo: row.tipo, natura_fiscale: row.natura_fiscale,
    ragione_sociale: row.ragione_sociale, referente: nullable(row.referente), piva: nullable(row.piva),
    codice_fiscale: nullable(row.codice_fiscale), codice_sdi: nullable(row.codice_sdi), pec: nullable(row.pec),
    email: nullable(row.email), telefono: nullable(row.telefono), indirizzo: nullable(row.indirizzo), cap: nullable(row.cap),
    citta: nullable(row.citta), provincia: nullable(row.provincia), nazione: row.nazione || "IT",
    consegna_indirizzo: nullable(row.consegna_indirizzo), consegna_cap: nullable(row.consegna_cap),
    consegna_citta: nullable(row.consegna_citta), consegna_provincia: nullable(row.consegna_provincia),
    canale: row.canale, sconto_default_percentuale: numberValue(row.sconto_default_percentuale),
    aliquota_iva_default: numberValue(row.aliquota_iva_default, 22), note: nullable(row.note), attivo: booleanValue(row.attivo),
  }));
  const dbSuppliers = suppliers.map((row) => ({
    ...trace(row), codice: row.codice, tipo: row.tipo, natura_fiscale: row.natura_fiscale,
    ragione_sociale: row.ragione_sociale, referente: nullable(row.referente), piva: nullable(row.piva),
    codice_fiscale: nullable(row.codice_fiscale), codice_sdi: nullable(row.codice_sdi), pec: nullable(row.pec),
    email: nullable(row.email), telefono: nullable(row.telefono), indirizzo: nullable(row.indirizzo), cap: nullable(row.cap),
    citta: nullable(row.citta), provincia: nullable(row.provincia), nazione: row.nazione || "IT",
    essenze_tipiche: splitValues(row.essenze_tipiche), note: nullable(row.note), attivo: booleanValue(row.attivo),
  }));
  const dbArticles = articles.map((row) => ({
    ...trace(row), codice: row.codice, nome: row.nome, descrizione: nullable(row.descrizione), natura: row.natura || "merce",
    gestione_magazzino: booleanValue(row.gestione_magazzino), stadio: row.stadio === "prelavorato" ? "semilavorato" : row.stadio,
    categoria: row.categoria, essenza: nullable(row.essenza), patina: nullable(row.patina),
    spessore_mm: nullable(row.spessore_mm) ? numberValue(row.spessore_mm) : null,
    larghezza_min_mm: nullable(row.larghezza_mm) ? numberValue(row.larghezza_mm) : null,
    larghezza_max_mm: nullable(row.larghezza_mm) ? numberValue(row.larghezza_mm) : null,
    lunghezza_min_mm: nullable(row.lunghezza_mm) ? numberValue(row.lunghezza_mm) : null,
    lunghezza_max_mm: nullable(row.lunghezza_mm) ? numberValue(row.lunghezza_mm) : null,
    unita_misura: row.unita_misura, mc_per_unita_milli: nullable(row.mc_per_unita_milli) ? numberValue(row.mc_per_unita_milli) : null,
    prezzo_acquisto_cents: numberValue(row.prezzo_acquisto_cents), prezzo_listino_cents: numberValue(row.prezzo_listino_cents),
    aliquota_iva: numberValue(row.aliquota_iva, 22), costo_medio_cents: numberValue(row.costo_medio_cents),
    giacenza_milli: numberValue(row.giacenza_milli), impegnato_milli: numberValue(row.impegnato_milli),
    scorta_minima_milli: numberValue(row.scorta_minima_milli), ubicazione: nullable(row.ubicazione),
    attivo: booleanValue(row.attivo), note: nullable(row.note),
  }));
  const dbLots = lots.map((row) => ({
    ...trace(row), codice: row.codice, descrizione: row.descrizione, fornitore_id: nullable(row.fornitore_id),
    ordine_acquisto_id: nullable(row.ordine_acquisto_id), provenienza_edificio: nullable(row.provenienza_tipo),
    provenienza_localita: nullable(row.provenienza_localita), provenienza_provincia: null,
    anno_costruzione_stimato: nullable(row.anno_stimato) ? numberValue(row.anno_stimato) : null,
    data_acquisto: row.data_acquisto, essenza: row.essenza, patina: row.patina, qualita: row.qualita,
    costo_acquisto_cents: numberValue(row.costo_acquisto_cents), ubicazione: nullable(row.ubicazione),
    stato: row.stato, note_storiche: nullable(row.note_storiche), note: nullable(row.note), foto: splitValues(row.foto),
  }));
  const dbMovements = movements.map((row) => ({
    ...trace({ ...row, updated_at: row.created_at }), data: row.data, tipo: row.tipo, origine: row.origine,
    articolo_id: nullable(row.articolo_id), lotto_id: nullable(row.lotto_id), quantita_milli: numberValue(row.quantita_milli),
    unita_misura: row.unita_misura, valore_unitario_cents: numberValue(row.valore_unitario_cents),
    valore_totale_cents: numberValue(row.valore_totale_cents), documento_tipo: nullable(row.documento_tipo),
    documento_id: nullable(row.documento_id), documento_numero: nullable(row.documento_numero), causale: row.causale, note: nullable(row.note),
  }));
  const dbQuotes = quotes.map((row) => ({
    ...trace(row), numero: row.numero.replace(/^PRE-/, "PRV-"), data: row.data, cliente_id: row.cliente_id,
    cliente_nome: row.cliente_ragione_sociale, intestazione: headerFor(customerById.get(row.cliente_id)), oggetto: row.oggetto,
    agente_nome: nullable(row.agente), provvigione_cents: Math.round(numberValue(row.imponibile_cents) * numberValue(row.provvigione_percentuale) / 100),
    righe: quoteLines.filter((line) => line.preventivo_id === row.id).map(salesLine),
    sconto_generale_percentuale: numberValue(row.sconto_generale_percentuale), imponibile_cents: numberValue(row.imponibile_cents),
    iva_cents: numberValue(row.iva_cents), totale_cents: numberValue(row.totale_cents), validita_giorni: numberValue(row.validita_giorni, 30),
    data_scadenza: row.data_scadenza, condizioni_pagamento: nullable(row.condizioni_pagamento), tempi_consegna: nullable(row.tempi_consegna),
    note: nullable(row.note), stato: row.ordine_id ? "convertito" : row.stato, ordine_id: nullable(row.ordine_id),
  }));
  const dbOrders = orders.map((row) => ({
    ...trace(row), numero: row.numero, data: row.data, cliente_id: row.cliente_id, cliente_nome: row.cliente_ragione_sociale,
    intestazione: headerFor(customerById.get(row.cliente_id)), preventivo_id: nullable(row.preventivo_id), preventivo_numero: nullable(row.preventivo_numero),
    agente_nome: nullable(row.agente), provvigione_cents: 0,
    righe: orderLines.filter((line) => line.ordine_id === row.id).map((line) => ({ ...salesLine(line), quantita_evasa_milli: numberValue(line.quantita_evasa_milli) })),
    sconto_generale_percentuale: numberValue(row.sconto_generale_percentuale), imponibile_cents: numberValue(row.imponibile_cents), iva_cents: numberValue(row.iva_cents),
    totale_cents: numberValue(row.totale_cents), acconto_cents: numberValue(row.acconto_previsto_cents), data_scadenza_saldo: nullable(row.data_scadenza_saldo),
    incassato_cents: numberValue(row.incassato_cents), residuo_cents: numberValue(row.residuo_cents), data_consegna_prevista: nullable(row.data_consegna_prevista),
    indirizzo_consegna: nullable(row.indirizzo_consegna), condizioni_pagamento: nullable(row.condizioni_pagamento), note: nullable(row.note), stato: row.stato,
  }));
  const dbDdt = ddt.map((row) => {
    const customer = customerById.get(row.cliente_id);
    const [dateTransport, timeTransport] = row.data_ora_trasporto.split("T");
    return {
      ...trace(row), numero: row.numero, data: row.data, data_trasporto: dateTransport || row.data,
      ora_trasporto: timeTransport?.slice(0, 5) || null, cliente_id: row.cliente_id, cliente_nome: row.cliente_ragione_sociale,
      intestazione: headerFor(customer), ordine_id: nullable(row.ordine_id), ordine_numero: nullable(row.ordine_numero),
      agente_nome: null, provvigione_cents: 0, destinazione_indirizzo: nullable(row.indirizzo_destinazione),
      destinazione_cap: null, destinazione_citta: null, destinazione_provincia: null, destinatario: null,
      causale: nullable(row.causale), causale_dichiarata: nullable(row.causale), trasporto_a_cura_di: row.trasporto_a_cura,
      porto: null, vettore: nullable(row.vettore), aspetto_beni: "Colli", colli_totali: numberValue(row.numero_colli),
      peso_totale_kg_milli: numberValue(row.peso_lordo_kg) * 1000, colli_dichiarati: row.numero_colli,
      peso_dichiarato: row.peso_lordo_kg, valorizzato: booleanValue(row.valorizzato), sconto_generale_percentuale: 0,
      righe: ddtLines.filter((line) => line.ddt_id === row.id).map((line) => ({
        id: line.id, tipo: line.tipo || "merce", articolo_id: nullable(line.articolo_id), lotto_id: nullable(line.lotto_id),
        lotto_codice: nullable(line.lotto_codice), codice_articolo: nullable(line.codice_articolo), descrizione: line.descrizione,
        quantita_milli: numberValue(line.quantita_milli), unita_misura: line.unita_misura, prezzo_unitario_cents: numberValue(line.prezzo_unitario_cents),
        sconto_percentuale: numberValue(line.sconto_percentuale), aliquota_iva: numberValue(line.aliquota_iva), imponibile_cents: numberValue(line.imponibile_cents),
        colli: 0, peso_kg_milli: 0, riga_ordine_id: nullable(line.ordine_riga_id), note: nullable(line.note),
      })),
      imponibile_cents: numberValue(row.imponibile_cents), iva_cents: numberValue(row.iva_cents), totale_cents: numberValue(row.totale_cents),
      stato: row.stato, note: nullable(row.note),
    };
  });
  const dbPurchases = purchases.map((row) => ({
    ...trace(row), numero: row.numero.replace(/^OA-/, "ACQ-"), data: row.data, fornitore_id: row.fornitore_id,
    fornitore_nome: row.fornitore_ragione_sociale,
    righe: purchaseLines.filter((line) => line.ordine_acquisto_id === row.id).map((line) => ({
      id: line.id, articolo_id: line.articolo_id, codice_articolo: nullable(line.codice_articolo), descrizione: line.descrizione,
      quantita_milli: numberValue(line.quantita_milli), unita_misura: line.unita_misura, prezzo_unitario_cents: numberValue(line.prezzo_unitario_cents),
      aliquota_iva: numberValue(line.aliquota_iva), imponibile_cents: numberValue(line.imponibile_cents), lotto_id: nullable(line.lotto_id), note: nullable(line.note),
    })),
    spese_trasporto_cents: numberValue(row.costo_trasporto_cents), imponibile_cents: numberValue(row.imponibile_cents),
    iva_cents: numberValue(row.iva_cents), totale_cents: numberValue(row.totale_cents), data_consegna_prevista: nullable(row.data_consegna_prevista),
    data_ricezione: nullable(row.data_ricezione), stato: row.stato, note: nullable(row.note),
  }));
  const dbPayments = payments.map((row) => ({
    ...trace({ ...row, updated_at: row.created_at }), cliente_id: row.cliente_id, cliente_nome: row.cliente_ragione_sociale,
    ordine_id: nullable(row.ordine_id), ordine_numero: nullable(row.ordine_numero), tipo: row.tipo, data: row.data,
    importo_cents: numberValue(row.importo_cents), mezzo: row.mezzo, riferimento: nullable(row.riferimento), note: nullable(row.note),
  }));
  const dbDeadlines = deadlines.map((row) => ({
    ...trace({ ...row, updated_at: row.created_at }), documento_tipo: row.documento_tipo, documento_id: row.documento_id,
    documento_numero: row.documento_numero, verso: row.verso, cliente_id: nullable(row.cliente_id), fornitore_id: nullable(row.fornitore_id),
    controparte_nome: row.controparte, data_scadenza: row.data_scadenza, data_pagamento: nullable(row.data_pagamento),
    importo_cents: numberValue(row.importo_cents), saldato: booleanValue(row.saldato), mezzo: nullable(row.mezzo),
    conto_tesoreria: nullable(row.tesoreria), rata_etichetta: nullable(row.etichetta) || (row.rata_totale ? `${row.rata_numero}/${row.rata_totale}` : null),
    riferimento: nullable(row.riferimento), note: nullable(row.note),
  }));

  return {
    versione: 8, origine: "seed", generato_il: Date.now(),
    sorgente: "WoodRevive Insight · dataset sintetico condiviso",
    db: {
      versione: 8, clienti: dbCustomers, fornitori: dbSuppliers, articoli: dbArticles, lotti: dbLots,
      movimenti: dbMovements, preventivi: [...dbQuotes, ...savedQuotes.map((quote) => quote.managerRecord)],
      ordini: dbOrders, ddt: dbDdt, acquisti: dbPurchases, pagamenti: dbPayments,
      fatture: [], fatture_acquisto: [], scadenze: dbDeadlines, schede_lavorazione: [],
    },
  };
}
