import { ChevronDown, ChevronUp } from 'lucide-react'
import { useId, useMemo, useState } from 'react'

import { api } from '../api'
import {
  MEZZO_PAGAMENTO_LABEL,
  TIPO_PAGAMENTO_LABEL,
  type ClienteConTotali,
  type ID,
  type MezzoPagamento,
  type Pagamento,
  type PagamentoInput,
  type TipoPagamento,
} from '../domain'
import { centsAInput, euroACents, formatEuro, oggiISO } from '../lib/format'
import { messaggioDi, useFetch } from '../useFetch'
import { AreaTesto, AvvisoErrore, Campo, GrigliaCampi, Scelta, Testo } from './Campi'
import { opzioniDa } from './Filtri'
import { SelettoreCliente } from './SelettoreAnagrafica'
import { Modale } from './Ui'

/**
 * Registrazione (o modifica) di un incasso, in una modale sola per tutto il
 * pannello.
 *
 * Sta in `components/` perché i posti da cui si incassa sono quattro, non uno:
 *   - IncassiPage — il bottone in cima, per la caparra senza ordine;
 *   - IncassiPage — il bottone «Incassa» su ogni riga dello scadenzario, che è
 *     il caso vero: la mattina si guarda chi deve pagare e si registra lì,
 *     senza uscire dalla pagina;
 *   - OrdineDettaglioPage — dalla scheda dell'ordine;
 *   - ClienteDettaglioPage — dalla scheda del cliente.
 *
 * Le tre cose che lo rendono un'azione da due click invece che da sei:
 *   1. `importoInizialeCents` — il residuo è già scritto nel campo. Prima era
 *      stampato nel testo di aiuto e andava ricopiato a mano dallo stesso
 *      schermo che lo mostrava.
 *   2. Con `bloccaCliente` NON chiede l'anagrafica: niente «Carico i clienti…»
 *      al posto del form quando il cliente non è nemmeno una scelta.
 *   3. Il tipo si deduce dall'importo: copre il residuo → saldo, lo si abbassa
 *      → acconto. Resta cambiabile a mano, e appena lo si tocca non si muove più.
 *
 * Sotto `md:` è un foglio che sale dal basso: si compila con il pollice.
 */

interface StatoForm {
  cliente: ClienteConTotali | null
  cliente_id: ID | ''
  ordine_id: ID | ''
  tipo: TipoPagamento
  data: string
  /** Testo dell'input: si converte in centesimi solo al salvataggio. */
  importo: string
  mezzo: MezzoPagamento
  riferimento: string
  note: string
}

export default function FormIncasso({
  pagamento = null,
  clienteIniziale,
  clienteNome,
  ordineIniziale,
  ordineNumero,
  importoInizialeCents,
  residuoCents,
  tipoIniziale,
  bloccaCliente = false,
  compatto,
  titolo,
  onChiudi,
  onSalvato,
}: {
  /** `null` per un nuovo incasso, valorizzato per la modifica. */
  pagamento?: Pagamento | null
  clienteIniziale?: ID
  /** Nome del cliente già noto: evita di richiederlo solo per stamparlo. */
  clienteNome?: string
  ordineIniziale?: ID
  ordineNumero?: string
  /** Precompila l'importo. Dallo scadenzario: `voce.residuo_cents`. */
  importoInizialeCents?: number
  /** Residuo dell'ordine, per dedurre saldo/acconto e scriverlo nell'aiuto. */
  residuoCents?: number
  tipoIniziale?: TipoPagamento
  /** Aperta da un ordine o da una riga di scadenzario: cliente e ordine sono un dato. */
  bloccaCliente?: boolean
  /** Solo importo, data, mezzo e riferimento; il resto sotto «Altri campi». Default: come `bloccaCliente`. */
  compatto?: boolean
  titolo?: string
  onChiudi: () => void
  onSalvato: (pagamento: Pagamento) => void
}) {
  const idForm = useId()
  const compatta = compatto ?? bloccaCliente

  const [form, setForm] = useState<StatoForm>(() =>
    pagamento
      ? {
          cliente: null,
          cliente_id: pagamento.cliente_id,
          ordine_id: pagamento.ordine_id ?? '',
          tipo: pagamento.tipo,
          data: pagamento.data,
          // Il segno lo decide il tipo: chi digita scrive sempre un numero positivo.
          importo: centsAInput(Math.abs(pagamento.importo_cents)),
          mezzo: pagamento.mezzo,
          riferimento: pagamento.riferimento ?? '',
          note: pagamento.note ?? '',
        }
      : {
          cliente: null,
          cliente_id: clienteIniziale ?? '',
          ordine_id: ordineIniziale ?? '',
          tipo: tipoIniziale ?? (ordineIniziale ? 'saldo' : 'acconto'),
          data: oggiISO(),
          importo: importoInizialeCents != null ? centsAInput(importoInizialeCents) : '',
          mezzo: 'bonifico',
          riferimento: '',
          note: '',
        },
  )
  const [tipoToccato, setTipoToccato] = useState(Boolean(tipoIniziale) || Boolean(pagamento))
  const [altriCampi, setAltriCampi] = useState(false)
  const [avviso, setAvviso] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)

  const imposta = (patch: Partial<StatoForm>) => setForm((f) => ({ ...f, ...patch }))

  // Il nome del cliente bloccato serve solo per stamparlo: se il chiamante ce
  // l'ha già, non si chiede niente a nessuno.
  const clienteBloccato = useFetch(
    () =>
      bloccaCliente && form.cliente_id && !clienteNome
        ? api.cliente(form.cliente_id)
        : Promise.resolve(null),
    [bloccaCliente, form.cliente_id, clienteNome],
  )
  const nomeCliente =
    clienteNome ?? form.cliente?.ragione_sociale ?? clienteBloccato.dati?.ragione_sociale ?? '—'

  // Gli ordini si chiedono per cliente, e solo quando il cliente è una scelta:
  // con `bloccaCliente` l'ordine è già dato e la lista non serve.
  const { dati: ordini } = useFetch(
    () =>
      !bloccaCliente && form.cliente_id
        ? api.listaOrdini({ cliente_id: form.cliente_id })
        : Promise.resolve([]),
    [bloccaCliente, form.cliente_id],
  )

  const ordineScelto = useMemo(
    () => (ordini ?? []).find((o) => o.id === form.ordine_id),
    [ordini, form.ordine_id],
  )
  const residuoDiRiferimento = residuoCents ?? ordineScelto?.residuo_cents ?? null

  /**
   * Chi paga tutto sta saldando, chi paga una parte sta dando un acconto.
   * Vale finché l'operatore non sceglie a mano: da lì in poi comanda lui.
   */
  const cambiaImporto = (testo: string) => {
    const patch: Partial<StatoForm> = { importo: testo }
    if (!tipoToccato && form.tipo !== 'nota_credito' && residuoDiRiferimento != null) {
      const cents = Math.abs(euroACents(testo))
      if (cents > 0) patch.tipo = cents >= residuoDiRiferimento ? 'saldo' : 'acconto'
    }
    imposta(patch)
  }

  const salva = async () => {
    if (!form.cliente_id) {
      setAvviso('Scegli il cliente che ha pagato.')
      return
    }
    const importo = Math.abs(euroACents(form.importo))
    if (!importo) {
      setAvviso('L’importo non può essere zero.')
      return
    }
    setInCorso(true)
    setAvviso(null)
    const input: PagamentoInput = {
      cliente_id: form.cliente_id,
      ordine_id: form.ordine_id || null,
      tipo: form.tipo,
      data: form.data,
      // La nota di credito è uno storno: entra in negativo, così la somma dei
      // pagamenti resta sempre «quanto è stato regolato», senza casi speciali.
      importo_cents: form.tipo === 'nota_credito' ? -importo : importo,
      mezzo: form.mezzo,
      riferimento: form.riferimento.trim() || null,
      note: form.note.trim() || null,
    }
    try {
      const salvato = pagamento
        ? await api.aggiornaPagamento(pagamento.id, input)
        : await api.creaPagamento(input)
      onSalvato(salvato)
    } catch (e) {
      setAvviso(messaggioDi(e))
      setInCorso(false)
    }
  }

  const campoImporto = (
    <Campo
      etichetta="Importo"
      obbligatorio
      aiuto={
        form.tipo === 'nota_credito'
          ? 'Scrivilo positivo: una nota di credito si registra in negativo da sola.'
          : residuoDiRiferimento != null
            ? `Residuo prima di questo incasso: ${formatEuro(residuoDiRiferimento)}`
            : 'In euro, IVA compresa: è quanto è entrato in banca o in cassa.'
      }
    >
      <Testo
        valore={form.importo}
        onCambia={cambiaImporto}
        inputMode="decimal"
        placeholder="1.500,00"
        className="tabular text-right text-base"
        // Con cliente e ordine già dati l'importo è il primo campo utile, e la
        // Modale mette lì il fuoco da sola: digitare sovrascrive il residuo
        // proposto invece di accodarcisi.
        onFocus={(e) => e.currentTarget.select()}
      />
    </Campo>
  )

  const campoData = (
    <Campo etichetta="Data" obbligatorio>
      <Testo valore={form.data} onCambia={(v) => imposta({ data: v })} type="date" />
    </Campo>
  )

  const campoMezzo = (
    <Campo etichetta="Mezzo" obbligatorio>
      <Scelta<MezzoPagamento>
        valore={form.mezzo}
        onCambia={(v) => imposta({ mezzo: v })}
        opzioni={opzioniDa(MEZZO_PAGAMENTO_LABEL)}
      />
    </Campo>
  )

  const campoRiferimento = (
    <Campo etichetta="Riferimento" aiuto="CRO del bonifico, numero dell’assegno.">
      <Testo
        valore={form.riferimento}
        onCambia={(v) => imposta({ riferimento: v })}
        placeholder="CRO 20260729-0011"
      />
    </Campo>
  )

  const campoTipo = (
    <Campo
      etichetta="Tipo"
      obbligatorio
      aiuto={tipoToccato ? undefined : 'Dedotto dall’importo: cambialo e resta come lo metti.'}
    >
      <Scelta<TipoPagamento>
        valore={form.tipo}
        onCambia={(v) => {
          setTipoToccato(true)
          imposta({ tipo: v })
        }}
        opzioni={opzioniDa(TIPO_PAGAMENTO_LABEL)}
      />
    </Campo>
  )

  const campoNote = (
    <Campo etichetta="Note" className="md:col-span-2">
      <AreaTesto valore={form.note} onCambia={(v) => imposta({ note: v })} righe={2} />
    </Campo>
  )

  return (
    <Modale
      titolo={titolo ?? (pagamento ? 'Modifica incasso' : 'Registra incasso')}
      sottotitolo={
        pagamento
          ? 'Il residuo dell’ordine si ricalcola da solo.'
          : bloccaCliente
            ? `${nomeCliente}${ordineNumero ? ` · ${ordineNumero}` : ''}`
            : 'Un acconto senza ordine è una caparra: si collega più avanti.'
      }
      onChiudi={onChiudi}
      larghezza={compatta ? 'max-w-lg' : 'max-w-2xl'}
      variante="foglio"
      piede={
        <>
          <button type="button" className="btn-secondary" onClick={onChiudi} disabled={inCorso}>
            Annulla
          </button>
          <button type="submit" form={idForm} className="btn-primary" disabled={inCorso}>
            {inCorso ? 'Salvataggio…' : pagamento ? 'Salva incasso' : 'Conferma incasso'}
          </button>
        </>
      }
    >
      {/* Un `<form>` vero: Invio in un campo conferma, come ci si aspetta. */}
      <form
        id={idForm}
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void salva()
        }}
      >
        <AvvisoErrore messaggio={avviso} />

        {compatta ? (
          <>
            <GrigliaCampi colonne={2}>
              {campoImporto}
              {campoData}
              {campoMezzo}
              {campoRiferimento}
            </GrigliaCampi>

            <button
              type="button"
              className="btn-ghost mt-3 px-0"
              onClick={() => setAltriCampi((v) => !v)}
              aria-expanded={altriCampi}
            >
              {altriCampi ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              Altri campi
            </button>

            {altriCampi && (
              <div className="mt-2 border-t border-line pt-4">
                <GrigliaCampi colonne={2}>
                  <Campo etichetta="Cliente">
                    <p className="text-sm text-ink">{nomeCliente}</p>
                  </Campo>
                  <Campo etichetta="Ordine">
                    <p className="text-sm text-ink">{ordineNumero ?? 'Nessun ordine collegato'}</p>
                  </Campo>
                  {campoTipo}
                  {campoNote}
                </GrigliaCampi>
              </div>
            )}
          </>
        ) : (
          <GrigliaCampi colonne={2}>
            <Campo etichetta="Cliente" obbligatorio>
              {bloccaCliente ? (
                <p className="text-sm text-ink">{nomeCliente}</p>
              ) : (
                <SelettoreCliente
                  valore={form.cliente}
                  autoFocus
                  onScegli={(c) =>
                    imposta({
                      cliente: c,
                      cliente_id: c?.id ?? '',
                      // Un ordine di un altro cliente non regge più.
                      ordine_id: '',
                    })
                  }
                />
              )}
            </Campo>

            <Campo
              etichetta="Ordine"
              aiuto={
                ordineScelto
                  ? `Residuo prima di questo incasso: ${formatEuro(ordineScelto.residuo_cents)}`
                  : 'Facoltativo: senza ordine resta una caparra generica.'
              }
            >
              {bloccaCliente ? (
                <p className="text-sm text-ink">{ordineNumero ?? 'Nessun ordine collegato'}</p>
              ) : (
                <Scelta
                  valore={form.ordine_id}
                  onCambia={(v) => imposta({ ordine_id: v })}
                  vuoto="Nessun ordine"
                  disabled={!form.cliente_id}
                  opzioni={(ordini ?? [])
                    .filter((o) => o.stato !== 'annullato')
                    .map((o) => ({
                      valore: o.id,
                      etichetta: `${o.numero} — ${formatEuro(o.totale_cents)} · residuo ${formatEuro(o.residuo_cents)}`,
                    }))}
                />
              )}
            </Campo>

            {campoTipo}
            {campoData}
            {campoImporto}
            {campoMezzo}
            {campoRiferimento}
            {campoNote}
          </GrigliaCampi>
        )}
      </form>
    </Modale>
  )
}
