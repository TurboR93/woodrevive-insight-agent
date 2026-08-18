import assert from "node:assert/strict";
import test from "node:test";
import {
  BUSINESS_SKILL_COUNT,
  businessSkillsPrompt,
  isRecentQuoteLookup,
  selectBusinessSkills,
} from "../src/skills/business-skills.js";

test("il catalogo contiene un numero contenuto di skill aziendali", () => {
  assert.equal(BUSINESS_SKILL_COUNT, 6);
});

test("attiva solo le skill pertinenti e mai più di due", () => {
  assert.deepEqual(
    selectBusinessSkills("Crea un preventivo con controllo del margine").map((skill) => skill.id),
    ["quote-draft", "margin-review"],
  );
  assert.deepEqual(
    selectBusinessSkills("Quali clienti hanno importi aperti e scaduti?").map((skill) => skill.id),
    ["customer-credit"],
  );
  assert.ok(selectBusinessSkills("Spiegami la procedura per una consegna da un lotto").length <= 2);
});

test("le istruzioni selettive restano entro un budget compatto", () => {
  const active = selectBusinessSkills("Prepara un preventivo con margine e disponibilità del lotto");
  const prompt = businessSkillsPrompt(active);
  assert.equal(active.length, 2);
  assert.ok(prompt.length < 1_100, `Prompt skill troppo lungo: ${prompt.length} caratteri`);
});

test("una richiesta generica non carica skill inutili", () => {
  assert.deepEqual(selectBusinessSkills("Ciao, puoi aiutarmi?"), []);
});

test("riconosce la consultazione dei preventivi senza confonderla con la creazione", () => {
  assert.equal(isRecentQuoteLookup("Abbiamo preventivi recenti?"), true);
  assert.equal(isRecentQuoteLookup("Quali sono gli ultimi preventivi creati?"), true);
  assert.equal(isRecentQuoteLookup("Mostrami le bozze dei preventivi"), true);
  assert.equal(isRecentQuoteLookup("Crea un preventivo per Atelier Arco"), false);
});
