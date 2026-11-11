"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const office = fs.readFileSync(path.join(root, "assets/campuskit-office-v2.js"), "utf8");
const intelligence = fs.readFileSync(path.join(root, "assets/intelligence-lab.js"), "utf8");
const askApi = fs.readFileSync(path.join(root, "api/ask.js"), "utf8");
const socialApi = fs.readFileSync(path.join(root, "api/social.js"), "utf8");

test("Main CampusKit keeps its core student sections available", () => {
  for (const id of ["dashboard", "study-tools-view", "notes-library", "laboratory-section", "ai-assistant", "social", "apk-download"]) {
    assert.ok(html.includes('id="' + id + '"'), "Missing main section: " + id);
  }
});

test("Existing local student data keys are preserved", () => {
  for (const key of ["campuskitAssignments", "campusTimetable", "campusNotes"]) {
    assert.ok(html.includes(key), "Missing existing storage key: " + key);
  }
});

test("Writer and Sheets launch controls use delegated mobile-safe clicks", () => {
  assert.match(html, /data-office-new="writer"/);
  assert.match(html, /data-office-new="sheet"/);
  assert.match(office, /document\.addEventListener\("click",e=>\{const b=e\.target\.closest\("\[data-office-new\]"\)/);
  const createStart = office.indexOf("function create(type)");
  const createEnd = office.indexOf("function open(id)", createStart);
  assert.ok(createStart >= 0 && createEnd > createStart);
  assert.doesNotMatch(office.slice(createStart, createEnd), /prompt\(/);
});

test("Main app scripts and serverless APIs pass JavaScript syntax checks", () => {
  for (const [name, source] of [["office", office], ["intelligence lab", intelligence], ["AI API", askApi], ["Community API", socialApi]]) {
    assert.doesNotThrow(() => new vm.Script(source), name + " syntax");
  }
  const start = html.indexOf('<script id="ck-social-campus">');
  const end = html.indexOf("</script>", start);
  assert.ok(start >= 0 && end > start);
  assert.doesNotThrow(() => new vm.Script(html.slice(start + '<script id="ck-social-campus">'.length, end)));
});

test("Google sign-in waits for persistent local auth and explains domain errors", () => {
  assert.match(html, /setPersistence\(auth, browserLocalPersistence\)/);
  assert.match(html, /await authPersistenceReady/);
  assert.match(html, /auth\/unauthorized-domain/);
  assert.match(html, /Authorized domains/);
});

test("Main website asset files are present and under the agreed 10 MB per-file ceiling", () => {
  for (const file of ["assets/campuskit-office-v2.js", "assets/campuskit-office.css", "assets/intelligence-lab.js", "assets/intelligence-lab.css", "manifest.webmanifest"]) {
    const full = path.join(root, file);
    assert.ok(fs.existsSync(full), "Missing asset: " + file);
    assert.ok(fs.statSync(full).size <= 10 * 1024 * 1024, "Asset exceeds 10 MB: " + file);
  }
});
