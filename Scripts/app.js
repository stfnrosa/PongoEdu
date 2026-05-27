const BASE_DATA = "../Assets/Data";
const LOGIN_PATH = "entrar.html";

let appData = null;
let currentUser = null;
let currentProfile = null;

let localProdutos = null;
let produtosFilter = { search: "", status: "all" };
let currentEditId = null;

let localCategorias = null;
let currentEditCategoriaId = null;

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

  const [profileData, agendamentos, categorias, produtos] = await Promise.all([
    loadJSON(`${BASE_DATA}/profiles/${currentUser.profile}.json`),
    loadJSON(`${BASE_DATA}/agendamentos.json`),
    loadJSON(`${BASE_DATA}/categorias.json`),
    loadJSON(`${BASE_DATA}/produtos.json`),
  ]);

  localProdutos = produtos;
  appData = {
    profiles:   { [currentUser.profile]: { role: profileData.role } },
    menus:      { [currentUser.profile]: profileData.menu },
    dashboards: { [currentUser.profile]: profileData.dashboard },
    agendamentos,
    categorias,
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
    currentProfile.role;

  document.getElementById("user-name").textContent =
    currentUser.name;

  document.getElementById("user-profile-type").textContent =
    currentProfile.role;

  const dropdownName = document.getElementById("dropdown-user-name");
  if (dropdownName) dropdownName.textContent = currentUser.name;

  const dropdownRole = document.getElementById("dropdown-user-role");
  if (dropdownRole) dropdownRole.textContent = currentProfile.role;

  const avatarEl = document.getElementById("user-avatar");
  if (avatarEl) avatarEl.textContent = currentUser.avatar || "👤";
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
}

function setActiveMenu(activeLink) {
  document.querySelectorAll(".menu-item, .submenu-item").forEach((item) => {
    item.classList.remove("active");
  });

  activeLink.classList.add("active");
}

function loadPage(page) {
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

function renderDashboard() {
  const dashboard = appData.dashboards[currentUser.profile];

  document.getElementById("main-content").innerHTML = `
    ${createHeroSection(dashboard)}
    ${createDashboardGrid(dashboard)}
  `;
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
        <a href="#" class="card-link">
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
                <span class="agenda-info">${item.turma} • ${item.alunos} alunos</span>
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
          <span class="material-symbols-rounded green">${data.icon}</span>
          ${data.title}
        </div>
        <a href="#" class="card-link">
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
          <span class="material-symbols-rounded orange">${table.icon}</span>
          ${table.title}
        </div>

        ${table.showLink !== false ? `
          <a href="#" class="card-link">
            Ver todas
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

          <button class="export-btn">
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

      <div class="see-all">
        <a href="#">
          ${table.footerLink}
          <span class="material-symbols-rounded">arrow_forward</span>
        </a>
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
    <div class="produtos-page">
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

        <button class="export-btn-outline">
          <span class="material-symbols-rounded">download</span>
          Exportar
        </button>

        ${isAuxiliar ? `
          <button class="new-item-btn" id="new-produto-btn">
            <span class="material-symbols-rounded">add</span>
            Novo Produto
          </button>
        ` : ""}
      </div>

      <div id="produtos-table-container">
        ${buildProdutosTable(getFilteredProdutos(), isAuxiliar)}
      </div>

      ${isAuxiliar ? buildCriarProdutoModal(categorias) : ""}
    </div>
  `;

  bindProdutosEvents(isAuxiliar);
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
    ? `<tr class="table-empty-row"><td colspan="${isAuxiliar ? 7 : 6}">Nenhum produto encontrado.</td></tr>`
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
          ${isAuxiliar ? `
            <td>
              <div class="action-cell">
                <button class="action-icon-btn" title="Editar" data-edit-id="${p.id}">
                  <span class="material-symbols-rounded">edit</span>
                </button>
                <button class="action-icon-btn delete" title="Excluir" data-delete-id="${p.id}">
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
        <span class="list-card-title">Lista de Produtos</span>
        <span class="result-badge">${produtos.length} resultado(s)</span>
      </div>
      <div class="list-card-inner">
        <div class="table-wrap">
          <table class="produtos-table">
            <thead>
              <tr>
                <th>Produtos</th>
                <th>Categoria</th>
                <th>Quantidade</th>
                <th>Validade</th>
                <th>Localização</th>
                <th>Status</th>
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

function refreshProdutosTable(isAuxiliar) {
  const container = document.getElementById("produtos-table-container");
  if (container) {
    container.innerHTML = buildProdutosTable(getFilteredProdutos(), isAuxiliar);
    bindTableButtons(isAuxiliar);
  }
}

function bindTableButtons(isAuxiliar) {
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
        <div class="cal-event cal-event-${colorClass}" style="top:${top}px;height:${height}px;">
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
        <button class="new-item-btn" id="cal-create-btn">
          <span class="material-symbols-rounded">add</span>
          Criar Agendamento
        </button>
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
  const roteiros = ["Titulação Ácido-Base", "Destilação Simples", "Eletroquímica Básica", "Síntese Orgânica I"];
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
              <label>Roteiro</label>
              <select id="agend-roteiro">
                <option value="">Selecione...</option>
                ${roteiros.map(r => `<option value="${r}">${r}</option>`).join("")}
              </select>
            </div>
            <div class="modal-field">
              <label>Turma</label>
              <input type="text" id="agend-turma" placeholder="Ex: Química 2A">
            </div>
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
          <button class="btn-modal-cancel" id="agend-modal-cancel">Cancelar</button>
          <div class="agend-footer-actions">
            <button class="btn-enviar-analise">Enviar para análise</button>
            <button class="btn-modal-green">Confirmar agendamento</button>
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

  document.querySelector(".btn-modal-green")?.addEventListener("click", () => {
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
}

function getDisplayProdutos() {
  return localProdutos || [];
}

function addMaterialRow(produtoId = "", qty = "") {
  const list = document.getElementById("agend-materiais-list");
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
    row.innerHTML = `
      <span class="mat-nome">${p.nome}</span>
      <span class="mat-qty">${qtyVal || p.quantidade}</span>
      <span class="mat-status ${cls}">
        <span class="material-symbols-rounded">${icon}</span>
        ${label}
      </span>
      <button class="mat-remove-btn" title="Remover">
        <span class="material-symbols-rounded">close</span>
      </button>
    `;
    row.querySelector(".mat-remove-btn").addEventListener("click", removeRow);
    abortCtrl = new AbortController();
    row.addEventListener("click", e => {
      if (!e.target.closest(".mat-remove-btn")) enterEditMode(selId, qtyVal || p.quantidade);
    }, { signal: abortCtrl.signal, once: true });
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

function populateMateriaisFromRoteiro(roteiro) {
  const list = document.getElementById("agend-materiais-list");
  if (!list) return;
  list.innerHTML = "";
  if (!roteiro) {
    list.innerHTML = `<div class="materiais-empty-hint">Selecione um roteiro ou clique em Adicionar para incluir materiais.</div>`;
    return;
  }
  const roteiroMateriais = {
    "Titulação Ácido-Base": [
      { id: "1", qty: "200 ml" },
      { id: "2", qty: "50 g" },
      { id: "4", qty: "2 unid." },
    ],
    "Destilação Simples": [
      { id: "4", qty: "1 unid." },
    ],
    "Eletroquímica Básica": [
      { id: "3", qty: "100 g" },
      { id: "5", qty: "1 caixa" },
    ],
    "Síntese Orgânica I": [
      { id: "1", qty: "100 ml" },
      { id: "2", qty: "30 g" },
    ],
  };
  const materiais = roteiroMateriais[roteiro] || [];
  materiais.forEach(m => addMaterialRow(m.id, m.qty));
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
          <button class="new-item-btn" id="new-categoria-btn">
            <span class="material-symbols-rounded">add</span>
            Nova Categoria
          </button>
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
        <span class="result-badge">${categorias.length} resultado(s)</span>
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
  "👩‍🔬","👨‍🔬","🧑‍🏫","👩‍🏫","👨‍🏫","👩‍💻","👨‍💻",
  "🧪","🔬","📚","🏫","🧑","👩","👨",
];

function renderMeuPerfil() {
  let selectedAvatar = currentUser.avatar || AVATAR_OPTIONS[0];

  const avatarGrid = AVATAR_OPTIONS.map(emoji => `
    <button class="avatar-option ${emoji === selectedAvatar ? "selected" : ""}" data-avatar="${emoji}">
      ${emoji}
    </button>
  `).join("");

  document.getElementById("main-content").innerHTML = `
    <div class="perfil-page">

      <div class="perfil-card">
        <h3 class="perfil-section-title">
          <span class="material-symbols-rounded">person</span>
          Ícone do perfil
        </h3>
        <div class="perfil-avatar-row">
          <div class="avatar-circle avatar-preview" id="perfil-avatar-preview">${selectedAvatar}</div>
          <div class="avatar-grid" id="avatar-grid">${avatarGrid}</div>
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

  document.getElementById("avatar-grid")?.addEventListener("click", e => {
    const btn = e.target.closest(".avatar-option");
    if (!btn) return;
    selectedAvatar = btn.dataset.avatar;
    document.querySelectorAll(".avatar-option").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    document.getElementById("perfil-avatar-preview").textContent = selectedAvatar;
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

    currentUser.name   = nome;
    currentUser.avatar = selectedAvatar;
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