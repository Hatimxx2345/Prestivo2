require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

const store = require("./store");

const app = express();

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@prestivo.ma";
const ADMIN_PASSWORD_HASH =
  process.env.ADMIN_PASSWORD_HASH ||
  "$2b$10$BYwZxEQ5hSq1i.gcq8rOkOkUNHbR/.8fsJbcGClGdhGRjq.IhiA9W"; // "changeme123" par défaut — à changer
const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(express.json());
app.use(cookieParser());

// --- CORS ---
// Le site et l'API sont désormais servis depuis le même domaine, donc CORS
// n'est plus vraiment nécessaire. On le garde en filet de sécurité au cas où
// tu déciderais un jour d'héberger le frontend séparément.
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (FRONTEND_ORIGINS.length === 0) return callback(null, true);
      if (FRONTEND_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error("Origine non autorisée par CORS"));
    },
    credentials: true,
  })
);

// --- Anti-spam basique pour /api/order (limite par IP) ---
const orderHits = new Map();
function orderRateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxHits = 5;

  const hits = (orderHits.get(ip) || []).filter((t) => now - t < windowMs);
  if (hits.length >= maxHits) {
    return res.status(429).json({ error: "Trop de demandes, réessaie dans une minute." });
  }
  hits.push(now);
  orderHits.set(ip, hits);
  next();
}

// --- Auth ---
function signToken(email) {
  return jwt.sign({ email }, JWT_SECRET, { expiresIn: "7d" });
}

function authMiddleware(req, res, next) {
  const token = req.cookies?.prestivo_session;
  if (!token) return res.status(401).json({ error: "Non authentifié" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Session invalide ou expirée" });
  }
}

const loginAttempts = new Map();
function loginRateLimit(req, res, next) {
  const ip = req.ip || "unknown";
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 8;

  const hits = (loginAttempts.get(ip) || []).filter((t) => now - t < windowMs);
  if (hits.length >= maxAttempts) {
    return res.status(429).json({ error: "Trop de tentatives, réessaie plus tard." });
  }
  hits.push(now);
  loginAttempts.set(ip, hits);
  next();
}

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/",
};

// ============ ROUTES PUBLIQUES ============

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Réception d'une demande de commande depuis le site vitrine.
// Aucune notification Discord ici : la commande est simplement enregistrée
// et visible dans le dashboard admin.
app.post("/api/order", orderRateLimit, async (req, res) => {
  const { lastname, firstname, phone, city, email, product } = req.body || {};

  if (!lastname || !firstname || !phone || !city || !email) {
    return res.status(400).json({ error: "Champs requis manquants." });
  }

  const order = await store.create({
    id: uuidv4(),
    lastname,
    firstname,
    phone,
    city,
    email,
    product,
  });

  res.status(201).json({ ok: true, order });
});

app.post("/api/login", loginRateLimit, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email et mot de passe requis." });
  }

  if (email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(401).json({ error: "Identifiants incorrects." });
  }

  const ok = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
  if (!ok) {
    return res.status(401).json({ error: "Identifiants incorrects." });
  }

  const token = signToken(email);
  res.cookie("prestivo_session", token, COOKIE_OPTS);
  res.json({ ok: true, email });
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("prestivo_session", { ...COOKIE_OPTS, maxAge: undefined });
  res.json({ ok: true });
});

app.get("/api/me", authMiddleware, (req, res) => {
  res.json({ email: req.admin.email });
});

// ============ ROUTES PROTÉGÉES (dashboard) ============

app.get("/api/orders", authMiddleware, async (req, res) => {
  const { status } = req.query;
  const orders = await store.getAll({ status });
  res.json({ orders });
});

app.patch("/api/orders/:id", authMiddleware, async (req, res) => {
  const { status } = req.body || {};
  if (!store.VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: "Statut invalide." });
  }
  const updated = await store.updateStatus(req.params.id, status);
  if (!updated) return res.status(404).json({ error: "Commande introuvable." });
  res.json({ ok: true, order: updated });
});

app.delete("/api/orders/:id", authMiddleware, async (req, res) => {
  const ok = await store.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: "Commande introuvable." });
  res.json({ ok: true });
});

app.get("/api/stats", authMiddleware, async (req, res) => {
  const s = await store.stats();
  res.json(s);
});

// ============ SITE + DASHBOARD (fichiers statiques) ============

app.use(express.static(path.join(__dirname, "public")));

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});
// "/" sert automatiquement public/index.html (le site vitrine) via express.static ci-dessus.

app.listen(PORT, () => {
  console.log(`Prestivo backend en écoute sur le port ${PORT}`);
});
