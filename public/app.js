const state = {
  token: localStorage.getItem("ttm_token"),
  user: JSON.parse(localStorage.getItem("ttm_user") || "null"),
  view: "dashboard",
  projects: [],
  users: [],
  selectedProjectId: null,
  members: [],
  tasks: [],
  dashboard: null,
  message: ""
};

const statusLabels = {
  todo: "To do",
  in_progress: "In progress",
  review: "Review",
  done: "Done"
};

const app = document.querySelector("#app");

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${state.token}`
  };
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    }
  });

  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Request failed");
  return data;
}

function setSession(payload) {
  state.token = payload.token;
  state.user = payload.user;
  localStorage.setItem("ttm_token", payload.token);
  localStorage.setItem("ttm_user", JSON.stringify(payload.user));
}

function clearSession() {
  localStorage.removeItem("ttm_token");
  localStorage.removeItem("ttm_user");
  state.token = null;
  state.user = null;
  state.projects = [];
  state.tasks = [];
  state.members = [];
  state.dashboard = null;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dateValue(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function isOverdue(task) {
  return task.dueDate && task.status !== "done" && dateValue(task.dueDate) < new Date().toISOString().slice(0, 10);
}

async function loadCore() {
  if (!state.token) return;
  const [projects, users, dashboard] = await Promise.all([
    api("/api/projects"),
    api("/api/users"),
    api("/api/dashboard")
  ]);
  state.projects = projects;
  state.users = users;
  state.dashboard = dashboard;
  if (!state.selectedProjectId && projects.length) state.selectedProjectId = projects[0].id;
  if (state.selectedProjectId) await loadProjectDetails(state.selectedProjectId);
}

async function loadProjectDetails(projectId) {
  state.selectedProjectId = Number(projectId);
  const [members, tasks] = await Promise.all([
    api(`/api/projects/${projectId}/members`),
    api(`/api/projects/${projectId}/tasks`)
  ]);
  state.members = members;
  state.tasks = tasks;
}

function selectedProject() {
  return state.projects.find((project) => project.id === state.selectedProjectId);
}

function canManageSelectedProject() {
  if (state.user?.role === "admin") return true;
  return state.members.some((member) => member.userId === state.user?.id && member.projectRole === "manager");
}

function renderAuth(mode = "login") {
  const isSignup = mode === "signup";
  app.innerHTML = `
    <section class="auth-page">
      <div class="auth-panel">
        <div class="auth-copy">
          <div class="brand"><span class="brand-mark">T</span><span>Team Task Manager</span></div>
          <h1>Plan projects, assign work, and spot bottlenecks quickly.</h1>
          <p>Create teams with admin/member access, manage project contributors, and track task status from one live dashboard.</p>
        </div>
        <div class="auth-form">
          <h2>${isSignup ? "Create account" : "Welcome back"}</h2>
          <form class="form" id="authForm">
            ${
              isSignup
                ? `<div class="field"><label>Name</label><input name="name" required minlength="2" autocomplete="name" /></div>`
                : ""
            }
            <div class="field"><label>Email</label><input name="email" required type="email" autocomplete="email" /></div>
            <div class="field"><label>Password</label><input name="password" required type="password" minlength="${isSignup ? 8 : 1}" autocomplete="${isSignup ? "new-password" : "current-password"}" /></div>
            ${
              isSignup
                ? `<div class="field"><label>Role</label><select name="role"><option value="member">Member</option><option value="admin">Admin</option></select></div>`
                : ""
            }
            <p id="authMessage" class="error"></p>
            <button class="btn" type="submit">${isSignup ? "Sign up" : "Log in"}</button>
            <button class="btn secondary" type="button" id="switchAuth">${isSignup ? "Use existing account" : "Create new account"}</button>
          </form>
        </div>
      </div>
    </section>
  `;

  document.querySelector("#switchAuth").addEventListener("click", () => renderAuth(isSignup ? "login" : "signup"));
  document.querySelector("#authForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.target));
    try {
      const payload = await api(isSignup ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST",
        body: JSON.stringify(form)
      });
      setSession(payload);
      await loadCore();
      renderApp();
    } catch (error) {
      document.querySelector("#authMessage").textContent = error.message;
    }
  });
}

function renderApp() {
  if (!state.token) {
    renderAuth();
    return;
  }

  app.innerHTML = `
    <section class="shell">
      <aside class="sidebar">
        <div class="brand"><span class="brand-mark">T</span><span>Team Task Manager</span></div>
        <div class="user-box">
          <strong>${escapeHtml(state.user.name)}</strong>
          <p>${escapeHtml(state.user.email)}</p>
          <p>${state.user.role === "admin" ? "Admin" : "Member"}</p>
        </div>
        <nav class="nav">
          ${navButton("dashboard", "Dashboard")}
          ${navButton("projects", "Projects")}
          ${navButton("tasks", "My tasks")}
        </nav>
        <button class="ghost-dark" id="logoutBtn">Log out</button>
      </aside>
      <section class="content">
        ${renderView()}
      </section>
    </section>
  `;

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      renderApp();
    });
  });
  document.querySelector("#logoutBtn").addEventListener("click", () => {
    clearSession();
    renderAuth();
  });
  bindViewEvents();
}

function navButton(view, label) {
  return `<button class="${state.view === view ? "active" : ""}" data-view="${view}">${label}</button>`;
}

function renderView() {
  if (state.view === "projects") return renderProjects();
  if (state.view === "tasks") return renderMyTasks();
  return renderDashboard();
}

function renderDashboard() {
  const summary = state.dashboard?.summary || {};
  const counts = Object.fromEntries((state.dashboard?.byStatus || []).map((row) => [row.status, row.count]));
  return `
    <div class="topbar">
      <div>
        <h1>Dashboard</h1>
        <p class="muted">A current read on workload, project count, and overdue work.</p>
      </div>
      <button class="btn" id="refreshBtn">Refresh</button>
    </div>
    <div class="grid stats">
      ${statCard("Total tasks", summary.total || 0)}
      ${statCard("My open tasks", summary.myTasks || 0)}
      ${statCard("Overdue", summary.overdue || 0)}
      ${statCard("Projects", summary.projects || 0)}
    </div>
    <div class="panel">
      <h2>Status distribution</h2>
      <div class="grid task-board">
        ${Object.entries(statusLabels)
          .map(([status, label]) => `<div class="item"><span class="pill ${status}">${label}</span><strong>${counts[status] || 0}</strong></div>`)
          .join("")}
      </div>
    </div>
  `;
}

function statCard(label, value) {
  return `<div class="panel stat"><span class="muted">${label}</span><strong>${value}</strong></div>`;
}

function renderProjects() {
  const project = selectedProject();
  return `
    <div class="topbar">
      <div>
        <h1>Projects</h1>
        <p class="muted">Create projects, add teammates, and move tasks through the board.</p>
      </div>
      <button class="btn" id="refreshBtn">Refresh</button>
    </div>
    <div class="grid columns">
      <div class="grid">
        <div class="panel">
          <h2>New project</h2>
          <form class="form" id="projectForm">
            <div class="field"><label>Name</label><input name="name" required minlength="2" /></div>
            <div class="field"><label>Description</label><textarea name="description"></textarea></div>
            <button class="btn" type="submit">Create project</button>
          </form>
        </div>
        <div class="panel">
          <h2>Project list</h2>
          <div class="list">
            ${
              state.projects.length
                ? state.projects.map(projectListItem).join("")
                : `<div class="empty">No projects yet. Create one to start assigning tasks.</div>`
            }
          </div>
        </div>
      </div>
      <div class="grid">
        ${project ? renderProjectDetail(project) : `<div class="panel empty">Choose or create a project.</div>`}
      </div>
    </div>
  `;
}

function projectListItem(project) {
  return `
    <button class="item ${project.id === state.selectedProjectId ? "selected" : ""}" data-project-id="${project.id}">
      <strong>${escapeHtml(project.name)}</strong>
      <span class="muted">${escapeHtml(project.description || "No description")}</span>
    </button>
  `;
}

function renderProjectDetail(project) {
  const canManage = canManageSelectedProject();
  return `
    <div class="panel">
      <h2>${escapeHtml(project.name)}</h2>
      <p class="muted">${escapeHtml(project.description || "No description")}</p>
      <div class="grid ${canManage ? "columns" : ""}">
        <div>
          <h3>Members</h3>
          <div class="list">
            ${state.members.map(memberItem).join("") || `<div class="empty">No members yet.</div>`}
          </div>
        </div>
        ${
          canManage
            ? `<form class="form" id="memberForm">
                <h3>Add member</h3>
                <div class="field"><label>User</label><select name="userId">${state.users.map((u) => `<option value="${u.id}">${escapeHtml(u.name)} (${escapeHtml(u.role)})</option>`).join("")}</select></div>
                <div class="field"><label>Project role</label><select name="projectRole"><option value="contributor">Contributor</option><option value="manager">Manager</option></select></div>
                <button class="btn" type="submit">Add to project</button>
              </form>`
            : ""
        }
      </div>
    </div>
    ${
      canManage
        ? `<div class="panel">
            <h2>New task</h2>
            ${taskForm()}
          </div>`
        : ""
    }
    <div class="panel">
      <h2>Task board</h2>
      <div class="grid task-board">
        ${Object.entries(statusLabels).map(([status, label]) => renderLane(status, label)).join("")}
      </div>
    </div>
  `;
}

function memberItem(member) {
  const canRemove = canManageSelectedProject() && member.userId !== state.user.id;
  return `
    <div class="item">
      <strong>${escapeHtml(member.name)}</strong>
      <div class="meta"><span>${escapeHtml(member.email)}</span><span class="pill">${escapeHtml(member.projectRole)}</span></div>
      ${canRemove ? `<button class="btn danger" data-remove-member="${member.userId}">Remove</button>` : ""}
    </div>
  `;
}

function taskForm(task = {}) {
  return `
    <form class="form" id="${task.id ? `taskEditForm-${task.id}` : "taskForm"}" data-task-form="${task.id || ""}">
      <div class="field"><label>Title</label><input name="title" required minlength="2" value="${escapeHtml(task.title || "")}" /></div>
      <div class="field"><label>Description</label><textarea name="description">${escapeHtml(task.description || "")}</textarea></div>
      <div class="field"><label>Assignee</label><select name="assigneeId"><option value="">Unassigned</option>${state.members
        .map((m) => `<option value="${m.userId}" ${task.assigneeId === m.userId ? "selected" : ""}>${escapeHtml(m.name)}</option>`)
        .join("")}</select></div>
      <div class="field"><label>Status</label><select name="status">${Object.entries(statusLabels)
        .map(([value, label]) => `<option value="${value}" ${task.status === value ? "selected" : ""}>${label}</option>`)
        .join("")}</select></div>
      <div class="field"><label>Priority</label><select name="priority">${["low", "medium", "high"]
        .map((value) => `<option value="${value}" ${task.priority === value ? "selected" : ""}>${value}</option>`)
        .join("")}</select></div>
      <div class="field"><label>Due date</label><input name="dueDate" type="date" value="${dateValue(task.dueDate)}" /></div>
      <button class="btn" type="submit">${task.id ? "Save task" : "Create task"}</button>
    </form>
  `;
}

function renderLane(status, label) {
  const tasks = state.tasks.filter((task) => task.status === status);
  return `
    <div class="lane">
      <h3>${label}</h3>
      ${
        tasks.length
          ? tasks.map(taskItem).join("")
          : `<div class="empty">No ${label.toLowerCase()} tasks.</div>`
      }
    </div>
  `;
}

function taskItem(task) {
  const canEditAll = canManageSelectedProject();
  const canUpdateStatus = canEditAll || task.assigneeId === state.user.id;
  return `
    <article class="card">
      <strong>${escapeHtml(task.title)}</strong>
      <p class="muted">${escapeHtml(task.description || "No description")}</p>
      <div class="meta">
        <span class="pill ${task.priority}">${escapeHtml(task.priority)}</span>
        <span>${escapeHtml(task.assigneeName || "Unassigned")}</span>
        ${task.dueDate ? `<span class="pill ${isOverdue(task) ? "overdue" : ""}">${dateValue(task.dueDate)}</span>` : ""}
      </div>
      ${
        canUpdateStatus
          ? `<div class="button-row">
              <select data-status-task="${task.id}">
                ${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}" ${task.status === value ? "selected" : ""}>${label}</option>`).join("")}
              </select>
              ${canEditAll ? `<button class="btn danger" data-delete-task="${task.id}">Delete</button>` : ""}
            </div>`
          : ""
      }
    </article>
  `;
}

function renderMyTasks() {
  const mine = state.tasks.filter((task) => task.assigneeId === state.user.id);
  return `
    <div class="topbar">
      <div>
        <h1>My tasks</h1>
        <p class="muted">Tasks currently assigned to you in the selected project.</p>
      </div>
      <button class="btn" id="refreshBtn">Refresh</button>
    </div>
    <div class="panel">
      <div class="list">
        ${mine.length ? mine.map(taskItem).join("") : `<div class="empty">No assigned tasks in this project.</div>`}
      </div>
    </div>
  `;
}

function bindViewEvents() {
  document.querySelector("#refreshBtn")?.addEventListener("click", refresh);

  document.querySelectorAll("[data-project-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      await loadProjectDetails(button.dataset.projectId);
      renderApp();
    });
  });

  document.querySelector("#projectForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.target));
    const project = await api("/api/projects", { method: "POST", body: JSON.stringify(form) });
    state.selectedProjectId = project.id;
    await refresh();
  });

  document.querySelector("#memberForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.target));
    await api(`/api/projects/${state.selectedProjectId}/members`, { method: "POST", body: JSON.stringify(form) });
    await refresh();
  });

  document.querySelector("#taskForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.target));
    await api(`/api/projects/${state.selectedProjectId}/tasks`, { method: "POST", body: JSON.stringify(form) });
    await refresh();
  });

  document.querySelectorAll("[data-remove-member]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/projects/${state.selectedProjectId}/members/${button.dataset.removeMember}`, { method: "DELETE" });
      await refresh();
    });
  });

  document.querySelectorAll("[data-delete-task]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/tasks/${button.dataset.deleteTask}`, { method: "DELETE" });
      await refresh();
    });
  });

  document.querySelectorAll("[data-status-task]").forEach((select) => {
    select.addEventListener("change", async () => {
      await api(`/api/tasks/${select.dataset.statusTask}`, {
        method: "PATCH",
        body: JSON.stringify({ status: select.value })
      });
      await refresh();
    });
  });
}

async function refresh() {
  await loadCore();
  renderApp();
}

loadCore()
  .then(renderApp)
  .catch(() => {
    clearSession();
    renderAuth();
  });
