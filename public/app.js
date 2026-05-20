const state = {
  token: localStorage.getItem("token"),
  user: null,
  users: [],
  projects: [],
  tasks: [],
  mode: "login"
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

function names(userId) {
  return state.users.find(user => user.id === userId)?.name || "Unknown";
}

function projectName(projectId) {
  return state.projects.find(project => project.id === projectId)?.name || "Unknown project";
}

function setAuthMode(mode) {
  state.mode = mode;
  $$(".tabs button").forEach(button => button.classList.toggle("active", button.dataset.mode === mode));
  $$(".signup-only").forEach(item => item.classList.toggle("hidden", mode !== "signup"));
  $("#authMessage").textContent = "";
}

async function loadApp() {
  if (!state.token) return showAuth();
  try {
    const me = await request("/api/me");
    state.user = me.user;
    await refresh();
    showApp();
  } catch {
    localStorage.removeItem("token");
    state.token = null;
    showAuth();
  }
}

function showAuth() {
  $("#authView").classList.remove("hidden");
  $("#appView").classList.add("hidden");
  setAuthMode(state.mode);
}

function showApp() {
  $("#authView").classList.add("hidden");
  $("#appView").classList.remove("hidden");
  $("#welcome").textContent = `${state.user.name} (${state.user.role})`;
  $$(".admin-only").forEach(item => item.classList.toggle("hidden", state.user.role !== "Admin"));
}

async function refresh() {
  const [users, projects, tasks, dashboard] = await Promise.all([
    request("/api/users"),
    request("/api/projects"),
    request("/api/tasks"),
    request("/api/dashboard")
  ]);
  state.users = users.users;
  state.projects = projects.projects;
  state.tasks = tasks.tasks;
  renderStats(dashboard);
  renderProjects();
  renderTasks();
  renderSelects();
}

function renderStats(stats) {
  const labels = [
    ["total", "Total"],
    ["todo", "Todo"],
    ["progress", "In Progress"],
    ["done", "Done"],
    ["overdue", "Overdue"]
  ];
  $("#stats").innerHTML = labels.map(([key, label]) => `
    <article class="stat">
      <strong>${stats[key]}</strong>
      <span>${label}</span>
    </article>
  `).join("");
}

function renderProjects() {
  $("#projects").innerHTML = state.projects.length ? state.projects.map(project => `
    <article class="item">
      <div class="row">
        <h4>${project.name}</h4>
        <span class="badge">${project.role || "Admin"}</span>
      </div>
      <p class="meta">${project.description || "No description added."}</p>
      <p class="meta">${project.members.length} team member(s)</p>
    </article>
  `).join("") : `<p class="meta">No projects yet.</p>`;
}

function renderTasks() {
  const today = new Date().toISOString().slice(0, 10);
  $("#tasks").innerHTML = state.tasks.length ? state.tasks.map(task => {
    const overdue = task.dueDate && task.dueDate < today && task.status !== "Done";
    return `
      <article class="item">
        <div class="row">
          <h4>${task.title}</h4>
          <span class="badge">${task.status}</span>
        </div>
        <p class="meta">${projectName(task.projectId)} · Assigned to ${names(task.assigneeId)}</p>
        <p class="meta ${overdue ? "overdue" : ""}">Due: ${task.dueDate || "Not set"}</p>
        <label>Status
          <select data-task="${task.id}" class="statusSelect">
            ${["Todo", "In Progress", "Done"].map(status => `<option ${task.status === status ? "selected" : ""}>${status}</option>`).join("")}
          </select>
        </label>
      </article>
    `;
  }).join("") : `<p class="meta">No tasks yet.</p>`;

  $$(".statusSelect").forEach(select => {
    select.addEventListener("change", async event => {
      await request(`/api/tasks/${event.target.dataset.task}`, {
        method: "PATCH",
        body: JSON.stringify({ status: event.target.value })
      });
      await refresh();
    });
  });
}

function renderSelects() {
  const projectOptions = state.projects.map(project => `<option value="${project.id}">${project.name}</option>`).join("");
  const userOptions = state.users.map(user => `<option value="${user.id}">${user.name} (${user.role})</option>`).join("");
  $$("select[name='projectId']").forEach(select => select.innerHTML = projectOptions);
  $$("select[name='userId'], select[name='assigneeId']").forEach(select => select.innerHTML = userOptions);
}

$("#authForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = new FormData(event.target);
  const payload = Object.fromEntries(form.entries());
  try {
    const data = await request(`/api/auth/${state.mode}`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    state.token = data.token;
    localStorage.setItem("token", data.token);
    await loadApp();
  } catch (error) {
    $("#authMessage").textContent = error.message;
  }
});

$$(".tabs button").forEach(button => button.addEventListener("click", () => setAuthMode(button.dataset.mode)));

$("#logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("token");
  state.token = null;
  state.user = null;
  showAuth();
});

$("#projectForm").addEventListener("submit", async event => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target).entries());
  await request("/api/projects", { method: "POST", body: JSON.stringify(payload) });
  event.target.reset();
  await refresh();
});

$("#memberForm").addEventListener("submit", async event => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target).entries());
  await request(`/api/projects/${payload.projectId}/members`, { method: "POST", body: JSON.stringify(payload) });
  await refresh();
});

$("#taskForm").addEventListener("submit", async event => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target).entries());
  await request("/api/tasks", { method: "POST", body: JSON.stringify(payload) });
  event.target.reset();
  await refresh();
});

loadApp();
