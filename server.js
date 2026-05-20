const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { MongoClient } = require("mongodb");

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-on-railway";
const PUBLIC_DIR = path.join(__dirname, "public");
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || "team_task_manager";

if (!MONGODB_URI) {
  console.error("MONGODB_URI is required. Create a free MongoDB Atlas cluster and add the connection string.");
  process.exit(1);
}

const client = new MongoClient(MONGODB_URI);
let db;

async function initDb() {
  await client.connect();
  db = client.db(DB_NAME);
  await db.collection("users").createIndex({ email: 1 }, { unique: true });
  await db.collection("projects").createIndex({ ownerId: 1 });
  await db.collection("memberships").createIndex({ projectId: 1, userId: 1 }, { unique: true });
  await db.collection("memberships").createIndex({ userId: 1 });
  await db.collection("tasks").createIndex({ projectId: 1 });
  await db.collection("tasks").createIndex({ assigneeId: 1 });
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  return hashPassword(password, salt).split(":")[1] === hash;
}

function base64url(input) {
  return Buffer.from(JSON.stringify(input)).toString("base64url");
}

function signToken(payload) {
  const header = base64url({ alg: "HS256", typ: "JWT" });
  const body = base64url({ ...payload, exp: Date.now() + 1000 * 60 * 60 * 24 });
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  if (!token) return null;
  const [header, body, signature] = token.split(".");
  if (!header || !body || !signature) return null;
  const expected = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString());
  if (payload.exp < Date.now()) return null;
  return payload;
}

function send(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1e6) reject(new Error("Request body too large"));
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function publicUser(user) {
  return { id: user._id, name: user.name, email: user.email, role: user.role };
}

async function currentUser(req) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  const payload = verifyToken(token);
  if (!payload) return null;
  return db.collection("users").findOne({ _id: payload.id }, { projection: { passwordHash: 0 } });
}

async function requireUser(req, res) {
  const user = await currentUser(req);
  if (!user) send(res, 401, { error: "Please login first." });
  return user;
}

async function projectRole(projectId, userId) {
  const member = await db.collection("memberships").findOne({ projectId, userId });
  return member?.role || null;
}

function mapTask(task) {
  return {
    id: task._id,
    title: task.title,
    projectId: task.projectId,
    assigneeId: task.assigneeId,
    status: task.status,
    dueDate: task.dueDate || "",
    createdBy: task.createdBy,
    createdAt: task.createdAt
  };
}

async function visibleProjectIds(user) {
  if (user.role === "Admin") {
    const projects = await db.collection("projects").find({}, { projection: { _id: 1 } }).toArray();
    return projects.map(project => project._id);
  }
  const memberships = await db.collection("memberships").find({ userId: user._id }).toArray();
  return memberships.map(member => member.projectId);
}

async function projectsForUser(user) {
  const query = user.role === "Admin" ? {} : { _id: { $in: await visibleProjectIds(user) } };
  const projects = await db.collection("projects").find(query).sort({ createdAt: -1 }).toArray();
  const result = [];
  for (const project of projects) {
    const members = await db.collection("memberships").find({ projectId: project._id }).toArray();
    result.push({
      id: project._id,
      name: project.name,
      description: project.description,
      ownerId: project.ownerId,
      createdAt: project.createdAt,
      role: await projectRole(project._id, user._id),
      members: members.map(member => ({
        id: member._id,
        projectId: member.projectId,
        userId: member.userId,
        role: member.role
      }))
    });
  }
  return result;
}

async function api(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split("/").filter(Boolean);

  try {
    if (req.method === "POST" && url.pathname === "/api/auth/signup") {
      const body = await parseBody(req);
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const role = body.role === "Admin" ? "Admin" : "Member";
      if (name.length < 2) return send(res, 400, { error: "Name must be at least 2 characters." });
      if (!validateEmail(email)) return send(res, 400, { error: "Enter a valid email." });
      if (password.length < 6) return send(res, 400, { error: "Password must be at least 6 characters." });

      const user = {
        _id: id("usr"),
        name,
        email,
        passwordHash: hashPassword(password),
        role,
        createdAt: new Date()
      };
      await db.collection("users").insertOne(user);
      return send(res, 201, { user: publicUser(user), token: signToken({ id: user._id }) });
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await parseBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const user = await db.collection("users").findOne({ email });
      if (!user || !verifyPassword(password, user.passwordHash)) return send(res, 401, { error: "Invalid email or password." });
      return send(res, 200, { user: publicUser(user), token: signToken({ id: user._id }) });
    }

    if (req.method === "GET" && url.pathname === "/api/me") {
      const user = await requireUser(req, res);
      if (!user) return;
      return send(res, 200, { user: publicUser(user) });
    }

    if (req.method === "GET" && url.pathname === "/api/users") {
      const user = await requireUser(req, res);
      if (!user) return;
      const users = await db.collection("users").find({}, { projection: { passwordHash: 0 } }).sort({ name: 1 }).toArray();
      return send(res, 200, { users: users.map(publicUser) });
    }

    if (req.method === "GET" && url.pathname === "/api/projects") {
      const user = await requireUser(req, res);
      if (!user) return;
      return send(res, 200, { projects: await projectsForUser(user) });
    }

    if (req.method === "POST" && url.pathname === "/api/projects") {
      const user = await requireUser(req, res);
      if (!user) return;
      if (user.role !== "Admin") return send(res, 403, { error: "Only Admin users can create projects." });
      const body = await parseBody(req);
      const name = String(body.name || "").trim();
      const description = String(body.description || "").trim();
      if (name.length < 3) return send(res, 400, { error: "Project name must be at least 3 characters." });

      const project = { _id: id("prj"), name, description, ownerId: user._id, createdAt: new Date() };
      await db.collection("projects").insertOne(project);
      await db.collection("memberships").insertOne({ _id: id("mem"), projectId: project._id, userId: user._id, role: "Admin" });
      return send(res, 201, { project: { id: project._id, name, description, ownerId: user._id, role: "Admin", members: [] } });
    }

    if (req.method === "POST" && parts[0] === "api" && parts[1] === "projects" && parts[3] === "members") {
      const user = await requireUser(req, res);
      if (!user) return;
      const projectId = parts[2];
      const role = await projectRole(projectId, user._id);
      if (user.role !== "Admin" && role !== "Admin") return send(res, 403, { error: "Only project admins can manage team members." });
      const body = await parseBody(req);
      const memberUserId = String(body.userId || "");
      const memberRole = body.role === "Admin" ? "Admin" : "Member";
      const targetUser = await db.collection("users").findOne({ _id: memberUserId });
      const project = await db.collection("projects").findOne({ _id: projectId });
      if (!targetUser) return send(res, 404, { error: "User not found." });
      if (!project) return send(res, 404, { error: "Project not found." });
      await db.collection("memberships").updateOne(
        { projectId, userId: memberUserId },
        { $set: { role: memberRole }, $setOnInsert: { _id: id("mem"), projectId, userId: memberUserId } },
        { upsert: true }
      );
      const memberships = await db.collection("memberships").find({ projectId }).toArray();
      return send(res, 200, { memberships });
    }

    if (req.method === "GET" && url.pathname === "/api/tasks") {
      const user = await requireUser(req, res);
      if (!user) return;
      const query = user.role === "Admin"
        ? {}
        : { $or: [{ assigneeId: user._id }, { projectId: { $in: await visibleProjectIds(user) } }] };
      const tasks = await db.collection("tasks").find(query).sort({ createdAt: -1 }).toArray();
      return send(res, 200, { tasks: tasks.map(mapTask) });
    }

    if (req.method === "POST" && url.pathname === "/api/tasks") {
      const user = await requireUser(req, res);
      if (!user) return;
      const body = await parseBody(req);
      const title = String(body.title || "").trim();
      const projectId = String(body.projectId || "");
      const assigneeId = String(body.assigneeId || "");
      const dueDate = body.dueDate ? String(body.dueDate) : "";
      const status = ["Todo", "In Progress", "Done"].includes(body.status) ? body.status : "Todo";
      if (title.length < 3) return send(res, 400, { error: "Task title must be at least 3 characters." });
      if (user.role !== "Admin" && await projectRole(projectId, user._id) !== "Admin") return send(res, 403, { error: "Only admins can create tasks." });
      if (!await projectRole(projectId, assigneeId)) return send(res, 400, { error: "Assignee must be a project member." });

      const task = { _id: id("tsk"), title, projectId, assigneeId, status, dueDate, createdBy: user._id, createdAt: new Date() };
      await db.collection("tasks").insertOne(task);
      return send(res, 201, { task: mapTask(task) });
    }

    if (req.method === "PATCH" && parts[0] === "api" && parts[1] === "tasks" && parts[2]) {
      const user = await requireUser(req, res);
      if (!user) return;
      const task = await db.collection("tasks").findOne({ _id: parts[2] });
      if (!task) return send(res, 404, { error: "Task not found." });
      const role = await projectRole(task.projectId, user._id);
      if (user.role !== "Admin" && role !== "Admin" && task.assigneeId !== user._id) return send(res, 403, { error: "You can update only your assigned tasks." });

      const body = await parseBody(req);
      const update = {};
      if (["Todo", "In Progress", "Done"].includes(body.status)) update.status = body.status;
      if ((user.role === "Admin" || role === "Admin") && typeof body.title === "string" && body.title.trim().length >= 3) update.title = body.title.trim();
      if (!Object.keys(update).length) return send(res, 400, { error: "No valid updates provided." });

      await db.collection("tasks").updateOne({ _id: task._id }, { $set: update });
      const updated = await db.collection("tasks").findOne({ _id: task._id });
      return send(res, 200, { task: mapTask(updated) });
    }

    if (req.method === "GET" && url.pathname === "/api/dashboard") {
      const user = await requireUser(req, res);
      if (!user) return;
      const query = user.role === "Admin"
        ? {}
        : { $or: [{ assigneeId: user._id }, { projectId: { $in: await visibleProjectIds(user) } }] };
      const tasks = await db.collection("tasks").find(query).toArray();
      const today = new Date().toISOString().slice(0, 10);
      return send(res, 200, {
        total: tasks.length,
        todo: tasks.filter(task => task.status === "Todo").length,
        progress: tasks.filter(task => task.status === "In Progress").length,
        done: tasks.filter(task => task.status === "Done").length,
        overdue: tasks.filter(task => task.dueDate && task.dueDate < today && task.status !== "Done").length
      });
    }

    return send(res, 404, { error: "API route not found." });
  } catch (error) {
    if (error.code === 11000) return send(res, 409, { error: "This record already exists." });
    return send(res, 400, { error: error.message });
  }
}

function staticFile(req, res) {
  const requested = req.url === "/" ? "/index.html" : req.url;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (_, fallback) => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(fallback);
      });
      return;
    }
    const ext = path.extname(filePath);
    const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };
    res.writeHead(200, { "Content-Type": types[ext] || "text/plain" });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) return api(req, res);
  return staticFile(req, res);
});

initDb()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Team Task Manager running on http://localhost:${PORT}`);
    });
  })
  .catch(error => {
    console.error("Database startup failed:", error.message);
    process.exit(1);
  });
