import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const outDir = resolve(root, "datasets/demo");
const checkOnly = process.argv.includes("--check");

const DAY = 86_400_000;
const baseTimestamp = Date.parse("2025-01-02T09:00:00Z");
const createdAt = (offset = 0) => baseTimestamp + offset * DAY;
const isoDate = (offset) => new Date(Date.parse("2025-01-02T00:00:00Z") + offset * DAY).toISOString().slice(0, 10);
const cents = (value) => Math.round(value * 100);
const milli = (value) => Math.round(value * 1000);
const sum = (rows, field) => rows.reduce((total, row) => total + Number(row[field] || 0), 0);
const euro = (value) => String(value).replace(".", ",");

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = Array.isArray(value) ? value.join(";") : String(value);
  return /[",\n;]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function asCsv(columns, rows) {
  return `${columns.join(",")}\n${rows.map((row) => columns.map((key) => csvEscape(row[key])).join(",")).join("\n")}\n`;
}

async function outputCsv(name, columns, rows) {
  const content = asCsv(columns, rows);
  const path = resolve(outDir, name);
  if (checkOnly) {
    const existing = await readFile(path, "utf8");
    if (existing !== content) throw new Error(`${name} non è riproducibile: rigenerare il dataset.`);
  } else {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
  }
}

const customerSeeds = [
  ["C001", "Atelier Arco S.r.l.", "Milano", "MI", "architetto"],
  ["C002", "Cantieri Brenta S.p.A.", "Padova", "PD", "impresa"],
  ["C003", "Dimora Lab S.r.l.", "Firenze", "FI", "showroom"],
  ["C004", "Forma Interni S.r.l.", "Torino", "TO", "rivenditore"],
  ["C005", "Officina Abitare S.r.l.", "Bologna", "BO", "diretto"],
  ["C006", "Studio Cedro Associati", "Roma", "RM", "architetto"],
  ["C007", "Edilnova Restauri S.r.l.", "Verona", "VR", "impresa"],
  ["C008", "Materia Casa S.r.l.", "Genova", "GE", "showroom"],
  ["C009", "Nordic Habitat S.r.l.", "Como", "CO", "rivenditore"],
  ["C010", "Casa Radice S.r.l.", "Treviso", "TV", "online"],
  ["C011", "Progetto Quercia S.r.l.", "Bergamo", "BG", "architetto"],
  ["C012", "Corte Antica Hospitality S.r.l.", "Siena", "SI", "diretto"],
  ["C013", "Linea Restauro S.r.l.", "Vicenza", "VI", "impresa"],
  ["C014", "Spazio Materico S.r.l.", "Parma", "PR", "showroom"],
  ["C015", "Rovere Contract S.r.l.", "Monza", "MB", "rivenditore"],
  ["C016", "Architettura Viva S.r.l.", "Venezia", "VE", "architetto"],
  ["C017", "Borgo Nuovo Resort S.r.l.", "Perugia", "PG", "diretto"],
  ["C018", "Cantiere Blu S.r.l.", "Ravenna", "RA", "impresa"],
  ["C019", "Interni Levante S.r.l.", "La Spezia", "SP", "showroom"],
  ["C020", "Alpine Lodges Italia S.r.l.", "Trento", "TN", "diretto"],
  ["C021", "Studio Nodo S.r.l.", "Udine", "UD", "architetto"],
  ["C022", "Recupero & Design S.r.l.", "Brescia", "BS", "rivenditore"],
  ["C023", "Terra Cruda Contract S.r.l.", "Arezzo", "AR", "impresa"],
  ["C024", "Habitat Circolare S.r.l.", "Pisa", "PI", "online"],
];

const customers = customerSeeds.map(([codice, ragione_sociale, citta, provincia, canale], index) => ({
  id: `cli-${String(index + 1).padStart(3, "0")}`,
  created_at: createdAt(index), updated_at: createdAt(180 + index), id_esterno: `DEMO-${codice}`,
  codice, tipo: "azienda", natura_fiscale: "societa", ragione_sociale,
  referente: ["Giulia", "Marco", "Elena", "Luca", "Sara", "Andrea"][index % 6] + ` Demo ${index + 1}`,
  piva: `IT${String(10000000000 + index).padStart(11, "0")}`, codice_fiscale: "", codice_sdi: `D${String(index + 1).padStart(6, "0")}`,
  pec: `amministrazione${index + 1}@pec.example`, email: `acquisti${index + 1}@example.com`, telefono: `+3900000${String(index + 1).padStart(4, "0")}`,
  indirizzo: `Via Demo ${index + 1}`, cap: String(20100 + index), citta, provincia, nazione: "IT",
  consegna_indirizzo: index % 3 === 0 ? `Cantiere Demo ${index + 1}` : "", consegna_cap: "", consegna_citta: citta, consegna_provincia: provincia,
  canale, sconto_default_percentuale: [0, 3, 5, 8][index % 4], aliquota_iva_default: 22,
  note: index % 7 === 0 ? "Consegna su appuntamento; verificare accesso mezzi pesanti." : "Anagrafica sintetica per test.", attivo: true,
}));

const supplierSeeds = [
  ["F001", "Recuperi Alpini Demo S.r.l.", "Trento", "TN", "recuperante", "abete;larice;cirmolo"],
  ["F002", "Demolizioni Laguna Demo S.r.l.", "Venezia", "VE", "demolitore", "rovere;olmo"],
  ["F003", "Segheria Valverde Demo S.r.l.", "Belluno", "BL", "segheria", "abete;larice"],
  ["F004", "Legni Storici Demo S.r.l.", "Brescia", "BS", "commerciante", "rovere;castagno"],
  ["F005", "Materiali di Corte Demo S.r.l.", "Mantova", "MN", "recuperante", "olmo;noce"],
  ["F006", "Trasporti Bosco Demo S.r.l.", "Verona", "VR", "trasportatore", ""],
  ["F007", "Ferramenta Restauro Demo S.r.l.", "Vicenza", "VI", "ferramenta", ""],
  ["F008", "Recuperi Dolomia Demo S.r.l.", "Bolzano", "BZ", "recuperante", "abete;cirmolo"],
  ["F009", "Antiche Travi Demo S.r.l.", "Aosta", "AO", "commerciante", "larice;rovere"],
  ["F010", "Segheria Circolare Demo S.r.l.", "Cuneo", "CN", "segheria", "castagno;noce"],
];

const suppliers = supplierSeeds.map(([codice, ragione_sociale, citta, provincia, tipo, essenze_tipiche], index) => ({
  id: `for-${String(index + 1).padStart(3, "0")}`, created_at: createdAt(index), updated_at: createdAt(170 + index), id_esterno: `DEMO-${codice}`,
  codice, tipo, natura_fiscale: "societa", ragione_sociale, referente: `Referente Demo ${index + 1}`,
  piva: `IT${String(20000000000 + index).padStart(11, "0")}`, codice_fiscale: "", codice_sdi: `S${String(index + 1).padStart(6, "0")}`,
  pec: `fornitore${index + 1}@pec.example`, email: `ordini${index + 1}@example.com`, telefono: `+3900010${String(index + 1).padStart(4, "0")}`,
  indirizzo: `Strada Demo ${index + 1}`, cap: String(30100 + index), citta, provincia, nazione: "IT",
  essenze_tipiche, note: "Fornitore sintetico; nessun dato identifica un soggetto reale.", attivo: true,
}));

const articleSeeds = [
  ["TV-ABE-01", "Tavola abete prima patina", "tavola", "abete", "prima_patina", 28, "mq", 42, 88],
  ["TV-LAR-01", "Tavola larice seconda patina", "tavola", "larice", "seconda_patina", 32, "mq", 55, 112],
  ["TV-ROV-01", "Tavola rovere prima patina", "tavola", "rovere", "prima_patina", 35, "mq", 92, 182],
  ["TV-CAS-01", "Tavola castagno naturale", "tavola", "castagno", "naturale", 30, "mq", 75, 145],
  ["TV-OLM-01", "Tavola olmo prima patina", "tavola", "olmo", "prima_patina", 38, "mq", 86, 169],
  ["TV-NOC-01", "Tavola noce naturale", "tavola", "noce", "naturale", 32, "mq", 110, 215],
  ["PR-ABE-01", "Perlinato abete grigio", "perlinato", "abete", "grigio", 20, "mq", 34, 72],
  ["PR-LAR-01", "Perlinato larice bruciato sole", "perlinato", "larice", "bruciato_sole", 22, "mq", 48, 96],
  ["PN-ROV-01", "Pannello rovere recuperato", "pannello", "rovere", "seconda_patina", 24, "mq", 78, 158],
  ["PN-CAS-01", "Pannello castagno spazzolato", "pannello", "castagno", "spazzolato", 24, "mq", 64, 132],
  ["LM-OLM-01", "Lamella olmo naturale", "lamella", "olmo", "naturale", 18, "mq", 61, 126],
  ["LM-NOC-01", "Lamella noce prima patina", "lamella", "noce", "prima_patina", 18, "mq", 89, 179],
  ["TR-ABE-01", "Travatura abete recuperata", "travatura", "abete", "seconda_patina", 180, "ml", 28, 63],
  ["TR-LAR-01", "Travatura larice recuperata", "travatura", "larice", "prima_patina", 200, "ml", 39, 82],
  ["TR-ROV-01", "Travatura rovere recuperata", "travatura", "rovere", "naturale", 200, "ml", 72, 145],
  ["PV-CAS-01", "Pavimento castagno antico", "pavimento", "castagno", "prima_patina", 20, "mq", 83, 168],
  ["PV-OLM-01", "Pavimento olmo antico", "pavimento", "olmo", "seconda_patina", 20, "mq", 88, 176],
  ["PV-NOC-01", "Pavimento noce recuperato", "pavimento", "noce", "naturale", 20, "mq", 105, 214],
  ["RV-ABE-01", "Rivestimento abete spazzolato", "rivestimento", "abete", "spazzolato", 18, "mq", 31, 69],
  ["RV-LAR-01", "Rivestimento larice grigio", "rivestimento", "larice", "grigio", 18, "mq", 43, 91],
  ["RV-ROV-01", "Rivestimento rovere bruciato sole", "rivestimento", "rovere", "bruciato_sole", 18, "mq", 70, 149],
  ["MB-CAS-01", "Piano mobile castagno", "mobile", "castagno", "naturale", 40, "pz", 125, 255],
  ["MB-OLM-01", "Piano mobile olmo", "mobile", "olmo", "prima_patina", 40, "pz", 145, 285],
  ["MB-CIR-01", "Piano mobile cirmolo", "mobile", "cirmolo", "naturale", 35, "pz", 98, 205],
];

const articles = articleSeeds.map(([codice, nome, categoria, essenza, patina, spessore_mm, unita_misura, costo, prezzo], index) => ({
  id: `art-${String(index + 1).padStart(3, "0")}`, created_at: createdAt(index), updated_at: createdAt(190 + index), id_esterno: `DEMO-${codice}`,
  codice, nome, descrizione: `${nome}; materiale demo non identificativo.`, natura: "merce", gestione_magazzino: true,
  stadio: "prelavorato", categoria, essenza, patina, spessore_mm, larghezza_mm: categoria === "travatura" ? 160 : 180,
  lunghezza_mm: categoria === "mobile" ? 1600 : 2400, unita_misura, mc_per_unita_milli: categoria === "mobile" ? 45 : 28,
  prezzo_acquisto_cents: cents(costo), prezzo_listino_cents: cents(prezzo), aliquota_iva: 22,
  costo_medio_cents: cents(costo), giacenza_milli: 0, impegnato_milli: 0, scorta_minima_milli: milli(categoria === "mobile" ? 4 : 12),
  ubicazione: `A${String((index % 6) + 1).padStart(2, "0")}-${String((index % 4) + 1).padStart(2, "0")}`,
  attivo: true, note: "Articolo sintetico compatibile con il dominio WoodRevive.",
}));

const purchaseOrders = [];
const purchaseRows = [];
const lots = [];
const movements = [];

for (let index = 0; index < 18; index += 1) {
  const article = articles[index];
  const supplier = suppliers[index % suppliers.length];
  const quantity = milli(article.unita_misura === "pz" ? 14 + index % 4 : 150 + (index % 5) * 22);
  const unitCost = Math.round(article.prezzo_acquisto_cents * (0.95 + (index % 3) * 0.025));
  const imponibile = Math.round(quantity * unitCost / 1000);
  const transport = cents(240 + (index % 4) * 55);
  const taxable = imponibile + transport;
  const vat = Math.round(taxable * 0.22);
  const state = index < 16 ? "ricevuto" : index === 16 ? "confermato" : "bozza";
  const orderId = `oa-${String(index + 1).padStart(3, "0")}`;
  const rowId = `roa-${String(index + 1).padStart(3, "0")}`;
  const lotId = state === "ricevuto" ? `lot-${String(index + 1).padStart(3, "0")}` : "";
  purchaseRows.push({ id: rowId, ordine_acquisto_id: orderId, posizione: 1, tipo: "merce", articolo_id: article.id, codice_articolo: article.codice,
    descrizione: article.nome, quantita_milli: quantity, unita_misura: article.unita_misura, prezzo_unitario_cents: unitCost,
    sconto_percentuale: 0, aliquota_iva: 22, imponibile_cents: imponibile, lotto_id: lotId, lotto_codice: lotId ? `L25-${String(index + 1).padStart(3, "0")}` : "",
    essenza_snapshot: article.essenza, patina_snapshot: article.patina, spessore_mm_snapshot: article.spessore_mm, note: "" });
  purchaseOrders.push({ id: orderId, created_at: createdAt(10 + index), updated_at: createdAt(15 + index), numero: `OA-2025-${String(index + 1).padStart(3, "0")}`,
    data: isoDate(10 + index * 6), fornitore_id: supplier.id, fornitore_ragione_sociale: supplier.ragione_sociale,
    imponibile_cents: imponibile, costo_trasporto_cents: transport, iva_cents: vat, totale_cents: taxable + vat,
    data_consegna_prevista: isoDate(17 + index * 6), data_ricezione: state === "ricevuto" ? isoDate(18 + index * 6) : "", stato: state,
    note: index === 7 ? "Ricezione con controllo umidità rafforzato." : "Ordine demo." });
  if (state === "ricevuto") {
    const receivedDate = isoDate(18 + index * 6);
    lots.push({ id: lotId, created_at: createdAt(18 + index * 6), updated_at: createdAt(190 + index), id_esterno: `DEMO-LOT-${index + 1}`,
      codice: `L25-${String(index + 1).padStart(3, "0")}`, descrizione: `${article.nome} da ${supplier.ragione_sociale}`,
      fornitore_id: supplier.id, ordine_acquisto_id: orderId, provenienza_tipo: index % 3 === 0 ? "fienile" : index % 3 === 1 ? "cascina" : "edificio_civile",
      provenienza_localita: ["Val di Fassa", "Bassa Padana", "Alta Lessinia", "Langhe"][index % 4], provenienza_nazione: "IT",
      anno_stimato: 1890 + (index % 7) * 10, data_acquisto: purchaseOrders.at(-1).data, essenza: article.essenza, patina: article.patina,
      qualita: ["A", "A", "B"][index % 3], costo_acquisto_cents: imponibile + transport, ubicazione: article.ubicazione,
      stato: index === 7 ? "quarantena" : "disponibile", note_storiche: `Provenienza sintetica documentata nel verbale DEMO-${index + 1}.`,
      note: index === 7 ? "In attesa esito controllo umidità." : "Lotto demo ricevuto e fotografato.", foto: "" });
    movements.push({ id: `mov-c-${String(index + 1).padStart(3, "0")}`, created_at: createdAt(18 + index * 6), data: receivedDate,
      tipo: "carico", origine: "acquisto", articolo_id: article.id, lotto_id: lotId, quantita_milli: quantity, unita_misura: article.unita_misura,
      valore_unitario_cents: unitCost, valore_totale_cents: imponibile + transport, documento_tipo: "ordine_acquisto", documento_id: orderId,
      documento_numero: purchaseOrders.at(-1).numero, causale: "Ricezione merce", note: index === 7 ? "Carico in quarantena qualità." : "" });
  }
}

const quoteStates = ["bozza", "inviato", "accettato", "rifiutato", "scaduto"];
const quotes = [];
const quoteRows = [];
for (let index = 0; index < 30; index += 1) {
  const customer = customers[index % customers.length];
  const article = articles[index % 16];
  const quantity = milli(article.unita_misura === "pz" ? 3 + index % 3 : 18 + (index % 5) * 5);
  const discount = [0, 3, 5, 8, 12][index % 5];
  const unitPrice = article.prezzo_listino_cents;
  const imponibile = Math.round(quantity * unitPrice / 1000 * (1 - discount / 100));
  const vat = Math.round(imponibile * 0.22);
  const state = index < 24 ? "accettato" : quoteStates[index % quoteStates.length];
  const id = `pre-${String(index + 1).padStart(3, "0")}`;
  quoteRows.push({ id: `rpre-${String(index + 1).padStart(3, "0")}`, preventivo_id: id, posizione: 1, tipo: "merce", articolo_id: article.id,
    codice_articolo: article.codice, descrizione: article.nome, lotto_id: "", lotto_codice: "", quantita_milli: quantity, unita_misura: article.unita_misura,
    prezzo_unitario_cents: unitPrice, sconto_percentuale: discount, aliquota_iva: 22, imponibile_cents: imponibile,
    essenza_snapshot: article.essenza, patina_snapshot: article.patina, spessore_mm_snapshot: article.spessore_mm, note: index % 6 === 0 ? "Campione da approvare." : "" });
  if (index % 4 === 0) quoteRows.push({ id: `rpre-note-${String(index + 1).padStart(3, "0")}`, preventivo_id: id, posizione: 2,
    tipo: "descrizione", articolo_id: "", codice_articolo: "", descrizione: "Posa e lavorazioni escluse; trasporto da confermare.", lotto_id: "", lotto_codice: "",
    quantita_milli: 0, unita_misura: "corpo", prezzo_unitario_cents: 0, sconto_percentuale: 0, aliquota_iva: 22, imponibile_cents: 0,
    essenza_snapshot: "", patina_snapshot: "", spessore_mm_snapshot: "", note: "" });
  quotes.push({ id, created_at: createdAt(60 + index), updated_at: createdAt(61 + index), numero: `PRE-2025-${String(index + 1).padStart(3, "0")}`,
    data: isoDate(60 + index * 4), cliente_id: customer.id, cliente_ragione_sociale: customer.ragione_sociale, cliente_canale: customer.canale,
    oggetto: `Fornitura ${article.nome} — progetto demo ${index + 1}`, agente: ["Elena", "Luca", "Marta"][index % 3], provvigione_percentuale: [2, 3, 4][index % 3],
    sconto_generale_percentuale: 0, imponibile_cents: imponibile, iva_cents: vat, totale_cents: imponibile + vat,
    validita_giorni: 30, data_scadenza: isoDate(90 + index * 4), condizioni_pagamento: "30% conferma, saldo prima della consegna",
    tempi_consegna: "15–25 giorni dalla conferma", note: index % 6 === 0 ? "Subordinato ad approvazione campione." : "Preventivo demo.", stato: state,
    ordine_id: index < 24 ? `ord-${String(index + 1).padStart(3, "0")}` : "" });
}

const orders = [];
const orderRows = [];
for (let index = 0; index < 24; index += 1) {
  const quote = quotes[index];
  const qrow = quoteRows.find((row) => row.preventivo_id === quote.id && row.tipo === "merce");
  const customer = customers[index % customers.length];
  const total = quote.totale_cents;
  const state = index < 18 ? "evaso" : index < 22 ? "confermato" : "in_lavorazione";
  orders.push({ id: `ord-${String(index + 1).padStart(3, "0")}`, created_at: createdAt(65 + index * 4), updated_at: createdAt(150 + index),
    numero: `ORD-2025-${String(index + 1).padStart(3, "0")}`, data: isoDate(65 + index * 4), cliente_id: customer.id,
    cliente_ragione_sociale: customer.ragione_sociale, cliente_canale: customer.canale, preventivo_id: quote.id, preventivo_numero: quote.numero,
    agente: quote.agente, sconto_generale_percentuale: 0, imponibile_cents: quote.imponibile_cents, iva_cents: quote.iva_cents, totale_cents: total,
    acconto_previsto_cents: Math.round(total * 0.3), data_scadenza_saldo: isoDate(105 + index * 4), incassato_cents: 0, residuo_cents: total,
    data_consegna_prevista: isoDate(92 + index * 4), indirizzo_consegna: customer.consegna_indirizzo || `${customer.indirizzo}, ${customer.citta}`,
    condizioni_pagamento: quote.condizioni_pagamento, note: index === 9 ? "Cliente richiede lotti omogenei per patina." : "Ordine demo.", stato: state });
  orderRows.push({ id: `rord-${String(index + 1).padStart(3, "0")}`, ordine_id: orders.at(-1).id, posizione: 1, tipo: "merce",
    articolo_id: qrow.articolo_id, codice_articolo: qrow.codice_articolo, descrizione: qrow.descrizione, lotto_id: `lot-${String((index % 16) + 1).padStart(3, "0")}`,
    lotto_codice: `L25-${String((index % 16) + 1).padStart(3, "0")}`, quantita_milli: qrow.quantita_milli, quantita_evasa_milli: 0,
    unita_misura: qrow.unita_misura, prezzo_unitario_cents: qrow.prezzo_unitario_cents, sconto_percentuale: qrow.sconto_percentuale,
    aliquota_iva: 22, imponibile_cents: qrow.imponibile_cents, essenza_snapshot: qrow.essenza_snapshot, patina_snapshot: qrow.patina_snapshot,
    spessore_mm_snapshot: qrow.spessore_mm_snapshot, note: "" });
}

const ddts = [];
const ddtRows = [];
for (let index = 0; index < 20; index += 1) {
  const orderIndex = index < 18 ? index : index - 2;
  const order = orders[orderIndex];
  const orow = orderRows[orderIndex];
  const isSplit = index >= 18;
  const quantity = isSplit ? Math.round(orow.quantita_milli * 0.35) : (orderIndex >= 16 ? Math.round(orow.quantita_milli * 0.65) : orow.quantita_milli);
  if (isSplit) {
    const firstDdt = ddtRows.find((row) => row.ordine_id === order.id);
    const remaining = orow.quantita_milli - (firstDdt?.quantita_milli || 0);
    if (remaining <= 0) continue;
  }
  const actualQuantity = isSplit ? orow.quantita_milli - ddtRows.find((row) => row.ordine_id === order.id).quantita_milli : quantity;
  const id = `ddt-${String(index + 1).padStart(3, "0")}`;
  const date = isoDate(96 + orderIndex * 4 + (isSplit ? 8 : 0));
  ddtRows.push({ id: `rddt-${String(index + 1).padStart(3, "0")}`, ddt_id: id, ordine_id: order.id, ordine_riga_id: orow.id, posizione: 1,
    tipo: "merce", articolo_id: orow.articolo_id, codice_articolo: orow.codice_articolo, descrizione: orow.descrizione, lotto_id: orow.lotto_id,
    lotto_codice: orow.lotto_codice, quantita_milli: actualQuantity, unita_misura: orow.unita_misura, prezzo_unitario_cents: orow.prezzo_unitario_cents,
    sconto_percentuale: orow.sconto_percentuale, aliquota_iva: 22, imponibile_cents: Math.round(actualQuantity * orow.prezzo_unitario_cents / 1000 * (1 - orow.sconto_percentuale / 100)),
    essenza_snapshot: orow.essenza_snapshot, patina_snapshot: orow.patina_snapshot, spessore_mm_snapshot: orow.spessore_mm_snapshot, note: "" });
  orow.quantita_evasa_milli += actualQuantity;
  ddts.push({ id, created_at: createdAt(96 + orderIndex * 4), updated_at: createdAt(97 + orderIndex * 4), numero: `DDT-2025-${String(index + 1).padStart(3, "0")}`,
    data: date, cliente_id: order.cliente_id, cliente_ragione_sociale: order.cliente_ragione_sociale, ordine_id: order.id, ordine_numero: order.numero,
    causale: "vendita", trasporto_a_cura: index % 3 === 0 ? "mittente" : "vettore", vettore: index % 3 === 0 ? "WoodRevive demo" : "Trasporti Bosco Demo S.r.l.",
    numero_colli: Math.max(1, Math.round(actualQuantity / 10000)), peso_lordo_kg: Math.max(80, Math.round(actualQuantity / 1000 * 8.5)),
    data_ora_trasporto: `${date}T08:30:00Z`, indirizzo_destinazione: order.indirizzo_consegna, valorizzato: false,
    imponibile_cents: ddtRows.at(-1).imponibile_cents, iva_cents: Math.round(ddtRows.at(-1).imponibile_cents * 0.22),
    totale_cents: Math.round(ddtRows.at(-1).imponibile_cents * 1.22), stato: "emesso", note: isSplit ? "Saldo consegna frazionata." : "DDT demo." });
  const article = articles.find((item) => item.id === orow.articolo_id);
  movements.push({ id: `mov-s-${String(index + 1).padStart(3, "0")}`, created_at: createdAt(96 + orderIndex * 4), data: date,
    tipo: "scarico", origine: "ddt", articolo_id: orow.articolo_id, lotto_id: orow.lotto_id, quantita_milli: actualQuantity,
    unita_misura: orow.unita_misura, valore_unitario_cents: article.prezzo_acquisto_cents,
    valore_totale_cents: Math.round(actualQuantity * article.prezzo_acquisto_cents / 1000), documento_tipo: "ddt", documento_id: id,
    documento_numero: ddts.at(-1).numero, causale: "Consegna cliente", note: isSplit ? "Seconda tranche." : "" });
}

// Due rettifiche rendono verificabili scarto e inventario senza alterare i documenti commerciali.
movements.push({ id: "mov-r-001", created_at: createdAt(210), data: isoDate(210), tipo: "scarico", origine: "scarto", articolo_id: "art-003", lotto_id: "lot-003",
  quantita_milli: milli(2.5), unita_misura: "mq", valore_unitario_cents: articles[2].prezzo_acquisto_cents, valore_totale_cents: Math.round(milli(2.5) * articles[2].prezzo_acquisto_cents / 1000),
  documento_tipo: "rettifica", documento_id: "ret-001", documento_numero: "RET-2025-001", causale: "Scarto per difetto non recuperabile", note: "Caso demo non conformità." });
movements.push({ id: "mov-r-002", created_at: createdAt(215), data: isoDate(215), tipo: "carico", origine: "inventario", articolo_id: "art-006", lotto_id: "lot-006",
  quantita_milli: milli(1), unita_misura: "mq", valore_unitario_cents: articles[5].prezzo_acquisto_cents, valore_totale_cents: articles[5].prezzo_acquisto_cents,
  documento_tipo: "rettifica", documento_id: "ret-002", documento_numero: "RET-2025-002", causale: "Rettifica inventariale positiva", note: "Caso demo conteggio fisico." });

const salesInvoices = [];
const salesInvoiceRows = [];
for (let index = 0; index < 18; index += 1) {
  const order = orders[index];
  const relevantRows = ddtRows.filter((row) => row.ordine_id === order.id);
  const delivered = sum(relevantRows, "quantita_milli");
  const orow = orderRows[index];
  const taxable = Math.round(delivered * orow.prezzo_unitario_cents / 1000 * (1 - orow.sconto_percentuale / 100));
  const vat = Math.round(taxable * 0.22);
  const id = `fv-${String(index + 1).padStart(3, "0")}`;
  salesInvoiceRows.push({ id: `rfv-${String(index + 1).padStart(3, "0")}`, fattura_id: id, posizione: 1, tipo: "merce", articolo_id: orow.articolo_id,
    codice_articolo: orow.codice_articolo, descrizione: orow.descrizione, lotto_id: orow.lotto_id, lotto_codice: orow.lotto_codice,
    quantita_milli: delivered, unita_misura: orow.unita_misura, prezzo_unitario_cents: orow.prezzo_unitario_cents,
    sconto_percentuale: orow.sconto_percentuale, aliquota_iva: 22, imponibile_cents: taxable, essenza_snapshot: orow.essenza_snapshot,
    patina_snapshot: orow.patina_snapshot, spessore_mm_snapshot: orow.spessore_mm_snapshot, note: "" });
  const ddtIds = ddts.filter((doc) => doc.ordine_id === order.id).map((doc) => doc.id);
  salesInvoices.push({ id, created_at: createdAt(105 + index * 4), updated_at: createdAt(106 + index * 4), numero: `FV-2025-${String(index + 1).padStart(3, "0")}`,
    data: isoDate(105 + index * 4), cliente_id: order.cliente_id, cliente_ragione_sociale: order.cliente_ragione_sociale, ordine_id: order.id,
    ordine_numero: order.numero, ddt_ids: ddtIds, imponibile_cents: taxable, iva_cents: vat, totale_cents: taxable + vat,
    data_scadenza: isoDate(135 + index * 4), stato: "emessa", note: index === 14 ? "Pagamento parziale concordato." : "Fattura demo." });
}

const purchaseInvoices = purchaseOrders.filter((order) => order.stato === "ricevuto").map((order, index) => ({
  id: `fa-${String(index + 1).padStart(3, "0")}`, created_at: createdAt(25 + index * 6), updated_at: createdAt(26 + index * 6),
  numero: `FA-DEMO-${String(index + 1).padStart(3, "0")}`, data: isoDate(25 + index * 6), fornitore_id: order.fornitore_id,
  fornitore_ragione_sociale: order.fornitore_ragione_sociale, ordine_acquisto_id: order.id, ordine_acquisto_numero: order.numero,
  imponibile_cents: order.imponibile_cents + order.costo_trasporto_cents, iva_cents: order.iva_cents, totale_cents: order.totale_cents,
  data_scadenza: isoDate(55 + index * 6), stato: "registrata", note: "Fattura acquisto sintetica." }));
const purchaseInvoiceRows = purchaseInvoices.map((invoice, index) => {
  const row = purchaseRows[index];
  return { id: `rfa-${String(index + 1).padStart(3, "0")}`, fattura_acquisto_id: invoice.id, posizione: 1, tipo: "merce", articolo_id: row.articolo_id,
    codice_articolo: row.codice_articolo, descrizione: row.descrizione, lotto_id: row.lotto_id, lotto_codice: row.lotto_codice, quantita_milli: row.quantita_milli,
    unita_misura: row.unita_misura, prezzo_unitario_cents: row.prezzo_unitario_cents, sconto_percentuale: 0, aliquota_iva: 22,
    imponibile_cents: row.imponibile_cents, essenza_snapshot: row.essenza_snapshot, patina_snapshot: row.patina_snapshot,
    spessore_mm_snapshot: row.spessore_mm_snapshot, note: "Trasporto esposto in testata." };
});

const payments = [];
for (let index = 0; index < salesInvoices.length; index += 1) {
  const invoice = salesInvoices[index];
  const order = orders[index];
  const paidRatio = index < 12 ? 1 : index < 15 ? 0.4 : 0;
  if (paidRatio > 0) {
    const deposit = Math.round(invoice.totale_cents * Math.min(0.3, paidRatio));
    payments.push({ id: `pag-${String(payments.length + 1).padStart(3, "0")}`, created_at: createdAt(75 + index * 4), cliente_id: order.cliente_id,
      cliente_ragione_sociale: order.cliente_ragione_sociale, ordine_id: order.id, ordine_numero: order.numero, tipo: "acconto", data: isoDate(75 + index * 4),
      importo_cents: deposit, mezzo: index % 4 === 0 ? "riba" : "bonifico", riferimento: `DEMO-ACC-${index + 1}`, note: "Incasso sintetico." });
    if (paidRatio === 1) payments.push({ id: `pag-${String(payments.length + 1).padStart(3, "0")}`, created_at: createdAt(138 + index * 4), cliente_id: order.cliente_id,
      cliente_ragione_sociale: order.cliente_ragione_sociale, ordine_id: order.id, ordine_numero: order.numero, tipo: "saldo", data: isoDate(138 + index * 4),
      importo_cents: invoice.totale_cents - deposit, mezzo: "bonifico", riferimento: `DEMO-SAL-${index + 1}`, note: "Saldo sintetico." });
    else payments.push({ id: `pag-${String(payments.length + 1).padStart(3, "0")}`, created_at: createdAt(142 + index * 4), cliente_id: order.cliente_id,
      cliente_ragione_sociale: order.cliente_ragione_sociale, ordine_id: order.id, ordine_numero: order.numero, tipo: "acconto", data: isoDate(142 + index * 4),
      importo_cents: Math.round(invoice.totale_cents * paidRatio) - deposit, mezzo: "bonifico", riferimento: `DEMO-PAR-${index + 1}`, note: "Pagamento parziale sintetico." });
  }
}

for (const order of orders) {
  order.incassato_cents = sum(payments.filter((payment) => payment.ordine_id === order.id), "importo_cents");
  order.residuo_cents = Math.max(0, order.totale_cents - order.incassato_cents);
}

const deadlines = [
  ...salesInvoices.map((invoice, index) => {
    const received = sum(payments.filter((payment) => payment.ordine_id === invoice.ordine_id), "importo_cents");
    return { id: `sca-v-${String(index + 1).padStart(3, "0")}`, created_at: createdAt(106 + index * 4), documento_tipo: "fattura", documento_id: invoice.id,
      documento_numero: invoice.numero, verso: "incasso", cliente_id: invoice.cliente_id, fornitore_id: "", controparte: invoice.cliente_ragione_sociale,
      data_scadenza: invoice.data_scadenza, data_pagamento: received >= invoice.totale_cents ? isoDate(138 + index * 4) : "", importo_cents: invoice.totale_cents,
      saldato: received >= invoice.totale_cents, mezzo: received ? "bonifico" : "", tesoreria: "Banca demo", rata_numero: 1, rata_totale: 1,
      etichetta: received >= invoice.totale_cents ? "incassata" : received ? "parziale" : "aperta", riferimento: invoice.ordine_numero, note: "Scadenza cliente demo." };
  }),
  ...purchaseInvoices.map((invoice, index) => ({ id: `sca-a-${String(index + 1).padStart(3, "0")}`, created_at: createdAt(26 + index * 6),
    documento_tipo: "fattura_acquisto", documento_id: invoice.id, documento_numero: invoice.numero, verso: "pagamento", cliente_id: "", fornitore_id: invoice.fornitore_id,
    controparte: invoice.fornitore_ragione_sociale, data_scadenza: invoice.data_scadenza, data_pagamento: index < 13 ? isoDate(54 + index * 6) : "",
    importo_cents: invoice.totale_cents, saldato: index < 13, mezzo: index < 13 ? "bonifico" : "", tesoreria: "Banca demo", rata_numero: 1,
    rata_totale: 1, etichetta: index < 13 ? "pagata" : "aperta", riferimento: invoice.ordine_acquisto_numero,
    note: index === 14 ? "Sospesa in attesa nota su difformità." : "Scadenza fornitore demo." })),
];

const signedQuantity = (movement) => movement.tipo === "scarico" ? -movement.quantita_milli : movement.quantita_milli;
for (const article of articles) {
  const related = movements.filter((movement) => movement.articolo_id === article.id);
  article.giacenza_milli = related.reduce((total, movement) => total + signedQuantity(movement), 0);
  article.impegnato_milli = sum(orderRows.filter((row) => row.articolo_id === article.id), "quantita_milli")
    - sum(orderRows.filter((row) => row.articolo_id === article.id), "quantita_evasa_milli");
}

const transactionRows = [];
const pushTransactions = (rows, tipo, dateField, amountField, counterpartyField, statusField, source) => rows.forEach((row) => transactionRows.push({
  id: `trx-${String(transactionRows.length + 1).padStart(4, "0")}`, data: row[dateField], tipo, direzione: ["ordine_acquisto", "fattura_acquisto", "scadenza_pagamento"].includes(tipo) ? "uscita" :
    ["preventivo", "ordine_vendita", "ddt", "fattura_vendita", "incasso"].includes(tipo) ? "entrata" : "neutra",
  documento_id: row.id, documento_numero: row.numero || row.documento_numero || row.riferimento || row.id,
  controparte: row[counterpartyField] || "", importo_cents: Number(row[amountField] || 0), stato: row[statusField] ?? "registrato", fonte_csv: source,
  descrizione: row.note || `${tipo} sintetico`,
}));
pushTransactions(purchaseOrders, "ordine_acquisto", "data", "totale_cents", "fornitore_ragione_sociale", "stato", "ordini_acquisto.csv");
pushTransactions(quotes, "preventivo", "data", "totale_cents", "cliente_ragione_sociale", "stato", "preventivi.csv");
pushTransactions(orders, "ordine_vendita", "data", "totale_cents", "cliente_ragione_sociale", "stato", "ordini.csv");
pushTransactions(ddts, "ddt", "data", "totale_cents", "cliente_ragione_sociale", "stato", "ddt.csv");
pushTransactions(salesInvoices, "fattura_vendita", "data", "totale_cents", "cliente_ragione_sociale", "stato", "fatture_vendita.csv");
pushTransactions(purchaseInvoices, "fattura_acquisto", "data", "totale_cents", "fornitore_ragione_sociale", "stato", "fatture_acquisto.csv");
pushTransactions(payments, "incasso", "data", "importo_cents", "cliente_ragione_sociale", "tipo", "pagamenti.csv");
deadlines.forEach((row) => transactionRows.push({ id: `trx-${String(transactionRows.length + 1).padStart(4, "0")}`, data: row.data_scadenza,
  tipo: row.verso === "incasso" ? "scadenza_incasso" : "scadenza_pagamento", direzione: row.verso === "incasso" ? "entrata" : "uscita",
  documento_id: row.documento_id, documento_numero: row.documento_numero, controparte: row.controparte, importo_cents: row.importo_cents,
  stato: row.etichetta, fonte_csv: "scadenze.csv", descrizione: row.note }));
transactionRows.sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));

const salesView = salesInvoiceRows.map((row) => {
  const invoice = salesInvoices.find((item) => item.id === row.fattura_id);
  const order = orders.find((item) => item.id === invoice.ordine_id);
  const article = articles.find((item) => item.id === row.articolo_id);
  return { data: invoice.data, ordine_id: order.id, cliente_id: order.cliente_id, canale: order.cliente_canale, articolo_id: article.id,
    categoria: article.categoria, essenza: article.essenza, quantita_milli: row.quantita_milli, unita_misura: row.unita_misura,
    ricavo_cents: row.imponibile_cents, costo_cents: Math.round(row.quantita_milli * article.costo_medio_cents / 1000) };
});

const inventoryView = lots.map((lot) => {
  const rel = movements.filter((movement) => movement.lotto_id === lot.id);
  const article = articles.find((item) => item.id === rel[0].articolo_id);
  return { articolo_id: article.id, lotto_id: lot.id, categoria: article.categoria, essenza: article.essenza, patina: article.patina,
    data_carico: rel.find((movement) => movement.tipo === "carico").data,
    giacenza_milli: rel.reduce((total, movement) => total + signedQuantity(movement), 0), unita_misura: article.unita_misura,
    costo_medio_cents: article.costo_medio_cents, ubicazione: article.ubicazione, stato_lotto: lot.stato };
});

const cashView = salesInvoices.map((invoice) => {
  const order = orders.find((item) => item.id === invoice.ordine_id);
  const received = sum(payments.filter((payment) => payment.ordine_id === order.id), "importo_cents");
  return { ordine_id: order.id, cliente_id: order.cliente_id, cliente: order.cliente_ragione_sociale, data_scadenza: invoice.data_scadenza,
    importo_cents: invoice.totale_cents, incassato_cents: received, residuo_cents: Math.max(0, invoice.totale_cents - received),
    stato: received >= invoice.totale_cents ? "incassato" : received > 0 ? "parziale" : "aperto" };
});

const schemas = [
  ["clienti.csv", customers], ["fornitori.csv", suppliers], ["articoli.csv", articles], ["ordini_acquisto.csv", purchaseOrders],
  ["righe_ordini_acquisto.csv", purchaseRows], ["lotti.csv", lots], ["preventivi.csv", quotes], ["righe_preventivi.csv", quoteRows],
  ["ordini.csv", orders], ["righe_ordini.csv", orderRows], ["ddt.csv", ddts], ["righe_ddt.csv", ddtRows],
  ["movimenti_magazzino.csv", movements], ["fatture_vendita.csv", salesInvoices], ["righe_fatture_vendita.csv", salesInvoiceRows],
  ["fatture_acquisto.csv", purchaseInvoices], ["righe_fatture_acquisto.csv", purchaseInvoiceRows], ["pagamenti.csv", payments],
  ["scadenze.csv", deadlines], ["transazioni.csv", transactionRows], ["vendite.csv", salesView], ["magazzino.csv", inventoryView], ["incassi.csv", cashView],
];

const ids = new Map(schemas.map(([name, rows]) => [name, new Set(rows.map((row) => row.id).filter(Boolean))]));
const checks = [
  [customers.length >= 20, `clienti aziendali: ${customers.length}`],
  [transactionRows.length >= 60, `eventi transazionali: ${transactionRows.length}`],
  [purchaseRows.every((row) => ids.get("articoli.csv").has(row.articolo_id)), "righe acquisto → articoli"],
  [orderRows.every((row) => ids.get("ordini.csv").has(row.ordine_id) && ids.get("articoli.csv").has(row.articolo_id)), "righe ordine → ordini/articoli"],
  [ddtRows.every((row) => ids.get("ddt.csv").has(row.ddt_id) && ids.get("ordini.csv").has(row.ordine_id)), "righe DDT → DDT/ordini"],
  [movements.every((row) => ids.get("articoli.csv").has(row.articolo_id) && ids.get("lotti.csv").has(row.lotto_id)), "movimenti → articoli/lotti"],
  [articles.every((row) => row.giacenza_milli >= 0), "giacenze articolo non negative"],
  [inventoryView.every((row) => row.giacenza_milli >= 0), "giacenze lotto non negative"],
  [orders.every((row) => row.residuo_cents === Math.max(0, row.totale_cents - row.incassato_cents)), "residui ordine coerenti"],
  [salesInvoices.every((row) => row.totale_cents === row.imponibile_cents + row.iva_cents), "totali fatture vendita coerenti"],
  [purchaseOrders.every((row) => row.totale_cents === row.imponibile_cents + row.costo_trasporto_cents + row.iva_cents), "totali acquisti coerenti"],
];
const failures = checks.filter(([ok]) => !ok);
if (failures.length) throw new Error(`Controlli falliti:\n${failures.map(([, label]) => `- ${label}`).join("\n")}`);

for (const [name, rows] of schemas) await outputCsv(name, Object.keys(rows[0]), rows);

const manifest = {
  version: 2,
  generated_at: "2026-08-18T00:00:00Z",
  synthetic: true,
  privacy_note: "Tutti i nomi, recapiti, identificativi fiscali, documenti e importi sono sintetici e destinati esclusivamente a test.",
  conventions: { monetary_values: "integer cents", quantities: "integer thousandths", dates: "ISO 8601 YYYY-MM-DD", arrays_in_csv: "semicolon-separated" },
  counts: Object.fromEntries(schemas.map(([name, rows]) => [name, rows.length])),
  checks: checks.map(([ok, label]) => ({ status: ok ? "PASS" : "FAIL", label })),
  coverage: {
    aziende_clienti: customers.length,
    aziende_fornitrici: suppliers.length,
    eventi_transazionali: transactionRows.length,
    periodo: `${transactionRows[0].data}/${transactionRows.at(-1).data}`,
    documenti: ["ordini acquisto", "preventivi", "ordini vendita", "DDT", "fatture vendita", "fatture acquisto", "pagamenti", "scadenze"],
  },
};
const manifestPath = resolve(outDir, "manifest.json");
const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
if (checkOnly) {
  if (await readFile(manifestPath, "utf8") !== manifestContent) throw new Error("manifest.json non è riproducibile.");
} else await writeFile(manifestPath, manifestContent, "utf8");

console.log(`${checkOnly ? "Verificati" : "Generati"} ${schemas.length} CSV, ${customers.length} clienti, ${suppliers.length} fornitori e ${transactionRows.length} eventi.`);
console.log(`Totale vendite imponibile demo: € ${euro((sum(salesView, "ricavo_cents") / 100).toFixed(2))}.`);
