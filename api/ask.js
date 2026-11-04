
const { GoogleGenerativeAI } = require("@google/generative-ai");

const {
  initializeApp,
  cert,
  getApps
} = require("firebase-admin/app");

const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Use POST to ask CampusKit AI."
    });
  }

  try {
    // Firebase initialization
    if (getApps().length === 0) {
      const serviceAccount = JSON.parse(
        process.env.FIREBASE_SERVICE_ACCOUNT
      );

      initializeApp({
        credential: cert(serviceAccount)
      });
    }

    // Verify Firebase user
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "";

    if (!token) {
      return res.status(401).json({
        error: "Please sign in first."
      });
    }

    const decoded = await getAuth().verifyIdToken(token);
    const db = getFirestore();

    // Validate question
    const question = req.body?.question;

    if (typeof question !== "string" || !question.trim() || question.length > 4000) {
      return res.status(400).json({
        error: "Please enter a question of up to 4,000 characters."
      });
    }

    // Optional image input from the AI Assistant camera/upload controls.
    // Accept only common raster formats and cap decoded bytes to 3 MB.
    const image = req.body?.image;
    let imagePart = null;
    if (image !== undefined && image !== null) {
      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
      if (!image || !allowedTypes.includes(image.mimeType) ||
          typeof image.data !== "string" ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)) {
        return res.status(400).json({ error: "Please attach a valid JPG, PNG or WebP image." });
      }
      const estimatedBytes = Math.floor(image.data.length * 3 / 4) -
        (image.data.endsWith("==") ? 2 : image.data.endsWith("=") ? 1 : 0);
      if (estimatedBytes <= 0 || estimatedBytes > 3 * 1024 * 1024) {
        return res.status(413).json({ error: "Image is too large. Please use an image under 3 MB." });
      }
      imagePart = { inlineData: { mimeType: image.mimeType, data: image.data } };
    }

    // Enforce the free daily quota on the server (cannot be bypassed by editing localStorage).
    // India-local calendar day; text and image questions both count as one request.
    const dayKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date());
    const usageRef = db.collection("users").doc(decoded.uid).collection("aiUsage").doc(dayKey);
    const premiumRef = db.collection("users").doc(decoded.uid).collection("entitlements").doc("ai-premium");
    const quotaState = await db.runTransaction(async transaction => {
      const [usageSnap, premiumSnap] = await Promise.all([
        transaction.get(usageRef), transaction.get(premiumRef)
      ]);
      const premium = premiumSnap.exists ? premiumSnap.data() : {};
      const expiry = premium.expiresAt && typeof premium.expiresAt.toDate === "function" ? premium.expiresAt.toDate() : null;
      const isPremium = premium.status === "active" && (!expiry || expiry.getTime() > Date.now());
      const used = Number(usageSnap.exists ? usageSnap.data().count || 0 : 0);
      if (!isPremium && used >= 15) return { allowed: false, used, remaining: 0, premium: false };
      const nextUsed = used + 1;
      transaction.set(usageRef, { count: nextUsed, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return { allowed: true, used: nextUsed, remaining: isPremium ? null : Math.max(0, 15 - nextUsed), premium: isPremium };
    });
    if (!quotaState.allowed) {
      return res.status(429).json({
        error: "You have used all 15 free AI questions for today. Upgrade to AI Premium or wait until midnight (India time).",
        code: "DAILY_QUOTA_EXCEEDED", used: quotaState.used, limit: 15, resetTimeZone: "Asia/Kolkata"
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "Gemini API key is not configured."
      });
    }

    const genAI = new GoogleGenerativeAI(
      process.env.GEMINI_API_KEY
    );

    const prompt = `You are CampusKit AI, a helpful student assistant.
Answer clearly, accurately and simply.

Student question: ${question.trim()}`;

    // Primary and fallback models
    const models = [
      "gemini-3.8-flash",
      "gemini-3.5-flash-lite"
    ];

    let lastError;

    for (const modelName of models) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          quota: { used: quotaState.used, remaining: quotaState.remaining, premium: quotaState.premium, limit: quotaState.premium ? null : 15, resetTimeZone: "Asia/Kolkata" }
        });

        const content = imagePart ? [{ text: prompt }, imagePart] : prompt;
        const result = await model.generateContent(content);

        return res.status(200).json({
          answer: result.response.text(),
          model: modelName
        });

      } catch (error) {
        lastError = error;

        console.error(
          `CampusKit model ${modelName} failed:`,
          error
        );

        const retryable = [
          429, 500, 502, 503, 504
        ].includes(error.status);

        if (!retryable) {
          break;
        }
      }
    }

    console.error("All Gemini models failed:", lastError);

    return res.status(503).json({
      error: "CampusKit AI is temporarily busy. Please try again shortly."
    });

  } catch (error) {
    console.error("CampusKit AI error:", error);

    return res.status(500).json({
      error: "CampusKit AI request failed."
    });
  }
};
