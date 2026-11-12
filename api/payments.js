const crypto = require("crypto");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const PRICES = {
  "ai-premium": 59,
  "debate-tracker": 15,
  "lab-mistake-detection": 20,
  "opponent-teacher": 10,
  "doubt-dna": 30,
  "reverse-learning": 5,
  "class12-projectile-motion": 20,
  "class12-wave-interference": 40,
  "class12-electromagnetic-field": 40,
  "class12-gravitational-orbits": 40,
  "class12-doppler-effect": 20,
  "class12-refraction-reflection": 20,
  "class12-spring-mass-system": 20,
  "class12-double-slit-experiment": 40,
  "class12-chemical-bonding": 20,
  "class12-electrolysis": 40,
  "class12-gas-law": 20,
  "class12-acid-base-reaction": 20,
  "class12-crystal-lattice-structure": 40,
  "class12-molecular-diffusion": 20,
  "class12-exothermic-endothermic": 20,
  "class12-periodic-table-trends": 20,
  "class12-dna-replication": 40,
  "class12-protein-synthesis": 40,
  "class12-photosynthesis": 20,
  "class12-cellular-respiration": 20,
  "class12-mitosis-meiosis": 40,
  "class12-natural-selection": 20,
  "class12-neuron-synapse": 40,
  "class12-ecosystem-food-web": 20,
  "class12-immune-system-response": 40,
  "class12-serial-transform-visualizer": 40,
  "class12-fibonacci-golden-spiral": 20,
  "class12-3d-geometry-explorer": 40,
  "class12-calculus-visualizer": 40,
  "class12-mandelbrot-fractal": 40,
  "class12-probability-distributions": 20,
  "class12-linear-algebra-visualizer": 40,
  "class12-complex-number-plane": 20,
  "class12-topology-surfaces": 40,
  "class12-human-skull-craniometry": 40,
  "class12-human-skeletal-system": 20,
  "class12-human-evolution": 20
};

function initFirebase() {
  if (!getApps().length) {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) throw new Error("Firebase service account is not configured.");
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!["GET", "POST", "PATCH", "DELETE"].includes(req.method)) return res.status(405).json({ error: "Method not allowed." });

  try {
    initFirebase();
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) { if(req.method==="GET" && req.query?.resource==="notes") { initFirebase(); const db=getFirestore(); const snap=await db.collection("webLibraryNotes").where("status","==","published").limit(300).get(); const notes=snap.docs.map(d=>({id:d.id,title:d.data().title,subject:d.data().subject,kind:d.data().kind,url:d.data().url,createdAt:d.data().createdAt?.toDate?.().toISOString()||d.data().createdAt||null})); notes.sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""))); return res.status(200).json({notes}); } return res.status(401).json({ error: "Sign in first." }); }
    const user = await getAuth().verifyIdToken(token);
    const db = getFirestore();
    const requests = db.collection("paymentRequests");

    if (req.method === "POST" && !["social", "music"].includes(String(req.query?.resource || ""))) {
      const featureId = String(req.body?.featureId || "");
      const utr = String(req.body?.utr || "").trim().toUpperCase();
      if (!Object.prototype.hasOwnProperty.call(PRICES, featureId)) return res.status(400).json({ error: "Unknown paid feature." });
      if (!/^[A-Z0-9]{8,24}$/.test(utr)) return res.status(400).json({ error: "Enter a valid 8–24 character UPI transaction reference (UTR)." });
      const id = crypto.createHash("sha256").update(user.uid + ":" + utr).digest("hex");
      const ref = requests.doc(id);
      const duplicate = await requests.where("utr", "==", utr).limit(1).get();
      if (!duplicate.empty) return res.status(409).json({ error: "This UTR has already been submitted. Contact support if this is a mistake." });
      await ref.create({
        uid: user.uid, email: user.email || null, featureId, amount: PRICES[featureId],
        utr, status: "pending", createdAt: FieldValue.serverTimestamp()
      });
      return res.status(201).json({ ok: true, requestId: id, status: "pending", amount: PRICES[featureId], message: "Request submitted. Access unlocks only after the admin verifies the payment." });
    }

    if (req.method === "GET" && req.query?.mine === "1") {
      const snapshot = await requests.where("uid", "==", user.uid).limit(100).get();
      const mine = snapshot.docs.map(doc => {
        const item = doc.data();
        return {
          id: doc.id,
          featureId: item.featureId,
          amount: item.amount,
          utr: item.utr,
          status: item.status,
          createdAt: item.createdAt?.toDate?.().toISOString() || null,
          reviewedAt: item.reviewedAt?.toDate?.().toISOString() || null
        };
      });
      mine.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      return res.status(200).json({ requests: mine });
    }

    if (req.method === "GET" && typeof req.query?.check === "string") {
      const featureId = req.query.check;
      if (!Object.prototype.hasOwnProperty.call(PRICES, featureId)) return res.status(400).json({ error: "Unknown feature." });
      const entitlement = await db.collection("users").doc(user.uid).collection("entitlements").doc(featureId).get();
      const data = entitlement.exists ? entitlement.data() : {};
      return res.status(200).json({ active: data.status === "active", featureId });
    }

    const resource = String(req.query?.resource || "");
    const managementAdminEmails = (process.env.CAMPUSKIT_ADMIN_EMAILS || process.env.CAMPUSKIT_ADMIN_EMAIL || "")
      .split(",").map(email => email.trim().toLowerCase()).filter(Boolean);
    const socialAdminEmails = (process.env.CAMPUSKIT_SOCIAL_ADMIN_EMAILS || "")
      .split(",").map(email => email.trim().toLowerCase()).filter(Boolean);
    const allowedAdminEmails = ["social", "music"].includes(resource) ? socialAdminEmails : managementAdminEmails;
    if (!allowedAdminEmails.includes((user.email || "").toLowerCase())) {
      return res.status(403).json({ error: "Admin access is not configured for this account." });
    }
    if (resource === "notes") {
      const notes = db.collection("webLibraryNotes");
      if (req.method === "POST") {
        const title=String(req.body?.title||"").trim().slice(0,150), subject=String(req.body?.subject||"").trim().slice(0,80), kind=String(req.body?.kind||""), rawUrl=String(req.body?.url||"").trim();
        let parsed; try{parsed=new URL(rawUrl);}catch(_){parsed=null;}
        if(!title||!subject||!["pdf","image"].includes(kind)||!parsed||parsed.protocol!=="https:"||!["drive.google.com","docs.google.com"].includes(parsed.hostname)) return res.status(400).json({error:"Enter a title, subject, PDF/image type and a valid Google Drive HTTPS share link."});
        const ref=await notes.add({title,subject,kind,url:parsed.toString(),status:"published",createdAt:FieldValue.serverTimestamp(),createdBy:user.uid,createdByEmail:user.email||null});
        return res.status(201).json({ok:true,id:ref.id});
      }
      if (req.method === "DELETE") { const id=String(req.query?.id||""); if(!/^[A-Za-z0-9_-]{8,128}$/.test(id)) return res.status(400).json({error:"Invalid note ID."}); await notes.doc(id).delete(); return res.status(200).json({ok:true,id}); }
      return res.status(405).json({error:"Method not allowed for notes."});
    }
    if (resource === "users") {
      if (req.method === "GET") {
        const result = await getAuth().listUsers(200);
        const users = await Promise.all(result.users.map(async account => {
          const entitlements = await db.collection("users").doc(account.uid).collection("entitlements").get();
          return {
            uid: account.uid, email: account.email || null, displayName: account.displayName || null,
            disabled: account.disabled, createdAt: account.metadata.creationTime || null,
            lastSignInAt: account.metadata.lastSignInTime || null,
            entitlements: entitlements.docs.map(d => ({ featureId: d.id, status: d.data().status || "unknown" }))
          };
        }));
        return res.status(200).json({ users, pageToken: result.pageToken || null });
      }
      if (req.method === "PATCH") {
        const uid = String(req.body?.uid || "");
        if (!uid || uid === user.uid) return res.status(400).json({ error: "A different user UID is required." });
        const target = await getAuth().getUser(uid);
        await getAuth().updateUser(uid, { disabled: req.body?.disabled === true });
        return res.status(200).json({ ok: true, uid, disabled: req.body?.disabled === true, email: target.email || null });
      }
      return res.status(405).json({ error: "Method not allowed for users." });
    }

    if (resource === "music") {
      const music = db.collection("publicMusic");
      if (req.method === "GET") {
        const snapshot = await music.orderBy("createdAt", "desc").limit(300).get();
        return res.status(200).json({ tracks: snapshot.docs.map(d => ({ id: d.id, ...d.data() })) });
      }
      if (req.method === "POST") {
        const title = String(req.body?.title || "").trim().slice(0, 120);
        const rawUrl = String(req.body?.url || "").trim();
        let parsed;
        try { parsed = new URL(rawUrl); } catch (_) { parsed = null; }
        if (!title || !parsed || parsed.protocol !== "https:" || !["youtube.com", "www.youtube.com", "youtu.be", "open.spotify.com"].includes(parsed.hostname)) {
          return res.status(400).json({ error: "Enter a title and a supported HTTPS YouTube or Spotify link." });
        }
        const type = parsed.hostname.includes("spotify") ? "spotify" : "youtube";
        const ref = await music.add({ title, url: parsed.toString(), type, addedBy: user.email || "CampusKit admin", createdAt: new Date().toISOString() });
        return res.status(201).json({ ok: true, id: ref.id });
      }
      if (req.method === "DELETE") {
        const id = String(req.query?.id || "");
        if (!/^[A-Za-z0-9_-]{8,128}$/.test(id)) return res.status(400).json({ error: "Invalid music track ID." });
        await music.doc(id).delete();
        return res.status(200).json({ ok: true, id });
      }
      return res.status(405).json({ error: "Method not allowed for music." });
    }

    if (resource === "social") {
      const profiles = db.collection("socialProfiles");
      const reports = db.collection("socialReports");
      const communities = db.collection("socialCommunities");
      const posts = db.collection("socialPosts");

      if (req.method === "GET") {
        const view = String(req.query?.view || "summary");
        if (view === "summary") {
          const [profileCount, reportCount, communityCount, postCount, openReports] = await Promise.all([
            profiles.count().get(), reports.count().get(), communities.count().get(), posts.count().get(),
            reports.where("status", "==", "open").limit(100).get()
          ]);
          return res.status(200).json({
            summary: {
              profiles: profileCount.data().count,
              openReports: reportCount.data().count ? openReports.size : 0,
              communities: communityCount.data().count,
              posts: postCount.data().count
            },
            reports: openReports.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.().toISOString() || d.data().createdAt || null }))
          });
        }
        if (view === "reports") {
          const snap = await reports.orderBy("createdAt", "desc").limit(200).get();
          return res.status(200).json({ reports: snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.().toISOString() || d.data().createdAt || null })) });
        }
        if (view === "posts") {
          const snap = await posts.orderBy("createdAt", "desc").limit(200).get();
          return res.status(200).json({ posts: snap.docs.map(d => {
            const item = d.data();
            return {
              id: d.id, ownerUid: item.ownerUid || null,
              ownerName: item.ownerName || item.displayName || "CampusKit student",
              type: item.type || "post", caption: item.caption || "",
              mediaUrl: item.mediaUrl || item.fileUrl || "",
              status: item.status || "active",
              createdAt: item.createdAt?.toDate?.().toISOString() || item.createdAt || null
            };
          }) });
        }
        if (view === "profiles") {
          const snap = await profiles.orderBy("updatedAt", "desc").limit(200).get();
          return res.status(200).json({ profiles: snap.docs.map(d => ({ uid: d.id, ...d.data(), updatedAt: d.data().updatedAt?.toDate?.().toISOString() || d.data().updatedAt || null })) });
        }
        if (view === "communities") {
          const snap = await communities.orderBy("createdAt", "desc").limit(200).get();
          return res.status(200).json({ communities: snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.().toISOString() || d.data().createdAt || null })) });
        }
        return res.status(400).json({ error: "Unknown social management view." });
      }

      if (req.method === "PATCH") {
        const type = String(req.body?.type || "");
        const id = String(req.body?.id || "");
        const action = String(req.body?.action || "");
        if (!id || id.length > 180) return res.status(400).json({ error: "A valid record ID is required." });
        if (type === "report" && ["resolve", "dismiss"].includes(action)) {
          await reports.doc(id).set({ status: action === "resolve" ? "resolved" : "dismissed", reviewedAt: FieldValue.serverTimestamp(), reviewedBy: user.uid }, { merge: true });
          return res.status(200).json({ ok: true, id, status: action === "resolve" ? "resolved" : "dismissed" });
        }
        if (type === "profile" && ["suspend", "restore"].includes(action)) {
          await profiles.doc(id).set({ suspended: action === "suspend", updatedAt: FieldValue.serverTimestamp(), moderatedBy: user.uid }, { merge: true });
          return res.status(200).json({ ok: true, id, suspended: action === "suspend" });
        }
        if (type === "community" && ["disable", "enable"].includes(action)) {
          await communities.doc(id).set({ status: action === "disable" ? "disabled" : "active", moderatedAt: FieldValue.serverTimestamp(), moderatedBy: user.uid }, { merge: true });
          return res.status(200).json({ ok: true, id, status: action === "disable" ? "disabled" : "active" });
        }
        if (type === "post" && ["hide", "restore"].includes(action)) {
          await posts.doc(id).set({
            status: action === "hide" ? "removed" : "active",
            moderatedAt: FieldValue.serverTimestamp(), moderatedBy: user.uid
          }, { merge: true });
          return res.status(200).json({ ok: true, id, status: action === "hide" ? "removed" : "active" });
        }
        return res.status(400).json({ error: "Unsupported social moderation action." });
      }
      return res.status(405).json({ error: "Method not allowed for social management." });
    }

    if (req.method === "GET") {
      const requestedStatus = String(req.query?.status || "pending").toLowerCase();
      if (!["pending", "approved", "rejected", "all"].includes(requestedStatus)) {
        return res.status(400).json({ error: "Invalid payment status filter." });
      }
      const snapshot = requestedStatus === "all"
        ? await requests.limit(300).get()
        : await requests.where("status", "==", requestedStatus).limit(300).get();
      const items = snapshot.docs.map(doc => {
        const item = doc.data();
        return {
          id: doc.id,
          uid: item.uid || null,
          email: item.email || null,
          featureId: item.featureId || null,
          amount: item.amount || 0,
          utr: item.utr || null,
          status: item.status || "pending",
          createdAt: item.createdAt?.toDate?.().toISOString() || null,
          reviewedAt: item.reviewedAt?.toDate?.().toISOString() || null
        };
      });
      items.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      return res.status(200).json({ requests: items });
    }

    const requestId = String(req.body?.requestId || "");
    const decision = String(req.body?.decision || "");
    if (!/^[a-f0-9]{64}$/.test(requestId) || !["approve", "reject"].includes(decision)) return res.status(400).json({ error: "Invalid review request." });
    const requestRef = requests.doc(requestId);
    await db.runTransaction(async transaction => {
      const snap = await transaction.get(requestRef);
      if (!snap.exists || snap.data().status !== "pending") throw new Error("This payment request is no longer pending.");
      const payment = snap.data();
      transaction.update(requestRef, {
        status: decision === "approve" ? "approved" : "rejected",
        reviewedAt: FieldValue.serverTimestamp(), reviewedBy: user.uid
      });
      if (decision === "approve") {
        const entitlementRef = db.collection("users").doc(payment.uid).collection("entitlements").doc(payment.featureId);
        transaction.set(entitlementRef, {
          status: "active", featureId: payment.featureId, amount: payment.amount,
          paymentRequestId: requestId, approvedAt: FieldValue.serverTimestamp(), approvedBy: user.uid
        }, { merge: true });
      }
    });
    return res.status(200).json({ ok: true, status: decision === "approve" ? "approved" : "rejected" });
  } catch (error) {
    console.error("CampusKit payment API:", error);
    return res.status(500).json({ error: error.message || "Payment request could not be processed." });
  }
};
