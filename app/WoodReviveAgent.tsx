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
};

const MODES: { id: Mode; label: string; note: string }[] = [
  { id: "auto", label: "Automatico", note: "L’agente sceglie lo strumento" },
  { id: "rag", label: "RAG", note: "Ricerca semantica in ChromaDB" },
  { id: "wiki", label: "Wiki", note: "Pagine e sezioni strutturate" },
  { id: "data", label: "Dati", note: "Analisi CSV con pandas" },
];

const SUGGESTIONS = [
  "Come si calcola il margine su un articolo?",
  "Quali prodotti hanno la rotazione più lenta?",
  "Confronta la risposta RAG con la Wiki",
];

const INITIAL_MESSAGES: Message[] = [
  {
    id: 1,
    role: "assistant",
    text: "Buongiorno. Posso cercare procedure e informazioni di prodotto, oppure analizzare vendite, margini, giacenze e incassi. Da dove iniziamo?",
    tool: "Assistente pronto",
  },
];

function demoAnswer(question: string, mode: Mode, id: number): Message {
  const normalized = question.toLowerCase();
  const asksNumbers = /(trend|vend|fattur|marg|rotazione|giacenz|incass|kpi|quanto|quali prodotti)/.test(normalized);
  const selectedTool = mode === "auto" ? (asksNumbers ? "data" : "wiki") : mode;

  if (selectedTool === "data") {
    return {
      id,
      role: "assistant",
      text: "Per questa domanda userei l’analisi dati: il servizio pandas pulisce i CSV, calcola l’indicatore richiesto e restituisce risultato, metodo di calcolo e grafico. In questa fase iniziale i numeri sono dimostrativi e anonimi.",
      tool: "Pandas · dati demo",
      sources: ["datasets/demo/vendite.csv", "datasets/demo/magazzino.csv"],
    };
  }

  if (selectedTool === "rag") {
    return {
      id,
      role: "assistant",
      text: "Per questa domanda cercherei i passaggi semanticamente più pertinenti nella knowledge base indicizzata in ChromaDB e formulerei la risposta soltanto sulle fonti recuperate.",
      tool: "RAG · ChromaDB",
      sources: ["Procedure commerciali", "Glossario del legno antico"],
    };
  }

  return {
    id,
    role: "assistant",
    text: "Per questa domanda consulto la Wiki operativa: individuo la pagina tramite titolo, tag e indice, poi leggo le sezioni pertinenti mantenendo il collegamento alla fonte. Non vengono usati embedding o un database vettoriale.",
    tool: "Wiki · ricerca strutturata",
    sources: ["wiki/margini-e-prezzi.md", "wiki/ciclo-commerciale.md"],
  };
}

export function WoodReviveAgent() {
  const [mode, setMode] = useState<Mode>("auto");
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [draft, setDraft] = useState("");
  const activeMode = useMemo(() => MODES.find((item) => item.id === mode)!, [mode]);

  function send(question: string) {
    const cleanQuestion = question.trim();
    if (!cleanQuestion) return;

    setMessages((current) => {
      const nextId = (current.at(-1)?.id ?? 0) + 1;
      return [
        ...current,
        { id: nextId, role: "user", text: cleanQuestion },
        demoAnswer(cleanQuestion, mode, nextId + 1),
      ];
    });
    setDraft("");
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
          <div><span className="status-dot" /> Wiki disponibile</div>
          <div><span className="status-dot planned" /> RAG da configurare</div>
          <div><span className="status-dot planned" /> Pandas da collegare</div>
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
            <span className="live-pill"><span className="status-dot" /> Prototipo locale</span>
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
              </div>
            </article>
          ))}
        </section>

        <footer className="composer-area">
          <div className="suggestions" aria-label="Domande suggerite">
            {SUGGESTIONS.map((suggestion) => (
              <button key={suggestion} onClick={() => send(suggestion)} type="button">{suggestion}</button>
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
                  send(draft);
                }
              }}
              placeholder="Chiedi informazioni o analizza i dati…"
              rows={2}
              value={draft}
            />
            <button className="send-button" disabled={!draft.trim()} type="submit" aria-label="Invia domanda">↑</button>
          </form>
          <p className="composer-hint">Le risposte dovranno sempre indicare strumento, fonti e metodo di calcolo.</p>
        </footer>
      </section>
    </main>
  );
}
