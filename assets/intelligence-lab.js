/* CampusKit Student Intelligence Lab — free, local-first tools. */
(function () {
  "use strict";

  const KEY = "campuskitIntelligenceV1";
  const MAX_DEBTS = 100;
  const MAX_DOUBTS = 100;

  function median(values) {
    const sorted = values.slice().sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function parseReadings(raw) {
    const tokens = String(raw || "").trim().split(/[,;\s]+/).filter(Boolean);
    if (tokens.length < 3) return { error: "Enter at least 3 readings." };
    const values = tokens.map(Number);
    if (values.some(value => !Number.isFinite(value))) {
      return { error: "Use numbers only. Separate readings with commas or spaces." };
    }
    return { values };
  }

  function inspectReadings(raw) {
    const parsed = parseReadings(raw);
    if (parsed.error) return parsed;
    const values = parsed.values;
    const center = median(values);
    const absoluteDeviations = values.map(value => Math.abs(value - center));
    const mad = median(absoluteDeviations);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (values.length - 1);
    const sd = Math.sqrt(variance);
    const outliers = values.map((value, index) => ({
      index: index + 1,
      value,
      score: mad === 0 ? (value === center ? 0 : Infinity) : Math.abs(0.6745 * (value - center) / mad)
    })).filter(item => item.score > 3.5);
    return { values, count: values.length, median: center, mean, sampleSD: sd, outliers };
  }

  function classifyDoubt(text) {
    const value = String(text || "").toLowerCase();
    if (/\b(derive|proof|prove|why|reason|meaning|concept|explain)\b/.test(value)) return "Concept / reasoning";
    if (/\b(formula|calculate|solve|value|unit|equation|numerical|math)\b/.test(value)) return "Formula / numerical";
    if (/\b(when|year|date|who|where|name|define|definition|fact)\b/.test(value)) return "Fact / recall";
    if (/\b(how|step|process|method|procedure|experiment|apparatus|observation)\b/.test(value)) return "Process / method";
    return "General / unclear";
  }

  function opponentChallenges(topic, answer) {
    const words = String(answer || "").trim().split(/\s+/).filter(Boolean);
    const lower = String(answer || "").toLowerCase();
    const questions = [
      "Define the most important term without repeating the question.",
      "Which assumption must be true for your explanation to work?",
      "Give one real example and one case where the idea does not apply.",
      "What evidence, observation or equation supports your main claim?",
      "If one condition changed, which part of your explanation would change first?"
    ];
    if (/\b(formula|equation|force|energy|velocity|current|voltage|mass|time)\b/.test(lower)) {
      questions[3] = "Write the governing equation, define every symbol and check the units on both sides.";
    }
    if (words.length < 35) {
      questions.push("Your explanation is very short. Add the missing steps between the starting idea and conclusion.");
    } else {
      questions.push("Compress your explanation into three precise sentences without losing a logical step.");
    }
    return { topic: String(topic || "").trim(), wordCount: words.length, questions };
  }

  function reversePrompts(answer, kind) {
    const prompts = {
      science: [
        "What physical situation or question could produce this result?",
        "List the given quantities, unknown quantity and required units.",
        "Which law or formula connects the known values to this answer?",
        "State the assumptions and show the calculation in reverse to check it.",
        "Change one input value: how should the answer respond?"
      ],
      definition: [
        "What question would this definition answer?",
        "Which essential characteristics must be present?",
        "Give one valid example and one non-example.",
        "Explain the idea without using the key term.",
        "What nearby concept could be confused with it, and how are they different?"
      ],
      history: [
        "What question would make this fact the answer?",
        "What happened immediately before and after this event?",
        "Which primary or textbook source could verify the fact?",
        "What context makes this fact important?",
        "Which detail would change the interpretation if it were incorrect?"
      ]
    };
    return { answer: String(answer || "").trim(), prompts: prompts[kind] || prompts.science };
  }

  function normalizeState(input) {
    const state = input && typeof input === "object" ? input : {};
    return {
      debts: Array.isArray(state.debts) ? state.debts.slice(0, MAX_DEBTS) : [],
      doubts: Array.isArray(state.doubts) ? state.doubts.slice(0, MAX_DOUBTS) : []
    };
  }

  const core = { median, parseReadings, inspectReadings, classifyDoubt, opponentChallenges, reversePrompts, normalizeState };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  if (typeof window !== "undefined") window.CampusKitIntelligenceCore = core;

  if (typeof document === "undefined") return;
  const $ = id => document.getElementById(id);
  const safe = (tag, text) => {
    const node = document.createElement(tag);
    node.textContent = String(text);
    return node;
  };
  const readState = () => {
    try { return normalizeState(JSON.parse(localStorage.getItem(KEY) || "{}")); }
    catch (_) { return normalizeState({}); }
  };
  const state = readState();
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (_) {
      window.alert("CampusKit could not save this entry. Check your browser storage.");
      return false;
    }
  };
  const bind = (id, event, handler) => {
    const node = $(id);
    if (node) node.addEventListener(event, handler);
  };

  function renderDebts() {
    const box = $("ck-debt-list");
    if (!box) return;
    box.replaceChildren();
    if (!state.debts.length) {
      box.append(safe("p", "No concept debt yet. Add one small gap you want to close."));
      return;
    }
    state.debts.forEach((debt, index) => {
      const row = document.createElement("div");
      row.className = "ck-intel-entry";
      row.append(safe("strong", debt.topic || "Untitled concept"));
      row.append(safe("small", (debt.level || "Medium") + " priority · added " + new Date(debt.created || Date.now()).toLocaleDateString()));
      if (debt.note) row.append(safe("p", debt.note));
      const done = safe("button", "Mark understood");
      done.type = "button";
      done.addEventListener("click", () => {
        state.debts.splice(index, 1);
        if (save()) renderDebts();
      });
      row.append(done);
      box.append(row);
    });
  }

  bind("ck-debt-form", "submit", event => {
    event.preventDefault();
    const topic = $("ck-debt-topic").value.trim();
    if (!topic) return;
    state.debts.unshift({
      topic,
      level: $("ck-debt-level").value,
      note: $("ck-debt-note").value.trim(),
      created: Date.now()
    });
    state.debts = state.debts.slice(0, MAX_DEBTS);
    if (save()) { event.target.reset(); renderDebts(); }
  });

  bind("ck-lab-form", "submit", event => {
    event.preventDefault();
    const result = inspectReadings($("ck-lab-values").value);
    const output = $("ck-lab-result");
    if (result.error) { output.textContent = result.error; return; }
    const unit = $("ck-lab-unit").value.trim();
    const outlierText = result.outliers.length
      ? result.outliers.map(item => "#" + item.index + " = " + item.value + (unit ? " " + unit : "")).join(", ")
      : "None flagged by the MAD screen.";
    output.textContent =
      "Readings: " + result.count +
      "\nMedian: " + result.median + (unit ? " " + unit : "") +
      "\nMean: " + Number(result.mean.toFixed(4)) +
      "\nSample standard deviation: " + Number(result.sampleSD.toFixed(4)) +
      "\nPotential outliers: " + outlierText +
      "\n\nA statistical flag is not proof of a mistake. Check the original notebook, instrument, units, calibration and procedure. Never delete a reading only because this tool flags it.";
  });

  bind("ck-opponent-form", "submit", event => {
    event.preventDefault();
    const topic = $("ck-opponent-topic").value.trim();
    const answer = $("ck-opponent-answer").value.trim();
    const result = opponentChallenges(topic, answer);
    const box = $("ck-opponent-result");
    box.replaceChildren(safe("strong", "Your examiner is challenging: " + result.topic));
    box.append(safe("p", "Explanation length: " + result.wordCount + " words. This is a reasoning exercise, not an automatic correctness score."));
    result.questions.forEach((question, index) => box.append(safe("p", (index + 1) + ". " + question)));
    box.append(safe("small", "Answer each challenge, then rewrite your explanation using your course textbook or lecture notes."));
  });

  function renderDoubts() {
    const list = $("ck-doubt-list");
    const summary = $("ck-doubt-summary");
    if (!list || !summary) return;
    list.replaceChildren();
    const counts = {};
    state.doubts.forEach(doubt => { counts[doubt.type] = (counts[doubt.type] || 0) + 1; });
    const ordered = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    summary.textContent = state.doubts.length
      ? "Your doubt DNA · " + ordered.map(([type, count]) => type + ": " + count + " (" + Math.round(count / state.doubts.length * 100) + "%)").join(" · ")
      : "No doubts saved yet. Add a real question from today's class.";
    state.doubts.slice(0, 12).forEach(doubt => {
      const row = document.createElement("div");
      row.className = "ck-intel-entry";
      row.append(safe("strong", doubt.type || "General / unclear"));
      row.append(safe("p", doubt.text || ""));
      row.append(safe("small", new Date(doubt.created || Date.now()).toLocaleString()));
      const remove = safe("button", "Remove resolved doubt");
      remove.type = "button";
      remove.addEventListener("click", () => {
        const index = state.doubts.indexOf(doubt);
        if (index >= 0) state.doubts.splice(index, 1);
        if (save()) renderDoubts();
      });
      row.append(remove);
      list.append(row);
    });
  }

  bind("ck-doubt-form", "submit", event => {
    event.preventDefault();
    const text = $("ck-doubt-text").value.trim();
    if (!text) return;
    state.doubts.unshift({ text, type: classifyDoubt(text), created: Date.now() });
    state.doubts = state.doubts.slice(0, MAX_DOUBTS);
    if (save()) { event.target.reset(); renderDoubts(); }
  });

  bind("ck-reverse-form", "submit", event => {
    event.preventDefault();
    const answer = $("ck-reverse-answer").value.trim();
    const kind = $("ck-reverse-kind").value;
    const result = reversePrompts(answer, kind);
    const box = $("ck-reverse-result");
    box.replaceChildren(safe("strong", "Start from your answer: " + result.answer));
    result.prompts.forEach((prompt, index) => box.append(safe("p", (index + 1) + ". " + prompt)));
    box.append(safe("small", "Write your reconstructed question and verify every step with your syllabus or textbook."));
  });

  renderDebts();
  renderDoubts();
})();