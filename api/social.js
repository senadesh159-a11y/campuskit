const crypto = require("crypto");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");

const BUCKET = process.env.FIREBASE_STORAGE_BUCKET || "campuskit-11f47.firebasestorage.app";
const MAX_MEDIA_BYTES = 3 * 1024 * 1024;
const ALLOWED_MEDIA = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4"]);

function initFirebase() {
  if (!getApps().length) {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) throw new Error("Firebase service account is not configured.");
    initializeApp({
      credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
      storageBucket: BUCKET
    });
  }
}
const clean = (value, max = 500) => String(value || "").trim().slice(0, max);
const publicProfile = (uid, data = {}) => ({
  uid, displayName: data.displayName || "CampusKit Student",
  username: data.username || "", photoURL: data.photoURL || "",
  bio: data.bio || "", followersCount: data.followersCount || 0,
  followingCount: data.followingCount || 0, postsCount: data.postsCount || 0,
  isPrivate: data.isPrivate === true, suspended: data.suspended === true
});
const dateValue = value => value?.toDate ? value.toDate().toISOString() : value || null;
const fail = (res, code, message) => res.status(code).json({ error: message });
const idSafe = value => /^[A-Za-z0-9_-]{1,160}$/.test(String(value || ""));

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!["GET", "POST", "DELETE"].includes(req.method)) return fail(res, 405, "Method not allowed.");

  try {
    initFirebase();
    const bearer = req.headers.authorization || "";
    const token = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
    if (!token) return fail(res, 401, "Sign in to CampusKit first.");
    const user = await getAuth().verifyIdToken(token);
    const db = getFirestore();
    const profiles = db.collection("socialProfiles");
    const posts = db.collection("socialPosts");
    const stories = db.collection("socialStories");
    const follows = db.collection("socialFollows");
    const followRequests = db.collection("socialFollowRequests");
    const reports = db.collection("socialReports");
    const notifications = uid => db.collection("socialNotifications").doc(uid).collection("items");
    const blocks = db.collection("socialBlocks");
    const now = Timestamp.now();

    const myRef = profiles.doc(user.uid);
    const mySnap = await myRef.get();
    if (mySnap.exists && mySnap.data().suspended === true) return fail(res, 403, "This CampusKit Community account is currently restricted.");

    if (req.method === "GET") {
      const action = clean(req.query?.action || "feed", 30);
      if (action === "feed") {
        const [postSnap, storySnap, blockedA, blockedB, followingSnap] = await Promise.all([
          posts.orderBy("createdAt", "desc").limit(120).get(),
          stories.where("expiresAt", ">", now).orderBy("expiresAt").limit(80).get(),
          blocks.where("blockerUid", "==", user.uid).limit(200).get(),
          blocks.where("blockedUid", "==", user.uid).limit(200).get(),
          follows.where("followerUid", "==", user.uid).limit(500).get()
        ]);
        const hidden = new Set([...blockedA.docs.map(d => d.data().blockedUid), ...blockedB.docs.map(d => d.data().blockerUid)]);
        const followed = new Set(followingSnap.docs.map(d => d.data().followingUid));
        const owners = [...new Set([...postSnap.docs, ...storySnap.docs].map(d => d.data().ownerUid).filter(Boolean))];
        const ownerProfiles = await Promise.all(owners.map(uid => profiles.doc(uid).get()));
        const privateOwners = new Set(ownerProfiles.filter(d => d.exists && d.data().isPrivate === true).map(d => d.id));
        const canSee = uid => !hidden.has(uid) && (!privateOwners.has(uid) || uid === user.uid || followed.has(uid));
        const shape = d => ({ id: d.id, ...d.data(), createdAt: dateValue(d.data().createdAt) });
        return res.status(200).json({
          posts: await Promise.all(postSnap.docs.filter(d => d.data().status === "active" && d.data().type !== "reel" && canSee(d.data().ownerUid)).slice(0, 60).map(async d => {
            const p = shape(d);
            const [like, comments] = await Promise.all([
              d.ref.collection("likes").doc(user.uid).get(),
              d.ref.collection("comments").orderBy("createdAt", "desc").limit(3).get()
            ]);
            p.likedByMe = like.exists;
            p.comments = comments.docs.map(x => ({ id: x.id, ...x.data(), createdAt: dateValue(x.data().createdAt) })).reverse();
            return p;
          })),
          stories: storySnap.docs.map(shape).filter(s => canSee(s.ownerUid)),
          reels: postSnap.docs.map(shape).filter(p => p.status === "active" && p.type === "reel" && canSee(p.ownerUid)).slice(0, 30)
        });
      }
      if (action === "profile") {
        const uid = clean(req.query?.uid || user.uid, 128);
        if (!uid) return fail(res, 400, "A profile ID is required.");
        const [profileSnap, postSnap, followerSnap, followingSnap, requestSnap] = await Promise.all([
          profiles.doc(uid).get(),
          posts.orderBy("createdAt", "desc").limit(120).get(),
          follows.where("followingUid", "==", uid).limit(500).get(),
          follows.where("followerUid", "==", uid).limit(500).get(),
          followRequests.doc(user.uid + "_" + uid).get()
        ]);
        if (!profileSnap.exists) return fail(res, 404, "Student profile not found.");
        const profile = publicProfile(uid, profileSnap.data());
        const isFollowing = followerSnap.docs.some(d => d.data().followerUid === user.uid);
        const isRequested = requestSnap.exists;
        if (profile.isPrivate && uid !== user.uid && !isFollowing) {
          return res.status(200).json({ profile, posts: [], locked: true, isFollowing, isRequested });
        }
        return res.status(200).json({
          profile, isFollowing, isRequested,
          followers: followerSnap.size, following: followingSnap.size,
          posts: postSnap.docs.filter(d => d.data().ownerUid === uid && d.data().status === "active" && d.data().type !== "reel").slice(0, 60).map(d => ({ id: d.id, ...d.data(), createdAt: dateValue(d.data().createdAt) }))
        });
      }
      if (action === "search") {
        const term = clean(req.query?.q, 50).toLowerCase();
        if (term.length < 2) return res.status(200).json({ profiles: [], posts: [] });
        const [profileSnap, postSnap, followingSnap] = await Promise.all([
          profiles.orderBy("updatedAt", "desc").limit(200).get(),
          posts.orderBy("createdAt", "desc").limit(120).get(),
          follows.where("followerUid", "==", user.uid).limit(500).get()
        ]);
        const profileResults = profileSnap.docs.map(d => publicProfile(d.id, d.data()))
          .filter(p => !p.suspended && (p.displayName.toLowerCase().includes(term) || p.username.toLowerCase().includes(term))).slice(0, 30);
        const followed = new Set(followingSnap.docs.map(d => d.data().followingUid));
        const postResults = postSnap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: dateValue(d.data().createdAt) }))
          .filter(p => {
            if (p.status !== "active") return false;
            const owner = profileSnap.docs.find(d => d.id === p.ownerUid);
            const privateBlocked = owner?.data()?.isPrivate === true && p.ownerUid !== user.uid && !followed.has(p.ownerUid);
            return !privateBlocked && String(p.caption || "").toLowerCase().includes(term);
          }).slice(0, 30);
        return res.status(200).json({ profiles: profileResults, posts: postResults });
      }
      if (action === "comments") {
        const postId = clean(req.query?.postId, 160);
        if (!idSafe(postId)) return fail(res, 400, "Invalid post.");
        const postSnap = await posts.doc(postId).get();
        if (!postSnap.exists) return fail(res, 404, "Post not found.");
        const ownerProfile = await profiles.doc(postSnap.data().ownerUid).get();
      if (ownerProfile.exists && ownerProfile.data().isPrivate === true && postSnap.data().ownerUid !== user.uid) {
        const relation = await follows.doc(user.uid + "_" + postSnap.data().ownerUid).get();
        if (!relation.exists) return fail(res, 403, "Follow this private account to view this content.");
      }
        const snap = await posts.doc(postId).collection("comments").orderBy("createdAt", "desc").limit(50).get();
        return res.status(200).json({ comments: snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: dateValue(d.data().createdAt) })).reverse() });
      }
      if (action === "messages") {
        const otherUid = clean(req.query?.with, 128);
        if (!otherUid || otherUid === user.uid) return fail(res, 400, "Choose another student to message.");
        const pair = [user.uid, otherUid].sort();
        const conversationId = pair.join("_");
        const conversation = db.collection("socialConversations").doc(conversationId);
        const [conversationSnap, peerSnap, blockedByPeer, blockedByMe] = await Promise.all([
          conversation.get(), profiles.doc(otherUid).get(),
          blocks.doc(otherUid + "_" + user.uid).get(), blocks.doc(user.uid + "_" + otherUid).get()
        ]);
        if (!peerSnap.exists || peerSnap.data().suspended) return fail(res, 404, "Student not found.");
        if (blockedByPeer.exists || blockedByMe.exists) return fail(res, 403, "Messaging is unavailable for this connection.");
        if (conversationSnap.exists && !(conversationSnap.data().memberUids || []).includes(user.uid)) return fail(res, 403, "You cannot access this conversation.");
        const snap = conversationSnap.exists ? await conversation.collection("messages").orderBy("createdAt", "desc").limit(100).get() : { docs: [] };
        const peer = publicProfile(otherUid, peerSnap.data());
        return res.status(200).json({ conversationId, peer, messages: snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: dateValue(d.data().createdAt) })).reverse() });
      }
      if (action === "inbox") {
        const snap = await db.collection("socialConversations").where("memberUids", "array-contains", user.uid).limit(100).get();
        const conversations = await Promise.all(snap.docs.map(async d => {
          const data = d.data(), otherUid = (data.memberUids || []).find(uid => uid !== user.uid) || "";
          const peerSnap = otherUid ? await profiles.doc(otherUid).get() : null;
          const peer = peerSnap?.exists ? publicProfile(otherUid, peerSnap.data()) : {};
          return { id: d.id, ...data, otherUid, otherName: peer.displayName || "CampusKit student", otherPhoto: peer.photoURL || "", updatedAt: dateValue(data.updatedAt) };
        }));
        conversations.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
        return res.status(200).json({ conversations: conversations.slice(0, 50) });
      }
      if (action === "notifications") {
        const snap = await notifications(user.uid).orderBy("createdAt", "desc").limit(60).get();
        return res.status(200).json({ notifications: snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: dateValue(d.data().createdAt) })) });
      }
      if (action === "communities") {
        const snap = await db.collection("socialCommunities").orderBy("createdAt", "desc").limit(100).get();
        const active = snap.docs.filter(d => d.data().status === "active").slice(0, 50);
        const communities = await Promise.all(active.map(async d => {
          const member = await d.ref.collection("members").doc(user.uid).get();
          return { id: d.id, ...d.data(), joined: member.exists };
        }));
        return res.status(200).json({ communities });
      }
      if (action === "community-chat") {
        const communityId = clean(req.query?.communityId, 160);
        if (!idSafe(communityId)) return fail(res, 400, "Choose a valid community.");
        const communityRef = db.collection("socialCommunities").doc(communityId);
        const [communitySnap, memberSnap] = await Promise.all([
          communityRef.get(), communityRef.collection("members").doc(user.uid).get()
        ]);
        if (!communitySnap.exists || communitySnap.data().status !== "active") return fail(res, 404, "Community not found.");
        if (!memberSnap.exists) return fail(res, 403, "Join this community to enter its chat.");
        const snap = await communityRef.collection("messages").orderBy("createdAt", "desc").limit(100).get();
        const messages = snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: dateValue(d.data().createdAt) })).reverse();
        return res.status(200).json({ community: { id: communitySnap.id, ...communitySnap.data() }, messages });
      }
      return fail(res, 400, "Unknown Community request.");
    }

    if (req.method === "DELETE") {
      const id = clean(req.query?.id, 160);
      const type = clean(req.query?.type, 20);
      if (!idSafe(id)) return fail(res, 400, "Invalid item ID.");
      if (type === "post" || type === "story") {
        const collection = type === "post" ? posts : stories;
        const ref = collection.doc(id);
        const snap = await ref.get();
        if (!snap.exists) return fail(res, 404, "Item not found.");
        if (snap.data().ownerUid !== user.uid) return fail(res, 403, "You can delete only your own content.");
        await ref.delete();
        return res.status(200).json({ ok: true });
      }
      return fail(res, 400, "Unsupported delete request.");
    }

    const action = clean(req.body?.action, 30);
    if (action === "community-create") {
      const name = clean(req.body?.name, 70);
      const description = clean(req.body?.description, 300);
      if (name.length < 3) return fail(res, 400, "Community name must be at least 3 characters.");
      const profile = mySnap.exists ? mySnap.data() : {};
      const ref = db.collection("socialCommunities").doc();
      await ref.set({
        name, description, status: "active", createdBy: user.uid,
        createdByName: profile.displayName || user.name || "CampusKit Student",
        memberCount: 1, createdAt: FieldValue.serverTimestamp()
      });
      await ref.collection("members").doc(user.uid).set({
        uid: user.uid, role: "owner", displayName: profile.displayName || user.name || "CampusKit Student",
        photoURL: profile.photoURL || user.picture || "", joinedAt: FieldValue.serverTimestamp()
      });
      return res.status(201).json({ ok: true, communityId: ref.id });
    }

    if (action === "community-join" || action === "community-leave") {
      const communityId = clean(req.body?.communityId, 160);
      if (!idSafe(communityId)) return fail(res, 400, "Choose a valid community.");
      const ref = db.collection("socialCommunities").doc(communityId);
      const memberRef = ref.collection("members").doc(user.uid);
      const profile = mySnap.exists ? mySnap.data() : {};
      const communitySnap = await ref.get();
      if (!communitySnap.exists || communitySnap.data().status !== "active") return fail(res, 404, "Community not found.");
      if (action === "community-join") {
        await db.runTransaction(async tx => {
          const member = await tx.get(memberRef);
          if (!member.exists) {
            tx.create(memberRef, {
              uid: user.uid, role: "member", displayName: profile.displayName || user.name || "CampusKit Student",
              photoURL: profile.photoURL || user.picture || "", joinedAt: FieldValue.serverTimestamp()
            });
            tx.update(ref, { memberCount: FieldValue.increment(1) });
          }
        });
        return res.status(200).json({ ok: true, joined: true });
      }
      await db.runTransaction(async tx => {
        const member = await tx.get(memberRef);
        if (member.exists) {
          tx.delete(memberRef);
          tx.update(ref, { memberCount: FieldValue.increment(-1) });
        }
      });
      return res.status(200).json({ ok: true, joined: false });
    }

    if (action === "community-message") {
      const communityId = clean(req.body?.communityId, 160);
      const text = clean(req.body?.text, 1200);
      if (!idSafe(communityId) || !text) return fail(res, 400, "Write a message first.");
      const ref = db.collection("socialCommunities").doc(communityId);
      const [communitySnap, memberSnap] = await Promise.all([
        ref.get(), ref.collection("members").doc(user.uid).get()
      ]);
      if (!communitySnap.exists || communitySnap.data().status !== "active") return fail(res, 404, "Community not found.");
      if (!memberSnap.exists) return fail(res, 403, "Join this community before sending messages.");
      const profile = mySnap.exists ? mySnap.data() : {};
      const message = await ref.collection("messages").add({
        uid: user.uid, author: profile.displayName || user.name || "CampusKit Student",
        photoURL: profile.photoURL || user.picture || "", text,
        createdAt: FieldValue.serverTimestamp()
      });
      await ref.set({ lastMessage: text.slice(0, 120), lastMessageAt: FieldValue.serverTimestamp() }, { merge: true });
      return res.status(201).json({ ok: true, id: message.id });
    }

    if (action === "profile") {
      const displayName = clean(req.body?.displayName, 60) || clean(user.name || user.email?.split("@")[0], 60) || "CampusKit Student";
      const username = clean(req.body?.username, 24).toLowerCase().replace(/[^a-z0-9._]/g, "");
      if (username.length < 3) return fail(res, 400, "Username must be at least 3 characters.");
      const existing = await profiles.where("username", "==", username).limit(2).get();
      if (existing.docs.some(d => d.id !== user.uid)) return fail(res, 409, "That username is already taken.");
      const profile = {
        displayName, username, email: user.email || null,
        photoURL: clean(req.body?.photoURL, 1500), bio: clean(req.body?.bio, 180),
        isPrivate: req.body?.isPrivate === true, updatedAt: FieldValue.serverTimestamp()
      };
      await myRef.set(profile, { merge: true });
      return res.status(200).json({ ok: true, profile: publicProfile(user.uid, { ...mySnap.data(), ...profile }) });
    }

    if (action === "upload") {
      const mimeType = clean(req.body?.mimeType, 80);
      const base64 = String(req.body?.data || "");
      if (!ALLOWED_MEDIA.has(mimeType)) return fail(res, 415, "Use JPG, PNG, WebP or MP4 media.");
      const buffer = Buffer.from(base64.replace(/^data:[^,]+,/, ""), "base64");
      if (!buffer.length || buffer.length > MAX_MEDIA_BYTES) return fail(res, 413, "Media must be smaller than 3 MB.");
      const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4" })[mimeType];
      const objectPath = "campuskit-social/" + user.uid + "/" + crypto.randomUUID() + "." + extension;
      const downloadToken = crypto.randomUUID();
      const file = getStorage().bucket(BUCKET).file(objectPath);
      await file.save(buffer, { resumable: false, metadata: { contentType: mimeType, metadata: { firebaseStorageDownloadTokens: downloadToken, ownerUid: user.uid } } });
      const url = "https://firebasestorage.googleapis.com/v0/b/" + BUCKET + "/o/" + encodeURIComponent(objectPath) + "?alt=media&token=" + downloadToken;
      return res.status(201).json({ ok: true, url, path: objectPath, mimeType });
    }

    if (action === "publish") {
      const type = ["post", "story", "reel"].includes(req.body?.type) ? req.body.type : "post";
      const caption = clean(req.body?.caption, 2200);
      const mediaUrl = clean(req.body?.mediaUrl, 1800);
      if (!caption && !mediaUrl) return fail(res, 400, "Add a caption or media first.");
      if (mediaUrl && !mediaUrl.startsWith("https://firebasestorage.googleapis.com/")) return fail(res, 400, "Media URL is not a valid CampusKit upload.");
      const profile = mySnap.exists ? mySnap.data() : {};
      const record = {
        ownerUid: user.uid, author: profile.displayName || user.name || user.email || "CampusKit Student",
        username: profile.username || "", photo: profile.photoURL || user.picture || "",
        caption, mediaUrl, mediaType: clean(req.body?.mediaType, 20) || "",
        type, status: "active", likesCount: 0, commentsCount: 0,
        createdAt: FieldValue.serverTimestamp()
      };
      const collection = type === "story" ? stories : posts;
      const ref = await collection.add(type === "story" ? { ...record, expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000) } : record);
      if (type === "post" || type === "reel") await myRef.set({ postsCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return res.status(201).json({ ok: true, id: ref.id, item: { id: ref.id, ...record, createdAt: new Date().toISOString() } });
    }

    if (action === "like") {
      const postId = clean(req.body?.postId, 160);
      if (!idSafe(postId)) return fail(res, 400, "Invalid post.");
      const postRef = posts.doc(postId), likeRef = postRef.collection("likes").doc(user.uid);
      const postSnap = await postRef.get();
      if (!postSnap.exists) return fail(res, 404, "Post not found.");
      const ownerProfile = await profiles.doc(postSnap.data().ownerUid).get();
      if (ownerProfile.exists && ownerProfile.data().isPrivate === true && postSnap.data().ownerUid !== user.uid) {
        const relation = await follows.doc(user.uid + "_" + postSnap.data().ownerUid).get();
        if (!relation.exists) return fail(res, 403, "Follow this private account to interact.");
      }
      const result = await db.runTransaction(async tx => {
        const likeSnap = await tx.get(likeRef);
        if (likeSnap.exists) { tx.delete(likeRef); tx.update(postRef, { likesCount: FieldValue.increment(-1) }); return false; }
        tx.create(likeRef, { uid: user.uid, createdAt: FieldValue.serverTimestamp() });
        tx.update(postRef, { likesCount: FieldValue.increment(1) });
        return true;
      });
      if (result && postSnap.data().ownerUid !== user.uid) await notifications(postSnap.data().ownerUid).add({ type: "like", fromUid: user.uid, fromName: user.name || user.email || "A student", postId, read: false, createdAt: FieldValue.serverTimestamp() });
      return res.status(200).json({ ok: true, liked: result });
    }

    if (action === "comment") {
      const postId = clean(req.body?.postId, 160), text = clean(req.body?.text, 500);
      if (!idSafe(postId) || !text) return fail(res, 400, "Write a comment first.");
      const ref = posts.doc(postId), snap = await ref.get();
      if (!snap.exists) return fail(res, 404, "Post not found.");
      const ownerProfile = await profiles.doc(snap.data().ownerUid).get();
      if (ownerProfile.exists && ownerProfile.data().isPrivate === true && snap.data().ownerUid !== user.uid) {
        const relation = await follows.doc(user.uid + "_" + snap.data().ownerUid).get();
        if (!relation.exists) return fail(res, 403, "Follow this private account to interact.");
      }
      const profile = mySnap.exists ? mySnap.data() : {};
      const comment = { uid: user.uid, author: profile.displayName || user.name || "Student", text, createdAt: FieldValue.serverTimestamp() };
      const commentRef = await ref.collection("comments").add(comment);
      await ref.update({ commentsCount: FieldValue.increment(1) });
      if (snap.data().ownerUid !== user.uid) await notifications(snap.data().ownerUid).add({ type: "comment", fromUid: user.uid, fromName: comment.author, postId, text: text.slice(0, 120), read: false, createdAt: FieldValue.serverTimestamp() });
      return res.status(201).json({ ok: true, id: commentRef.id });
    }

    if (action === "follow") {
      const targetUid = clean(req.body?.targetUid, 128);
      if (!targetUid || targetUid === user.uid) return fail(res, 400, "Choose another student.");
      const targetRef = profiles.doc(targetUid), targetSnap = await targetRef.get();
      if (!targetSnap.exists || targetSnap.data().suspended) return fail(res, 404, "Student not found.");
      const followRef = follows.doc(user.uid + "_" + targetUid);
      if (targetSnap.data().isPrivate === true) {
        const requestRef = followRequests.doc(user.uid + "_" + targetUid);
        const pending = await requestRef.get();
        if (pending.exists) { await requestRef.delete(); return res.status(200).json({ ok: true, requested: false, following: false }); }
        await requestRef.create({ followerUid: user.uid, followingUid: targetUid, createdAt: FieldValue.serverTimestamp() });
        await notifications(targetUid).add({ type: "follow_request", fromUid: user.uid, fromName: user.name || user.email || "A student", read: false, createdAt: FieldValue.serverTimestamp() });
        return res.status(200).json({ ok: true, requested: true, following: false });
      }
      const result = await db.runTransaction(async tx => {
        const snap = await tx.get(followRef);
        if (snap.exists) {
          tx.delete(followRef);
          tx.set(myRef, { followingCount: FieldValue.increment(-1) }, { merge: true });
          tx.set(targetRef, { followersCount: FieldValue.increment(-1) }, { merge: true });
          return false;
        }
        tx.create(followRef, { followerUid: user.uid, followingUid: targetUid, createdAt: FieldValue.serverTimestamp() });
        tx.set(myRef, { followingCount: FieldValue.increment(1) }, { merge: true });
        tx.set(targetRef, { followersCount: FieldValue.increment(1) }, { merge: true });
        return true;
      });
      if (result) await notifications(targetUid).add({ type: "follow", fromUid: user.uid, fromName: user.name || user.email || "A student", read: false, createdAt: FieldValue.serverTimestamp() });
      return res.status(200).json({ ok: true, following: result });
    }

    if (action === "follow-request") {
      const fromUid = clean(req.body?.fromUid, 128);
      const accept = req.body?.accept === true;
      const requestRef = followRequests.doc(fromUid + "_" + user.uid);
      const requestSnap = await requestRef.get();
      if (!requestSnap.exists) return fail(res, 404, "Follow request not found.");
      if (accept) {
        const followRef = follows.doc(fromUid + "_" + user.uid);
        await db.runTransaction(async tx => {
          const [pending, existing] = await Promise.all([tx.get(requestRef), tx.get(followRef)]);
          if (!pending.exists) throw new Error("Follow request is no longer available.");
          if (!existing.exists) {
            tx.create(followRef, { followerUid: fromUid, followingUid: user.uid, createdAt: FieldValue.serverTimestamp() });
            tx.set(profiles.doc(fromUid), { followingCount: FieldValue.increment(1) }, { merge: true });
            tx.set(myRef, { followersCount: FieldValue.increment(1) }, { merge: true });
          }
          tx.delete(requestRef);
        });
        await notifications(fromUid).add({ type: "follow_accepted", fromUid: user.uid, fromName: user.name || user.email || "A student", read: false, createdAt: FieldValue.serverTimestamp() });
      } else await requestRef.delete();
      return res.status(200).json({ ok: true, accepted: accept });
    }

    if (action === "message") {
      const toUid = clean(req.body?.toUid, 128), text = clean(req.body?.text, 2000);
      if (!toUid || toUid === user.uid || !text) return fail(res, 400, "Choose a student and write a message.");
      const target = await profiles.doc(toUid).get();
      if (!target.exists || target.data().suspended) return fail(res, 404, "Student not found.");
      const pair = [user.uid, toUid].sort(), conversationId = pair.join("_");
      const conversation = db.collection("socialConversations").doc(conversationId);
      const [blockedByRecipient, blockedBySender] = await Promise.all([
        blocks.doc(toUid + "_" + user.uid).get(),
        blocks.doc(user.uid + "_" + toUid).get()
      ]);
      if (blockedByRecipient.exists || blockedBySender.exists) return fail(res, 403, "Messaging is unavailable for this connection.");
      await conversation.set({ memberUids: pair, updatedAt: FieldValue.serverTimestamp(), lastMessage: text.slice(0, 120), lastSenderUid: user.uid }, { merge: true });
      const message = await conversation.collection("messages").add({ fromUid: user.uid, toUid, text, createdAt: FieldValue.serverTimestamp(), read: false });
      await notifications(toUid).add({ type: "message", fromUid: user.uid, fromName: user.name || user.email || "A student", messageId: message.id, read: false, createdAt: FieldValue.serverTimestamp() });
      return res.status(201).json({ ok: true, conversationId, id: message.id });
    }

    if (action === "report") {
      const targetId = clean(req.body?.targetId, 160), targetType = clean(req.body?.targetType, 20), reason = clean(req.body?.reason, 300);
      if (!idSafe(targetId) || !["post", "profile", "message"].includes(targetType) || !reason) return fail(res, 400, "Select a report reason.");
      await reports.add({ reporterUid: user.uid, targetId, targetType, reason, status: "open", createdAt: FieldValue.serverTimestamp() });
      return res.status(201).json({ ok: true });
    }

    if (action === "block") {
      const targetUid = clean(req.body?.targetUid, 128);
      if (!targetUid || targetUid === user.uid) return fail(res, 400, "Choose another student.");
      const ref = blocks.doc(user.uid + "_" + targetUid);
      await ref.set({ blockerUid: user.uid, blockedUid: targetUid, createdAt: FieldValue.serverTimestamp() });
      return res.status(200).json({ ok: true });
    }

    if (action === "read-notifications") {
      const snap = await notifications(user.uid).where("read", "==", false).limit(100).get();
      const batch = db.batch();
      snap.docs.forEach(d => batch.update(d.ref, { read: true }));
      await batch.commit();
      return res.status(200).json({ ok: true, updated: snap.size });
    }

    return fail(res, 400, "Unknown Community action.");
  } catch (error) {
    console.error("CampusKit Community API:", error);
    return fail(res, 500, "CampusKit Community could not complete this request. Please try again.");
  }
};
