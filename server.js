require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();

const PORT = Number(process.env.PORT || 10000);
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_NAME = (process.env.ADMIN_NAME || "DEVENDRA GARG").trim().toUpperCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL is missing.");
  process.exit(1);
}

if (!JWT_SECRET) {
  console.error("❌ JWT_SECRET is missing.");
  process.exit(1);
}

if (!ADMIN_PASSWORD) {
  console.error("❌ ADMIN_PASSWORD is missing.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : undefined,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

/* ================= CORS ================= */

const allowedOrigins = [
  "https://devendragarg773-cmd.github.io",
  "http://localhost:3000",
  "http://localhost:5500",
  ...(process.env.FRONTEND_ORIGIN || "")
    .split(",")
    .map(v => v.trim())
    .filter(Boolean)
];

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("CORS blocked for this origin."));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false
}));

app.options("*", cors());

/*
  Banner/signature are sent by the current frontend as data URLs.
  15MB is enough for the current 10MB banner limit plus JSON overhead.
*/
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

/* ================= DATABASE ================= */

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS twd_admin (
      id INTEGER PRIMARY KEY DEFAULT 1,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS twd_projects (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_twd_projects_updated
      ON twd_projects(updated_at DESC);

    CREATE TABLE IF NOT EXISTS twd_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      policy TEXT NOT NULL DEFAULT '',
      banner TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  await pool.query(
    `
      INSERT INTO twd_admin (id, name, password_hash)
      VALUES (1, $1, $2)
      ON CONFLICT (id)
      DO UPDATE SET
        name = EXCLUDED.name,
        password_hash = EXCLUDED.password_hash,
        updated_at = NOW()
    `,
    [ADMIN_NAME, hash]
  );

  await pool.query(`
    INSERT INTO twd_settings (id)
    VALUES (1)
    ON CONFLICT (id) DO NOTHING
  `);

  console.log("✅ Database initialized.");
}

/* ================= HELPERS ================= */

function makeToken() {
  return jwt.sign(
    {
      sub: "twd-owner",
      role: "owner",
      name: ADMIN_NAME
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Authentication required."
    });
  }

  const token = header.slice(7);

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({
      message: "Invalid or expired session."
    });
  }
}

function normalizeProject(input) {
  const p = input && typeof input === "object" ? input : {};

  return {
    ...p,
    id: String(p.id || Date.now()),
    type: p.type === "real" ? "real" : "demo",
    websiteName: String(p.websiteName || "").trim(),
    category: String(p.category || "").trim(),
    price: String(p.price ?? "").trim(),
    websiteURL: String(p.websiteURL || "").trim(),
    description: String(p.description || "").trim(),
    favorite: Boolean(p.favorite),
    signature: p.signature || null,
    date: p.date || new Date().toLocaleDateString("en-IN"),
    status: p.status || (p.type === "real" ? "Sold" : "Demo"),
    customerName: p.customerName ? String(p.customerName).trim() : "",
    customerMobile: p.customerMobile ? String(p.customerMobile).trim() : "",
    soldPrice: p.soldPrice != null ? String(p.soldPrice) : ""
  };
}

function validateProject(p) {
  if (!p.websiteName) return "Website name is required.";
  if (!p.category) return "Website category is required.";
  if (!p.price) return "Price is required.";

  if (p.type === "real") {
    if (!p.websiteURL) return "Live website link is required.";
    if (!p.customerName) return "Customer name is required.";
    if (!p.customerMobile) return "Customer mobile is required.";
  }

  return null;
}

/* ================= HEALTH ================= */

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      ok: true,
      service: "THE WEB DEVELOPER BACKEND",
      database: "connected",
      time: new Date().toISOString()
    });
  } catch (error) {
    console.error("Health DB error:", error);
    res.status(503).json({
      ok: false,
      database: "disconnected"
    });
  }
});

/* ================= LOGIN ================= */

app.post("/api/auth/login", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim().toUpperCase();
    const password = String(req.body?.password || "");

    if (!name || !password) {
      return res.status(400).json({
        message: "Name and password are required."
      });
    }

    const result = await pool.query(
      "SELECT name, password_hash FROM twd_admin WHERE id = 1 LIMIT 1"
    );

    const admin = result.rows[0];

    if (!admin || name !== admin.name) {
      return res.status(401).json({
        message: "Invalid login."
      });
    }

    const valid = await bcrypt.compare(
      password,
      admin.password_hash
    );

    if (!valid) {
      return res.status(401).json({
        message: "Invalid login."
      });
    }

    res.json({
      success: true,
      token: makeToken(),
      user: {
        name: admin.name,
        role: "owner"
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      message: "Login failed."
    });
  }
});

/* ================= PROJECTS ================= */

/* GET ALL */
app.get("/api/projects", auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT data
      FROM twd_projects
      ORDER BY updated_at DESC
    `);

    res.json({
      projects: result.rows.map(row => row.data)
    });
  } catch (error) {
    console.error("GET projects:", error);
    res.status(500).json({
      message: "Projects load failed."
    });
  }
});

/* CREATE */
app.post("/api/projects", auth, async (req, res) => {
  try {
    const project = normalizeProject(req.body);
    const validation = validateProject(project);

    if (validation) {
      return res.status(400).json({
        message: validation
      });
    }

    await pool.query(
      `
        INSERT INTO twd_projects (id, data)
        VALUES ($1, $2::jsonb)
      `,
      [project.id, JSON.stringify(project)]
    );

    res.status(201).json({
      success: true,
      project
    });
  } catch (error) {
    console.error("POST project:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        message: "Project ID already exists."
      });
    }

    res.status(500).json({
      message: "Project save failed."
    });
  }
});

/* UPDATE */
app.put("/api/projects/:id", auth, async (req, res) => {
  try {
    const id = String(req.params.id);

    const existing = await pool.query(
      "SELECT data FROM twd_projects WHERE id = $1 LIMIT 1",
      [id]
    );

    if (!existing.rows.length) {
      return res.status(404).json({
        message: "Project not found."
      });
    }

    const oldProject = existing.rows[0].data || {};

    const project = normalizeProject({
      ...oldProject,
      ...(req.body || {}),
      id
    });

    const validation = validateProject(project);

    if (validation) {
      return res.status(400).json({
        message: validation
      });
    }

    await pool.query(
      `
        UPDATE twd_projects
        SET data = $1::jsonb,
            updated_at = NOW()
        WHERE id = $2
      `,
      [JSON.stringify(project), id]
    );

    res.json({
      success: true,
      project
    });
  } catch (error) {
    console.error("PUT project:", error);
    res.status(500).json({
      message: "Project update failed."
    });
  }
});

/* DELETE */
app.delete("/api/projects/:id", auth, async (req, res) => {
  try {
    const id = String(req.params.id);

    const result = await pool.query(
      "DELETE FROM twd_projects WHERE id = $1",
      [id]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        message: "Project not found."
      });
    }

    res.json({
      success: true,
      message: "Project deleted."
    });
  } catch (error) {
    console.error("DELETE project:", error);
    res.status(500).json({
      message: "Project delete failed."
    });
  }
});

/* ================= SETTINGS ================= */

app.get("/api/settings", auth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT policy, banner FROM twd_settings WHERE id = 1 LIMIT 1"
    );

    const settings = result.rows[0] || {
      policy: "",
      banner: ""
    };

    res.json({ settings });
  } catch (error) {
    console.error("GET settings:", error);
    res.status(500).json({
      message: "Settings load failed."
    });
  }
});

/* POLICY */
app.put("/api/settings/policy", auth, async (req, res) => {
  try {
    const policy = String(req.body?.policy || "");

    await pool.query(
      `
        UPDATE twd_settings
        SET policy = $1,
            updated_at = NOW()
        WHERE id = 1
      `,
      [policy]
    );

    res.json({
      success: true,
      policy
    });
  } catch (error) {
    console.error("Policy update:", error);
    res.status(500).json({
      message: "Policy save failed."
    });
  }
});

/* BANNER */
app.put("/api/settings/banner", auth, async (req, res) => {
  try {
    const banner = String(req.body?.banner || "");

    if (!banner) {
      return res.status(400).json({
        message: "Banner is required."
      });
    }

    if (banner.length > 14_000_000) {
      return res.status(413).json({
        message: "Banner image is too large."
      });
    }

    await pool.query(
      `
        UPDATE twd_settings
        SET banner = $1,
            updated_at = NOW()
        WHERE id = 1
      `,
      [banner]
    );

    res.json({
      success: true,
      banner
    });
  } catch (error) {
    console.error("Banner update:", error);
    res.status(500).json({
      message: "Banner save failed."
    });
  }
});

/* ================= ERROR HANDLER ================= */

app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err);

  if (err.message === "CORS blocked for this origin.") {
    return res.status(403).json({
      message: "CORS blocked."
    });
  }

  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({
      message: "Invalid JSON."
    });
  }

  res.status(500).json({
    message: "Internal server error."
  });
});

/* ================= START ================= */

async function start() {
  try {
    await initDatabase();

    app.listen(PORT, () => {
      console.log(`🚀 THE WEB DEVELOPER backend running on port ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Server startup failed:", error);
    process.exit(1);
  }
}

start();
