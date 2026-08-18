/**
 * Identità e dati aziendali. Unico punto da toccare per rifare il brand del
 * pannello: nessun altro file conosce il nome, l'indirizzo o la partita IVA.
 *
 * I dati sono quelli pubblici di woodrevive.it.
 */

export const brandConfig = {
  nome: 'Wood Revive',
  nomeCompleto: 'WOOD REVIVE srl',
  payoff: 'Ridiamo vita al legno antico',
  sottotitoloPannello: 'Gestionale interno',

  // Sede e dati fiscali — finiscono nella testata dei PDF
  indirizzo: 'Via Maestra d’Italia, 19',
  cap: '31016',
  citta: 'Cordignano',
  provincia: 'TV',
  nazione: 'Italia',
  piva: '05149090267',

  telefono: '+39 351 3718645',
  email: 'info@woodrevive.it',
  sito: 'woodrevive.it',

  /** Da chiedere al cliente: oggi il PDF stampa un segnaposto. */
  iban: null as string | null,

  logo: {
    positivo: '/brand/logo.png', // su fondo chiaro
    negativo: '/brand/logo-neg.png', // su fondo scuro — è quello della sidebar
    negativo2x: '/brand/logo-neg@2x.png',
    quadrato: '/brand/logo-square.png', // per i PDF
  },

  /** Testi predefiniti proposti sui nuovi documenti. */
  documenti: {
    condizioniPagamento: 'Acconto 40% alla conferma, saldo alla consegna.',
    tempiConsegna: 'Da concordare in base alla disponibilità del materiale.',
    validitaGiorniPreventivo: 30,
    aspettoBeniDefault: 'Bancali',
    noteFinaliPreventivo:
      'I prezzi si intendono per materiale reso franco nostro magazzino. Il legno antico presenta ' +
      'per sua natura variazioni di colore, nodi, fessurazioni e fori di tarlo: sono caratteristiche ' +
      'del materiale e non difetti.',
  },
} as const

export const indirizzoCompleto = [
  brandConfig.indirizzo,
  `${brandConfig.cap} ${brandConfig.citta} (${brandConfig.provincia})`,
].join(' — ')
