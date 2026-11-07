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

test("Community photo and video uploads use the connected student's Google Drive", () => {
  assert.match(html, /async uploadCommunityMedia\(file\)/);
  assert.match(html, /https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files/);
  assert.match(html, /type: "anyone", role: "reader"/);
  assert.match(html, /ck-social-drive-consent/);
  assert.match(html, /50 \* 1024 \* 1024/);
  assert.match(html, /mediaProvider:uploaded\?'google-drive'/);
  assert.doesNotMatch(api, /getStorage|STORAGE_BUCKETS|action === "upload"/);
});

test("Google Drive uploads retain the least-privilege drive.file OAuth scope", () => {
  assert.match(html, /https:\/\/www\.googleapis\.com\/auth\/drive\.file/);
  assert.match(html, /driveTokenExpiresAt/);
  assert.match(html, /permissions\?fields=id,type,role/);
});

test("Community media publishing validates Drive references and protects private profiles", () => {
  assert.match(api, /mediaProvider !== "google-drive"/);
  assert.match(api, /profile\.isPrivate === true/);
  assert.match(api, /driveFileId/);
  assert.match(api, /driveCheck = await fetch\("https:\/\/www\.googleapis\.com\/drive\/v3\/files/);
  assert.match(api, /owners\?\.some\(owner => owner\.me === true\)/);
  assert.match(api, /permissions\?\.some\(permission => permission\.type === "anyone" && permission\.role === "reader"\)/);
  assert.doesNotMatch(api, /driveAccessToken,/);
  assert.match(html, /driveAccessToken:uploaded\?\.accessToken/);
  assert.match(api, /https:\/\/drive\.google\.com\/uc\?export=view&id=/);
  assert.match(html, /ck-social-drive-video/);
  assert.match(html, /drive\.google\.com\/file\/d\/\x27\+safe\(p\.driveFileId\)\+\x27\/preview/);
});

test("Story publishing persists media in socialStories with a 24-hour expiry", () => {
  assert.match(api, /const collection = type === "story" \? stories : posts/);
  assert.match(api, /expiresAt: Timestamp\.fromMillis\(Date\.now\(\) \+ 24 \* 60 \* 60 \* 1000\)/);
  assert.match(api, /await collection\.add\(type === "story"/);
});

test("Deleting a Community post or story returns its Drive file ID for cleanup", () => {
  assert.match(api, /const driveFileId = clean\(snap\.data\(\)\.driveFileId, 200\)/);
  assert.match(api, /json\(\{ ok: true, driveFileId \}\)/);
  assert.match(html, /CampusKitNotesStorage\.delete\(deleted\.driveFileId\)/);
});

test("Notes & Library keeps its existing private Google Drive upload workflow", () => {
  assert.match(html, /async upload\(file, noteId\)/);
  assert.match(html, /CampusKit note attachment/);
  assert.match(html, /Files stay private in your Drive/);
});
