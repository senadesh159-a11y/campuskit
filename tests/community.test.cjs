"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const api = fs.readFileSync(path.join(root, "api/social.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

test("Community navigation replaces Social and removes the standalone Profile tab", () => {
  assert.match(html, /<span>Community<\/span>/);
  assert.doesNotMatch(html, /id="ck-profile-nav"/);
  assert.doesNotMatch(html, /class="ck-social-tab" data-social-view="profile"/);
  assert.match(html, /data-social-view="profile">View profile<\/button>/);
});

test("Community rooms support creation, joining, leaving and group messages", () => {
  for (const action of ["community-create", "community-join", "community-leave", "community-message", "community-chat"]) {
    assert.ok(api.includes(action), "Missing community action: " + action);
  }
  assert.match(api, /if \(!memberSnap\.exists\) return fail\(res, 403, "Join this community to enter its chat\."/);
  assert.match(api, /if \(!memberSnap\.exists\) return fail\(res, 403, "Join this community before sending messages\."/);
});

test("Community UI includes room discovery, membership and a group chat composer", () => {
  assert.match(html, /id="ck-social-communities"/);
  assert.match(html, /id="ck-social-community-chat"/);
  assert.match(html, /data-community-join/);
  assert.match(html, /data-community-open/);
  assert.match(html, /id="ck-community-message-form"/);
});

test("Existing posts, video reels, member profiles and direct messages remain wired", () => {
  assert.match(api, /action === "publish"/);
  assert.match(api, /action === "messages"/);
  assert.match(api, /action === "profile"/);
  assert.match(html, /id="ck-social-feed"/);
  assert.match(html, /id="ck-social-reels-grid"/);
  assert.match(html, /id="ck-social-profile"/);
  assert.match(html, /id="ck-social-message-form"/);
});

test("A first direct message can open a conversation before any message exists", () => {
  assert.match(api, /conversationSnap\.exists \? await conversation\.collection\("messages"\)/);
  assert.match(html, /async function conversation\(uid\)/);
});

test("Community API and browser interaction script pass JavaScript syntax checks", () => {
  assert.doesNotThrow(() => new vm.Script(api));
  const start = html.indexOf('<script id="ck-social-campus">');
  const end = html.indexOf('</script>', start);
  assert.ok(start >= 0 && end > start, "Community interaction script should exist");
  const script = html.slice(start + '<script id="ck-social-campus">'.length, end);
  assert.doesNotThrow(() => new vm.Script(script));
});
