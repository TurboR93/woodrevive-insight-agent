export interface BusinessSkill {
  id: string;
  label: string;
  description: string;
  guidance: string;
  patterns: RegExp[];
  priority: number;
}

export type ActiveBusinessSkill = Pick<BusinessSkill, "id" | "label" | "description">;

const skills: BusinessSkill[] = [
  {
    id: "quote-draft",
    label: "Preventivo controllato",
    description: "Crea bozze coerenti con catalogo, listino e Manager.",
    priority: 100,
    patterns: [/preventiv/i, /offert[ae]/i, /quotazion/i],
    guidance: "Per un preventivo: risolvi prima cliente e articoli con quote_catalog_search; crea la bozza solo su richiesta esplicita e con quantità certa. Non inventare ID, prezzi, sconti, IVA o disponibilità. Riporta totale, margine, controlli e specifica che non avviene alcun invio al cliente.",
  },
  {
    id: "margin-review",
    label: "Controllo marginalità",
    description: "Distingue margine, ricarico, sconti e costi.",
    priority: 80,
    patterns: [/margin/i, /marginalit/i, /ricaric/i, /redditivit/i, /sconto/i],
    guidance: "Per la marginalità usa soltanto i risultati pandas o i calcoli deterministici del preventivo. Distingui margine sul venduto da ricarico sul costo; indica formula, periodo e unità. Non sommare IVA ai ricavi e segnala quando il costo non è disponibile.",
  },
  {
    id: "inventory-delivery",
    label: "Disponibilità e consegne",
    description: "Controlla stock, impegni, lotti, DDT ed evasione.",
    priority: 75,
    patterns: [/giacenz/i, /disponibilit/i, /stock/i, /scort/i, /lott/i, /consegn/i, /\bddt\b/i, /evas/i],
    guidance: "Mantieni separati giacenza fisica, quantità impegnata e disponibilità commerciale. Per valori e classifiche usa pandas; per regole di lotto, DDT o consegna consulta la Wiki. Dichiara data di riferimento e non promettere materiale oltre la disponibilità.",
  },
  {
    id: "customer-credit",
    label: "Crediti e incassi",
    description: "Analizza esposizione, scadenze e pagamenti senza doppi conteggi.",
    priority: 75,
    patterns: [/esposizion/i, /scadenz/i, /incass/i, /insolut/i, /credit[io]/i, /residu/i, /pagament/i, /importi? apert/i],
    guidance: "Per crediti e incassi usa customer_exposure e specifica la data di analisi. Distingui importo aperto da scaduto, cliente da fornitore e pagamento atteso da avvenuto. Non sommare ordini e scadenze se rappresentano lo stesso credito.",
  },
  {
    id: "sales-kpi",
    label: "KPI commerciali",
    description: "Calcola vendite e trend con perimetro e metodo espliciti.",
    priority: 60,
    patterns: [/fatturat/i, /vendit/i, /andament/i, /\btrend\b/i, /\bkpi\b/i, /categoria/i, /top client/i],
    guidance: "Per KPI commerciali scegli l'operazione pandas più specifica. Esplicita periodo, perimetro, formula e unità; separa imponibile, IVA e incassi. Presenta pochi insight verificabili prima della tabella completa.",
  },
  {
    id: "wiki-procedure",
    label: "Procedura aziendale",
    description: "Risponde usando pagine Wiki lette e citate.",
    priority: 50,
    patterns: [/procedur/i, /policy/i, /regol[ae]/i, /manual/i, /faq/i, /definizion/i, /come (?:si|devo|gest)/i],
    guidance: "Per procedure e definizioni usa wiki_search e poi wiki_read. Rispondi soltanto con ciò che le pagine lette supportano, cita la fonte e separa regola, eccezioni e passi operativi. Se la Wiki non copre un dettaglio, dichiaralo.",
  },
];

function score(skill: BusinessSkill, question: string): number {
  const matches = skill.patterns.filter((pattern) => pattern.test(question)).length;
  return matches ? skill.priority + matches * 10 : 0;
}

export function selectBusinessSkills(question: string, limit = 2): BusinessSkill[] {
  return skills
    .map((skill) => ({ skill, score: score(skill, question) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.skill.id.localeCompare(right.skill.id))
    .slice(0, Math.max(0, Math.min(2, limit)))
    .map((candidate) => candidate.skill);
}

export function businessSkillsPrompt(active: BusinessSkill[]): string {
  if (!active.length) return "Nessuna skill aziendale specialistica necessaria per questa richiesta.";
  return `Skill aziendali attive (applica solo queste):\n${active.map((skill) => `- ${skill.label}: ${skill.guidance}`).join("\n")}`;
}

export function publicBusinessSkills(active: BusinessSkill[]): ActiveBusinessSkill[] {
  return active.map(({ id, label, description }) => ({ id, label, description }));
}

export const BUSINESS_SKILL_COUNT = skills.length;
