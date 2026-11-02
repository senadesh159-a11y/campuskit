"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../assets/intelligence-lab.js");

test("lab readings reject too few and non-numeric values", () => {
  assert.match(core.inspectReadings("1, 2").error, /at least 3/i);
  assert.match(core.inspectReadings("1, two, 3").error, /numbers only/i);
});
test("lab readings calculate median, mean and sample spread", () => {
  const result = core.inspectReadings("10, 11, 12");
  assert.equal(result.median, 11);
  assert.equal(result.mean, 11);
  assert.equal(result.count, 3);
  assert.ok(result.sampleSD > 0);
});
test("lab detective flags a clear extreme outlier without deleting it", () => {
  const result = core.inspectReadings("10, 10, 10, 100");
  assert.deepEqual(result.outliers.map(item => item.index), [4]);
  assert.equal(result.values.length, 4);
});
test("Doubt DNA classifies concept, numerical, recall and process doubts", () => {
  assert.equal(core.classifyDoubt("Why does this concept work?"), "Concept / reasoning");
  assert.equal(core.classifyDoubt("How do I calculate the formula value?"), "Formula / numerical");
  assert.equal(core.classifyDoubt("When did this event happen?"), "Fact / recall");
  assert.equal(core.classifyDoubt("How is the experiment procedure done?"), "Process / method");
});
test("Opponent Teacher produces a challenge set and word count", () => {
  const result = core.opponentChallenges("Newton's laws", "Force equals mass times acceleration.");
  assert.equal(result.topic, "Newton's laws");
  assert.equal(result.wordCount, 5);
  assert.ok(result.questions.length >= 6);
  assert.match(result.questions[3], /equation|units/i);
});
test("Reverse Learning returns prompts for each supported answer type", () => {
  for (const kind of ["science", "definition", "history"]) {
    const result = core.reversePrompts("42", kind);
    assert.equal(result.answer, "42");
    assert.equal(result.prompts.length, 5);
  }
});
test("existing saved intelligence arrays are retained and bounded", () => {
  const state = core.normalizeState({ debts: [{ topic: "Vectors" }], doubts: [{ text: "Why?" }] });
  assert.equal(state.debts[0].topic, "Vectors");
  assert.equal(state.doubts[0].text, "Why?");
  assert.deepEqual(core.normalizeState(null), { debts: [], doubts: [] });
});