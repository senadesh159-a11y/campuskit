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

test("Explore Campus searches active communities and displays join or chat actions", () => {
  assert.match(api, /const matchingCommunities = communitySnap\.docs\.filter/);
  assert.match(api, /communities: communityResults/);
  assert.match(html, /<h3>Communities<\/h3>/);
  assert.match(html, /data-community-join=/);
});

test("Direct messages record read receipts and show sent or seen state", () => {
  assert.match(api, /readAt: FieldValue\.serverTimestamp\(\)/);
  assert.match(html, /m\.read\?' · Seen':' · Sent'/);
});

test("Community chat messages create Activity notifications for other members", () => {
  assert.match(api, /type: "community_message"/);
  assert.match(html, /n\.type==='community_message'/);
});

test("Member profiles include a visible Details section", () => {
  assert.match(html, /ck-social-profile-details/);
});

test("Community API and browser interaction script pass JavaScript syntax checks", () => {
  assert.doesNotThrow(() => new vm.Script(api));
  const start = html.indexOf('<script id="ck-social-campus">');
  const end = html.indexOf('</script>', start);
  assert.ok(start >= 0 && end > start, "Community interaction script should exist");
  const script = html.slice(start + '<script id="ck-social-campus">'.length, end);
  assert.doesNotThrow(() => new vm.Script(script));
});

test("Photo and video uploads try the configured, current and legacy Firebase Storage buckets", () => {
  assert.match(api, /STORAGE_BUCKETS = \[\.\.\.new Set\(\[process\.env\.FIREBASE_STORAGE_BUCKET, "campuskit-11f47\.firebasestorage\.app", "campuskit-11f47\.appspot\.com"/);
  assert.match(api, /for \(const bucketName of STORAGE_BUCKETS\)/);
  assert.match(api, /campuskit-social\/" \+ user\.uid \+ "\/"/);
  assert.match(api, /"image\/jpeg".*"video\/mp4"/);
});

test("Story publishing persists media in socialStories with a 24-hour expiry", () => {
  assert.match(api, /const collection = type === "story" \? stories : posts/);
  assert.match(api, /expiresAt: Timestamp\.fromMillis\(Date\.now\(\) \+ 24 \* 60 \* 60 \* 1000\)/);
  assert.match(api, /await collection\.add\(type === "story"/);
});

test("Storage failures are returned with actionable backend details instead of a generic message", () => {
  assert.match(api, /STORAGE_BUCKET_MISSING/);
  assert.match(api, /Firebase Storage denied this upload/);
  assert.match(api, /configured Firebase Storage bucket was not found/);
  assert.doesNotMatch(api, /CampusKit Community could not complete this request\. Please try again\./);
});
