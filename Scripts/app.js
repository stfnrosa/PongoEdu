const BASE_DATA = "../Assets/Data";
const LOGIN_PATH = "entrar.html";

/* ===== Componentes reutilizáveis (Bootstrap) ===== */

function btnCreate({ id = "", label, icon = "add" } = {}) {
  return `
    <button class="new-item-btn" id="${id}" type="button">
      <span class="material-symbols-rounded">${icon}</span>
      ${label}
    </button>`;
}

function btnModalConfirm({ id = "", label, icon = "check" } = {}) {
  return `
    <button class="btn btn-success btn-pongo fw-bold d-flex align-items-center gap-2" id="${id}" type="button">
      <span class="material-symbols-rounded" style="font-size:17px">${icon}</span>
      ${label}
    </button>`;
}

function btnModalCancel({ id = "", label = "Cancelar" } = {}) {
  return `<button class="btn btn-outline-secondary btn-pongo" id="${id}" type="button">${label}</button>`;
}

function btnModalDanger({ id = "", label } = {}) {
  return `<button class="btn btn-outline-danger btn-pongo" id="${id}" type="button">${label}</button>`;
}

function resultBadge(count, unit = "resultado(s)") {
  return `<span class="badge bg-pongo-purple rounded-pill">${count} ${unit}</span>`;
}

function exportCSV(filename, headers, rows) {
  const escape = v => {
    const s = String(v ?? "").replace(/"/g, '""');
    return /[,"\n]/.test(s) ? `"${s}"` : s;
  };
  const lines = [
    headers.map(escape).join(","),
    ...rows.map(r => r.map(escape).join(","))
  ];
  const bom = "﻿"; // UTF-8 BOM para Excel reconhecer acentos
  const blob = new Blob([bom + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`"${filename}" exportado com sucesso.`);
}

function showToast(message, type = "success") {
  const existing = document.getElementById("pongo-toast");
  if (existing) existing.remove();

  const icons = { success: "check_circle", error: "error", warning: "warning" };
  const colors = { success: "#08b44f", error: "#ff304f", warning: "#ff7a1a" };

  const toast = document.createElement("div");
  toast.id = "pongo-toast";
  toast.className = "pongo-toast";
  toast.innerHTML = `
    <span class="material-symbols-rounded" style="color:${colors[type]};font-size:20px">${icons[type]}</span>
    <span>${message}</span>
  `;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("pongo-toast--visible"));
  setTimeout(() => {
    toast.classList.remove("pongo-toast--visible");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

let appData = null;
let currentUser = null;
let currentProfile = null;

let localProdutos = null;
let produtosFilter = { search: "", status: "all" };
let currentEditId = null;

let localCategorias = null;
let currentEditCategoriaId = null;

let localRoteiros = null;
let roteirosFilter = { search: "", categoria: "all" };
let currentEditRoteiroId = null;

function getLocalCategorias() {
  if (!localCategorias) {
    localCategorias = JSON.parse(JSON.stringify(appData.categorias || []));
  }
  return localCategorias;
}

document.addEventListener("DOMContentLoaded", () => {
  bindDropdownEvents();
  initApp();
});

function bindDropdownEvents() {
  const userButton = document.getElementById("userDropdownButton");
  const userDropdown = document.getElementById("userDropdown");
  const arrow = document.getElementById("user-dropdown-arrow");

  const notifButton = document.getElementById("notificationButton");
  const notifDropdown = document.getElementById("notificationDropdown");

  function closeAll() {
    userDropdown?.classList.remove("open");
    notifDropdown?.classList.remove("open");
    if (arrow) arrow.textContent = "expand_more";
  }

  userButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = !userDropdown.classList.contains("open");
    closeAll();
    if (isOpen) {
      userDropdown.classList.add("open");
      if (arrow) arrow.textContent = "expand_less";
    }
  });

  notifButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = !notifDropdown.classList.contains("open");
    closeAll();
    if (isOpen) notifDropdown.classList.add("open");
  });

  document.addEventListener("click", closeAll);
}

async function initApp() {
  currentUser = getLoggedUser();

  if (!currentUser) {
    window.location.href = LOGIN_PATH;
    return;
  }

  // Migrate legacy URL-based avatars to emoji
  if (!currentUser.avatar || currentUser.avatar.startsWith("http")) {
    currentUser.avatar = currentUser.profile === "professor" ? "👨‍🏫" : "👩‍🔬";
    localStorage.setItem("pongo_user", JSON.stringify(currentUser));
  }

  const [profileData, agendamentos, categorias, produtos, roteiros, emprestimos] = await Promise.all([
    loadJSON(`${BASE_DATA}/profiles/${currentUser.profile}.json`),
    loadJSON(`${BASE_DATA}/agendamentos.json`),
    loadJSON(`${BASE_DATA}/categorias.json`),
    loadJSON(`${BASE_DATA}/produtos.json`),
    loadJSON(`${BASE_DATA}/roteiros.json`),
    loadJSON(`${BASE_DATA}/emprestimos.json`),
  ]);

  localProdutos = produtos;
  localRoteiros = JSON.parse(JSON.stringify(roteiros || []));
  appData = {
    profiles:   { [currentUser.profile]: { role: profileData.role } },
    menus:      { [currentUser.profile]: profileData.menu },
    dashboards: { [currentUser.profile]: profileData.dashboard },
    agendamentos,
    categorias,
    roteiros,
    emprestimos: JSON.parse(JSON.stringify(emprestimos || [])),
  };

  currentProfile = appData.profiles[currentUser.profile];

  if (!currentProfile) {
    logout();
    return;
  }

  renderUserInfo();
  renderMenu();
  bindLayoutEvents();
  loadPage("dashboard");
}

function getLoggedUser() {
  const user = localStorage.getItem("pongo_user");
  return user ? JSON.parse(user) : null;
}

async function loadJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Não foi possível carregar ${path}`);
  return response.json();
}

function renderUserInfo() {

  document.getElementById("user-role").textContent =
    "Gestão de Laboratórios";

  document.getElementById("user-name").textContent =
    currentUser.name;

  document.getElementById("user-profile-type").textContent =
    currentProfile.role;

  const dropdownName = document.getElementById("dropdown-user-name");
  if (dropdownName) dropdownName.textContent = currentUser.name;

  const dropdownRole = document.getElementById("dropdown-user-role");
  if (dropdownRole) dropdownRole.textContent = currentProfile.role;

  const avatarEl = document.getElementById("user-avatar");
  if (avatarEl) {
    avatarEl.textContent = currentUser.avatar || "👤";
    if (currentUser.avatarColor) avatarEl.style.background = currentUser.avatarColor;
  }
}

function renderMenu() {
  const menu = document.getElementById("sidebar-menu");
  const items = appData.menus[currentUser.profile];

  menu.innerHTML = "";

  items.forEach((item) => {
    if (item.type === "link") {
      menu.insertAdjacentHTML("beforeend", createMenuLink(item));
    }

    if (item.type === "group") {
      menu.insertAdjacentHTML("beforeend", createMenuGroup(item));
    }
  });

  bindMenuEvents();
}

function createMenuLink(item) {
  return `
    <a href="#" class="menu-item" data-page="${item.page}">
      <span class="material-symbols-rounded">${item.icon}</span>
      <span class="menu-text">${item.label}</span>
    </a>
  `;
}

function createMenuGroup(item) {
  const children = item.children.map((child) => {
    return `
      <a href="#" class="submenu-item" data-page="${child.page}">
        <span class="material-symbols-rounded">${child.icon}</span>
        <span class="menu-text">${child.label}</span>
      </a>
    `;
  }).join("");

  return `
    <div class="menu-group ${item.defaultOpen ? "open" : ""}">
      <button class="menu-title" type="button">
        <span class="material-symbols-rounded">${item.icon}</span>
        <span class="menu-text">${item.label}</span>
        <span class="material-symbols-rounded arrow">expand_more</span>
      </button>

      <div class="submenu">
        ${children}
      </div>
    </div>
  `;
}

function bindMenuEvents() {
  document.querySelectorAll(".menu-title").forEach((button) => {
    button.addEventListener("click", () => {
      button.closest(".menu-group").classList.toggle("open");
    });
  });

  document.querySelectorAll("[data-page]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();

      setActiveMenu(link);
      loadPage(link.dataset.page);
      closeMobileSidebar();
    });
  });

  document.getElementById("main-content")?.addEventListener("click", (event) => {
    const link = event.target.closest("[data-page]");
    if (!link) return;
    event.preventDefault();
    const sidebarLink = document.querySelector(
      `.menu-item[data-page="${link.dataset.page}"], .submenu-item[data-page="${link.dataset.page}"]`
    );
    if (sidebarLink) setActiveMenu(sidebarLink);
    loadPage(link.dataset.page);
    closeMobileSidebar();
  });
}

function setActiveMenu(activeLink) {
  document.querySelectorAll(".menu-item, .submenu-item").forEach((item) => {
    item.classList.remove("active");
  });

  activeLink.classList.add("active");
}

function loadPage(page) {
  closeMobileSidebar();
  if (page === "dashboard") {
    renderDashboard();
    setDashboardMenuActive();
    return;
  }

  if (page === "produtos") {
    renderProdutos();
    return;
  }

  if (page === "categorias-produtos") {
    renderCategorias();
    return;
  }

  if (page === "meus-roteiros") {
    renderRoteiros();
    return;
  }

  if (page === "emprestimos") {
    renderEmprestimos();
    return;
  }

  if (page === "meus-agendamentos") {
    renderMeusAgendamentos();
    return;
  }

  if (page === "meu-perfil") {
    renderMeuPerfil();
    return;
  }

  renderPlaceholder(page);
}

function setDashboardMenuActive() {
  const dashboardLink = document.querySelector('[data-page="dashboard"]');

  if (dashboardLink) {
    setActiveMenu(dashboardLink);
  }
}

function enrichDashboardData(dashboard, profile) {
  const data     = JSON.parse(JSON.stringify(dashboard));
  const today    = new Date().toISOString().slice(0, 10);

  const agendamentos = appData.agendamentos || [];
  const emprestimos  = appData.emprestimos  || [];
  const roteiros     = localRoteiros        || [];

  const todayAgend = agendamentos.filter(a => a.data === today);

  const futureLimit = new Date();
  futureLimit.setDate(futureLimit.getDate() + 7);
  const futureLimitStr = futureLimit.toISOString().slice(0, 10);
  const upcoming = agendamentos.filter(a => a.data >= today && a.data <= futureLimitStr);

  if (profile === "professor") {
    data.agendamentosHoje.items = todayAgend.length > 0
      ? todayAgend.map(a => ({
          inicio: a.horaInicio,
          fim:    a.horaFim,
          titulo: a.titulo,
          turma:  a.turma,
          alunos: "",
          status: a.status === "preparado" ? "confirmado" : "em-preparacao",
        }))
      : [{ inicio: "—", fim: "—", titulo: "Nenhum agendamento hoje", turma: "", alunos: "", status: "em-preparacao" }];

    const aguardando = agendamentos.filter(a => a.status === "pendente");
    data.praticasPreparadas.title     = "Práticas Aguardando";
    data.praticasPreparadas.icon      = "schedule";
    data.praticasPreparadas.iconColor = "yellow";
    data.praticasPreparadas.items = aguardando.map(a => ({
      titulo:    a.titulo,
      descricao: `${a.roteiro} • ${formatDateBR(a.data)} às ${a.horaInicio}`,
      status:    "pendente",
      tempo:     a.data === today ? "Hoje" : formatDateBR(a.data),
    }));

    data.table.iconColor  = "green";
    data.table.footerPage = "meus-roteiros";
    data.table.rows = roteiros.map(r => [
      { type: "iconText", icon: "assignment", text: r.titulo, color: "green" },
      r.categoria,
      `${(r.materiais || []).length} item(ns)`,
      r.turma || "—",
    ]);
  }

  if (profile === "auxiliar") {
    const pendentes    = agendamentos.filter(a => a.status === "pendente").length;
    const reservasHoje = todayAgend.length;
    const aVencer      = upcoming.length;

    data.summary.items[0].value = String(pendentes);
    data.summary.items[2].value = String(aVencer);
    data.summary.items[3].value = String(reservasHoje);

    const empStatusMap = {
      "agendado":     { label: "Empréstimo agendado",     icon: "schedule",     color: "blue"   },
      "em-andamento": { label: "Empréstimo em andamento", icon: "swap_horiz",   color: "orange" },
      "concluido":    { label: "Empréstimo concluído",    icon: "check_circle", color: "green"  },
    };
    data.activities.items = [...emprestimos].reverse().slice(0, 4).map(e => {
      const s = empStatusMap[e.status] || { label: "Empréstimo", icon: "history", color: "purple" };
      return {
        title: `${s.label}: ${e.produto}`,
        time:  `${formatDateBR(e.dataInicio)} às ${e.horaInicio}`,
        icon:  s.icon,
        color: s.color,
      };
    });
  }

  return data;
}

function renderDashboard() {
  const dashboard = enrichDashboardData(
    appData.dashboards[currentUser.profile],
    currentUser.profile
  );

  document.getElementById("main-content").innerHTML = `
    ${createHeroSection(dashboard)}
    ${createDashboardGrid(dashboard)}
  `;

  document.getElementById("dashboard-export-btn")?.addEventListener("click", () => {
    const headers = ["Nome", "Categoria", "Duração", "Turma", "Observação", "Qtd. Materiais"];
    const rows = (localRoteiros || []).map(r => [
      r.titulo, r.categoria, formatDuracao(r.duracao),
      r.turma || "", r.observacao || "", (r.materiais || []).length
    ]);
    if (rows.length === 0) {
      showToast("Nenhum roteiro para exportar.", "warning");
      return;
    }
    exportCSV("roteiros.csv", headers, rows);
  });
}

function createHeroSection(data) {
  return `
    <section class="hero-card">
      <div>
        <span class="badge-soft">
          <span class="material-symbols-rounded">${data.badgeIcon}</span>
          ${data.badge}
        </span>

        <h1>${data.greeting}</h1>

        <p>${data.description}</p>

        <div class="action-row">
          <a href="#" class="btn-green" data-page="${data.primaryAction.page}">
            <span class="material-symbols-rounded">${data.primaryAction.icon}</span>
            ${data.primaryAction.label}
          </a>

          <a href="#" class="btn-outline-purple" data-page="${data.secondaryAction.page}">
            ${data.secondaryAction.label}
            <span class="material-symbols-rounded">${data.secondaryAction.icon}</span>
          </a>
        </div>
      </div>

      ${data.heroImage
        ? `<div class="hero-image-wrap"><img src="${data.heroImage}" alt="" class="hero-image"></div>`
        : createStockHealth(data.stockHealth)
      }
    </section>
  `;
}

function createStockHealth(stock) {
  return `
    <aside class="stock-health">
      <div class="stock-health-header">
        <div>
          <small>${stock.label}</small>
          <h3>${stock.title}</h3>
        </div>

        <div class="stock-icon">
          <span class="material-symbols-rounded">${stock.icon}</span>
        </div>
      </div>

      ${stock.items.map((item) => `
        <div class="health-row">
          <div>
            <span>${item.label}</span>
            <strong>${item.value}%</strong>
          </div>

          <div class="progress">
            <span style="width: ${item.value}%; background: var(${item.color});"></span>
          </div>
        </div>
      `).join("")}
    </aside>
  `;
}

function createDashboardGrid(data) {
  const asideHtml = data.agendamentosHoje
    ? `${createAgendamentosHoje(data.agendamentosHoje)}${createPraticasPreparadas(data.praticasPreparadas)}`
    : `${createSummaryCard(data.summary)}${createActivitiesCard(data.activities)}`;

  return `
    <section class="main-grid">
      <div>
        ${createQuickAccess(data.quickAccess)}
        ${createMainTable(data.table)}
      </div>

      <aside>${asideHtml}</aside>
    </section>
  `;
}

function createAgendamentosHoje(data) {
  const statusMap = {
    confirmado: { label: "Confirmado", cls: "confirmado" },
    "em-preparacao": { label: "Em preparação", cls: "em-preparacao" }
  };

  return `
    <div class="card">
      <div class="card-header-line">
        <div class="card-title">
          <span class="material-symbols-rounded purple">${data.icon}</span>
          ${data.title}
        </div>
        <a href="#" class="card-link" data-page="meus-agendamentos">
          Ver todos
          <span class="material-symbols-rounded">arrow_forward</span>
        </a>
      </div>

      <div class="agenda-list">
        ${data.items.map(item => {
          const s = statusMap[item.status] || { label: item.status, cls: "" };
          return `
            <div class="agenda-item">
              <div class="agenda-time">
                <span>${item.inicio}</span>
                <span>${item.fim}</span>
              </div>
              <div class="agenda-body">
                <span class="agenda-titulo">${item.titulo}</span>
                <span class="agenda-info">${item.turma}${item.alunos ? ` • ${item.alunos} alunos` : ""}</span>
              </div>
              <span class="agenda-status ${s.cls}">${s.label}</span>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function createPraticasPreparadas(data) {
  const statusMap = {
    preparada: { label: "Preparada", icon: "check_circle", cls: "preparada" },
    pendente: { label: "Pendente", icon: "schedule", cls: "pendente" }
  };

  return `
    <div class="card">
      <div class="card-header-line">
        <div class="card-title">
          <span class="material-symbols-rounded ${data.iconColor || "green"}">${data.icon}</span>
          ${data.title}
        </div>
        <a href="#" class="card-link" data-page="meus-agendamentos">
          Ver todas
          <span class="material-symbols-rounded">arrow_forward</span>
        </a>
      </div>

      <div class="praticas-list">
        ${data.items.map(item => {
          const s = statusMap[item.status] || { label: item.status, icon: "help", cls: "" };
          return `
            <div class="pratica-item">
              <div class="pratica-icon ${s.cls}">
                <span class="material-symbols-rounded">${s.icon}</span>
              </div>
              <div class="pratica-body">
                <span class="pratica-titulo">${item.titulo}</span>
                <span class="pratica-desc">${item.descricao}</span>
              </div>
              <div class="pratica-meta">
                <span class="pratica-status ${s.cls}">${s.label}</span>
                <span class="pratica-tempo">${item.tempo}</span>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function createQuickAccess(items) {
  return `
    <div class="card">
      <div class="card-header-line">
        <div class="card-title">
          <span class="material-symbols-rounded green">bolt</span>
          Acesso rápido
        </div>

      </div>

      <div class="quick-grid">
        ${items.map((item) => `
          <article class="quick-card" data-page="${item.page}">
            <div class="icon-box ${item.color}">
              <span class="material-symbols-rounded">${item.icon}</span>
            </div>

            <h3>${item.title}</h3>
            <p>${item.description}</p>
          </article>
        `).join("")}
      </div>
    </div>
  `;
}

function createMainTable(table) {
  return `
    <div class="card">
      <div class="card-header-line">
        <div class="card-title">
          <span class="material-symbols-rounded ${table.iconColor || "orange"}">${table.icon}</span>
          ${table.title}
        </div>

        ${table.footerPage ? `
          <a href="#" class="card-link" data-page="${table.footerPage}">
            Ver todos
            <span class="material-symbols-rounded">arrow_forward</span>
          </a>
        ` : ""}
      </div>

      ${table.search ? `
        <div class="search-row">
          <label class="search-box">
            <span class="material-symbols-rounded">search</span>
            <input type="text" placeholder="${table.searchPlaceholder}">
          </label>

          <button class="export-btn" id="dashboard-export-btn">
            <span class="material-symbols-rounded">download</span>
            Exportar
          </button>
        </div>
      ` : ""}

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              ${table.columns.map((column) => `<th>${column}</th>`).join("")}
            </tr>
          </thead>

          <tbody>
            ${table.rows.map((row) => `
              <tr>
                ${row.map((cell) => createTableCell(cell)).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

    </div>
  `;
}

function createTableCell(cell) {
  if (typeof cell === "string") {
    return `<td>${cell}</td>`;
  }

  if (cell.type === "user") {
    return `
      <td>
        <div class="user-cell">
          <span class="initials ${cell.color}">${cell.initials}</span>
          ${cell.name}
        </div>
      </td>
    `;
  }

  if (cell.type === "iconText") {
    return `
      <td>
        <div class="user-cell">
          <span class="icon-chip ${cell.color}">
            <span class="material-symbols-rounded">${cell.icon}</span>
          </span>
          ${cell.text}
        </div>
      </td>
    `;
  }

  if (cell.type === "status") {
    return `
      <td>
        <span class="status ${cell.color}">
          ${cell.label}
        </span>
      </td>
    `;
  }

  return `<td>${cell.label || ""}</td>`;
}

function createSummaryCard(summary) {
  return `
    <div class="card">
      <div class="card-header-line">
        <div class="card-title">
          <span class="material-symbols-rounded blue">${summary.icon}</span>
          ${summary.title}
        </div>
        <span class="summary-live-dot"></span>
      </div>

      <div class="summary-list">
        ${summary.items.map((item) => `
          <div class="summary-row">
            <div class="icon-box ${item.color}">
              <span class="material-symbols-rounded">${item.icon}</span>
            </div>

            <div class="summary-row-text">
              <span>${item.title}</span>
              <small>${item.subtitle}</small>
            </div>

            <strong class="summary-row-value">${item.value}</strong>
          </div>
        `).join("")}
      </div>

      <a href="#" class="btn-green full-width" data-page="${summary.action.page}">
        ${summary.action.label}
        <span class="material-symbols-rounded">${summary.action.icon}</span>
      </a>
    </div>
  `;
}

function createActivitiesCard(activities) {
  return `
    <div class="card">
      <div class="card-header-line">
        <div class="card-title">
          <span class="material-symbols-rounded purple">${activities.icon}</span>
          ${activities.title}
        </div>
      </div>

      ${activities.items.map((item) => `
        <div class="activity-item">
          <div class="icon-box ${item.color}">
            <span class="material-symbols-rounded">${item.icon}</span>
          </div>

          <div class="activity-text">
            <strong>${item.title}</strong>
            <small>${item.time}</small>
          </div>

          <span class="material-symbols-rounded activity-arrow">
            chevron_right
          </span>
        </div>
      `).join("")}

      <div class="see-all">
        <a href="#">
          ${activities.footerLink}
          <span class="material-symbols-rounded">arrow_forward</span>
        </a>
      </div>
    </div>
  `;
}

function renderProdutos() {
  const isAuxiliar = currentUser.profile === "auxiliar";
  const categorias = getLocalCategorias();

  document.getElementById("main-content").innerHTML = `
    <div class="agend-page">
      <h1 class="page-section-title">Produtos</h1>
      <p class="page-section-sub">Consulte o inventário de materiais e reagentes disponíveis no laboratório.</p>
      <div class="page-toolbar">
        <label class="page-search">
          <span class="material-symbols-rounded">search</span>
          <input type="text" id="produtos-search" placeholder="Buscar por nome, código ou localização..." value="${produtosFilter.search}">
        </label>

        <div class="filter-dropdown-wrap">
          <button class="filter-btn ${produtosFilter.status !== "all" ? "active-filter" : ""}" id="status-filter-btn">
            <span class="material-symbols-rounded">filter_list</span>
            Filtrar status
            <span class="material-symbols-rounded" style="font-size:16px">expand_more</span>
          </button>
          <div class="filter-dropdown-menu" id="status-filter-menu">
            ${[
              { key: "all", label: "Todos" },
              { key: "normal", label: "Normal" },
              { key: "estoque-baixo", label: "Estoque baixo" },
              { key: "vencido", label: "Vencido" }
            ].map(s => `
              <div class="filter-option ${produtosFilter.status === s.key ? "active" : ""}" data-status="${s.key}">
                ${s.label}
              </div>
            `).join("")}
          </div>
        </div>

        <button class="export-btn-outline" id="produtos-export-btn">
          <span class="material-symbols-rounded">download</span>
          Exportar
        </button>

      </div>

      <div id="produtos-table-container">
        ${buildProdutosTable(getFilteredProdutos(), isAuxiliar)}
      </div>

      ${isAuxiliar ? buildCriarProdutoModal(categorias) : ""}
      ${buildViewProdutoModal()}
    </div>
  `;

  bindProdutosEvents(isAuxiliar);
}

function formatDateBR(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function buildEmprestimosList(items) {
  const statusMap = {
    pendente:      { label: "Pendente",     cls: "emp-status-agendado",  icon: "schedule" },
    agendado:      { label: "Agendado",     cls: "emp-status-agendado",  icon: "schedule" },
    "em-andamento":{ label: "Em andamento", cls: "emp-status-andamento", icon: "autorenew" },
    concluido:     { label: "Concluído",    cls: "emp-status-concluido", icon: "check_circle" },
  };
  const editableStatuses = ["pendente", "agendado"];

  if (items.length === 0) {
    return `<tr class="table-empty-row"><td colspan="6">Nenhum empréstimo encontrado.</td></tr>`;
  }

  return items.map(e => {
    const s = statusMap[e.status] || { label: e.status, cls: "", icon: "help" };
    const canEdit = editableStatuses.includes(e.status);
    return `
      <tr>
        <td><span class="emp-produto-nome">${e.produto}</span></td>
        <td>${e.quantidade}</td>
        <td>${formatDateBR(e.dataInicio)} ${e.horaInicio}</td>
        <td>${formatDateBR(e.dataFim)} ${e.horaFim}</td>
        <td>
          <span class="emp-status ${s.cls}">
            <span class="material-symbols-rounded">${s.icon}</span>
            ${s.label}
          </span>
        </td>
        <td>
          <div class="action-cell">
            <button class="action-icon-btn" title="Visualizar" data-view-emp-id="${e.id}">
              <span class="material-symbols-rounded">visibility</span>
            </button>
            ${canEdit ? `
            <button class="action-icon-btn" title="Editar" data-edit-emp-id="${e.id}">
              <span class="material-symbols-rounded">edit</span>
            </button>
            <button class="action-icon-btn delete" title="Excluir" data-delete-emp-id="${e.id}">
              <span class="material-symbols-rounded">delete</span>
            </button>` : ""}
          </div>
        </td>
      </tr>`;
  }).join("");
}

function buildCriarEmprestimoModal() {
  const categorias = getLocalCategorias();
  const produtos = (localProdutos || []).filter(p => {
    const cat = categorias.find(c => c.nome === p.categoria);
    return cat?.permiteEmprestimo === true;
  });

  return `
    <div class="modal-overlay" id="criar-emp-modal">
      <div class="modal-card modal-card-wide">
        <div class="modal-header">
          <span class="modal-title">Nova Solicitação de Empréstimo</span>
          <button class="modal-close" id="emp-modal-close">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>

        <div class="modal-body">
          

          <div class="modal-field">
            <label>Produto <span class="required-star">*</span></label>
            <select id="emp-produto">
              <option value="">Buscar produto...</option>
              ${produtos.map(p => `<option value="${p.id}">${p.nome} (${p.categoria})</option>`).join("")}
            </select>
          </div>

          <div class="modal-field">
            <label>Quantidade</label>
            <div class="emp-qty-control">
              <button class="emp-qty-btn" id="emp-qty-minus" type="button">
                <span class="material-symbols-rounded">remove</span>
              </button>
              <input class="emp-qty-input" type="number" id="emp-qty" value="1" min="1" max="99">
              <button class="emp-qty-btn" id="emp-qty-plus" type="button">
                <span class="material-symbols-rounded">add</span>
              </button>
            </div>
          </div>

          <div class="modal-field">
            <label>Período de uso</label>
            <div class="modal-row" style="margin-top:4px">
              <div class="modal-field">
                <label style="font-size:11px;color:var(--muted);font-weight:500;text-transform:none;letter-spacing:0">Data e hora de início</label>
                <input type="datetime-local" id="emp-inicio">
              </div>
              <div class="modal-field">
                <label style="font-size:11px;color:var(--muted);font-weight:500;text-transform:none;letter-spacing:0">Data e hora de término</label>
                <input type="datetime-local" id="emp-fim">
              </div>
            </div>
          </div>

          <div class="modal-field">
            <label>Observações</label>
            <textarea id="emp-obs" placeholder="Descreva a atividade ou objetivo do empréstimo..." rows="3"></textarea>
          </div>
        </div>

        <div class="modal-footer">
          ${btnModalCancel({ id: "emp-modal-cancel" })}
          ${btnModalConfirm({ id: "emp-modal-confirm", label: "Enviar Solicitação", icon: "send" })}
        </div>
      </div>
    </div>
  `;
}

function renderEmprestimos() {
  const empData = appData.emprestimos || [];
  let empFilter = { search: "", status: "all" };

  const renderList = () => {
    const q = empFilter.search.toLowerCase();
    const filtered = empData.filter(e => {
      const matchSearch = !q || e.produto.toLowerCase().includes(q);
      const matchStatus = empFilter.status === "all" || e.status === empFilter.status;
      return matchSearch && matchStatus;
    });
    const container = document.getElementById("emp-list-container");
    if (container) container.innerHTML = buildEmprestimosList(filtered);
    const badge = document.getElementById("emp-result-badge");
    if (badge) badge.outerHTML; // atualiza via re-render completo
    return filtered;
  };

  document.getElementById("main-content").innerHTML = `
    <div class="agend-page">
      <h1 class="page-section-title">Empréstimos</h1>
      <p class="page-section-sub">Acompanhe os empréstimos de materiais e equipamentos do laboratório.</p>
      <div class="page-toolbar">
        <label class="page-search">
          <span class="material-symbols-rounded">search</span>
          <input type="text" id="emp-search" placeholder="Buscar equipamento...">
        </label>

        <div class="filter-dropdown-wrap">
          <button class="filter-btn" id="emp-status-filter-btn">
            <span class="material-symbols-rounded">filter_list</span>
            Filtrar status
            <span class="material-symbols-rounded" style="font-size:16px">expand_more</span>
          </button>
          <div class="filter-dropdown-menu" id="emp-status-filter-menu">
            ${[
              { key: "all",          label: "Todos" },
              { key: "pendente",     label: "Pendente" },
              { key: "agendado",     label: "Agendado" },
              { key: "em-andamento", label: "Em andamento" },
              { key: "concluido",    label: "Concluído" },
            ].map((o, i) => `
              <div class="filter-option ${i === 0 ? "active" : ""}" data-emp-status="${o.key}">${o.label}</div>
            `).join("")}
          </div>
        </div>

        <button class="export-btn-outline" id="emp-export-btn">
          <span class="material-symbols-rounded">download</span>
          Exportar
        </button>
      </div>

      <div class="list-card">
        <div class="list-card-header">
          <span class="list-card-title">Lista de Empréstimos</span>
          <div style="display:flex;align-items:center;gap:12px">
            ${resultBadge(empData.length)}
            ${btnCreate({ id: "new-emprestimo-btn", label: "Criar Empréstimo" })}
          </div>
        </div>
        <div class="list-card-inner">
          <div class="table-wrap">
            <table class="produtos-table tbl-emprestimos">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Quantidade</th>
                  <th>Data início</th>
                  <th>Data fim</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody id="emp-list-container">
                ${buildEmprestimosList(empData)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      ${buildCriarEmprestimoModal()}
    </div>
  `;

  // Modal Criar Empréstimo
  const openEmpModal = () => {
    ["emp-produto", "emp-qty", "emp-inicio", "emp-fim", "emp-obs"].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.value = id === "emp-qty" ? "1" : ""; el.classList.remove("field-error"); }
    });
    document.getElementById("criar-emp-modal")?.classList.add("open");
  };
  const closeEmpModal = () => document.getElementById("criar-emp-modal")?.classList.remove("open");

  document.getElementById("new-emprestimo-btn")?.addEventListener("click", openEmpModal);
  document.getElementById("emp-modal-close")?.addEventListener("click", closeEmpModal);
  document.getElementById("emp-modal-cancel")?.addEventListener("click", closeEmpModal);
  document.getElementById("criar-emp-modal")?.addEventListener("click", e => {
    if (e.target === e.currentTarget) closeEmpModal();
  });

  document.getElementById("emp-qty-minus")?.addEventListener("click", () => {
    const el = document.getElementById("emp-qty");
    if (el && parseInt(el.value) > 1) el.value = parseInt(el.value) - 1;
  });
  document.getElementById("emp-qty-plus")?.addEventListener("click", () => {
    const el = document.getElementById("emp-qty");
    if (el) el.value = parseInt(el.value || 0) + 1;
  });

  document.getElementById("emp-modal-confirm")?.addEventListener("click", () => {
    const produtoEl = document.getElementById("emp-produto");
    const inicioEl  = document.getElementById("emp-inicio");
    const fimEl     = document.getElementById("emp-fim");

    [produtoEl, inicioEl, fimEl].forEach(el => el?.classList.remove("field-error"));
    let valid = true;
    if (!produtoEl?.value) { produtoEl.classList.add("field-error"); valid = false; }
    if (!inicioEl?.value)  { inicioEl.classList.add("field-error");  valid = false; }
    if (!fimEl?.value)     { fimEl.classList.add("field-error");     valid = false; }
    if (!valid) return;

    const produto = localProdutos?.find(p => p.id === produtoEl.value);
    const [dataInicio, horaInicio] = inicioEl.value.split("T");
    const [dataFim,    horaFim]    = fimEl.value.split("T");
    const qty = document.getElementById("emp-qty")?.value || "1";

    const novo = {
      id: String(Date.now()),
      produto: produto?.nome || produtoEl.value,
      quantidade: `${qty} unidade${qty > 1 ? "s" : ""}`,
      dataInicio, horaInicio: horaInicio?.slice(0,5) || "",
      dataFim,    horaFim:    horaFim?.slice(0,5)    || "",
      status: "agendado",
    };
    appData.emprestimos.push(novo);
    empData.push(novo);

    closeEmpModal();
    const container = document.getElementById("emp-list-container");
    if (container) container.innerHTML = buildEmprestimosList(empData);
    bindEmpActions();
    showToast("Solicitação de empréstimo enviada com sucesso.");
  });

  document.getElementById("emp-search")?.addEventListener("input", e => {
    empFilter.search = e.target.value;
    const q = empFilter.search.toLowerCase();
    const filtered = empData.filter(ev => {
      const matchSearch = !q || ev.produto.toLowerCase().includes(q);
      const matchStatus = empFilter.status === "all" || ev.status === empFilter.status;
      return matchSearch && matchStatus;
    });
    const container = document.getElementById("emp-list-container");
    if (container) container.innerHTML = buildEmprestimosList(filtered);
  });

  const empBtn  = document.getElementById("emp-status-filter-btn");
  const empMenu = document.getElementById("emp-status-filter-menu");
  empBtn?.addEventListener("click", e => { e.stopPropagation(); empMenu.classList.toggle("open"); });
  empMenu?.querySelectorAll(".filter-option").forEach(opt => {
    opt.addEventListener("click", e => {
      e.stopPropagation();
      empFilter.status = opt.dataset.empStatus;
      empMenu.classList.remove("open");
      empBtn.classList.toggle("active-filter", empFilter.status !== "all");
      empMenu.querySelectorAll(".filter-option").forEach(o =>
        o.classList.toggle("active", o === opt)
      );
      const q = empFilter.search.toLowerCase();
      const filtered = empData.filter(ev => {
        const matchSearch = !q || ev.produto.toLowerCase().includes(q);
        const matchStatus = empFilter.status === "all" || ev.status === empFilter.status;
        return matchSearch && matchStatus;
      });
      const container = document.getElementById("emp-list-container");
      if (container) container.innerHTML = buildEmprestimosList(filtered);
    });
  });
  document.addEventListener("click", () => empMenu?.classList.remove("open"));

  document.getElementById("emp-export-btn")?.addEventListener("click", () => {
    const headers = ["Produto", "Quantidade", "Data Início", "Hora Início", "Data Fim", "Hora Fim", "Status"];
    const statusLabel = { pendente: "Pendente", agendado: "Agendado", "em-andamento": "Em andamento", concluido: "Concluído" };
    const rows = empData.map(e => [
      e.produto, e.quantidade,
      formatDateBR(e.dataInicio), e.horaInicio,
      formatDateBR(e.dataFim), e.horaFim,
      statusLabel[e.status] || e.status
    ]);
    exportCSV("emprestimos.csv", headers, rows);
  });

  const bindEmpActions = () => {
    document.querySelectorAll("[data-view-emp-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        const e = empData.find(x => x.id === btn.dataset.viewEmpId);
        if (!e) return;
        showToast(`${e.produto} — ${formatDateBR(e.dataInicio)} ${e.horaInicio} até ${formatDateBR(e.dataFim)} ${e.horaFim}`);
      });
    });

    document.querySelectorAll("[data-delete-emp-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        const e = empData.find(x => x.id === btn.dataset.deleteEmpId);
        if (!e) return;
        if (!confirm(`Tem certeza que deseja excluir o empréstimo de "${e.produto}"? Esta ação não poderá ser desfeita.`)) return;
        const idx = appData.emprestimos.findIndex(x => x.id === e.id);
        if (idx !== -1) appData.emprestimos.splice(idx, 1);
        empData.splice(empData.indexOf(e), 1);
        const container = document.getElementById("emp-list-container");
        if (container) container.innerHTML = buildEmprestimosList(empData);
        bindEmpActions();
        showToast("Empréstimo excluído com sucesso.");
      });
    });

    document.querySelectorAll("[data-edit-emp-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        const e = empData.find(x => x.id === btn.dataset.editEmpId);
        if (e) showToast(`Edição de "${e.produto}" será disponibilizada em breve.`, "warning");
      });
    });
  };

  bindEmpActions();
}

function getFilteredProdutos() {
  const q = produtosFilter.search.toLowerCase();
  return (localProdutos || []).filter(p => {
    const matchSearch = !q ||
      p.nome.toLowerCase().includes(q) ||
      p.codigo.toLowerCase().includes(q) ||
      p.localizacao.toLowerCase().includes(q);
    const matchStatus = produtosFilter.status === "all" || p.status === produtosFilter.status;
    return matchSearch && matchStatus;
  });
}

function buildProdutosTable(produtos, isAuxiliar) {
  const statusLabels = { normal: "Normal", "estoque-baixo": "Estoque baixo", vencido: "Vencido" };

  const rows = produtos.length === 0
    ? `<tr class="table-empty-row"><td colspan="7">Nenhum produto encontrado.</td></tr>`
    : produtos.map(p => `
        <tr>
          <td>
            <span class="prod-codigo">${p.codigo}</span>
            ${p.nome}
          </td>
          <td>${p.categoria}</td>
          <td>${p.quantidade}</td>
          <td>${p.validade}</td>
          <td>
            <div class="localizacao-cell">
              <span class="material-symbols-rounded" style="font-size:15px;color:var(--muted)">location_on</span>
              ${p.localizacao}
            </div>
          </td>
          <td><span class="status-pill ${p.status}">${statusLabels[p.status] || p.status}</span></td>
          <td>
            <div class="action-cell">
              <button class="action-icon-btn" title="Visualizar" data-view-produto-id="${p.id}">
                <span class="material-symbols-rounded">visibility</span>
              </button>
              ${isAuxiliar ? `
                <button class="action-icon-btn" title="Editar" data-edit-id="${p.id}">
                  <span class="material-symbols-rounded">edit</span>
                </button>
                <button class="action-icon-btn delete" title="Excluir" data-delete-id="${p.id}">
                  <span class="material-symbols-rounded">delete</span>
                </button>
              ` : ""}
            </div>
          </td>
        </tr>
      `).join("");

  return `
    <div class="list-card">
      <div class="list-card-header">
        <span class="list-card-title">Lista de Produtos</span>
        <div style="display:flex;align-items:center;gap:12px">
          ${resultBadge(produtos.length)}
          ${isAuxiliar ? btnCreate({ id: "new-produto-btn", label: "Novo Produto" }) : ""}
        </div>
      </div>
      <div class="list-card-inner">
        <div class="table-wrap">
          <table class="produtos-table tbl-produtos">
            <thead>
              <tr>
                <th>Produtos</th>
                <th>Categoria</th>
                <th>Quantidade</th>
                <th>Validade</th>
                <th>Localização</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function buildCriarProdutoModal(categorias) {
  return `
    <div class="modal-overlay" id="criar-produto-modal">
      <div class="modal-card">
        <div class="modal-header">
          <span class="modal-title">Criar Produto</span>
          <button class="modal-close" id="modal-close-btn">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>

        <div class="modal-body">
          <div class="modal-row">
            <div class="modal-field">
              <label>Nome</label>
              <input type="text" id="prod-nome" placeholder="Ex.: Ácido Clorídrico">
            </div>
            <div class="modal-field">
              <label>Código</label>
              <input type="text" id="prod-codigo" placeholder="Ex.: 006">
            </div>
          </div>

          <div class="modal-row">
            <div class="modal-field">
              <label>Categoria</label>
              <select id="prod-categoria">
                <option value="">Selecione uma categoria...</option>
                ${categorias.map(c => `<option value="${c.nome}">${c.nome}</option>`).join("")}
              </select>
            </div>
            <div class="modal-field">
              <label>Unidade de Medida</label>
              <input type="text" id="prod-unidade" placeholder="Ex.: ml, g, unid.">
            </div>
          </div>

          <div class="modal-field">
            <label>Localização</label>
            <input type="text" id="prod-localizacao" placeholder="Ex.: Armário A1">
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-modal-cancel" id="modal-cancel-btn">Cancelar</button>
          <button class="btn-modal-save" id="modal-save-btn">
            <span class="material-symbols-rounded">check</span>
            Salvar Produto
          </button>
        </div>
      </div>
    </div>
  `;
}

function buildViewProdutoModal() {
  return `
    <div class="modal-overlay" id="view-produto-modal">
      <div class="modal-card">
        <div class="modal-header">
          <span class="modal-title">Detalhes do Produto</span>
          <button class="modal-close" id="view-produto-close">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>
        <div class="modal-body">
          <div class="modal-row">
            <div class="modal-field">
              <label>Nome</label>
              <div class="view-field-value" id="view-prod-nome"></div>
            </div>
            <div class="modal-field">
              <label>Código</label>
              <div class="view-field-value" id="view-prod-codigo"></div>
            </div>
          </div>
          <div class="modal-row">
            <div class="modal-field">
              <label>Categoria</label>
              <div class="view-field-value" id="view-prod-categoria"></div>
            </div>
            <div class="modal-field">
              <label>Quantidade</label>
              <div class="view-field-value" id="view-prod-quantidade"></div>
            </div>
          </div>
          <div class="modal-row">
            <div class="modal-field">
              <label>Validade</label>
              <div class="view-field-value" id="view-prod-validade"></div>
            </div>
            <div class="modal-field">
              <label>Localização</label>
              <div class="view-field-value" id="view-prod-localizacao"></div>
            </div>
          </div>
          <div class="modal-row">
            <div class="modal-field">
              <label>Status</label>
              <div id="view-prod-status"></div>
            </div>
            <div class="modal-field">
              <label>Permite Empréstimo</label>
              <div id="view-prod-emprestimo"></div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-modal-cancel" id="view-produto-close-btn">Fechar</button>
        </div>
      </div>
    </div>
  `;
}

function refreshProdutosTable(isAuxiliar) {
  const container = document.getElementById("produtos-table-container");
  if (container) {
    container.innerHTML = buildProdutosTable(getFilteredProdutos(), isAuxiliar);
    bindTableButtons(isAuxiliar);
  }
}

function bindTableButtons(isAuxiliar) {
  const statusLabels = { normal: "Normal", "estoque-baixo": "Estoque baixo", vencido: "Vencido" };

  document.querySelectorAll("[data-view-produto-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const p = localProdutos.find(x => x.id === btn.dataset.viewProdutoId);
      if (!p) return;
      document.getElementById("view-prod-nome").textContent       = p.nome;
      document.getElementById("view-prod-codigo").textContent     = p.codigo;
      document.getElementById("view-prod-categoria").textContent  = p.categoria;
      document.getElementById("view-prod-quantidade").textContent = p.quantidade;
      document.getElementById("view-prod-validade").textContent   = p.validade;
      document.getElementById("view-prod-localizacao").textContent= p.localizacao;
      document.getElementById("view-prod-status").innerHTML =
        `<span class="status-pill ${p.status}">${statusLabels[p.status] || p.status}</span>`;
      const cat = getLocalCategorias().find(c => c.nome === p.categoria);
      const permiteEmp = cat?.permiteEmprestimo === true;
      document.getElementById("view-prod-emprestimo").innerHTML =
        permiteEmp
          ? `<span class="status-pill normal">Sim</span>`
          : `<span class="status-pill estoque-baixo">Não</span>`;
      document.getElementById("view-produto-modal").classList.add("open");
    });
  });

  const closeView = () => document.getElementById("view-produto-modal")?.classList.remove("open");
  document.getElementById("view-produto-close")?.addEventListener("click", closeView);
  document.getElementById("view-produto-close-btn")?.addEventListener("click", closeView);
  document.getElementById("view-produto-modal")?.addEventListener("click", e => {
    if (e.target === e.currentTarget) closeView();
  });

  document.querySelectorAll("[data-delete-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      localProdutos = localProdutos.filter(p => p.id !== btn.dataset.deleteId);
      refreshProdutosTable(isAuxiliar);
    });
  });

  document.querySelectorAll("[data-edit-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const produto = localProdutos.find(p => p.id === btn.dataset.editId);
      if (!produto) return;

      currentEditId = produto.id;

      document.getElementById("prod-nome").value = produto.nome;
      document.getElementById("prod-codigo").value = produto.codigo;
      document.getElementById("prod-categoria").value = produto.categoria;
      document.getElementById("prod-unidade").value = produto.quantidade;
      document.getElementById("prod-localizacao").value = produto.localizacao;

      document.querySelector("#criar-produto-modal .modal-title").textContent = "Editar Produto";
      document.getElementById("modal-save-btn").innerHTML =
        `<span class="material-symbols-rounded">check</span> Salvar Alterações`;

      document.getElementById("criar-produto-modal").classList.add("open");
    });
  });
}

function bindProdutosEvents(isAuxiliar) {
  document.getElementById("produtos-search")?.addEventListener("input", e => {
    produtosFilter.search = e.target.value;
    refreshProdutosTable(isAuxiliar);
  });

  document.getElementById("produtos-export-btn")?.addEventListener("click", () => {
    const headers = ["Código", "Nome", "Categoria", "Quantidade", "Validade", "Localização", "Status"];
    const statusLabel = { normal: "Normal", "estoque-baixo": "Estoque baixo", vencido: "Vencido" };
    const rows = getFilteredProdutos().map(p => [
      p.codigo, p.nome, p.categoria, p.quantidade, p.validade, p.localizacao, statusLabel[p.status] || p.status
    ]);
    exportCSV("produtos.csv", headers, rows);
  });

  const statusBtn = document.getElementById("status-filter-btn");
  const statusMenu = document.getElementById("status-filter-menu");

  statusBtn?.addEventListener("click", e => {
    e.stopPropagation();
    statusMenu.classList.toggle("open");
  });

  statusMenu?.querySelectorAll(".filter-option").forEach(opt => {
    opt.addEventListener("click", e => {
      e.stopPropagation();
      produtosFilter.status = opt.dataset.status;
      statusMenu.classList.remove("open");
      statusBtn.classList.toggle("active-filter", produtosFilter.status !== "all");
      statusMenu.querySelectorAll(".filter-option").forEach(o =>
        o.classList.toggle("active", o.dataset.status === produtosFilter.status)
      );
      refreshProdutosTable(isAuxiliar);
    });
  });

  document.addEventListener("click", () => statusMenu?.classList.remove("open"), { once: false });

  bindTableButtons(isAuxiliar);

  if (!isAuxiliar) return;

  const resetModal = () => {
    currentEditId = null;
    ["prod-nome", "prod-codigo", "prod-categoria", "prod-unidade", "prod-localizacao"]
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    document.querySelector("#criar-produto-modal .modal-title").textContent = "Criar Produto";
    document.getElementById("modal-save-btn").innerHTML =
      `<span class="material-symbols-rounded">check</span> Salvar Produto`;
  };

  const openModal = () => document.getElementById("criar-produto-modal")?.classList.add("open");
  const closeModal = () => {
    document.getElementById("criar-produto-modal")?.classList.remove("open");
    resetModal();
  };

  document.getElementById("new-produto-btn")?.addEventListener("click", openModal);
  document.getElementById("modal-close-btn")?.addEventListener("click", closeModal);
  document.getElementById("modal-cancel-btn")?.addEventListener("click", closeModal);

  document.getElementById("criar-produto-modal")?.addEventListener("click", e => {
    if (e.target === e.currentTarget) closeModal();
  });

  document.getElementById("modal-save-btn")?.addEventListener("click", () => {
    const nome = document.getElementById("prod-nome").value.trim();
    const codigo = document.getElementById("prod-codigo").value.trim();
    const categoria = document.getElementById("prod-categoria").value;
    const unidade = document.getElementById("prod-unidade").value.trim();
    const localizacao = document.getElementById("prod-localizacao").value.trim();

    if (!nome || !codigo || !categoria || !unidade || !localizacao) return;

    if (currentEditId) {
      const idx = localProdutos.findIndex(p => p.id === currentEditId);
      if (idx !== -1) {
        localProdutos[idx] = { ...localProdutos[idx], nome, codigo, categoria, quantidade: unidade, localizacao };
      }
    } else {
      localProdutos.push({
        id: String(Date.now()),
        codigo,
        nome,
        categoria,
        quantidade: unidade,
        validade: "—",
        localizacao,
        status: "normal"
      });
    }

    closeModal();
    refreshProdutosTable(isAuxiliar);
  });
}

/* ===== Roteiros ===== */

function formatDuracao(d) {
  if (!d) return "—";
  const h = d.horas || 0;
  const m = d.minutos || 0;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

function renderRoteiros() {
  roteirosFilter = { search: "", categoria: "all" };
  const categoriasDisciplina = ["Química", "Física", "Biologia", "Ciências", "Outros"];

  document.getElementById("main-content").innerHTML = `
    <div class="agend-page">
      <h1 class="page-section-title">Roteiros</h1>
      <p class="page-section-sub">Crie e gerencie os roteiros de prática utilizados nos agendamentos de laboratório.</p>
      <div class="page-toolbar">
        <label class="page-search">
          <span class="material-symbols-rounded">search</span>
          <input type="text" id="roteiros-search" placeholder="Buscar roteiro...">
        </label>

        <div class="filter-dropdown-wrap">
          <button class="filter-btn" id="rot-cat-filter-btn">
            <span class="material-symbols-rounded">filter_list</span>
            Filtrar categoria
            <span class="material-symbols-rounded" style="font-size:16px">expand_more</span>
          </button>
          <div class="filter-dropdown-menu" id="rot-cat-filter-menu">
            <div class="filter-option active" data-rot-cat="all">Todas</div>
            ${categoriasDisciplina.map(c => `
              <div class="filter-option" data-rot-cat="${c}">${c}</div>
            `).join("")}
          </div>
        </div>

        <button class="export-btn-outline" id="roteiros-export-btn">
          <span class="material-symbols-rounded">download</span>
          Exportar
        </button>
      </div>

      <div id="roteiros-table-container">
        ${buildRoteirosTable(localRoteiros || [])}
      </div>

      ${buildCriarRoteiroModal()}
      ${buildViewRoteiroModal()}
    </div>
  `;

  bindRoteirosEvents();
}

function buildViewRoteiroModal() {
  return `
    <div class="modal-overlay" id="view-roteiro-modal">
      <div class="modal-card modal-card-wide">
        <div class="modal-header">
          <span class="modal-title">Detalhes do Roteiro</span>
          <button class="modal-close" id="view-roteiro-close">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>
        <div class="modal-body">
          <div class="modal-row">
            <div class="modal-field">
              <label>Nome</label>
              <div class="view-field-value" id="view-rot-titulo"></div>
            </div>
            <div class="modal-field">
              <label>Categoria</label>
              <div class="view-field-value" id="view-rot-categoria"></div>
            </div>
          </div>
          <div class="modal-row">
            <div class="modal-field">
              <label>Duração</label>
              <div class="view-field-value" id="view-rot-duracao"></div>
            </div>
            <div class="modal-field">
              <label>Turma</label>
              <div class="view-field-value" id="view-rot-turma"></div>
            </div>
          </div>
          <div class="modal-field">
            <label>Observações</label>
            <div class="view-field-value" id="view-rot-obs"></div>
          </div>
          <div class="modal-field">
            <label>Materiais</label>
            <div class="view-field-value" id="view-rot-materiais"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-modal-cancel" id="view-roteiro-close-btn">Fechar</button>
        </div>
      </div>
    </div>
  `;
}

function buildRoteirosTable(roteiros) {
  const isAuxiliar = currentUser.profile === "auxiliar";

  const rows = roteiros.length === 0
    ? `<tr class="table-empty-row"><td colspan="6">Nenhum roteiro encontrado.</td></tr>`
    : roteiros.map(r => `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="material-symbols-rounded" style="font-size:17px;color:var(--purple)">list_alt</span>
              ${r.titulo}
            </div>
          </td>
          <td>${r.categoria}</td>
          <td>${formatDuracao(r.duracao)}</td>
          <td>${r.turma || `<span style="color:var(--muted)">—</span>`}</td>
          <td>${(r.materiais || []).length} item(ns)</td>
          <td>
            <div class="action-cell">
              <button class="action-icon-btn" title="Visualizar" data-view-roteiro-id="${r.id}">
                <span class="material-symbols-rounded">visibility</span>
              </button>
              <button class="action-icon-btn" title="Editar" data-edit-roteiro-id="${r.id}">
                <span class="material-symbols-rounded">edit</span>
              </button>
              <button class="action-icon-btn delete" title="Excluir" data-delete-roteiro-id="${r.id}">
                <span class="material-symbols-rounded">delete</span>
              </button>
            </div>
          </td>
        </tr>
      `).join("");

  return `
    <div class="list-card">
      <div class="list-card-header">
        <span class="list-card-title">Lista de Roteiros</span>
        <div style="display:flex;align-items:center;gap:12px">
          ${resultBadge(roteiros.length)}
          ${isAuxiliar ? btnCreate({ id: "new-roteiro-btn", label: "Criar Roteiro" }) : ""}
        </div>
      </div>
      <div class="list-card-inner">
        <div class="table-wrap">
          <table class="produtos-table tbl-roteiros">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Categoria</th>
                <th>Duração</th>
                <th>Turma</th>
                <th>Materiais</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function buildCriarRoteiroModal() {
  const categoriasDisciplina = ["Química", "Física", "Biologia", "Ciências", "Outros"];
  return `
    <div class="modal-overlay" id="criar-roteiro-modal">
      <div class="modal-card modal-card-wide">
        <div class="modal-header">
          <span class="modal-title" id="roteiro-modal-title">Criar Roteiro</span>
          <button class="modal-close" id="roteiro-modal-close">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>

        <div class="modal-body">
          <div class="modal-row">
            <div class="modal-field">
              <label>Nome <span class="required-star">*</span></label>
              <input type="text" id="rot-nome" placeholder="Ex: Titulação Ácido-Base">
            </div>
            <div class="modal-field">
              <label>Categoria <span class="required-star">*</span></label>
              <select id="rot-categoria">
                <option value="">Selecione...</option>
                ${categoriasDisciplina.map(c => `<option value="${c}">${c}</option>`).join("")}
              </select>
            </div>
          </div>

          <div class="modal-row">
            <div class="modal-field">
              <label>Duração <span class="required-star">*</span></label>
              <div class="duracao-wrap">
                <select id="rot-horas" class="modal-input-sm">
                  <option value="" disabled selected>—</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                </select>
                <span class="duracao-sep">h</span>
                <select id="rot-minutos" class="modal-input-sm">
                  <option value="0">00</option>
                  <option value="30">30</option>
                </select>
                <span class="duracao-sep">min</span>
              </div>
            </div>
            <div class="modal-field">
              <label>Turma</label>
              <input type="text" id="rot-turma" placeholder="Ex: Química 2A">
            </div>
          </div>

          <div class="modal-field">
            <label>Observação</label>
            <textarea id="rot-obs" placeholder="Informações adicionais sobre o roteiro..." rows="3"></textarea>
          </div>

          <div class="materiais-section">
            <div class="materiais-hdr">
              <span class="materiais-label">Materiais necessários</span>
              <button class="add-mat-btn" id="rot-add-mat-btn">
                <span class="material-symbols-rounded">add</span>
                Adicionar
              </button>
            </div>
            <div class="materiais-list" id="rot-materiais-list">
              <div class="materiais-empty-hint">Clique em Adicionar para incluir materiais.</div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          ${btnModalCancel({ id: "roteiro-modal-cancel" })}
          ${btnModalConfirm({ id: "roteiro-modal-save", label: "Salvar Roteiro" })}
        </div>
      </div>
    </div>
  `;
}

function refreshRoteirosTable() {
  const q = roteirosFilter.search.toLowerCase();
  const filtered = (localRoteiros || []).filter(r => {
    const matchSearch = !q || r.titulo.toLowerCase().includes(q) || r.categoria.toLowerCase().includes(q);
    const matchCat = roteirosFilter.categoria === "all" || r.categoria === roteirosFilter.categoria;
    return matchSearch && matchCat;
  });
  const container = document.getElementById("roteiros-table-container");
  if (container) {
    container.innerHTML = buildRoteirosTable(filtered);
    bindRoteirosTableButtons();
  }
}

function collectRoteirosMateriaisRows() {
  const list = document.getElementById("rot-materiais-list");
  if (!list) return [];
  const materiais = [];
  list.querySelectorAll(".material-row").forEach(row => {
    const select = row.querySelector(".mat-select");
    const qtyInput = row.querySelector(".mat-qty-input");
    const nomeEl = row.querySelector(".mat-nome");
    if (select && select.value) {
      materiais.push({ produtoId: select.value, qty: qtyInput?.value || "" });
    } else if (nomeEl) {
      const produtoId = row.dataset.produtoId;
      const qty = row.querySelector(".mat-qty")?.textContent?.trim() || "";
      if (produtoId) materiais.push({ produtoId, qty });
    }
  });
  return materiais;
}

function resetRoteiroModal() {
  currentEditRoteiroId = null;
  ["rot-nome", "rot-turma", "rot-obs"].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ""; el.classList.remove("field-error"); }
  });
  const horasEl = document.getElementById("rot-horas");
  if (horasEl) { horasEl.selectedIndex = 0; horasEl.classList.remove("field-error"); }
  const minutosEl = document.getElementById("rot-minutos");
  if (minutosEl) { minutosEl.value = "0"; minutosEl.classList.remove("field-error"); }
  const cat = document.getElementById("rot-categoria");
  if (cat) { cat.value = ""; cat.classList.remove("field-error"); }
  const list = document.getElementById("rot-materiais-list");
  if (list) list.innerHTML = `<div class="materiais-empty-hint">Clique em Adicionar para incluir materiais.</div>`;
  document.getElementById("roteiro-modal-title").textContent = "Criar Roteiro";
  document.getElementById("roteiro-modal-save").innerHTML =
    `<span class="material-symbols-rounded">check</span> Salvar Roteiro`;
}

function bindRoteirosTableButtons() {
  document.querySelectorAll("[data-view-roteiro-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const r = (localRoteiros || []).find(x => x.id === btn.dataset.viewRoteiroId);
      if (!r) return;
      document.getElementById("view-rot-titulo").textContent    = r.titulo;
      document.getElementById("view-rot-categoria").textContent = r.categoria;
      document.getElementById("view-rot-duracao").textContent   = formatDuracao(r.duracao);
      document.getElementById("view-rot-turma").textContent     = r.turma || "—";
      document.getElementById("view-rot-obs").textContent       = r.observacao || "—";
      const mats = r.materiais || [];
      document.getElementById("view-rot-materiais").innerHTML = mats.length === 0
        ? `<span style="color:var(--muted)">Nenhum material cadastrado</span>`
        : mats.map(m => `<div style="padding:2px 0">${m.nome || m.produto || m.id}</div>`).join("");
      document.getElementById("view-roteiro-modal").classList.add("open");
    });
  });

  const closeView = () => document.getElementById("view-roteiro-modal")?.classList.remove("open");
  document.getElementById("view-roteiro-close")?.addEventListener("click", closeView);
  document.getElementById("view-roteiro-close-btn")?.addEventListener("click", closeView);
  document.getElementById("view-roteiro-modal")?.addEventListener("click", e => {
    if (e.target === e.currentTarget) closeView();
  });

  document.querySelectorAll("[data-delete-roteiro-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!confirm("Tem certeza que deseja excluir este roteiro? Esta ação não poderá ser desfeita.")) return;
      localRoteiros = (localRoteiros || []).filter(r => r.id !== btn.dataset.deleteRoteiroId);
      refreshRoteirosTable();
      showToast("Roteiro excluído com sucesso.");
    });
  });

  document.querySelectorAll("[data-edit-roteiro-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const roteiro = (localRoteiros || []).find(r => r.id === btn.dataset.editRoteiroId);
      if (!roteiro) return;

      currentEditRoteiroId = roteiro.id;
      document.getElementById("rot-nome").value         = roteiro.titulo;
      document.getElementById("rot-categoria").value    = roteiro.categoria;
      document.getElementById("rot-horas").value        = roteiro.duracao?.horas ?? 1;
      document.getElementById("rot-minutos").value      = roteiro.duracao?.minutos ?? 0;
      document.getElementById("rot-turma").value        = roteiro.turma || "";
      document.getElementById("rot-obs").value          = roteiro.observacao || "";

      const list = document.getElementById("rot-materiais-list");
      if (list) list.innerHTML = "";
      (roteiro.materiais || []).forEach(m => addMaterialRow(m.produtoId, m.qty, "rot-materiais-list", false));
      if ((roteiro.materiais || []).length === 0 && list) {
        list.innerHTML = `<div class="materiais-empty-hint">Clique em Adicionar para incluir materiais.</div>`;
      }

      document.getElementById("roteiro-modal-title").textContent = "Editar Roteiro";
      document.getElementById("roteiro-modal-save").innerHTML =
        `<span class="material-symbols-rounded">check</span> Salvar Alterações`;

      document.getElementById("criar-roteiro-modal")?.classList.add("open");
    });
  });

  document.getElementById("new-roteiro-btn")?.addEventListener("click", () => {
    resetRoteiroModal();
    document.getElementById("criar-roteiro-modal")?.classList.add("open");
  });
}

function bindRoteirosEvents() {
  document.getElementById("roteiros-search")?.addEventListener("input", e => {
    roteirosFilter.search = e.target.value;
    refreshRoteirosTable();
  });

  document.getElementById("roteiros-export-btn")?.addEventListener("click", () => {
    const headers = ["Nome", "Categoria", "Duração", "Turma", "Observação", "Qtd. Materiais"];
    const q = roteirosFilter.search.toLowerCase();
    const filtered = (localRoteiros || []).filter(r => {
      const matchSearch = !q || r.titulo.toLowerCase().includes(q) || r.categoria.toLowerCase().includes(q);
      const matchCat = roteirosFilter.categoria === "all" || r.categoria === roteirosFilter.categoria;
      return matchSearch && matchCat;
    });
    const rows = filtered.map(r => [
      r.titulo, r.categoria, formatDuracao(r.duracao),
      r.turma || "", r.observacao || "", (r.materiais || []).length
    ]);
    exportCSV("roteiros.csv", headers, rows);
  });

  const rotCatBtn  = document.getElementById("rot-cat-filter-btn");
  const rotCatMenu = document.getElementById("rot-cat-filter-menu");

  rotCatBtn?.addEventListener("click", e => {
    e.stopPropagation();
    rotCatMenu.classList.toggle("open");
  });

  rotCatMenu?.querySelectorAll(".filter-option").forEach(opt => {
    opt.addEventListener("click", e => {
      e.stopPropagation();
      roteirosFilter.categoria = opt.dataset.rotCat;
      rotCatMenu.classList.remove("open");
      rotCatBtn.classList.toggle("active-filter", roteirosFilter.categoria !== "all");
      rotCatMenu.querySelectorAll(".filter-option").forEach(o =>
        o.classList.toggle("active", o.dataset.rotCat === roteirosFilter.categoria)
      );
      refreshRoteirosTable();
    });
  });

  document.addEventListener("click", () => rotCatMenu?.classList.remove("open"));

  bindRoteirosTableButtons();

  const openModal = () => {
    resetRoteiroModal();
    document.getElementById("criar-roteiro-modal")?.classList.add("open");
  };
  const closeModal = () => {
    document.getElementById("criar-roteiro-modal")?.classList.remove("open");
    resetRoteiroModal();
  };

  document.getElementById("roteiro-modal-close")?.addEventListener("click", closeModal);
  document.getElementById("roteiro-modal-cancel")?.addEventListener("click", closeModal);
  document.getElementById("criar-roteiro-modal")?.addEventListener("click", e => {
    if (e.target === e.currentTarget) closeModal();
  });

  document.getElementById("rot-add-mat-btn")?.addEventListener("click", () => {
    addMaterialRow("", "", "rot-materiais-list", false);
  });

  document.getElementById("roteiro-modal-save")?.addEventListener("click", () => {
    const nomeEl     = document.getElementById("rot-nome");
    const catEl      = document.getElementById("rot-categoria");
    const horasEl    = document.getElementById("rot-horas");
    const minutosEl  = document.getElementById("rot-minutos");

    [nomeEl, catEl, horasEl].forEach(el => el?.classList.remove("field-error"));

    let valid = true;
    if (!nomeEl?.value.trim())    { nomeEl.classList.add("field-error");  valid = false; }
    if (!catEl?.value)            { catEl.classList.add("field-error");   valid = false; }
    const horas = parseInt(horasEl?.value, 10);
    if (!horasEl?.value || isNaN(horas) || horas < 1) {
      horasEl?.classList.add("field-error"); valid = false;
    }
    if (!valid) return;

    const minutos = parseInt(minutosEl?.value, 10) || 0;
    const materiais = collectRoteirosMateriaisRows();

    if (currentEditRoteiroId) {
      const idx = (localRoteiros || []).findIndex(r => r.id === currentEditRoteiroId);
      if (idx !== -1) {
        localRoteiros[idx] = {
          ...localRoteiros[idx],
          titulo:     nomeEl.value.trim(),
          categoria:  catEl.value,
          duracao:    { horas, minutos },
          turma:      document.getElementById("rot-turma")?.value.trim() || "",
          observacao: document.getElementById("rot-obs")?.value.trim() || "",
          materiais,
        };
      }
    } else {
      localRoteiros = localRoteiros || [];
      localRoteiros.push({
        id:         String(Date.now()),
        titulo:     nomeEl.value.trim(),
        categoria:  catEl.value,
        duracao:    { horas, minutos },
        turma:      document.getElementById("rot-turma")?.value.trim() || "",
        observacao: document.getElementById("rot-obs")?.value.trim() || "",
        materiais,
      });
    }

    closeModal();
    refreshRoteirosTable();
  });
}

/* ===== Meus Agendamentos ===== */

const CAL_START = 7;
const CAL_END = 22;
const HOUR_PX = 64;
let calWeekOffset = 0;

function renderMeusAgendamentos() {
  calWeekOffset = 0;
  document.getElementById("main-content").innerHTML = `
    <div class="agend-page">
      <h1 class="page-section-title">Meus Agendamentos</h1>
      <p class="page-section-sub">Visualize a disponibilidade dos laboratórios e crie agendamentos com roteiro de materiais.</p>
      <div id="calendar-container">${buildCalendarSection()}</div>
      ${buildCriarAgendamentoModal()}
      ${buildVisualizarAgendamentoModal()}
    </div>
  `;
  bindCalendarEvents();
}

function getWeekDays(offset) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay() + offset * 7);
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function toDateStr(d) {
  return d.toISOString().split("T")[0];
}

function formatWeekRange(days) {
  const sd = days[0].getDate().toString().padStart(2, "0");
  const ed = days[6].getDate().toString().padStart(2, "0");
  const my = days[6].toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return `${sd} – ${ed} de ${my}`;
}

function buildCalendarSection() {
  const DAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const days = getWeekDays(calWeekOffset);
  const todayStr = toDateStr(new Date());
  const agendamentos = appData.agendamentos || [];
  const hours = Array.from({ length: CAL_END - CAL_START }, (_, i) => CAL_START + i);

  const now = new Date();
  const nowTop = (now.getHours() - CAL_START) * HOUR_PX + (now.getMinutes() / 60) * HOUR_PX;
  const showNow = calWeekOffset === 0 && now.getHours() >= CAL_START && now.getHours() < CAL_END;

  const dayHeaders = days.map((d, i) => {
    const isToday = toDateStr(d) === todayStr;
    return `
      <div class="cal-day-hdr">
        <span class="cal-day-name">${DAY_NAMES[i]}</span>
        <span class="cal-day-num${isToday ? " is-today" : ""}">${d.getDate().toString().padStart(2, "0")}</span>
      </div>`;
  }).join("");

  const timeLabels = hours.map(h =>
    `<div class="cal-hour-label" style="top:${(h - CAL_START) * HOUR_PX}px">${h.toString().padStart(2, "0")}:00</div>`
  ).join("");

  const dayCols = days.map(d => {
    const dateStr = toDateStr(d);
    const events = agendamentos.filter(a => a.data === dateStr).map(evt => {
      const [sh, sm] = evt.horaInicio.split(":").map(Number);
      const [eh, em] = evt.horaFim.split(":").map(Number);
      const top = (sh - CAL_START) * HOUR_PX + (sm / 60) * HOUR_PX;
      const height = (eh - sh) * HOUR_PX + ((em - sm) / 60) * HOUR_PX;
      const isPendente = evt.status === "pendente";
      const colorClass = isPendente ? "yellow" : "green";
      const icon = isPendente
        ? `<span class="material-symbols-rounded cal-evt-icon">schedule</span>`
        : "";
      return `
        <div class="cal-event cal-event-${colorClass}" data-agend-id="${evt.id}" style="top:${top}px;height:${height}px;cursor:pointer">
          <div class="cal-evt-hdr">
            <span class="cal-evt-time">${evt.horaInicio} - ${evt.horaFim}</span>
            ${icon}
          </div>
          <span class="cal-evt-title">${evt.titulo}</span>
          <span class="cal-evt-turma">${evt.turma}</span>
        </div>`;
    }).join("");

    return `<div class="cal-day-col">${events}</div>`;
  }).join("");

  const nowLine = showNow ? `
    <div class="cal-now-line" style="top:${nowTop}px;"></div>
    <div class="cal-now-dot" style="top:${nowTop}px;"></div>
  ` : "";

  return `
    <div class="cal-card">
      <div class="cal-toolbar">
        <div class="cal-nav-group">
          <span class="cal-label">Agenda da semana</span>
          <button class="cal-nav-btn" id="cal-prev"><span class="material-symbols-rounded">chevron_left</span></button>
          <button class="cal-nav-btn" id="cal-next"><span class="material-symbols-rounded">chevron_right</span></button>
          <span class="cal-range">${formatWeekRange(days)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          ${resultBadge(agendamentos.length, "agendamento(s)")}
          ${btnCreate({ id: "cal-create-btn", label: "Criar Agendamento" })}
        </div>
      </div>

      <div class="cal-header-row">
        <div class="cal-gutter"></div>
        ${dayHeaders}
      </div>

      <div class="cal-body-wrap">
        <div class="cal-body" style="height:${(CAL_END - CAL_START) * HOUR_PX}px">
          <div class="cal-time-col">${timeLabels}</div>
          ${dayCols}
          ${nowLine}
        </div>
      </div>
    </div>
  `;
}

function buildCriarAgendamentoModal() {
  const roteiros = localRoteiros || [];
  return `
    <div class="modal-overlay" id="criar-agend-modal">
      <div class="modal-card modal-card-wide">
        <div class="modal-header">
          <span class="modal-title">Criar Agendamento</span>
          <button class="modal-close" id="agend-modal-close">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>

        <div class="modal-body">
          <div class="modal-field">
            <label>Nome <span class="required-star">*</span></label>
            <input type="text" id="agend-nome" placeholder="Ex: Titulação Ácido-Base">
          </div>

          <div class="modal-row">
            <div class="modal-field">
              <label>Data <span class="required-star">*</span></label>
              <input type="date" id="agend-data">
            </div>
            <div class="modal-field">
              <label>Horário <span class="required-star">*</span></label>
              <div class="time-range-wrap">
                <input type="time" id="agend-inicio" value="10:00">
                <span class="time-sep">–</span>
                <input type="time" id="agend-fim" value="12:00">
              </div>
            </div>
          </div>

          <div class="modal-row">
            <div class="modal-field">
              <label>Roteiro</label>
              <select id="agend-roteiro">
                <option value="">Selecione...</option>
                ${roteiros.map(r => `<option value="${r.titulo}">${r.titulo}</option>`).join("")}
              </select>
            </div>
            <div class="modal-field">
              <label>Turma</label>
              <input type="text" id="agend-turma" placeholder="Ex: Química 2A">
            </div>
          </div>

          <div class="modal-field">
            <label>Observações</label>
            <textarea id="agend-obs" placeholder="Informações adicionais sobre o agendamento..." rows="3"></textarea>
          </div>

          <div class="materiais-section">
            <div class="materiais-hdr">
              <span class="materiais-label">Materiais necessários</span>
              <button class="add-mat-btn">
                <span class="material-symbols-rounded">add</span>
                Adicionar
              </button>
            </div>

            <div class="materiais-list" id="agend-materiais-list">
              <div class="materiais-empty-hint">Selecione um roteiro ou clique em Adicionar para incluir materiais.</div>
            </div>

            <div class="material-alert" id="material-alert-box" style="display:none">
              <span class="material-symbols-rounded">warning</span>
              <span id="material-alert-text"></span>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          ${btnModalCancel({ id: "agend-modal-cancel" })}
          <div class="agend-footer-actions">
            <button class="btn-enviar-analise" id="btn-enviar-analise" style="display:none">Enviar para análise</button>
            ${btnModalConfirm({ id: "agend-confirm-btn", label: "Confirmar agendamento" })}
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildVisualizarAgendamentoModal() {
  const roteiros = localRoteiros || [];
  return `
    <div class="modal-overlay" id="view-agend-modal">
      <div class="modal-card modal-card-wide" id="view-agend-card">
        <div class="modal-header">
          <span class="modal-title" id="view-modal-title">Visualizar Agendamento</span>
          <button class="modal-close" id="view-agend-modal-close">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>

        <div class="modal-body">
          <div class="modal-field">
            <label>Nome <span class="required-star">*</span></label>
            <input type="text" id="view-agend-nome" placeholder="Ex: Titulação Ácido-Base">
          </div>

          <div class="modal-row">
            <div class="modal-field">
              <label>Data <span class="required-star">*</span></label>
              <input type="date" id="view-agend-data">
            </div>
            <div class="modal-field">
              <label>Horário <span class="required-star">*</span></label>
              <div class="time-range-wrap">
                <input type="time" id="view-agend-inicio">
                <span class="time-sep">–</span>
                <input type="time" id="view-agend-fim">
              </div>
            </div>
          </div>

          <div class="modal-row">
            <div class="modal-field">
              <label>Roteiro</label>
              <select id="view-agend-roteiro">
                <option value="">Selecione...</option>
                ${roteiros.map(r => `<option value="${r.titulo}">${r.titulo}</option>`).join("")}
              </select>
            </div>
            <div class="modal-field">
              <label>Turma</label>
              <input type="text" id="view-agend-turma" placeholder="Ex: Química 2A">
            </div>
          </div>

          <div class="modal-field">
            <label>Observações</label>
            <textarea id="view-agend-obs" placeholder="Informações adicionais sobre o agendamento..." rows="3"></textarea>
          </div>

          <div class="materiais-section">
            <div class="materiais-hdr">
              <span class="materiais-label">Materiais necessários</span>
              <button class="add-mat-btn" id="view-add-mat-btn">
                <span class="material-symbols-rounded">add</span>
                Adicionar
              </button>
            </div>
            <div class="materiais-list" id="view-agend-materiais-list">
              <div class="materiais-empty-hint">Nenhum material registrado.</div>
            </div>
          </div>
        </div>

        <div class="modal-footer" style="justify-content:space-between">
          ${btnModalDanger({ id: "view-cancel-agend-btn", label: "Cancelar Agendamento" })}
          <div class="agend-footer-actions">
            ${btnModalCancel({ id: "view-close-btn", label: "Fechar" })}
            ${btnModalConfirm({ id: "view-save-btn", label: "Salvar Alterações" })}
          </div>
        </div>
      </div>
    </div>
  `;
}

function refreshCalendar() {
  const container = document.getElementById("calendar-container");
  if (container) {
    container.innerHTML = buildCalendarSection();
    bindCalendarNavEvents();
    bindCalEventClicks();
  }
}

function bindCalendarNavEvents() {
  document.getElementById("cal-prev")?.addEventListener("click", () => {
    calWeekOffset--;
    refreshCalendar();
  });
  document.getElementById("cal-next")?.addEventListener("click", () => {
    calWeekOffset++;
    refreshCalendar();
  });
  document.getElementById("cal-create-btn")?.addEventListener("click", () => {
    resetAgendamentoModal();
    document.getElementById("criar-agend-modal")?.classList.add("open");
  });
}

function bindCalendarEvents() {
  bindCalendarNavEvents();

  const closeModal = () => document.getElementById("criar-agend-modal")?.classList.remove("open");
  document.getElementById("agend-modal-close")?.addEventListener("click", closeModal);
  document.getElementById("agend-modal-cancel")?.addEventListener("click", closeModal);
  document.getElementById("criar-agend-modal")?.addEventListener("click", e => {
    if (e.target === e.currentTarget) closeModal();
  });

  document.querySelector(".add-mat-btn")?.addEventListener("click", () => addMaterialRow());

  document.getElementById("agend-roteiro")?.addEventListener("change", e => {
    populateMateriaisFromRoteiro(e.target.value);
  });

  // View/Edit modal
  const closeViewModal = () => document.getElementById("view-agend-modal")?.classList.remove("open");
  document.getElementById("view-agend-modal-close")?.addEventListener("click", closeViewModal);
  document.getElementById("view-close-btn")?.addEventListener("click", closeViewModal);
  document.getElementById("view-agend-modal")?.addEventListener("click", e => {
    if (e.target === e.currentTarget) closeViewModal();
  });

  document.getElementById("view-add-mat-btn")?.addEventListener("click", () => {
    addMaterialRow("", "", "view-agend-materiais-list");
  });

  document.getElementById("view-agend-roteiro")?.addEventListener("change", e => {
    populateMateriaisFromRoteiro(e.target.value, "view-agend-materiais-list");
  });

  document.getElementById("view-cancel-agend-btn")?.addEventListener("click", () => {
    const card = document.getElementById("view-agend-card");
    const isPendente = card?.dataset.mode === "edit";
    const msg = isPendente
      ? "Este agendamento ainda está pendente e pode ser editado. Deseja cancelar o agendamento?"
      : "Este agendamento já foi preparado pela equipe auxiliar. Deseja realmente cancelá-lo?";
    if (confirm(msg)) {
      const id = card?.dataset.agendId;
      appData.agendamentos = appData.agendamentos.filter(a => a.id !== id);
      closeViewModal();
      refreshCalendar();
    }
  });

  document.getElementById("view-save-btn")?.addEventListener("click", () => {
    const card = document.getElementById("view-agend-card");
    const id = card?.dataset.agendId;
    const agend = appData.agendamentos.find(a => a.id === id);
    if (!agend) return;

    const nomeEl   = document.getElementById("view-agend-nome");
    const dataEl   = document.getElementById("view-agend-data");
    const inicioEl = document.getElementById("view-agend-inicio");
    const fimEl    = document.getElementById("view-agend-fim");

    const required = [nomeEl, dataEl, inicioEl, fimEl];
    required.forEach(el => el?.classList.remove("field-error"));
    let valid = true;
    required.forEach(el => {
      if (!el?.value?.trim()) { el.classList.add("field-error"); valid = false; }
    });
    if (!valid) return;

    agend.titulo      = nomeEl.value.trim();
    agend.data        = dataEl.value;
    agend.horaInicio  = inicioEl.value;
    agend.horaFim     = fimEl.value;
    agend.roteiro     = document.getElementById("view-agend-roteiro")?.value || "";
    agend.turma       = document.getElementById("view-agend-turma")?.value.trim() || "";
    agend.observacoes = document.getElementById("view-agend-obs")?.value.trim() || "";

    closeViewModal();
    refreshCalendar();
  });

  bindCalEventClicks();

  document.getElementById("agend-confirm-btn")?.addEventListener("click", () => {
    const nomeEl   = document.getElementById("agend-nome");
    const dataEl   = document.getElementById("agend-data");
    const inicioEl = document.getElementById("agend-inicio");
    const fimEl    = document.getElementById("agend-fim");

    const required = [nomeEl, dataEl, inicioEl, fimEl];
    required.forEach(el => el?.classList.remove("field-error"));

    let valid = true;
    required.forEach(el => {
      if (!el?.value?.trim()) { el.classList.add("field-error"); valid = false; }
    });
    if (!valid) return;

    appData.agendamentos.push({
      id: String(Date.now()),
      titulo: nomeEl.value.trim(),
      roteiro: document.getElementById("agend-roteiro")?.value || "",
      turma: document.getElementById("agend-turma")?.value.trim() || "",
      observacoes: document.getElementById("agend-obs")?.value.trim() || "",
      data: dataEl.value,
      horaInicio: inicioEl.value,
      horaFim: fimEl.value,
      status: "pendente",
    });

    document.getElementById("criar-agend-modal")?.classList.remove("open");
    refreshCalendar();
  });

  [document.getElementById("agend-nome"), document.getElementById("agend-data"),
   document.getElementById("agend-inicio"), document.getElementById("agend-fim")].forEach(el => {
    el?.addEventListener("input", () => el.classList.remove("field-error"));
  });
}

function resetAgendamentoModal() {
  ["agend-nome", "agend-turma", "agend-obs"].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ""; el.classList.remove("field-error"); }
  });
  ["agend-data", "agend-inicio", "agend-fim"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove("field-error");
  });
  const roteiroSel = document.getElementById("agend-roteiro");
  if (roteiroSel) { roteiroSel.value = ""; roteiroSel.classList.remove("field-error"); }
  const list = document.getElementById("agend-materiais-list");
  if (list) list.innerHTML = `<div class="materiais-empty-hint">Selecione um roteiro ou clique em Adicionar para incluir materiais.</div>`;
  const alertBox = document.getElementById("material-alert-box");
  if (alertBox) alertBox.style.display = "none";
  const enviarBtn = document.getElementById("btn-enviar-analise");
  if (enviarBtn) enviarBtn.style.display = "none";
}

function checkEnviarAnaliseBtnVisibility() {
  const list = document.getElementById("agend-materiais-list");
  const btn = document.getElementById("btn-enviar-analise");
  if (!btn) return;
  const hasUnavailable = !!list?.querySelector(".mat-status.em-falta");
  btn.style.display = hasUnavailable ? "" : "none";
}

function getDisplayProdutos() {
  return localProdutos || [];
}

function addMaterialRow(produtoId = "", qty = "", listId = "agend-materiais-list", showStatus = true) {
  const list = document.getElementById(listId);
  if (!list) return;
  const hint = list.querySelector(".materiais-empty-hint");
  if (hint) hint.remove();

  const produtos = getDisplayProdutos();
  const row = document.createElement("div");
  row.className = "material-row";
  list.appendChild(row);

  let abortCtrl = null;

  const removeRow = () => {
    if (abortCtrl) abortCtrl.abort();
    row.remove();
    if (list.children.length === 0) {
      list.innerHTML = `<div class="materiais-empty-hint">Selecione um roteiro ou clique em Adicionar para incluir materiais.</div>`;
    }
    checkEnviarAnaliseBtnVisibility();
  };

  const enterDisplayMode = (selId, qtyVal) => {
    if (abortCtrl) abortCtrl.abort();
    const p = produtos.find(x => x.id === selId);
    if (!p) { enterEditMode(selId, qtyVal); return; }
    const statusMap = {
      normal:         ["ok",       "check",   "ok"],
      "estoque-baixo":["em-falta", "warning", "Em falta"],
      vencido:        ["em-falta", "warning", "Vencido"],
    };
    const [cls, icon, label] = statusMap[p.status] || ["", "help", ""];
    row.style.cursor = "pointer";
    row.dataset.produtoId = selId;
    row.innerHTML = `
      <span class="mat-nome">${p.nome}</span>
      <span class="mat-qty">${qtyVal || p.quantidade}</span>
      ${showStatus ? `
        <span class="mat-status ${cls}">
          <span class="material-symbols-rounded">${icon}</span>
          ${label}
        </span>` : ""}
      <button class="mat-remove-btn" title="Remover">
        <span class="material-symbols-rounded">close</span>
      </button>
    `;
    row.querySelector(".mat-remove-btn").addEventListener("click", removeRow);
    abortCtrl = new AbortController();
    row.addEventListener("click", e => {
      if (!e.target.closest(".mat-remove-btn")) enterEditMode(selId, qtyVal || p.quantidade);
    }, { signal: abortCtrl.signal, once: true });
    checkEnviarAnaliseBtnVisibility();
  };

  const enterEditMode = (selId, qtyVal) => {
    if (abortCtrl) abortCtrl.abort();
    abortCtrl = new AbortController();
    const signal = abortCtrl.signal;
    const options = produtos.map(p =>
      `<option value="${p.id}" ${p.id === selId ? "selected" : ""}>${p.nome}</option>`
    ).join("");
    row.style.cursor = "";
    row.innerHTML = `
      <select class="mat-select">
        <option value="">Selecione o produto...</option>
        ${options}
      </select>
      <input class="mat-input mat-qty-input" type="text" placeholder="Qtd." value="${qtyVal || ""}">
      <button class="mat-remove-btn" title="Remover">
        <span class="material-symbols-rounded">close</span>
      </button>
    `;
    const select = row.querySelector(".mat-select");
    const qtyInput = row.querySelector(".mat-qty-input");
    select.addEventListener("change", e => {
      const p = produtos.find(x => x.id === e.target.value);
      if (p && !qtyInput.value) qtyInput.value = p.quantidade;
    });
    row.querySelector(".mat-remove-btn").addEventListener("click", removeRow);
    row.addEventListener("focusout", e => {
      if (!row.contains(e.relatedTarget)) {
        if (select.value) enterDisplayMode(select.value, qtyInput.value);
      }
    }, { signal });
  };

  if (produtoId) {
    enterDisplayMode(produtoId, qty);
  } else {
    enterEditMode("", "");
  }
}

function populateMateriaisFromRoteiro(roteiro, listId = "agend-materiais-list") {
  const list = document.getElementById(listId);
  if (!list) return;
  list.innerHTML = "";
  if (!roteiro) {
    list.innerHTML = `<div class="materiais-empty-hint">Selecione um roteiro ou clique em Adicionar para incluir materiais.</div>`;
    return;
  }
  const roteiroObj = (localRoteiros || []).find(r => r.titulo === roteiro);
  const materiais = roteiroObj?.materiais || [];
  if (materiais.length === 0) {
    list.innerHTML = `<div class="materiais-empty-hint">Este roteiro não possui materiais cadastrados.</div>`;
    return;
  }
  materiais.forEach(m => addMaterialRow(m.produtoId, m.qty, listId));
}

function populateViewMateriais(roteiro, readonly) {
  const listId = "view-agend-materiais-list";
  if (!readonly) {
    populateMateriaisFromRoteiro(roteiro, listId);
    return;
  }
  const list = document.getElementById(listId);
  if (!list) return;
  list.innerHTML = "";
  if (!roteiro) {
    list.innerHTML = `<div class="materiais-empty-hint">Nenhum roteiro selecionado.</div>`;
    return;
  }
  const roteiroObj = (localRoteiros || []).find(r => r.titulo === roteiro);
  const materiais = roteiroObj?.materiais || [];
  if (materiais.length === 0) {
    list.innerHTML = `<div class="materiais-empty-hint">Nenhum material para este roteiro.</div>`;
    return;
  }
  const produtos = getDisplayProdutos();
  materiais.forEach(m => {
    const p = produtos.find(x => x.id === m.produtoId);
    if (!p) return;
    const statusMap = {
      normal:          ["ok",       "check",   "ok"],
      "estoque-baixo": ["em-falta", "warning", "Em falta"],
      vencido:         ["em-falta", "warning", "Vencido"],
    };
    const [cls, icon, label] = statusMap[p.status] || ["", "help", p.status || ""];
    const row = document.createElement("div");
    row.className = "material-row";
    row.innerHTML = `
      <span class="mat-nome">${p.nome}</span>
      <span class="mat-qty">${m.qty || p.quantidade}</span>
      <span class="mat-status ${cls}">
        <span class="material-symbols-rounded">${icon}</span>
        ${label}
      </span>
    `;
    list.appendChild(row);
  });
}

function openVisualizarModal(id) {
  const agend = appData.agendamentos.find(a => a.id === id);
  if (!agend) return;

  const isPendente = agend.status === "pendente";
  const card = document.getElementById("view-agend-card");
  if (card) {
    card.dataset.agendId = id;
    card.dataset.mode = isPendente ? "edit" : "view";
  }

  document.getElementById("view-modal-title").textContent =
    isPendente ? "Editar Agendamento" : "Visualizar Agendamento";

  const setVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val ?? ""; };
  setVal("view-agend-nome",    agend.titulo);
  setVal("view-agend-data",    agend.data);
  setVal("view-agend-inicio",  agend.horaInicio);
  setVal("view-agend-fim",     agend.horaFim);
  setVal("view-agend-roteiro", agend.roteiro     || "");
  setVal("view-agend-turma",   agend.turma       || "");
  setVal("view-agend-obs",     agend.observacoes || "");

  ["view-agend-nome", "view-agend-data", "view-agend-inicio", "view-agend-fim",
   "view-agend-turma", "view-agend-obs"].forEach(fid => {
    const el = document.getElementById(fid);
    if (el) el.readOnly = !isPendente;
  });
  const roteiroEl = document.getElementById("view-agend-roteiro");
  if (roteiroEl) roteiroEl.disabled = !isPendente;

  const addMatBtn = document.getElementById("view-add-mat-btn");
  if (addMatBtn) addMatBtn.style.display = isPendente ? "" : "none";

  populateViewMateriais(agend.roteiro || "", !isPendente);

  document.getElementById("view-close-btn").style.display = isPendente ? "none" : "";
  document.getElementById("view-save-btn").style.display   = isPendente ? "" : "none";

  document.getElementById("view-agend-modal")?.classList.add("open");
}

function bindCalEventClicks() {
  document.querySelectorAll(".cal-event[data-agend-id]").forEach(el => {
    el.addEventListener("click", () => openVisualizarModal(el.dataset.agendId));
  });
}

function renderCategorias() {
  getLocalCategorias();
  const isAuxiliar = currentUser.profile === "auxiliar";

  document.getElementById("main-content").innerHTML = `
    <div class="categorias-page">
      <div class="page-toolbar">
        <label class="page-search">
          <span class="material-symbols-rounded">search</span>
          <input type="text" id="categorias-search" placeholder="Buscar categoria...">
        </label>
        ${isAuxiliar ? `
          ${btnCreate({ id: "new-categoria-btn", label: "Nova Categoria" })}
        ` : ""}
      </div>

      <div id="categorias-table-container">
        ${buildCategoriasTable(localCategorias, isAuxiliar)}
      </div>

      ${isAuxiliar ? buildCriarCategoriaModal() : ""}
    </div>
  `;

  bindCategoriasEvents(isAuxiliar);
}

function buildCategoriasTable(categorias, isAuxiliar) {
  const rows = categorias.length === 0
    ? `<tr class="table-empty-row"><td colspan="${isAuxiliar ? 3 : 2}">Nenhuma categoria encontrada.</td></tr>`
    : categorias.map(c => `
        <tr>
          <td>
            <div class="user-cell">
              <span class="icon-chip purple">
                <span class="material-symbols-rounded">category</span>
              </span>
              ${c.nome}
            </div>
          </td>
          <td>
            <span class="status-pill ${c.permiteEmprestimo ? "normal" : "muted"}">
              ${c.permiteEmprestimo ? "Sim" : "Não"}
            </span>
          </td>
          ${isAuxiliar ? `
            <td>
              <div class="action-cell">
                <button class="action-icon-btn" title="Editar" data-edit-cat-id="${c.id}">
                  <span class="material-symbols-rounded">edit</span>
                </button>
                <button class="action-icon-btn delete" title="Excluir" data-delete-cat-id="${c.id}">
                  <span class="material-symbols-rounded">delete</span>
                </button>
              </div>
            </td>
          ` : ""}
        </tr>
      `).join("");

  return `
    <div class="list-card">
      <div class="list-card-header">
        <span class="list-card-title">Categorias de Produtos</span>
        ${resultBadge(categorias.length)}
      </div>
      <div class="list-card-inner">
        <div class="table-wrap">
          <table class="produtos-table">
            <thead>
              <tr>
                <th>Categoria</th>
                <th>Permite Empréstimo</th>
                ${isAuxiliar ? "<th>Ações</th>" : ""}
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function buildCriarCategoriaModal() {
  return `
    <div class="modal-overlay" id="criar-categoria-modal">
      <div class="modal-card">
        <div class="modal-header">
          <span class="modal-title" id="categoria-modal-title">Nova Categoria</span>
          <button class="modal-close" id="cat-modal-close-btn">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>

        <div class="modal-body">
          <div class="modal-field">
            <label>Nome da Categoria</label>
            <input type="text" id="cat-nome" placeholder="Ex.: Reagentes">
          </div>

          <div class="modal-field">
            <label>Permite Empréstimo</label>
            <label class="toggle">
              <input type="checkbox" id="cat-permite-emprestimo">
              <span class="toggle-track">
                <span class="toggle-thumb"></span>
              </span>
              <span class="toggle-label">Produtos desta categoria podem ser emprestados</span>
            </label>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-modal-cancel" id="cat-modal-cancel-btn">Cancelar</button>
          <button class="btn-modal-save" id="cat-modal-save-btn">
            <span class="material-symbols-rounded">check</span>
            Salvar Categoria
          </button>
        </div>
      </div>
    </div>
  `;
}

function refreshCategoriasTable(isAuxiliar) {
  const searchVal = document.getElementById("categorias-search")?.value.toLowerCase() || "";
  const filtered = localCategorias.filter(c => c.nome.toLowerCase().includes(searchVal));
  const container = document.getElementById("categorias-table-container");
  if (container) {
    container.innerHTML = buildCategoriasTable(filtered, isAuxiliar);
    bindCategoriaTableButtons(isAuxiliar);
  }
}

function bindCategoriaTableButtons(isAuxiliar) {
  document.querySelectorAll("[data-delete-cat-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      localCategorias = localCategorias.filter(c => c.id !== btn.dataset.deleteCatId);
      refreshCategoriasTable(isAuxiliar);
    });
  });

  document.querySelectorAll("[data-edit-cat-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const cat = localCategorias.find(c => c.id === btn.dataset.editCatId);
      if (!cat) return;

      currentEditCategoriaId = cat.id;
      document.getElementById("cat-nome").value = cat.nome;
      document.getElementById("cat-permite-emprestimo").checked = cat.permiteEmprestimo;
      document.getElementById("categoria-modal-title").textContent = "Editar Categoria";
      document.getElementById("cat-modal-save-btn").innerHTML =
        `<span class="material-symbols-rounded">check</span> Salvar Alterações`;

      document.getElementById("criar-categoria-modal").classList.add("open");
    });
  });
}

function bindCategoriasEvents(isAuxiliar) {
  document.getElementById("categorias-search")?.addEventListener("input", () => {
    refreshCategoriasTable(isAuxiliar);
  });

  bindCategoriaTableButtons(isAuxiliar);

  if (!isAuxiliar) return;

  const resetCatModal = () => {
    currentEditCategoriaId = null;
    document.getElementById("cat-nome").value = "";
    document.getElementById("cat-permite-emprestimo").checked = false;
    document.getElementById("categoria-modal-title").textContent = "Nova Categoria";
    document.getElementById("cat-modal-save-btn").innerHTML =
      `<span class="material-symbols-rounded">check</span> Salvar Categoria`;
  };

  const closeCatModal = () => {
    document.getElementById("criar-categoria-modal")?.classList.remove("open");
    resetCatModal();
  };

  document.getElementById("new-categoria-btn")?.addEventListener("click", () => {
    document.getElementById("criar-categoria-modal").classList.add("open");
  });

  document.getElementById("cat-modal-close-btn")?.addEventListener("click", closeCatModal);
  document.getElementById("cat-modal-cancel-btn")?.addEventListener("click", closeCatModal);
  document.getElementById("criar-categoria-modal")?.addEventListener("click", e => {
    if (e.target === e.currentTarget) closeCatModal();
  });

  document.getElementById("cat-modal-save-btn")?.addEventListener("click", () => {
    const nome = document.getElementById("cat-nome").value.trim();
    const permiteEmprestimo = document.getElementById("cat-permite-emprestimo").checked;

    if (!nome) return;

    if (currentEditCategoriaId) {
      const idx = localCategorias.findIndex(c => c.id === currentEditCategoriaId);
      if (idx !== -1) localCategorias[idx] = { ...localCategorias[idx], nome, permiteEmprestimo };
    } else {
      localCategorias.push({ id: String(Date.now()), nome, permiteEmprestimo });
    }

    closeCatModal();
    refreshCategoriasTable(isAuxiliar);
  });
}

function renderPlaceholder(page) {
  const label = formatPageName(page);

  document.getElementById("main-content").innerHTML = `
    <section class="placeholder-page">
      <div class="card placeholder-card">
        <span class="material-symbols-rounded placeholder-icon">
          construction
        </span>

        <h1>${label}</h1>

        <p>
          Esta área será carregada dentro do mesmo layout, mantendo o menu lateral, o topo e o perfil atual.
        </p>
      </div>
    </section>
  `;
}

function formatPageName(page) {
  return page
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const AVATAR_OPTIONS = [
  // Pessoas (neutro)
  "🧑", "🧑🏻", "🧑🏼", "🧑🏽", "🧑🏾", 

  // Mulheres
  "👩", "👩🏻", "👩🏼", "👩🏽", "👩🏾", 

  // Homens
  "👨", "👨🏻", "👨🏼", "👨🏽", "👨🏾", 

  // Profissões / estudo / tecnologia
  "🧑‍🏫", "👩‍🏫", "👨‍🏫",
  "🧑‍🔬", "👩‍🔬", "👨‍🔬",
  "🧑‍💻", "👩‍💻", "👨‍💻",
  "🧑‍🎓", "👩‍🎓", "👨‍🎓",

  // Ícones simbólicos 
  "🧠", "📚", "🧪", "🔬", "💡", "🚀", "🏫", "💻"
];


const AVATAR_COLOR_OPTIONS = [
  { id: "blue",   gradient: "linear-gradient(135deg,#ede8ff,#d1e8ff)" },
  { id: "green",  gradient: "linear-gradient(135deg,#e2f5e8,#c8edda)" },
  { id: "orange", gradient: "linear-gradient(135deg,#fff0e2,#ffddb2)" },
  { id: "pink",   gradient: "linear-gradient(135deg,#ffe8f4,#ffc5e0)" },
  { id: "teal",   gradient: "linear-gradient(135deg,#e2f5f3,#b2e8e0)" },
];

function renderMeuPerfil() {
  let selectedAvatar = currentUser.avatar || AVATAR_OPTIONS[0];
  let selectedColor  = currentUser.avatarColor || AVATAR_COLOR_OPTIONS[0].gradient;

  const avatarGrid = AVATAR_OPTIONS.map(emoji => `
    <button class="avatar-option ${emoji === selectedAvatar ? "selected" : ""}" data-avatar="${emoji}">
      ${emoji}
    </button>
  `).join("");

  const colorPicker = AVATAR_COLOR_OPTIONS.map(c => `
    <button class="avatar-color-option ${c.gradient === selectedColor ? "selected" : ""}"
            data-gradient="${c.gradient}"
            style="background:${c.gradient}"></button>
  `).join("");

  document.getElementById("main-content").innerHTML = `
    <div class="perfil-page">

      <div class="perfil-card">
        <h3 class="perfil-section-title">
          <span class="material-symbols-rounded">person</span>
          Ícone do perfil
        </h3>
        <div class="perfil-avatar-row">
          <div class="avatar-circle avatar-preview" id="perfil-avatar-preview" style="background:${selectedColor}">${selectedAvatar}</div>
          <div class="avatar-right-col">
            <div class="avatar-grid" id="avatar-grid">${avatarGrid}</div>
            <div class="avatar-color-picker" id="avatar-color-picker">
              <span class="avatar-color-label">Cor do fundo</span>
              ${colorPicker}
            </div>
          </div>
        </div>
      </div>

      <div class="perfil-card">
        <h3 class="perfil-section-title">
          <span class="material-symbols-rounded">badge</span>
          Informações pessoais
        </h3>
        <div class="modal-row">
          <div class="modal-field">
            <label>Nome <span class="required-star">*</span></label>
            <input type="text" id="perfil-nome" value="${currentUser.name}" placeholder="Seu nome">
          </div>
          <div class="modal-field">
            <label>E-mail</label>
            <input type="email" id="perfil-email" value="${currentUser.email}" disabled>
          </div>
        </div>
      </div>

      <div class="perfil-card">
        <h3 class="perfil-section-title">
          <span class="material-symbols-rounded">lock</span>
          Alterar senha
        </h3>
        <p class="perfil-section-hint">Preencha apenas se quiser trocar a senha.</p>
        <div class="modal-field">
          <label>Senha atual</label>
          <div class="perfil-pw-wrap">
            <input type="password" id="perfil-senha-atual" placeholder="Digite sua senha atual" autocomplete="current-password">
            <button class="eye-btn" data-target="perfil-senha-atual">
              <span class="material-symbols-rounded">visibility</span>
            </button>
          </div>
        </div>
        <div class="modal-row">
          <div class="modal-field">
            <label>Nova senha</label>
            <div class="perfil-pw-wrap">
              <input type="password" id="perfil-senha-nova" placeholder="Mínimo 4 caracteres" autocomplete="new-password">
              <button class="eye-btn" data-target="perfil-senha-nova">
                <span class="material-symbols-rounded">visibility</span>
              </button>
            </div>
          </div>
          <div class="modal-field">
            <label>Confirmar nova senha</label>
            <div class="perfil-pw-wrap">
              <input type="password" id="perfil-senha-confirma" placeholder="Repita a nova senha" autocomplete="new-password">
              <button class="eye-btn" data-target="perfil-senha-confirma">
                <span class="material-symbols-rounded">visibility</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="perfil-actions">
        <div class="perfil-feedback" id="perfil-feedback"></div>
        <button class="perfil-save-btn" id="perfil-save-btn">
          <span class="material-symbols-rounded">save</span>
          Salvar alterações
        </button>
      </div>

    </div>
  `;

  bindPerfilEvents();
}

function bindPerfilEvents() {
  let selectedAvatar = currentUser.avatar || AVATAR_OPTIONS[0];
  let selectedColor  = currentUser.avatarColor || AVATAR_COLOR_OPTIONS[0].gradient;

  document.getElementById("avatar-grid")?.addEventListener("click", e => {
    const btn = e.target.closest(".avatar-option");
    if (!btn) return;
    selectedAvatar = btn.dataset.avatar;
    document.querySelectorAll(".avatar-option").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    document.getElementById("perfil-avatar-preview").textContent = selectedAvatar;
  });

  document.getElementById("avatar-color-picker")?.addEventListener("click", e => {
    const btn = e.target.closest(".avatar-color-option");
    if (!btn) return;
    selectedColor = btn.dataset.gradient;
    document.querySelectorAll(".avatar-color-option").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    document.getElementById("perfil-avatar-preview").style.background = selectedColor;
  });

  document.querySelectorAll(".eye-btn[data-target]").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const isText = input.type === "text";
      input.type = isText ? "password" : "text";
      btn.querySelector(".material-symbols-rounded").textContent = isText ? "visibility" : "visibility_off";
    });
  });

  document.getElementById("perfil-save-btn")?.addEventListener("click", () => {
    const feedback = document.getElementById("perfil-feedback");
    const nome = document.getElementById("perfil-nome")?.value.trim();

    if (!nome) {
      showPerfilFeedback(feedback, "error", "O nome não pode estar vazio.");
      return;
    }

    const senhaAtual   = document.getElementById("perfil-senha-atual")?.value;
    const senhaNova    = document.getElementById("perfil-senha-nova")?.value;
    const senhaConfirma = document.getElementById("perfil-senha-confirma")?.value;

    if (senhaAtual || senhaNova || senhaConfirma) {
      if (senhaAtual !== currentUser.password) {
        showPerfilFeedback(feedback, "error", "Senha atual incorreta.");
        return;
      }
      if (!senhaNova || senhaNova.length < 4) {
        showPerfilFeedback(feedback, "error", "A nova senha deve ter pelo menos 4 caracteres.");
        return;
      }
      if (senhaNova !== senhaConfirma) {
        showPerfilFeedback(feedback, "error", "As senhas não coincidem.");
        return;
      }
      currentUser.password = senhaNova;
    }

    currentUser.name        = nome;
    currentUser.avatar      = selectedAvatar;
    currentUser.avatarColor = selectedColor;
    localStorage.setItem("pongo_user", JSON.stringify(currentUser));
    renderUserInfo();

    document.getElementById("perfil-senha-atual").value  = "";
    document.getElementById("perfil-senha-nova").value   = "";
    document.getElementById("perfil-senha-confirma").value = "";

    showPerfilFeedback(feedback, "success", "Perfil atualizado com sucesso!");
  });
}

function showPerfilFeedback(el, type, msg) {
  el.textContent = msg;
  el.className = `perfil-feedback perfil-feedback-${type}`;
  setTimeout(() => { el.textContent = ""; el.className = "perfil-feedback"; }, 3500);
}

function bindLayoutEvents() {
  const toggleSidebar = document.getElementById("toggle-sidebar");
  const expandSidebar = document.getElementById("expand-sidebar");
  const logoutButton = document.getElementById("logout-button");
  const mobileMenuButton = document.getElementById("mobile-menu-button");
  const sidebarOverlay = document.getElementById("sidebar-overlay");

  toggleSidebar?.addEventListener("click", () => {
    document.body.classList.toggle("sidebar-collapsed");
  });

  expandSidebar?.addEventListener("click", () => {
    document.body.classList.toggle("sidebar-collapsed");
  });

  mobileMenuButton?.addEventListener("click", () => {
    document.body.classList.add("sidebar-mobile-open");
  });

  sidebarOverlay?.addEventListener("click", closeMobileSidebar);

  logoutButton?.addEventListener("click", logout);

  document.getElementById("goto-perfil-btn")?.addEventListener("click", () => {
    document.getElementById("userDropdown")?.classList.remove("open");
    loadPage("meu-perfil");
  });
}

function closeMobileSidebar() {
  document.body.classList.remove("sidebar-mobile-open");
}

function logout() {
  localStorage.removeItem("pongo_user");
  localStorage.removeItem("pongo_user_profile");
  window.location.href = LOGIN_PATH;
}