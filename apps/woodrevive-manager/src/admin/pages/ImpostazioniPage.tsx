import { Database, Download, FileText, RotateCcw, Upload } from 'lucide-react'
import { useRef, useState } from 'react'

import { MODALITA_DATI, api } from '../api'
import { brandConfig, indirizzoCompleto } from '../brand.config'
import { AvvisoErrore } from '../components/Campi'
import IntestazionePagina from '../components/IntestazionePagina'
import { Card, Conferma, Dato } from '../components/Ui'
import { conteggi } from '../mock/busta'
import { SEED_VERSION } from '../mock/db'
import { formatData } from '../lib/format'
import { messaggioDi, useFetch } from '../useFetch'

/** Allineata a `version` in package.json. */
const VERSIONE_PANNELLO = '0.1.0'

const DOCUMENTI = [
  { file: 'docs/architettura.md', testo: 'Com’è fatto il pannello e perché il layer api esiste.' },
  { file: 'docs/modello-dati.md', testo: 'Le entità, i campi e le regole: è la specifica del backend futuro.' },
  { file: 'docs/dominio-legno.md', testo: 'Il mestiere: essenze, patine, provenienza e come si compra e si rivende.' },
  { file: 'docs/design-system.md', testo: 'Palette, tipografia e componenti base.' },
  { file: 'docs/dati-mock.md', testo: 'Cosa contiene il seed dimostrativo.' },
  {
    file: 'docs/COMPATIBILITA-MANAGER.md',
    testo: 'Come agente e copia Manager condividono lo stesso archivio sintetico.',
  },
]

/**
 * Impostazioni: oggi è quasi tutto in sola lettura. I dati aziendali vivono nel
 * codice (`brand.config.ts`) perché cambiano una volta ogni cinque anni, e una
 * form che li modifichi avrebbe bisogno di un posto dove salvarli — cioè del
 * backend che ancora non c'è.
 */
export default function ImpostazioniPage() {
  const [errore, setErrore] = useState<string | null>(null)
  const [esito, setEsito] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)
  const [confermaAperta, setConfermaAperta] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const { dati: stato, ricarica } = useFetch(() => api.statoDati(), [])
  const { dati: esportato } = useFetch(() => api.esporta(), [stato])
  const righe = esportato ? conteggi(esportato as Parameters<typeof conteggi>[0]) : []
  const daImport = stato?.origine === 'import'

  async function carica(file: File) {
    setInCorso(true)
    setErrore(null)
    setEsito(null)
    try {
      const grezzo = JSON.parse(await file.text())
      const nuovo = await api.importa(grezzo)
      setEsito(
        `Caricato l’archivio demo${nuovo.sorgente ? ` da ${nuovo.sorgente}` : ''}. ` +
          'Ricarica la pagina per vederli in tutto il pannello.',
      )
      ricarica()
    } catch (e) {
      setErrore(messaggioDi(e))
    } finally {
      setInCorso(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function esporta() {
    setInCorso(true)
    setErrore(null)
    try {
      const dati = await api.esporta()
      const blob = new Blob([JSON.stringify(dati, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'woodrevive-dati.json'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErrore(messaggioDi(e))
    } finally {
      setInCorso(false)
    }
  }

  async function ripristina() {
    setInCorso(true)
    setErrore(null)
    try {
      await api.ripristina()
      window.location.reload()
    } catch (e) {
      setErrore(messaggioDi(e))
      setInCorso(false)
      setConfermaAperta(false)
    }
  }

  return (
    <>
      <IntestazionePagina
        titolo="Impostazioni"
        sottotitolo="Anagrafica dell’azienda, origine dei dati caricati e informazioni sul pannello."
      />

      <AvvisoErrore messaggio={errore} />

      {esito && (
        <div className="mb-4 rounded-lg border border-line bg-surface-alt px-4 py-3 text-sm text-ink">
          {esito}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card titolo="Anagrafica dell’azienda">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Dato etichetta="Ragione sociale">{brandConfig.nomeCompleto}</Dato>
            <Dato etichetta="Partita IVA">
              <span className="tabular">{brandConfig.piva}</span>
            </Dato>
            <div className="sm:col-span-2">
              <Dato etichetta="Sede">{indirizzoCompleto}</Dato>
            </div>
            <Dato etichetta="Telefono">
              <span className="tabular">{brandConfig.telefono}</span>
            </Dato>
            <Dato etichetta="Email">
              <a href={`mailto:${brandConfig.email}`} className="text-brand-strong hover:underline">
                {brandConfig.email}
              </a>
            </Dato>
            <Dato etichetta="Sito">
              <a
                href={`https://${brandConfig.sito}`}
                target="_blank"
                rel="noreferrer"
                className="text-brand-strong hover:underline"
              >
                {brandConfig.sito}
              </a>
            </Dato>
          </dl>
          <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-ink-mute">
            Questi dati finiscono nella testata dei documenti stampati. Si cambiano in un solo
            punto: <span className="font-semibold">src/admin/brand.config.ts</span>. Nessun altro
            file conosce il nome, l’indirizzo o la partita IVA.
          </p>
        </Card>

        <Card titolo={daImport ? 'Dati caricati' : 'Dati dimostrativi'}>
          <p className="text-sm leading-relaxed text-ink-soft">
            {daImport ? (
              <>
                Il pannello sta mostrando un <span className="font-semibold">archivio demo locale</span>{' '}
                caricato manualmente. Vive nel{' '}
                <span className="font-semibold">localStorage</span> di questo browser: restano su
                questo computer e non sono ancora su nessun server.
              </>
            ) : (
              <>
                Il pannello è in <span className="font-semibold">modalità mock</span>: non c’è
                nessun database e nessun server. I dati sono{' '}
                <span className="font-semibold">dimostrativi</span> — nomi di fantasia — e si
                possono modificare liberamente senza conseguenze.
              </>
            )}
          </p>

          <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Dato etichetta="Modalità dati">
              {MODALITA_DATI === 'mock' ? 'Locale, senza backend' : 'Backend REST'}
            </Dato>
            <Dato etichetta="Origine">
              {daImport ? 'Archivio demo locale' : 'Dataset condiviso con l’agente'}
            </Dato>
            <Dato etichetta="Versione dei dati">
              <span className="tabular">{stato?.versione ?? SEED_VERSION}</span>
            </Dato>
            {stato?.generato_il ? (
              <Dato etichetta="Generato il">
                <span className="tabular">
                  {formatData(new Date(stato.generato_il).toISOString().slice(0, 10))}
                </span>
              </Dato>
            ) : null}
          </dl>

          {righe.length > 0 && (
            <div className="mt-4 border-t border-line pt-4">
              <p className="label mb-2">Cosa c’è dentro</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                {righe.map((r) => (
                  <div key={r.nome} className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="text-ink-soft">{r.nome}</span>
                    <span className="tabular font-semibold text-ink">{r.n}</span>
                  </div>
                ))}
              </dl>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
            <button
              type="button"
              className="btn-primary"
              onClick={() => fileInput.current?.click()}
              disabled={inCorso}
            >
              <Upload size={16} />
              Carica archivio demo
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void carica(f)
              }}
            />
            <button type="button" className="btn-secondary" onClick={esporta} disabled={inCorso}>
              <Download size={16} />
              Esporta
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={() => setConfermaAperta(true)}
              disabled={inCorso}
            >
              <RotateCcw size={16} />
              {daImport ? 'Torna ai dati dimostrativi' : 'Ripristina'}
            </button>
          </div>

          <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-ink-mute">
            <Database size={14} className="mt-0.5 shrink-0" />
            <span>
              Questa copia usa automaticamente i CSV sintetici dell’agente. Il caricamento manuale
              accetta soltanto una busta JSON versione 8 creata per test; non collega né modifica il
              gestionale WoodRevive originale.
            </span>
          </p>
        </Card>

        <Card titolo="Informazioni">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Dato etichetta="Versione del pannello">
              <span className="tabular">{VERSIONE_PANNELLO}</span>
            </Dato>
            <Dato etichetta="Fase">
              {daImport
                ? 'Demo — archivio locale caricato nel browser'
                : 'Demo — archivio condiviso tramite orchestratore'}
            </Dato>
          </dl>

          <p className="label mt-5 mb-2">Documentazione del progetto</p>
          <ul className="space-y-2">
            {DOCUMENTI.map((d) => (
              <li key={d.file} className="flex items-start gap-2 text-sm">
                <FileText size={16} className="mt-0.5 shrink-0 text-ink-mute" />
                <span>
                  <span className="font-semibold text-ink">{d.file}</span>
                  <span className="block text-xs text-ink-mute">{d.testo}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-ink-mute">
            I documenti stanno nel repository, non sono serviti dal pannello: si aprono dalla
            cartella <span className="font-semibold">docs/</span> del progetto.
          </p>
        </Card>
      </div>

      {confermaAperta && (
        <Conferma
          etichettaConferma={daImport ? 'Sostituisci l’archivio locale' : 'Ripristina tutto'}
          distruttiva
          inCorso={inCorso}
          onAnnulla={() => setConfermaAperta(false)}
          onConferma={ripristina}
          titolo={daImport ? 'Tornare ai dati dimostrativi?' : 'Ripristinare i dati dimostrativi?'}
          messaggio={
            daImport ? (
              <>
                <p>
                  Stai guardando un <span className="font-semibold">archivio demo locale</span>:
                  {' '}
                  {righe.map((r) => `${r.n} ${r.nome.toLowerCase()}`).join(', ')}. Vengono
                  cancellati e sostituiti dai dati di fantasia.
                </p>
                <p className="mt-2 text-ink-mute">
                  Si rimettono con «Carica archivio demo», ma tutto ciò che hai creato o corretto qui
                  dentro dopo l’import va perso. Esporta prima.
                </p>
              </>
            ) : (
              <>
                <p>
                  Tutto ciò che hai creato o modificato in questo browser — preventivi, ordini,
                  lotti, incassi — viene cancellato e sostituito dai dati di partenza.
                </p>
                <p className="mt-2 text-ink-mute">
                  Non è reversibile. Se vuoi conservare qualcosa, esporta prima i dati.
                </p>
              </>
            )
          }
        />
      )}
    </>
  )
}
