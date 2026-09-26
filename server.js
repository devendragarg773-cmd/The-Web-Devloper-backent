require("dotenv").config();

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");

const app = express();

const PORT = process.env.PORT || 10000;
const OWNER_PASSWORD = process.env.OWNER_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;

if (!OWNER_PASSWORD || !JWT_SECRET) {
  console.error("Missing OWNER_PASSWORD or JWT_SECRET in environment variables.");
  process.exit(1);
}

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "twd.db"));
db.pragma("journal_mode = WAL");

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || "*"
}));

app.use(express.json({ limit: "15mb" }));

// ================= HOME =================

app.get("/", (req, res) => {
  res.send("Backend is running!");
});

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('real','demo')),
    websiteName TEXT NOT NULL,
    category TEXT NOT NULL,
    price TEXT NOT NULL,
    websiteURL TEXT,
    customerName TEXT,
    customerMobile TEXT,
    description TEXT,
    favorite INTEGER NOT NULL DEFAULT 0,
    signature TEXT,
    status TEXT NOT NULL,
    date TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: "Login required." });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Session expired. Login again." });
  }
}

function today() {
  return new Date().toLocaleDateString("en-IN");
}

function getSetting(key, fallback = "") {
  const row = db.prepare(
    "SELECT value FROM settings WHERE key = ?"
  ).get(key);

  return row ? row.value : fallback;
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings(key, value)
    VALUES(?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

function rowToProject(row) {
  if (!row) return null;

  return {
    ...row,
    favorite: Boolean(row.favorite)
  };
}

/* ================= HEALTH ================= */

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "THE WEB DEVELOPER API"
  });
});

/* ================= LOGIN ================= */

app.post("/api/auth/login", (req, res) => {
  const { name, password } = req.body || {};

  if (
    String(name || "").trim().toUpperCase() !== "DEVENDRA GARG" ||
    password !== OWNER_PASSWORD
  ) {
    return res.status(401).json({
      error: "Name or password is incorrect."
    });
  }

  const token = jwt.sign(
    { role: "owner", name: "DEVENDRA GARG" },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({
    ok: true,
    token
  });
});

/* ================= PROJECTS ================= */

app.get("/api/projects", auth, (req, res) => {
  const rows = db.prepare(`
    SELECT *
    FROM projects
    ORDER BY createdAt DESC
  `).all();

  res.json(rows.map(rowToProject));
});

app.get("/api/projects/:id", auth, (req, res) => {
  const row = db.prepare(
    "SELECT * FROM projects WHERE id = ?"
  ).get(req.params.id);

  if (!row) {
    return res.status(404).json({ error: "Project not found." });
  }

  res.json(rowToProject(row));
});

app.post("/api/projects", auth, (req, res) => {
  const p = req.body || {};

  if (!p.websiteName || !p.category || !p.price || !p.type) {
    return res.status(400).json({
      error: "websiteName, category, price and type are required."
    });
  }

  if (!["real", "demo"].includes(p.type)) {
    return res.status(400).json({ error: "Invalid project type." });
  }

  if (p.type === "real" && (!p.websiteURL || !p.customerName || !p.customerMobile)) {
    return res.status(400).json({
      error: "Real website requires live link, customer name and mobile."
    });
  }

  const id = String(p.id || Date.now());
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO projects (
      id, type, websiteName, category, price, websiteURL,
      customerName, customerMobile, description, favorite,
      signature, status, date, createdAt, updatedAt
    )
    VALUES (
      @id, @type, @websiteName, @category, @price, @websiteURL,
      @customerName, @customerMobile, @description, @favorite,
      @signature, @status, @date, @createdAt, @updatedAt
    )
  `).run({
    id,
    type: p.type,
    websiteName: String(p.websiteName),
    category: String(p.category),
    price: String(p.price),
    websiteURL: p.websiteURL || "",
    customerName: p.customerName || "",
    customerMobile: p.customerMobile || "",
    description: p.description || "",
    favorite: p.favorite ? 1 : 0,
    signature: p.signature || null,
    status: p.type === "real" ? "Sold" : "Demo",
    date: p.date || today(),
    createdAt: now,
    updatedAt: now
  });

  res.status(201).json(rowToProject(
    db.prepare("SELECT * FROM projects WHERE id = ?").get(id)
  ));
});

app.put("/api/projects/:id", auth, (req, res) => {
  const old = db.prepare(
    "SELECT * FROM projects WHERE id = ?"
  ).get(req.params.id);

  if (!old) {
    return res.status(404).json({ error: "Project not found." });
  }

  const p = req.body || {};

  db.prepare(`
    UPDATE projects SET
      type = @type,
      websiteName = @websiteName,
      category = @category,
      price = @price,
      websiteURL = @websiteURL,
      customerName = @customerName,
      customerMobile = @customerMobile,
      description = @description,
      favorite = @favorite,
      signature = @signature,
      status = @status,
      updatedAt = @updatedAt
    WHERE id = @id
  `).run({
    id: req.params.id,
    type: p.type || old.type,
    websiteName: p.websiteName ?? old.websiteName,
    category: p.category ?? old.category,
    price: String(p.price ?? old.price),
    websiteURL: p.websiteURL ?? old.websiteURL ?? "",
    customerName: p.customerName ?? old.customerName ?? "",
    customerMobile: p.customerMobile ?? old.customerMobile ?? "",
    description: p.description ?? old.description ?? "",
    favorite: p.favorite ? 1 : 0,
    signature: p.signature ?? old.signature ?? null,
    status: p.status || old.status,
    updatedAt: new Date().toISOString()
  });

  res.json(rowToProject(
    db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id)
  ));
});

app.delete("/api/projects/:id", auth, (req, res) => {
  const result = db.prepare(
    "DELETE FROM projects WHERE id = ?"
  ).run(req.params.id);

  if (!result.changes) {
    return res.status(404).json({ error: "Project not found." });
  }

  res.json({ ok: true });
});

/* ================= SETTINGS ================= */

app.get("/api/settings", auth, (req, res) => {
  res.json({
    policy: getSetting("policy", ""),
    banner: getSetting("banner", "")
  });
});

app.put("/api/settings/policy", auth, (req, res) => {
  setSetting("policy", String(req.body?.policy || ""));
  res.json({ ok: true });
});

app.put("/api/settings/banner", auth, (req, res) => {
  const banner = String(req.body?.banner || "");

  if (!banner) {
    return res.status(400).json({ error: "Banner image is required." });
  }

  setSetting("banner", banner);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`THE WEB DEVELOPER API running on port ${PORT}`);
});
