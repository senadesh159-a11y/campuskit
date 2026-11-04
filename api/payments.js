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
  "reverse-learning": 5
};

function initFirebase() {
  if (!getApps().length) {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) throw new Error("Firebase service account is not configured.");
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!["GET", "POST", "PATCH"].includes(req.method)) return res.status(405).json({ error: "Method not allowed." });

  try {
    initFirebase();
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return res.status(401).json({ error: "Sign in first." });
    const user = await getAuth().verifyIdToken(token);
    const db = getFirestore();
    const requests = db.collection("paymentRequests");

    if (req.method === "POST") {
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

    if (req.method === "GET" && typeof req.query?.check === "string") {
      const featureId = req.query.check;
      if (!Object.prototype.hasOwnProperty.call(PRICES, featureId)) return res.status(400).json({ error: "Unknown feature." });
      const entitlement = await db.collection("users").doc(user.uid).collection("entitlements").doc(featureId).get();
      const data = entitlement.exists ? entitlement.data() : {};
      return res.status(200).json({ active: data.status === "active", featureId });
    }

    if (!process.env.CAMPUSKIT_ADMIN_EMAIL || (user.email || "").toLowerCase() !== process.env.CAMPUSKIT_ADMIN_EMAIL.toLowerCase()) {
      return res.status(403).json({ error: "Admin access is not configured for this account." });
    }

    if (req.method === "GET") {
      const snapshot = await requests.where("status", "==", "pending").limit(100).get();
      const pending = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt?.toDate?.().toISOString() || null }));
      pending.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
      return res.status(200).json({ requests: pending });
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
