import React from 'react'
import ReactDOM from 'react-dom/client'

import AdminApp from './admin/AdminApp'
import { brandConfig } from './admin/brand.config'
import { verificaBusta } from './admin/mock/busta'
import { avviaDb, caricaBusta } from './admin/mock/db'
import './index.css'

document.title = `${brandConfig.nome} — Demo condivisa`

const orchestratore = import.meta.env.VITE_ORCHESTRATOR_URL || 'http://127.0.0.1:8787'

async function caricaDemoCondivisa(): Promise<void> {
  const risposta = await fetch(`${orchestratore}/api/demo/manager-data`, { cache: 'no-store' })
  if (!risposta.ok) throw new Error(`Archivio demo condiviso non disponibile (HTTP ${risposta.status}).`)
  const esito = verificaBusta(await risposta.json())
  if ('errore' in esito) throw new Error(esito.errore)
  caricaBusta(esito.busta, true)
}

function monta(contenuto: React.ReactNode): void {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>{contenuto}</React.StrictMode>,
  )
}

function mostraErrore(error: unknown): void {
  const messaggio = error instanceof Error ? error.message : String(error)
  monta(
    <main className="mx-auto mt-16 max-w-xl rounded-xl border border-line bg-surface p-8 text-ink">
      <p className="text-xs font-semibold uppercase tracking-widest text-brand">Demo condivisa</p>
      <h1 className="mt-2 font-display text-2xl">Il gestionale non riesce a collegarsi all’agente</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">{messaggio}</p>
      <a className="mt-6 inline-flex rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white" href="http://localhost:3000/">Torna all’agente</a>
    </main>,
  )
}

async function avvia(): Promise<void> {
  await avviaDb()
  await caricaDemoCondivisa()
  monta(<AdminApp />)
}

void avvia().catch(mostraErrore)
