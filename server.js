require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const { z } = require("zod");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-before-deploy";
const DATABASE_URL = process.env.DATABASE_URL;
const dataFile = path.join(__dirname, "data", "local-db.json");

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
    })
  : null;

function nowIso() {
  return new Date().toISOString();
}

function toCamel(row) {
  if (!row || Array.isArray(row)) return row;
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
      value
    ])
  );
}

function ensureLocalDb() {
  if (fs.existsSync(dataFile)) return;
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(
    dataFile,
    JSON.stringify({ users: [], projects: [], memberships: [], tasks: [], nextId: 1 }, null, 2)
  );
}

function readLocalDb() {
  ensureLocalDb();
  return JSON.parse(fs.readFileSync(dataFile, "utf8"));
}

function writeLocalDb(db) {
  fs.writeFileSync(dataFile, JSON.stringify(db, null, 2));
}

function nextLocalId(db) {
  const id = db.nextId;
  db.nextId += 1;
  return id;
}

async function query(text, params = []) {
  if (pool) {
    const result = await pool.query(text, params);
    return result.rows.map(toCamel);
  }
  return localQuery(text, params);
}

function localQuery(text, params) {
  const db = readLocalDb();
  const starts = text.trim().replace(/\s+/g, " ").toLowerCase();

  if (starts.startsWith("select id, name, email, role, password_hash from users where email")) {
    return db.users.filter((u) => u.email === params[0]);
  }
  if (starts.startsWith("insert into users")) {
    const user = {
      id: nextLocalId(db),
      name: params[0],
      email: params[1],
      passwordHash: params[2],
      role: params[3],
      createdAt: nowIso()
    };
    db.users.push(user);
    writeLocalDb(db);
    return [publicUser(user)];
  }
  if (starts.startsWith("select id, name, email, role, created_at from users order by name")) {
    return db.users.map(publicUser).sort((a, b) => a.name.localeCompare(b.name));
  }
  if (starts.startsWith("select id, name, email, role, created_at from users where id")) {
    return db.users.filter((u) => u.id === Number(params[0])).map(publicUser);
  }
  if (starts.startsWith("insert into projects")) {
    const project = {
      id: nextLocalId(db),
      name: params[0],
      description: params[1],
      ownerId: params[2],
      createdAt: nowIso()
    };
    db.projects.push(project);
    db.memberships.push({ projectId: project.id, userId: params[2], projectRole: "manager", createdAt: nowIso() });
    writeLocalDb(db);
    return [project];
  }
  if (starts.startsWith("select p.* from projects")) {
    if (!params.length) {
      return db.projects.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    const userId = Number(params[0]);
    const rows = db.projects.filter(
      (p) => p.ownerId === userId || db.memberships.some((m) => m.projectId === p.id && m.userId === userId)
    );
    return rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  if (starts.startsWith("select p.*, u.name as owner_name")) {
    return db.projects
      .filter((p) => p.id === Number(params[0]))
      .map((p) => ({ ...p, ownerName: db.users.find((u) => u.id === p.ownerId)?.name || "Unknown" }));
  }
  if (starts.startsWith("select * from memberships where project_id")) {
    return db.memberships.filter((m) => m.projectId === Number(params[0]) && m.userId === Number(params[1]));
  }
  if (starts.startsWith("insert into memberships")) {
    const existing = db.memberships.find((m) => m.projectId === Number(params[0]) && m.userId === Number(params[1]));
    if (existing) {
      existing.projectRole = params[2];
      writeLocalDb(db);
      return [existing];
    }
    const membership = { projectId: Number(params[0]), userId: Number(params[1]), projectRole: params[2], createdAt: nowIso() };
    db.memberships.push(membership);
    writeLocalDb(db);
    return [membership];
  }
  if (starts.startsWith("select m.project_id")) {
    return db.memberships
      .filter((m) => m.projectId === Number(params[0]))
      .map((m) => {
        const user = db.users.find((u) => u.id === m.userId);
        return { projectId: m.projectId, userId: m.userId, projectRole: m.projectRole, name: user?.name, email: user?.email };
      });
  }
  if (starts.startsWith("delete from memberships")) {
    const before = db.memberships.length;
    db.memberships = db.memberships.filter((m) => !(m.projectId === Number(params[0]) && m.userId === Number(params[1])));
    writeLocalDb(db);
    return before === db.memberships.length ? [] : [{ ok: true }];
  }
  if (starts.startsWith("insert into tasks")) {
    const task = {
      id: nextLocalId(db),
      projectId: Number(params[0]),
      title: params[1],
      description: params[2],
      assigneeId: params[3] ? Number(params[3]) : null,
      createdBy: Number(params[4]),
      status: params[5],
      priority: params[6],
      dueDate: params[7],
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    db.tasks.push(task);
    writeLocalDb(db);
    return [decorateTask(db, task)];
  }
  if (starts.startsWith("select t.*, assignee.name")) {
    let rows = db.tasks;
    if (starts.includes("where t.project_id = $1")) rows = rows.filter((t) => t.projectId === Number(params[0]));
    if (starts.includes("where t.assignee_id = $1")) rows = rows.filter((t) => t.assigneeId === Number(params[0]));
    return rows.map((t) => decorateTask(db, t)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  if (starts.startsWith("select * from tasks where id")) {
    return db.tasks.filter((t) => t.id === Number(params[0]));
  }
  if (starts.startsWith("update tasks set")) {
    const task = db.tasks.find((t) => t.id === Number(params[8]));
    if (!task) return [];
    Object.assign(task, {
      title: params[0],
      description: params[1],
      assigneeId: params[2] ? Number(params[2]) : null,
      status: params[3],
      priority: params[4],
      dueDate: params[5],
      updatedAt: nowIso()
    });
    writeLocalDb(db);
    return [decorateTask(db, task)];
  }
  if (starts.startsWith("delete from tasks")) {
    const before = db.tasks.length;
    db.tasks = db.tasks.filter((t) => t.id !== Number(params[0]));
    writeLocalDb(db);
    return before === db.tasks.length ? [] : [{ ok: true }];
  }
  if (starts.startsWith("select status, count(*)")) {
    const rows = {};
    db.tasks.forEach((task) => {
      rows[task.status] = (rows[task.status] || 0) + 1;
    });
    return Object.entries(rows).map(([status, count]) => ({ status, count: Number(count) }));
  }
  if (starts.startsWith("select count(*)::int as total")) {
    const today = new Date().toISOString().slice(0, 10);
    return [
      {
        total: db.tasks.length,
        overdue: db.tasks.filter((t) => t.dueDate && t.dueDate < today && t.status !== "done").length,
        myTasks: db.tasks.filter((t) => t.assigneeId === Number(params[0]) && t.status !== "done").length,
        projects: db.projects.length
      }
    ];
  }
  throw new Error(`Local database adapter does not support query: ${text}`);
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt
  };
}

function decorateTask(db, task) {
  const assignee = db.users.find((u) => u.id === task.assigneeId);
  const creator = db.users.find((u) => u.id === task.createdBy);
  const project = db.projects.find((p) => p.id === task.projectId);
  return {
    ...task,
    assigneeName: assignee?.name || null,
    creatorName: creator?.name || null,
    projectName: project?.name || null
  };
}

async function migrate() {
  if (!pool) {
    ensureLocalDb();
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL CHECK (char_length(name) >= 2),
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'member')) DEFAULT 'member',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL CHECK (char_length(name) >= 2),
      description TEXT NOT NULL DEFAULT '',
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS memberships (
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_role TEXT NOT NULL CHECK (project_role IN ('manager', 'contributor')) DEFAULT 'contributor',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (project_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL CHECK (char_length(title) >= 2),
      description TEXT NOT NULL DEFAULT '',
      assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('todo', 'in_progress', 'review', 'done')) DEFAULT 'todo',
      priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')) DEFAULT 'medium',
      due_date DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

const signupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160).transform((v) => v.toLowerCase()),
  password: z.string().min(8).max(100),
  role: z.enum(["admin", "member"]).default("member")
});

const loginSchema = z.object({
  email: z.string().trim().email().transform((v) => v.toLowerCase()),
  password: z.string().min(1)
});

const projectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1200).default("")
});

const memberSchema = z.object({
  userId: z.coerce.number().int().positive(),
  projectRole: z.enum(["manager", "contributor"]).default("contributor")
});

const taskSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1600).default(""),
  assigneeId: z.union([z.coerce.number().int().positive(), z.null(), z.literal("")]).optional().transform((v) => (v === "" ? null : v)),
  status: z.enum(["todo", "in_progress", "review", "done"]).default("todo"),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  dueDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null(), z.literal("")]).optional().transform((v) => (v === "" ? null : v))
});

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: "7d" });
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Authentication required" });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Admin access required" });
  next();
}

function validate(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation failed",
        errors: parsed.error.flatten().fieldErrors
      });
    }
    req.body = parsed.data;
    next();
  };
}

async function getProject(projectId) {
  const rows = await query(
    `SELECT p.*, u.name AS owner_name
     FROM projects p
     JOIN users u ON u.id = p.owner_id
     WHERE p.id = $1`,
    [projectId]
  );
  return rows[0];
}

async function getMembership(projectId, userId) {
  const rows = await query("SELECT * FROM memberships WHERE project_id = $1 AND user_id = $2", [projectId, userId]);
  return rows[0];
}

async function canManageProject(req, projectId) {
  if (req.user.role === "admin") return true;
  const membership = await getMembership(projectId, req.user.id);
  return membership?.projectRole === "manager";
}

async function canViewProject(req, projectId) {
  if (req.user.role === "admin") return true;
  return Boolean(await getMembership(projectId, req.user.id));
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, database: pool ? "postgres" : "local-json" });
});

app.post("/api/auth/signup", validate(signupSchema), async (req, res) => {
  const { name, email, password, role } = req.body;
  const existing = await query("SELECT id, name, email, role, password_hash FROM users WHERE email = $1", [email]);
  if (existing.length) return res.status(409).json({ message: "Email is already registered" });

  const passwordHash = await bcrypt.hash(password, 12);
  const inserted = await query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, role, created_at`,
    [name, email, passwordHash, role]
  );
  const user = inserted[0];
  res.status(201).json({ user, token: signToken(user) });
});

app.post("/api/auth/login", validate(loginSchema), async (req, res) => {
  const rows = await query("SELECT id, name, email, role, password_hash FROM users WHERE email = $1", [req.body.email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(req.body.password, user.passwordHash))) {
    return res.status(401).json({ message: "Invalid email or password" });
  }

  delete user.passwordHash;
  res.json({ user, token: signToken(user) });
});

app.get("/api/users", auth, async (_req, res) => {
  const users = await query("SELECT id, name, email, role, created_at FROM users ORDER BY name ASC");
  res.json(users);
});

app.get("/api/me", auth, async (req, res) => {
  const rows = await query("SELECT id, name, email, role, created_at FROM users WHERE id = $1", [req.user.id]);
  res.json(rows[0]);
});

app.get("/api/projects", auth, async (req, res) => {
  const projects =
    req.user.role === "admin"
      ? await query("SELECT p.* FROM projects p ORDER BY p.created_at DESC")
      : await query(
          `SELECT p.* FROM projects p
           LEFT JOIN memberships m ON m.project_id = p.id
           WHERE p.owner_id = $1 OR m.user_id = $1
           GROUP BY p.id
           ORDER BY p.created_at DESC`,
          [req.user.id]
        );
  res.json(projects);
});

app.post("/api/projects", auth, validate(projectSchema), async (req, res) => {
  const inserted = await query(
    `INSERT INTO projects (name, description, owner_id)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [req.body.name, req.body.description, req.user.id]
  );
  const project = inserted[0];
  if (pool) {
    await query(
      `INSERT INTO memberships (project_id, user_id, project_role)
       VALUES ($1, $2, 'manager')
       ON CONFLICT (project_id, user_id) DO UPDATE SET project_role = EXCLUDED.project_role
       RETURNING *`,
      [project.id, req.user.id]
    );
  }
  res.status(201).json(project);
});

app.get("/api/projects/:id/members", auth, async (req, res) => {
  const projectId = Number(req.params.id);
  if (!(await canViewProject(req, projectId))) return res.status(403).json({ message: "No project access" });
  const members = await query(
    `SELECT m.project_id, m.user_id, m.project_role, u.name, u.email
     FROM memberships m
     JOIN users u ON u.id = m.user_id
     WHERE m.project_id = $1
     ORDER BY u.name ASC`,
    [projectId]
  );
  res.json(members);
});

app.post("/api/projects/:id/members", auth, validate(memberSchema), async (req, res) => {
  const projectId = Number(req.params.id);
  if (!(await getProject(projectId))) return res.status(404).json({ message: "Project not found" });
  if (!(await canManageProject(req, projectId))) return res.status(403).json({ message: "Manager or admin access required" });

  const userRows = await query("SELECT id, name, email, role, created_at FROM users WHERE id = $1", [req.body.userId]);
  if (!userRows.length) return res.status(404).json({ message: "User not found" });

  const inserted = await query(
    `INSERT INTO memberships (project_id, user_id, project_role)
     VALUES ($1, $2, $3)
     ON CONFLICT (project_id, user_id) DO UPDATE SET project_role = EXCLUDED.project_role
     RETURNING *`,
    [projectId, req.body.userId, req.body.projectRole]
  );
  res.status(201).json(inserted[0]);
});

app.delete("/api/projects/:id/members/:userId", auth, async (req, res) => {
  const projectId = Number(req.params.id);
  if (!(await canManageProject(req, projectId))) return res.status(403).json({ message: "Manager or admin access required" });
  await query("DELETE FROM memberships WHERE project_id = $1 AND user_id = $2 RETURNING *", [projectId, Number(req.params.userId)]);
  res.status(204).end();
});

app.get("/api/projects/:id/tasks", auth, async (req, res) => {
  const projectId = Number(req.params.id);
  if (!(await canViewProject(req, projectId))) return res.status(403).json({ message: "No project access" });
  const tasks = await query(
    `SELECT t.*, assignee.name AS assignee_name, creator.name AS creator_name, p.name AS project_name
     FROM tasks t
     LEFT JOIN users assignee ON assignee.id = t.assignee_id
     JOIN users creator ON creator.id = t.created_by
     JOIN projects p ON p.id = t.project_id
     WHERE t.project_id = $1
     ORDER BY t.created_at DESC`,
    [projectId]
  );
  res.json(tasks);
});

app.post("/api/projects/:id/tasks", auth, validate(taskSchema), async (req, res) => {
  const projectId = Number(req.params.id);
  if (!(await canManageProject(req, projectId))) return res.status(403).json({ message: "Manager or admin access required" });
  if (req.body.assigneeId && !(await canViewProject({ user: { id: req.body.assigneeId, role: "member" } }, projectId))) {
    return res.status(400).json({ message: "Assignee must be a project member" });
  }

  const inserted = await query(
    `INSERT INTO tasks (project_id, title, description, assignee_id, created_by, status, priority, due_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      projectId,
      req.body.title,
      req.body.description,
      req.body.assigneeId || null,
      req.user.id,
      req.body.status,
      req.body.priority,
      req.body.dueDate || null
    ]
  );
  res.status(201).json(inserted[0]);
});

app.patch("/api/tasks/:id", auth, validate(taskSchema.partial()), async (req, res) => {
  const taskRows = await query("SELECT * FROM tasks WHERE id = $1", [Number(req.params.id)]);
  const task = taskRows[0];
  if (!task) return res.status(404).json({ message: "Task not found" });

  const canManage = await canManageProject(req, task.projectId);
  const isAssignee = task.assigneeId === req.user.id;
  if (!canManage && !isAssignee) return res.status(403).json({ message: "No task access" });

  const next = { ...task, ...req.body };
  if (!canManage) {
    next.title = task.title;
    next.description = task.description;
    next.assigneeId = task.assigneeId;
    next.priority = task.priority;
    next.dueDate = task.dueDate;
  }

  const updated = await query(
    `UPDATE tasks SET
       title = $1,
       description = $2,
       assignee_id = $3,
       status = $4,
       priority = $5,
       due_date = $6,
       updated_at = NOW()
     WHERE id = $9
     RETURNING *`,
    [
      next.title,
      next.description,
      next.assigneeId || null,
      next.status,
      next.priority,
      next.dueDate || null,
      task.projectId,
      req.user.id,
      task.id
    ]
  );
  res.json(updated[0]);
});

app.delete("/api/tasks/:id", auth, async (req, res) => {
  const taskRows = await query("SELECT * FROM tasks WHERE id = $1", [Number(req.params.id)]);
  const task = taskRows[0];
  if (!task) return res.status(404).json({ message: "Task not found" });
  if (!(await canManageProject(req, task.projectId))) return res.status(403).json({ message: "Manager or admin access required" });
  await query("DELETE FROM tasks WHERE id = $1 RETURNING *", [task.id]);
  res.status(204).end();
});

app.get("/api/tasks/my", auth, async (req, res) => {
  const tasks = await query(
    `SELECT t.*, assignee.name AS assignee_name, creator.name AS creator_name, p.name AS project_name
     FROM tasks t
     LEFT JOIN users assignee ON assignee.id = t.assignee_id
     JOIN users creator ON creator.id = t.created_by
     JOIN projects p ON p.id = t.project_id
     WHERE t.assignee_id = $1
     ORDER BY t.created_at DESC`,
    [req.user.id]
  );
  res.json(tasks);
});

app.get("/api/dashboard", auth, async (req, res) => {
  const summary = await query(
    `SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status <> 'done')::int AS overdue,
      COUNT(*) FILTER (WHERE assignee_id = $1 AND status <> 'done')::int AS my_tasks,
      (SELECT COUNT(*)::int FROM projects) AS projects
     FROM tasks`,
    [req.user.id]
  );
  const byStatus = await query("SELECT status, COUNT(*)::int AS count FROM tasks GROUP BY status ORDER BY status");
  res.json({ summary: summary[0], byStatus });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: "Something went wrong", detail: process.env.NODE_ENV === "production" ? undefined : err.message });
});

migrate()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Team Task Manager running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start app", error);
    process.exit(1);
  });
