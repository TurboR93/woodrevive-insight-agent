"use client";

import { FormEvent, useMemo, useState } from "react";
import Image from "next/image";

type Mode = "auto" | "rag" | "wiki" | "data";

type Message = {
  id: number;
  role: "user" | "assistant";
  text: string;
  tool?: string;
  sources?: string[];
  warnings?: string[];
};

type AgentResponse = {
  answer: string;
  tool: string;
  model?: string;
  sources: Array<{ label: string; locator: string }>;
  warnings: string[];
};

const MODES: { id: Mode; label: string; note: string }[] = [
  { id: "auto", label: "Automatico", note: "L’agente sceglie lo strumento" },
  { id: "rag", label: "RAG", note: "Retrieval sul corpus documentale" },
  { id: "wiki", label: "Wiki", note: "Pagine e sezioni strutturate" },
  { id: "data", label: "Dati", note: "Analisi CSV con pandas" },
];

const SUGGESTIONS = [
  "Come si calcola il margine su un articolo?",
  "Quali clienti hanno ancora importi aperti?",
  "Confronta RAG e Wiki sulla gestione dei lotti",
];

const INITIAL_MESSAGES: Message[] = [
  {
    id: 1,
    role: "assistant",
    text: "Buongiorno. Posso cercare procedure e informazioni di prodotto, oppure analizzare vendite, margini, giacenze e incassi. Da dove iniziamo?",
    tool: "Assistente pronto",
  },
];

export function WoodReviveAgent() {
  const [mode, setMode] = useState<Mode>("auto");
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const activeMode = useMemo(() => MODES.find((item) => item.id === mode)!, [mode]);

  async function send(question: string) {
    const cleanQuestion = question.trim();
    if (!cleanQuestion || isSending) return;

    const history = messages.map((message) => ({ role: message.role, text: message.text }));
    const nextId = (messages.at(-1)?.id ?? 0) + 1;
    setMessages((current) => [...current, { id: nextId, role: "user", text: cleanQuestion }]);
    setDraft("");
    setIsSending(true);
    try {
      const response = await fetch(
        process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || "http://127.0.0.1:8787/api/chat",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: cleanQuestion, mode, history }),
        },
      );
      const payload = await response.json() as AgentResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || `Errore HTTP ${response.status}`);
      setMessages((current) => [...current, {
        id: nextId + 1,
        role: "assistant",
        text: payload.answer,
        tool: `${payload.model?.includes("haiku") ? "Claude Haiku" : "Claude"} · ${payload.tool}`,
        sources: payload.sources.map((source) => source.locator),
        warnings: payload.warnings,
      }]);
    } catch (error) {
      setMessages((current) => [...current, {
        id: nextId + 1,
        role: "assistant",
        text: error instanceof Error ? error.message : "Impossibile contattare l’agente.",
        tool: "Connessione non disponibile",
        warnings: ["Controlla che l’orchestratore e il servizio pandas siano avviati."],
      }]);
    } finally {
      setIsSending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    send(draft);
  }

  return (
    <main className="agent-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <Image
            className="brand-logo"
            src="/brand/logo-neg@2x.png"
            alt="Wood Revive — Ridiamo vita al legno antico"
            width={801}
            height={135}
            priority
          />
          <p className="brand-product">Insight agent</p>
        </div>

        <nav className="primary-nav" aria-label="Navigazione principale">
          <button className="nav-item active" type="button"><span>✦</span> Assistente</button>
          <button className="nav-item" type="button"><span>▤</span> Knowledge base</button>
          <button className="nav-item" type="button"><span>⌁</span> Analisi salvate</button>
        </nav>

        <div className="sidebar-spacer" />

        <section className="system-card" aria-label="Stato dei servizi">
          <p className="eyebrow">SISTEMA</p>
          <div><span className="status-dot" /> Claude Haiku attivo</div>
          <div><span className="status-dot" /> Wiki connessa</div>
          <div><span className="status-dot" /> Pandas connesso</div>
          <div><span className="status-dot planned" /> ChromaDB prossimo</div>
        </section>

        <div className="privacy-note">
          <span aria-hidden="true">⌾</span>
          <p><strong>Ambiente dimostrativo</strong><br />Solo dati anonimi</p>
        </div>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">SALES &amp; OPERATIONS</p>
            <h1>Assistente operativo</h1>
          </div>
          <div className="header-meta">
            <span className="live-pill"><span className="status-dot" /> Agente reale · Haiku</span>
            <div className="avatar" aria-label="WoodRevive">
              <Image src="/brand/favicon-192.png" alt="" width={192} height={192} />
            </div>
          </div>
        </header>

        <div className="mode-panel">
          <div>
            <p className="mode-title">Modalità di risposta</p>
            <p className="mode-note">{activeMode.note}</p>
          </div>
          <div className="mode-switch" role="group" aria-label="Modalità di risposta">
            {MODES.map((item) => (
              <button className={mode === item.id ? "selected" : ""} key={item.id} onClick={() => setMode(item.id)} type="button">
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <section className="conversation" aria-live="polite">
          <div className="date-divider"><span>OGGI</span></div>
          {messages.map((message) => (
            <article className={`message-row ${message.role}`} key={message.id}>
              {message.role === "assistant" && <div className="assistant-icon" aria-hidden="true">✦</div>}
              <div className="message-wrap">
                {message.tool && <p className="tool-label">{message.tool}</p>}
                <div className="message-bubble">{message.text}</div>
                {message.sources && (
                  <div className="source-row">
                    {message.sources.map((source) => <span key={source}>↗ {source}</span>)}
                  </div>
                )}
                {message.warnings?.map((warning) => <p className="message-warning" key={warning}>ⓘ {warning}</p>)}
              </div>
            </article>
          ))}
          {isSending && (
            <article className="message-row assistant">
              <div className="assistant-icon" aria-hidden="true">✦</div>
              <div className="message-wrap">
                <p className="tool-label">Claude Haiku sta usando gli strumenti…</p>
                <div className="message-bubble thinking"><span /><span /><span /></div>
              </div>
            </article>
          )}
        </section>

        <footer className="composer-area">
          <div className="suggestions" aria-label="Domande suggerite">
            {SUGGESTIONS.map((suggestion) => (
              <button disabled={isSending} key={suggestion} onClick={() => void send(suggestion)} type="button">{suggestion}</button>
            ))}
          </div>
          <form className="composer" onSubmit={submit}>
            <label className="sr-only" htmlFor="question">Scrivi una domanda</label>
            <textarea
              id="question"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(draft);
                }
              }}
              placeholder="Chiedi informazioni o analizza i dati…"
              rows={2}
              value={draft}
            />
            <button className="send-button" disabled={!draft.trim() || isSending} type="submit" aria-label="Invia domanda">{isSending ? "…" : "↑"}</button>
          </form>
          <p className="composer-hint">Claude Haiku sceglie lo strumento; risposte fondate su Wiki e dati demo.</p>
        </footer>
      </section>
    </main>
  );
}
