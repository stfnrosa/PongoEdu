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
let produtosFilter = { search: "", status: "all", categoria: "all" };
let currentEditId = null;

let localCategorias = null;
let currentEditCategoriaId = null;

let localRoteiros = null;
let roteirosFilter = { search: "", categoria: "all" };
let currentEditRoteiroId = null;

let localEntradas = null;
let entradasFilter = { search: "", status: "all" };
let currentEditEntradaDocId = null;

let localSolicitacoes = null;
let solicitacoesFilter = { search: "", origem: "all", status: "pendente" };

let localMovimentacoes = null;
let _empOpenModal = null;
let movFilter = { search: "", tipo: "all" };

/* ---- Modal de confirmação reutilizável ---- */
function showConfirmModal({ title, message, confirmLabel, confirmIcon = "check", danger = false, onConfirm }) {
  let modal = document.getElementById("pongo-confirm-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "pongo-confirm-modal";
    modal.className = "modal-overlay";
    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <span class="modal-title" id="pcm-title"></span>
        </div>
        <div class="modal-body">
          <p id="pcm-message" style="font-size:14px;color:var(--dark);line-height:1.65;margin:0"></p>
        </div>
        <div class="modal-footer" id="pcm-footer"></div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  document.getElementById("pcm-title").textContent   = title;
  document.getElementById("pcm-message").textContent = message;
  document.getElementById("pcm-footer").innerHTML = `
    <button class="btn btn-outline-secondary btn-pongo" id="pcm-cancel">Cancelar</button>
    <button class="btn btn-pongo fw-bold d-flex align-items-center gap-2 ${danger ? "btn-danger" : "btn-success"}" id="pcm-confirm">
      <span class="material-symbols-rounded" style="font-size:17px">${confirmIcon}</span>
      ${confirmLabel}
    </button>
  `;
  modal.classList.add("open");
  modal.onclick = e => { if (e.target === modal) modal.classList.remove("open"); };

  const close = () => modal.classList.remove("open");
  document.getElementById("pcm-confirm").addEventListener("click", () => { close(); onConfirm(); });
  document.getElementById("pcm-cancel").addEventListener("click", close);
}

/* ---- Helpers de exibição e estoque ---- */

function fmtQty(prod) {
  if (!prod) return "—";
  return `${prod.quantidade ?? "—"} ${prod.unidadeMedida || ""}`.trim();
}

function parseQty(str) {
  const m = (str || "").trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)?$/);
  if (!m) return { num: 0, unit: str || "" };
  return { num: parseFloat(m[1].replace(",", ".")), unit: (m[2] || "").trim() };
}

function updateProdutoStatus(prod) {
  if (!prod.controlaEstoque) return;
  if (prod.status === "vencido") return;
  const min = prod.estoqueMinimo || 0;
  prod.status = (min > 0 && prod.quantidade <= min) ? "estoque-baixo" : "normal";
}

function gerarNumeroSolicitacao() {
  const ano = new Date().getFullYear();
  const seq = String((localSolicitacoes || []).length + 1).padStart(3, "0");
  return `SOL-${ano}-${seq}`;
}

function criarSolicitacao({ produtoId, produto, unidadeMedida, quantidadeSolicitada,
                            quantidadeDisponivel, estoqueMinimo, origem,
                            solicitante, agendamentoId = null, observacoes = "" }) {
  // Não duplicar: se já existe pendente para o mesmo produto, não cria nova
  const existente = (localSolicitacoes || []).find(
    s => s.produtoId === produtoId && s.status === "pendente"
  );
  if (existente) return existente;

  const nova = {
    id:                   `sol-${Date.now()}`,
    numero:               gerarNumeroSolicitacao(),
    data:                 new Date().toISOString().slice(0, 10),
    origem,
    status:               "pendente",
    solicitante,
    agendamentoId,
    produtoId,
    produto,
    quantidadeSolicitada,
    unidadeMedida,
    quantidadeDisponivel,
    estoqueMinimo:        estoqueMinimo || 0,
    observacoes,
  };
  localSolicitacoes = [nova, ...(localSolicitacoes || [])];
  return nova;
}

/* ---- Histórico de alterações de agendamento ---- */
function registrarHistorico(agend, novoStatus, justificativa = "") {
  if (!agend.historico) agend.historico = [];
  agend.historico.push({
    statusAnterior: agend.status,
    novoStatus,
    usuario:        currentUser?.name || "Sistema",
    perfil:         currentUser?.profile || "sistema",
    dataHora:       new Date().toISOString(),
    justificativa,
  });
}

function autoConcludeAgendamento(agend) {
  if (agend.status !== "preparado") return;
  const end = new Date(`${agend.data}T${agend.horaFim}`);
  if (new Date() > end) {
    registrarHistorico(agend, "concluido");
    agend.status = "concluido";
  }
}

function cancelarAgendamento(agend, justificativa = "") {
  registrarHistorico(agend, "cancelado", justificativa);
  agend.status        = "cancelado";
  agend.canceladoPor  = currentUser?.name || "";
  agend.canceladoEm   = new Date().toISOString();
}

function checkEstoqueMinimo() {
  (localProdutos || []).forEach(prod => {
    if (!prod.controlaEstoque || !prod.estoqueMinimo || prod.status === "vencido") return;
    if (prod.quantidade <= prod.estoqueMinimo) {
      criarSolicitacao({
        produtoId:            prod.id,
        produto:              prod.nome,
        unidadeMedida:        prod.unidadeMedida || "",
        quantidadeSolicitada: prod.estoqueMinimo - prod.quantidade,
        quantidadeDisponivel: prod.quantidade,
        estoqueMinimo:        prod.estoqueMinimo,
        origem:               "estoque-minimo",
        solicitante:          "Sistema",
      });
    }
  });
}

function addItemToStock(item) {
  const prod = (localProdutos || []).find(p => p.id === item.produtoId);
  if (!prod || !prod.controlaEstoque) return;
  const qty = parseQty(item.quantidade);
  prod.quantidade = (prod.quantidade || 0) + (qty.num || 0);
  updateProdutoStatus(prod);
  checkEstoqueMinimo();
}

function removeItemFromStock(item) {
  const prod = (localProdutos || []).find(p => p.id === item.produtoId);
  if (!prod || !prod.controlaEstoque) return;
  const qty = parseQty(item.quantidade);
  prod.quantidade = Math.max(0, (prod.quantidade || 0) - (qty.num || 0));
  updateProdutoStatus(prod);
  checkEstoqueMinimo();
}

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

  const [profileData, agendamentos, categorias, produtos, roteiros, emprestimos, entradas, solicitacoes, movimentacoes] = await Promise.all([
    loadJSON(`${BASE_DATA}/profiles/${currentUser.profile}.json`),
    loadJSON(`${BASE_DATA}/agendamentos.json`),
    loadJSON(`${BASE_DATA}/categorias.json`),
    loadJSON(`${BASE_DATA}/produtos.json`),
    loadJSON(`${BASE_DATA}/roteiros.json`),
    loadJSON(`${BASE_DATA}/emprestimos.json`),
    loadJSON(`${BASE_DATA}/entradas.json`),
    loadJSON(`${BASE_DATA}/solicitacoes.json`),
    loadJSON(`${BASE_DATA}/movimentacoes.json`),
  ]);

  localProdutos      = produtos;
  localRoteiros      = JSON.parse(JSON.stringify(roteiros      || []));
  localEntradas      = JSON.parse(JSON.stringify(entradas      || []));
  localSolicitacoes  = JSON.parse(JSON.stringify(solicitacoes  || []));
  localMovimentacoes = JSON.parse(JSON.stringify(movimentacoes || []));
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

  if (page === "criar-roteiro") {
    renderRoteiros();
    setTimeout(() => {
      document.getElementById("new-roteiro-btn")?.click();
    }, 50);
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

  if (page === "reservas") {
    renderReservas();
    return;
  }

  if (page === "movimentacoes") {
    renderMovimentacoes();
    return;
  }

  if (page === "entradas") {
    renderEntradas();
    return;
  }

  if (page === "compras") {
    renderCompras();
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
    const meuNome       = currentUser?.name || "";
    const meusTodayAgend = todayAgend.filter(a => a.professor === meuNome);

    data.agendamentosHoje.items = meusTodayAgend.length > 0
      ? meusTodayAgend.map(a => ({
          inicio: a.horaInicio,
          fim:    a.horaFim,
          titulo: a.titulo,
          turma:  a.turma,
          alunos: "",
          status: a.status === "preparado" ? "confirmado" : "em-preparacao",
        }))
      : [{ inicio: "—", fim: "—", titulo: "Nenhum agendamento hoje", turma: "", alunos: "", status: "em-preparacao" }];

    const aguardando = agendamentos.filter(a => a.status === "pendente" && a.professor === meuNome);
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
    const pendentes       = agendamentos.filter(a => a.status === "pendente").length;
    const reservasHoje    = todayAgend.length;
    const aVencer         = upcoming.length;
    const solicitacoesPend = (localSolicitacoes || []).filter(s => s.status === "pendente").length;

    data.summary.items[0].title    = "Agendamentos pendentes";
    data.summary.items[0].subtitle = "Aguardando preparo";
    data.summary.items[0].value    = String(pendentes);

    data.summary.items[1].title    = "Solicitações abertas";
    data.summary.items[1].subtitle = "Pendentes de aprovação";
    data.summary.items[1].value    = String(solicitacoesPend);

    data.summary.items[2].title    = "Reservas do dia";
    data.summary.items[2].subtitle = "Hoje";
    data.summary.items[2].value    = String(reservasHoje);

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

    // Popula tabela com movimentações reais (últimas 5)
    const tipoColor  = { entrada: "green", saida: "orange", compra: "blue", emprestimo: "purple" };
    const statusColor = {
      confirmado: "green", pendente: "orange", "em-transito": "blue",
      "em-andamento": "blue", concluido: "green", agendado: "purple", cancelado: "red",
    };
    data.table.rows = (localMovimentacoes || []).slice(0, 5).map(m => {
      const ti = MOV_TIPO_MAP[m.tipo]    || { label: m.tipo,   icon: "swap_horiz" };
      const si = MOV_STATUS_MAP[m.status] || { label: m.status };
      const tc = tipoColor[m.tipo]       || "purple";
      const sc = statusColor[m.status]   || "orange";
      return [
        { type: "iconText", icon: "science", text: m.produto, color: tc },
        m.categoria,
        m.quantidade,
        { type: "iconText", icon: ti.icon, text: ti.label, color: tc },
        { type: "status", label: si.label || m.status, color: sc },
      ];
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
          ${isAuxiliar ? `
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
          ` : `
            <button class="filter-btn ${produtosFilter.categoria !== "all" ? "active-filter" : ""}" id="categoria-filter-btn">
              <span class="material-symbols-rounded">filter_list</span>
              Filtrar categoria
              <span class="material-symbols-rounded" style="font-size:16px">expand_more</span>
            </button>
            <div class="filter-dropdown-menu" id="categoria-filter-menu">
              <div class="filter-option ${produtosFilter.categoria === "all" ? "active" : ""}" data-categoria="all">Todas</div>
              ${[...new Set((localProdutos || []).map(p => p.categoria).filter(Boolean))].map(cat => `
                <div class="filter-option ${produtosFilter.categoria === cat ? "active" : ""}" data-categoria="${cat}">
                  ${cat}
                </div>
              `).join("")}
            </div>
          `}
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

function buildEmprestimosList(items, isAuxiliar = false) {
  const statusMap = {
    pendente:      { label: "Pendente",     cls: "emp-status-pendente",  icon: "schedule" },
    agendado:      { label: "Agendado",     cls: "emp-status-agendado",  icon: "event_available" },
    "em-andamento":{ label: "Em andamento", cls: "emp-status-andamento", icon: "autorenew" },
    concluido:     { label: "Concluído",    cls: "emp-status-concluido", icon: "check_circle" },
    recusado:      { label: "Recusado",     cls: "emp-status-recusado",  icon: "cancel" },
  };
  const cols = isAuxiliar ? 7 : 6;

  if (items.length === 0) {
    return `<tr class="table-empty-row"><td colspan="${cols}">Nenhum empréstimo encontrado.</td></tr>`;
  }

  return items.map(e => {
    const s        = statusMap[e.status] || { label: e.status, cls: "", icon: "help" };
    const isPend   = e.status === "pendente";
    const canEdit  = !isAuxiliar && ["pendente", "agendado"].includes(e.status);

    return `
      <tr>
        <td><span class="emp-produto-nome">${e.produto}</span></td>
        <td>${e.quantidade}</td>
        ${isAuxiliar ? `<td>
          <div style="display:flex;align-items:center;gap:6px">
            <span class="material-symbols-rounded" style="font-size:16px;color:var(--purple)">school</span>
            ${e.professor || `<span style="color:var(--muted)">—</span>`}
          </div>
        </td>` : ""}
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
            ${isAuxiliar && isPend ? `
            <button class="action-icon-btn" title="Aceitar empréstimo" style="color:var(--green)" data-aceitar-emp-id="${e.id}">
              <span class="material-symbols-rounded">check_circle</span>
            </button>
            <button class="action-icon-btn delete" title="Recusar empréstimo" data-recusar-emp-id="${e.id}">
              <span class="material-symbols-rounded">cancel</span>
            </button>` : ""}
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
  const isAuxiliar = currentUser.profile === "auxiliar";
  const empData    = appData.emprestimos || [];
  let editEmpId    = null;
  let empFilter    = { search: "", status: "all" };

  const statusOpts = [
    { key: "all",          label: "Todos" },
    { key: "pendente",     label: "Pendente" },
    { key: "agendado",     label: "Agendado" },
    { key: "em-andamento", label: "Em andamento" },
    { key: "concluido",    label: "Concluído" },
    ...(isAuxiliar ? [{ key: "recusado", label: "Recusado" }] : []),
  ];

  const renderList = () => {
    const q = empFilter.search.toLowerCase();
    const filtered = empData.filter(e => {
      const matchSearch = !q || e.produto.toLowerCase().includes(q) ||
        (isAuxiliar && (e.professor || "").toLowerCase().includes(q));
      const matchStatus = empFilter.status === "all" || e.status === empFilter.status;
      return matchSearch && matchStatus;
    });
    const container = document.getElementById("emp-list-container");
    if (container) container.innerHTML = buildEmprestimosList(filtered, isAuxiliar);
    bindEmpTableButtons(isAuxiliar);
    return filtered;
  };

  const pendentes = empData.filter(e => e.status === "pendente").length;

  document.getElementById("main-content").innerHTML = `
    <div class="agend-page">
      <h1 class="page-section-title">${isAuxiliar ? "Solicitações de Empréstimo" : "Empréstimos"}</h1>
      <p class="page-section-sub">${isAuxiliar
        ? "Visualize todas as solicitações e aceite ou recuse conforme a disponibilidade dos equipamentos."
        : "Acompanhe os empréstimos de materiais e equipamentos do laboratório."}</p>
      <div class="page-toolbar">
        <label class="page-search">
          <span class="material-symbols-rounded">search</span>
          <input type="text" id="emp-search" placeholder="${isAuxiliar ? "Buscar produto ou professor..." : "Buscar equipamento..."}">
        </label>

        <div class="filter-dropdown-wrap">
          <button class="filter-btn" id="emp-status-filter-btn">
            <span class="material-symbols-rounded">filter_list</span>
            Filtrar status
            <span class="material-symbols-rounded" style="font-size:16px">expand_more</span>
          </button>
          <div class="filter-dropdown-menu" id="emp-status-filter-menu">
            ${statusOpts.map((o, i) => `
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
          <span class="list-card-title">${isAuxiliar ? "Todos os Empréstimos" : "Lista de Empréstimos"}</span>
          <div style="display:flex;align-items:center;gap:12px">
            <span id="emp-badge">${isAuxiliar && pendentes > 0
              ? `<span class="badge rounded-pill" style="background:#fff8e6;color:#b45309;font-size:11px;font-weight:700;padding:5px 12px">${pendentes} pendente(s)</span>`
              : resultBadge(empData.length)}</span>
            ${!isAuxiliar ? btnCreate({ id: "new-emprestimo-btn", label: "Criar Empréstimo" }) : ""}
          </div>
        </div>
        <div class="list-card-inner">
          <div class="table-wrap">
            <table class="produtos-table tbl-emprestimos">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Quantidade</th>
                  ${isAuxiliar ? "<th>Professor</th>" : ""}
                  <th>Data início</th>
                  <th>Data fim</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody id="emp-list-container">
                ${buildEmprestimosList(empData, isAuxiliar)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      ${!isAuxiliar ? buildCriarEmprestimoModal() : ""}
      ${buildViewEmprestimoModal()}
    </div>
  `;

  // Modal Criar / Editar Empréstimo
  const openEmpModal = (empItem = null) => {
    editEmpId = empItem ? empItem.id : null;

    const modal = document.getElementById("criar-emp-modal");
    if (!modal) return;

    modal.querySelector(".modal-title").textContent = empItem
      ? "Editar Empréstimo"
      : "Nova Solicitação de Empréstimo";

    const produtoEl = document.getElementById("emp-produto");
    const qtyEl     = document.getElementById("emp-qty");
    const inicioEl  = document.getElementById("emp-inicio");
    const fimEl     = document.getElementById("emp-fim");
    const obsEl     = document.getElementById("emp-obs");

    [produtoEl, qtyEl, inicioEl, fimEl, obsEl].forEach(el => el?.classList.remove("field-error"));

    if (empItem) {
      if (produtoEl) { produtoEl.value = ""; produtoEl.disabled = true;
        const opt = [...produtoEl.options].find(o => o.text.startsWith(empItem.produto));
        if (opt) produtoEl.value = opt.value;
        else { const o = new Option(empItem.produto, "_existing"); produtoEl.add(o); produtoEl.value = "_existing"; }
      }
      const qty = parseInt(empItem.quantidade) || 1;
      if (qtyEl) qtyEl.value = qty;
      if (inicioEl && empItem.dataInicio && empItem.horaInicio)
        inicioEl.value = `${empItem.dataInicio}T${empItem.horaInicio}`;
      if (fimEl && empItem.dataFim && empItem.horaFim)
        fimEl.value = `${empItem.dataFim}T${empItem.horaFim}`;
      if (obsEl) obsEl.value = empItem.observacoes || "";
    } else {
      if (produtoEl) { produtoEl.value = ""; produtoEl.disabled = false; }
      if (qtyEl)     qtyEl.value = "1";
      if (inicioEl)  inicioEl.value = "";
      if (fimEl)     fimEl.value = "";
      if (obsEl)     obsEl.value = "";
    }

    const confirmBtn = document.getElementById("emp-modal-confirm");
    if (confirmBtn) confirmBtn.querySelector("span:last-child, span.material-symbols-rounded + *")
      || (confirmBtn.childNodes[confirmBtn.childNodes.length - 1].textContent =
          empItem ? "Salvar Alterações" : "Enviar Solicitação");

    modal.classList.add("open");
  };
  const closeEmpModal = () => {
    document.getElementById("criar-emp-modal")?.classList.remove("open");
    const produtoEl = document.getElementById("emp-produto");
    if (produtoEl) produtoEl.disabled = false;
    editEmpId = null;
  };

  _empOpenModal = openEmpModal;

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

    [inicioEl, fimEl].forEach(el => el?.classList.remove("field-error"));
    let valid = true;
    if (!inicioEl?.value) { inicioEl.classList.add("field-error"); valid = false; }
    if (!fimEl?.value)    { fimEl.classList.add("field-error");    valid = false; }
    if (!editEmpId && !produtoEl?.value) { produtoEl?.classList.add("field-error"); valid = false; }
    if (!valid) return;

    const [dataInicio, horaInicio] = inicioEl.value.split("T");
    const [dataFim,    horaFim]    = fimEl.value.split("T");
    const qty = document.getElementById("emp-qty")?.value || "1";

    if (editEmpId) {
      const existing = appData.emprestimos.find(x => x.id === editEmpId);
      if (existing) {
        existing.quantidade  = `${qty} unidade${qty > 1 ? "s" : ""}`;
        existing.dataInicio  = dataInicio;
        existing.horaInicio  = horaInicio?.slice(0,5) || "";
        existing.dataFim     = dataFim;
        existing.horaFim     = horaFim?.slice(0,5) || "";
        existing.observacoes = document.getElementById("emp-obs")?.value.trim() || "";
      }
      closeEmpModal();
      const container = document.getElementById("emp-list-container");
      if (container) container.innerHTML = buildEmprestimosList(empData, isAuxiliar);
      bindEmpTableButtons(isAuxiliar);
      showToast("Solicitação de empréstimo atualizada.");
    } else {
      if (!produtoEl?.value) return;
      const produto = localProdutos?.find(p => p.id === produtoEl.value);
      const novo = {
        id:         String(Date.now()),
        produto:    produto?.nome || produtoEl.value,
        quantidade: `${qty} unidade${qty > 1 ? "s" : ""}`,
        professor:  currentUser.name,
        dataInicio, horaInicio: horaInicio?.slice(0,5) || "",
        dataFim,    horaFim:    horaFim?.slice(0,5)    || "",
        observacoes: document.getElementById("emp-obs")?.value.trim() || "",
        status:     "pendente",
      };
      appData.emprestimos.push(novo);
      empData.push(novo);
      closeEmpModal();
      const container = document.getElementById("emp-list-container");
      if (container) container.innerHTML = buildEmprestimosList(empData, isAuxiliar);
      bindEmpTableButtons(isAuxiliar);
      showToast("Solicitação de empréstimo enviada. Aguardando aprovação do auxiliar.");
    }
  });

  document.getElementById("emp-search")?.addEventListener("input", e => {
    empFilter.search = e.target.value;
    renderList();
  });

  const empBtn  = document.getElementById("emp-status-filter-btn");
  const empMenu = document.getElementById("emp-status-filter-menu");
  empBtn?.addEventListener("click", e => { e.stopPropagation(); empMenu.classList.toggle("open"); });
  empMenu?.querySelectorAll(".filter-option").forEach(opt => {
    opt.addEventListener("click", ev => {
      ev.stopPropagation();
      empFilter.status = opt.dataset.empStatus;
      empMenu.classList.remove("open");
      empBtn.classList.toggle("active-filter", empFilter.status !== "all");
      empMenu.querySelectorAll(".filter-option").forEach(o => o.classList.toggle("active", o === opt));
      renderList();
    });
  });
  document.addEventListener("click", () => empMenu?.classList.remove("open"));

  document.getElementById("emp-export-btn")?.addEventListener("click", () => {
    const statusLabel = { pendente:"Pendente", agendado:"Agendado", "em-andamento":"Em andamento", concluido:"Concluído", recusado:"Recusado" };
    const headers = isAuxiliar
      ? ["Produto","Quantidade","Professor","Data Início","Hora Início","Data Fim","Hora Fim","Status"]
      : ["Produto","Quantidade","Data Início","Hora Início","Data Fim","Hora Fim","Status"];
    const rows = empData.map(e => isAuxiliar
      ? [e.produto, e.quantidade, e.professor||"", formatDateBR(e.dataInicio), e.horaInicio, formatDateBR(e.dataFim), e.horaFim, statusLabel[e.status]||e.status]
      : [e.produto, e.quantidade, formatDateBR(e.dataInicio), e.horaInicio, formatDateBR(e.dataFim), e.horaFim, statusLabel[e.status]||e.status]
    );
    exportCSV("emprestimos.csv", headers, rows);
  });

  bindEmpTableButtons(isAuxiliar);
}

function buildViewEmprestimoModal() {
  return `
    <div class="modal-overlay" id="view-emp-modal">
      <div class="modal-card modal-card-wide">
        <div class="modal-header">
          <span class="modal-title" id="view-emp-titulo">Detalhes do Empréstimo</span>
          <button class="modal-close" id="view-emp-close">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>
        <div class="modal-body" id="view-emp-body"></div>
        <div class="modal-footer" id="view-emp-footer">
          <button class="btn btn-outline-secondary btn-pongo" id="view-emp-fechar">Fechar</button>
        </div>
      </div>
    </div>
  `;
}

function openViewEmprestimo(e, isAuxiliar) {
  const statusMap = {
    pendente:      { label: "Pendente",     cls: "emp-status-pendente",  icon: "schedule"       },
    agendado:      { label: "Agendado",     cls: "emp-status-agendado",  icon: "event_available" },
    "em-andamento":{ label: "Em andamento", cls: "emp-status-andamento", icon: "autorenew"       },
    concluido:     { label: "Concluído",    cls: "emp-status-concluido", icon: "check_circle"    },
    recusado:      { label: "Recusado",     cls: "emp-status-recusado",  icon: "cancel"          },
  };
  const s = statusMap[e.status] || { label: e.status, cls: "", icon: "help" };

  document.getElementById("view-emp-titulo").textContent = "Visualizar Empréstimo";
  document.getElementById("view-emp-body").innerHTML = `
    <div class="doc-info-grid">
      <div class="doc-info-cell">
        <span class="doc-info-label">Produto</span>
        <span class="doc-info-value">${e.produto}</span>
      </div>
      <div class="doc-info-cell">
        <span class="doc-info-label">Quantidade</span>
        <span class="doc-info-value">${e.quantidade}</span>
      </div>
      <div class="doc-info-cell">
        <span class="doc-info-label">Professor</span>
        <span class="doc-info-value">${e.professor || "—"}</span>
      </div>
      <div class="doc-info-cell">
        <span class="doc-info-label">Status</span>
        <span class="emp-status ${s.cls}" style="margin-top:2px">
          <span class="material-symbols-rounded">${s.icon}</span>
          ${s.label}
        </span>
      </div>
      <div class="doc-info-cell">
        <span class="doc-info-label">Data / hora início</span>
        <span class="doc-info-value">${formatDateBR(e.dataInicio)} às ${e.horaInicio}</span>
      </div>
      <div class="doc-info-cell">
        <span class="doc-info-label">Data / hora fim</span>
        <span class="doc-info-value">${formatDateBR(e.dataFim)} às ${e.horaFim}</span>
      </div>
      ${e.observacoes ? `
      <div class="doc-info-cell doc-info-cell--full">
        <span class="doc-info-label">Observações</span>
        <span class="doc-info-value">${e.observacoes}</span>
      </div>` : ""}
    </div>
  `;

  const footer = document.getElementById("view-emp-footer");
  if (isAuxiliar && e.status === "pendente") {
    footer.innerHTML = `
      ${btnModalDanger({ id: "view-emp-recusar", label: "Recusar" })}
      <div style="flex:1"></div>
      ${btnModalCancel({ id: "view-emp-fechar", label: "Fechar" })}
      ${btnModalConfirm({ id: "view-emp-aceitar", label: "Aceitar Empréstimo", icon: "check_circle" })}
    `;
  } else {
    footer.innerHTML = `<button class="btn btn-outline-secondary btn-pongo" id="view-emp-fechar">Fechar</button>`;
  }

  const overlay = document.getElementById("view-emp-modal");
  overlay?.classList.add("open");
  overlay.onclick = ev => { if (ev.target === overlay) overlay.classList.remove("open"); };

  const close = () => overlay?.classList.remove("open");
  document.getElementById("view-emp-fechar").onclick = close;
  document.getElementById("view-emp-close").onclick  = close;

  if (isAuxiliar && e.status === "pendente") {
    document.getElementById("view-emp-aceitar").onclick = () => {
      showConfirmModal({
        title:        "Aceitar Empréstimo",
        message:      `Confirma o aceite do empréstimo de "${e.produto}" para ${e.professor || "o professor"}?`,
        confirmLabel: "Aceitar",
        confirmIcon:  "check_circle",
        danger:       false,
        onConfirm: () => {
          e.status = "agendado";
          close();
          const container = document.getElementById("emp-list-container");
          if (container) container.innerHTML = buildEmprestimosList(appData.emprestimos, true);
          bindEmpTableButtons(true);
          refreshEmpBadge(true);
          showToast("Empréstimo aceito com sucesso!");
        },
      });
    };
    document.getElementById("view-emp-recusar").onclick = () => {
      showConfirmModal({
        title:        "Recusar Empréstimo",
        message:      `Tem certeza que deseja recusar o empréstimo de "${e.produto}" solicitado por ${e.professor || "o professor"}?`,
        confirmLabel: "Recusar",
        confirmIcon:  "cancel",
        danger:       true,
        onConfirm: () => {
          e.status = "recusado";
          close();
          const container = document.getElementById("emp-list-container");
          if (container) container.innerHTML = buildEmprestimosList(appData.emprestimos, true);
          bindEmpTableButtons(true);
          refreshEmpBadge(true);
          showToast("Empréstimo recusado.", "warning");
        },
      });
    };
  }
}

function refreshEmpBadge(isAuxiliar) {
  const empData  = appData.emprestimos || [];
  const pendentes = empData.filter(e => e.status === "pendente").length;
  const badge    = document.getElementById("emp-badge");
  if (!badge) return;
  badge.innerHTML = isAuxiliar && pendentes > 0
    ? `<span class="badge rounded-pill" style="background:#fff8e6;color:#b45309;font-size:11px;font-weight:700;padding:5px 12px">${pendentes} pendente(s)</span>`
    : resultBadge(empData.length);
}

function bindEmpTableButtons(isAuxiliar) {
  const empData = appData.emprestimos || [];

  document.querySelectorAll("[data-view-emp-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const e = empData.find(x => x.id === btn.dataset.viewEmpId);
      if (e) openViewEmprestimo(e, isAuxiliar);
    });
  });

  if (isAuxiliar) {
    document.querySelectorAll("[data-aceitar-emp-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        const e = empData.find(x => x.id === btn.dataset.aceitarEmpId);
        if (!e) return;
        showConfirmModal({
          title:        "Aceitar Empréstimo",
          message:      `Confirma o aceite do empréstimo de "${e.produto}" para ${e.professor || "o professor"}?`,
          confirmLabel: "Aceitar",
          confirmIcon:  "check_circle",
          danger:       false,
          onConfirm: () => {
            e.status = "agendado";
            const container = document.getElementById("emp-list-container");
            if (container) container.innerHTML = buildEmprestimosList(empData, true);
            bindEmpTableButtons(true);
            refreshEmpBadge(true);
            showToast("Empréstimo aceito com sucesso!");
          },
        });
      });
    });

    document.querySelectorAll("[data-recusar-emp-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        const e = empData.find(x => x.id === btn.dataset.recusarEmpId);
        if (!e) return;
        showConfirmModal({
          title:        "Recusar Empréstimo",
          message:      `Tem certeza que deseja recusar o empréstimo de "${e.produto}" solicitado por ${e.professor || "o professor"}?`,
          confirmLabel: "Recusar",
          confirmIcon:  "cancel",
          danger:       true,
          onConfirm: () => {
            e.status = "recusado";
            const container = document.getElementById("emp-list-container");
            if (container) container.innerHTML = buildEmprestimosList(empData, true);
            bindEmpTableButtons(true);
            refreshEmpBadge(true);
            showToast("Empréstimo recusado.", "warning");
          },
        });
      });
    });
    return;
  }

  // Professor: edit e delete
  document.querySelectorAll("[data-edit-emp-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const e = empData.find(x => x.id === btn.dataset.editEmpId);
      if (e && _empOpenModal) _empOpenModal(e);
    });
  });

  document.querySelectorAll("[data-delete-emp-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const e = empData.find(x => x.id === btn.dataset.deleteEmpId);
      if (!e) return;
      showConfirmModal({
        title:        "Excluir Empréstimo",
        message:      `Tem certeza que deseja excluir a solicitação de "${e.produto}"?`,
        confirmLabel: "Excluir",
        confirmIcon:  "delete",
        danger:       true,
        onConfirm: () => {
          const idx = appData.emprestimos.findIndex(x => x.id === e.id);
          if (idx !== -1) appData.emprestimos.splice(idx, 1);
          const container = document.getElementById("emp-list-container");
          if (container) container.innerHTML = buildEmprestimosList(appData.emprestimos, false);
          bindEmpTableButtons(false);
          showToast("Empréstimo excluído com sucesso.");
        },
      });
    });
  });
}

function getFilteredProdutos() {
  const q = produtosFilter.search.toLowerCase();
  return (localProdutos || []).filter(p => {
    const matchSearch = !q ||
      p.nome.toLowerCase().includes(q) ||
      p.codigo.toLowerCase().includes(q) ||
      p.localizacao.toLowerCase().includes(q);
    const matchStatus   = produtosFilter.status   === "all" || p.status    === produtosFilter.status;
    const matchCategoria = produtosFilter.categoria === "all" || p.categoria === produtosFilter.categoria;
    return matchSearch && matchStatus && matchCategoria;
  });
}

function buildProdutosTable(produtos, isAuxiliar) {
  const statusLabels = { normal: "Normal", "estoque-baixo": "Estoque baixo", vencido: "Vencido" };

  const colCount = isAuxiliar ? 7 : 6;

  const rows = produtos.length === 0
    ? `<tr class="table-empty-row"><td colspan="${colCount}">Nenhum produto encontrado.</td></tr>`
    : produtos.map(p => `
        <tr>
          <td>
            <span class="prod-codigo">${p.codigo}</span>
            ${p.nome}
          </td>
          <td>${p.categoria}</td>
          <td>${fmtQty(p)}</td>
          <td>${p.validade}</td>
          <td>
            <div class="localizacao-cell">
              <span class="material-symbols-rounded" style="font-size:15px;color:var(--muted)">location_on</span>
              ${p.localizacao}
            </div>
          </td>
          ${isAuxiliar ? `<td><span class="status-pill ${p.status}">${statusLabels[p.status] || p.status}</span></td>` : ""}
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
                ${isAuxiliar ? "<th>Status</th>" : ""}
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
      <div class="modal-card modal-card-wide">
        <div class="modal-header">
          <span class="modal-title" id="prod-modal-title">Novo Produto</span>
          <button class="modal-close" id="modal-close-btn">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>

        <div class="modal-body">
          <div class="modal-row">
            <div class="modal-field">
              <label>Nome <span class="required-star">*</span></label>
              <input type="text" id="prod-nome" placeholder="Ex.: Ácido Clorídrico">
            </div>
            <div class="modal-field">
              <label>Código <span class="required-star">*</span></label>
              <input type="text" id="prod-codigo" placeholder="Ex.: 006">
            </div>
          </div>

          <div class="modal-row">
            <div class="modal-field">
              <label>Categoria <span class="required-star">*</span></label>
              <select id="prod-categoria">
                <option value="">Selecione uma categoria...</option>
                ${categorias.map(c => `<option value="${c.nome}">${c.nome}</option>`).join("")}
              </select>
            </div>
            <div class="modal-field">
              <label>Unidade de Medida <span class="required-star">*</span></label>
              <input type="text" id="prod-unidade" placeholder="Ex.: ml, g, unid.">
            </div>
          </div>

          <div class="modal-field">
            <label>Localização</label>
            <input type="text" id="prod-localizacao" placeholder="Ex.: Armário A1">
          </div>

          <div class="modal-row" style="margin-top:4px">
            <div class="modal-field">
              <label>Ativo</label>
              <label class="toggle">
                <input type="checkbox" id="prod-ativo" checked>
                <span class="toggle-track"><span class="toggle-thumb"></span></span>
                <span class="toggle-label">Produto em uso</span>
              </label>
            </div>
            <div class="modal-field">
              <label>Controla Estoque</label>
              <label class="toggle">
                <input type="checkbox" id="prod-controla-estoque" checked>
                <span class="toggle-track"><span class="toggle-thumb"></span></span>
                <span class="toggle-label">Participar do controle de saldo</span>
              </label>
            </div>
          </div>

          <div class="modal-field" id="prod-estoque-min-wrap">
            <label>Estoque Mínimo</label>
            <input type="number" id="prod-estoque-min" placeholder="Ex.: 100" min="0" step="1">
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
      <div class="modal-card modal-card-wide">
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
              <label>Unidade de Medida</label>
              <div class="view-field-value" id="view-prod-unidade"></div>
            </div>
          </div>
          <div class="modal-row">
            <div class="modal-field">
              <label>Quantidade em Estoque</label>
              <div class="view-field-value" id="view-prod-quantidade"></div>
            </div>
            <div class="modal-field">
              <label>Estoque Mínimo</label>
              <div class="view-field-value" id="view-prod-estoque-min"></div>
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
              <label>Controla Estoque</label>
              <div id="view-prod-controla"></div>
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
      document.getElementById("view-prod-nome").textContent        = p.nome;
      document.getElementById("view-prod-codigo").textContent      = p.codigo;
      document.getElementById("view-prod-categoria").textContent   = p.categoria;
      document.getElementById("view-prod-unidade").textContent     = p.unidadeMedida || "—";
      document.getElementById("view-prod-quantidade").textContent  = fmtQty(p);
      document.getElementById("view-prod-estoque-min").textContent =
        p.controlaEstoque && p.estoqueMinimo ? `${p.estoqueMinimo} ${p.unidadeMedida || ""}`.trim() : "—";
      document.getElementById("view-prod-validade").textContent    = p.validade;
      document.getElementById("view-prod-localizacao").textContent = p.localizacao || "—";
      document.getElementById("view-prod-status").innerHTML =
        `<span class="status-pill ${p.status}">${statusLabels[p.status] || p.status}</span>`;
      document.getElementById("view-prod-controla").innerHTML =
        p.controlaEstoque
          ? `<span class="status-pill normal">Sim</span>`
          : `<span class="status-pill muted">Não</span>`;
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

      document.getElementById("prod-nome").value      = produto.nome;
      document.getElementById("prod-codigo").value    = produto.codigo;
      document.getElementById("prod-categoria").value = produto.categoria;
      document.getElementById("prod-unidade").value   = produto.unidadeMedida || "";
      document.getElementById("prod-localizacao").value = produto.localizacao || "";
      document.getElementById("prod-ativo").checked            = produto.ativo !== false;
      document.getElementById("prod-controla-estoque").checked = produto.controlaEstoque !== false;
      document.getElementById("prod-estoque-min").value        = produto.estoqueMinimo || "";
      document.getElementById("prod-estoque-min-wrap").style.display =
        produto.controlaEstoque !== false ? "" : "none";

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

  const statusBtn  = document.getElementById("status-filter-btn");
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

  const categoriaBtn  = document.getElementById("categoria-filter-btn");
  const categoriaMenu = document.getElementById("categoria-filter-menu");

  categoriaBtn?.addEventListener("click", e => {
    e.stopPropagation();
    categoriaMenu.classList.toggle("open");
  });

  categoriaMenu?.querySelectorAll(".filter-option").forEach(opt => {
    opt.addEventListener("click", e => {
      e.stopPropagation();
      produtosFilter.categoria = opt.dataset.categoria;
      categoriaMenu.classList.remove("open");
      categoriaBtn.classList.toggle("active-filter", produtosFilter.categoria !== "all");
      categoriaMenu.querySelectorAll(".filter-option").forEach(o =>
        o.classList.toggle("active", o.dataset.categoria === produtosFilter.categoria)
      );
      refreshProdutosTable(isAuxiliar);
    });
  });

  document.addEventListener("click", () => {
    statusMenu?.classList.remove("open");
    categoriaMenu?.classList.remove("open");
  }, { once: false });

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

  // Toggle estoque mínimo ao mudar controlaEstoque
  document.getElementById("prod-controla-estoque")?.addEventListener("change", e => {
    document.getElementById("prod-estoque-min-wrap").style.display = e.target.checked ? "" : "none";
  });

  document.getElementById("modal-save-btn")?.addEventListener("click", () => {
    const nome         = document.getElementById("prod-nome").value.trim();
    const codigo       = document.getElementById("prod-codigo").value.trim();
    const categoria    = document.getElementById("prod-categoria").value;
    const unidade      = document.getElementById("prod-unidade").value.trim();
    const localizacao  = document.getElementById("prod-localizacao").value.trim();
    const ativo        = document.getElementById("prod-ativo").checked;
    const controlaEst  = document.getElementById("prod-controla-estoque").checked;
    const estoqueMin   = controlaEst
      ? (parseInt(document.getElementById("prod-estoque-min").value, 10) || 0)
      : 0;

    if (!nome || !codigo || !categoria || !unidade) return;

    if (currentEditId) {
      const idx = localProdutos.findIndex(p => p.id === currentEditId);
      if (idx !== -1) {
        localProdutos[idx] = {
          ...localProdutos[idx],
          nome, codigo, categoria,
          unidadeMedida: unidade,
          localizacao,
          ativo,
          controlaEstoque: controlaEst,
          estoqueMinimo:   estoqueMin,
        };
        updateProdutoStatus(localProdutos[idx]);
      }
    } else {
      const novo = {
        id:             String(Date.now()),
        codigo, nome, categoria,
        unidadeMedida:  unidade,
        quantidade:     0,
        estoqueMinimo:  estoqueMin,
        validade:       "—",
        localizacao,
        status:         "normal",
        ativo,
        controlaEstoque: controlaEst,
      };
      updateProdutoStatus(novo);
      localProdutos.push(novo);
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
  const isProfessor = currentUser.profile === "professor";

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
          ${isProfessor ? btnCreate({ id: "new-roteiro-btn", label: "Criar Roteiro" }) : ""}
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
              <label>Categoria</label>
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
        : mats.map(m => {
            const prod = (localProdutos || []).find(p => p.id === m.produtoId);
            const nome = prod ? prod.nome : (m.nome || m.produtoId || "—");
            return `<div style="padding:3px 0;display:flex;gap:8px;align-items:center">
              <span class="material-symbols-rounded" style="font-size:15px;color:var(--purple)">science</span>
              <span>${nome}</span>
              ${m.qty ? `<span style="color:var(--muted);font-size:12px">— ${m.qty}</span>` : ""}
            </div>`;
          }).join("");
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

    [nomeEl, horasEl].forEach(el => el?.classList.remove("field-error"));

    let valid = true;
    if (!nomeEl?.value.trim())    { nomeEl.classList.add("field-error");  valid = false; }
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
let reservasWeekOffset = 0;
let preparacaoChecks = {}; // { agendId: Set<itemIndex> }

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
    const isProfessor = currentUser?.profile === "professor";
    const events = agendamentos.filter(a =>
      a.data === dateStr &&
      (!isProfessor || a.professor === currentUser.name)
    ).map(evt => {
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
          ${resultBadge(
            currentUser?.profile === "professor"
              ? agendamentos.filter(a => a.professor === currentUser.name).length
              : agendamentos.length,
            "agendamento(s)"
          )}
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

          <div class="conflict-alert-box" id="conflict-alert-box" style="display:none">
            <span class="material-symbols-rounded">event_busy</span>
            <span id="conflict-alert-text"></span>
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

  const checkConflito = () => {
    const data   = document.getElementById("agend-data")?.value;
    const inicio = document.getElementById("agend-inicio")?.value;
    const fim    = document.getElementById("agend-fim")?.value;
    const alertBox  = document.getElementById("conflict-alert-box");
    const alertText = document.getElementById("conflict-alert-text");
    const confirmBtn = document.getElementById("agend-confirm-btn");
    if (!data || !inicio || !fim || !alertBox) return;

    const toMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
    const conflito = (appData.agendamentos || []).find(a =>
      a.data === data &&
      toMin(a.horaInicio) < toMin(fim) &&
      toMin(a.horaFim)    > toMin(inicio)
    );

    if (conflito) {
      alertBox.style.display = "flex";
      alertText.textContent  = `Laboratório já ocupado das ${conflito.horaInicio} às ${conflito.horaFim}. Escolha outro horário.`;
      if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.style.opacity = ".45"; }
    } else {
      alertBox.style.display = "none";
      if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.style.opacity = ""; }
    }
  };

  ["agend-data", "agend-inicio", "agend-fim"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", checkConflito);
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
    const card  = document.getElementById("view-agend-card");
    const agend = appData.agendamentos.find(a => a.id === card?.dataset.agendId);
    if (!agend) return;

    const isPendente = agend.status === "pendente";
    const msg = isPendente
      ? "Tem certeza que deseja cancelar este agendamento?"
      : "Os materiais desta prática já foram preparados pela equipe auxiliar. Deseja realmente cancelar este agendamento?";

    showConfirmModal({
      title:        "Cancelar Agendamento",
      message:      msg,
      confirmLabel: "Confirmar Cancelamento",
      confirmIcon:  "cancel",
      danger:       true,
      onConfirm: () => {
        cancelarAgendamento(agend);
        closeViewModal();
        refreshCalendar();
        showToast("Agendamento cancelado.", "warning");
      },
    });
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

    // Verificar conflito de horário no laboratório
    const dataVal   = dataEl.value;
    const inicioVal = inicioEl.value;
    const fimVal    = fimEl.value;

    const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
    const novoInicio = toMin(inicioVal);
    const novoFim    = toMin(fimVal);

    const conflito = (appData.agendamentos || []).find(a =>
      a.data === dataVal &&
      toMin(a.horaInicio) < novoFim &&
      toMin(a.horaFim)    > novoInicio
    );

    if (conflito) {
      showToast(
        `Laboratório já ocupado das ${conflito.horaInicio} às ${conflito.horaFim} (${conflito.titulo}). Escolha outro horário.`,
        "warning"
      );
      [inicioEl, fimEl].forEach(el => el.classList.add("field-error"));
      return;
    }

    // Coletar materiais com controlaEstoque = true e verificar estoque
    const matRows   = document.querySelectorAll("#agend-materiais-list .material-row");
    const semEstoque = [];
    matRows.forEach(row => {
      const produtoId = row.dataset.produtoId || row.querySelector(".mat-select")?.value;
      if (!produtoId) return;
      const prod = (localProdutos || []).find(p => p.id === produtoId);
      if (!prod || !prod.controlaEstoque) return;
      if (prod.status === "estoque-baixo" || prod.status === "vencido") {
        semEstoque.push(prod);
      }
    });

    const criarAgendamento = (gerarSolicitacao = false) => {
      const agId = String(Date.now());
      appData.agendamentos.push({
        id:          agId,
        titulo:      nomeEl.value.trim(),
        roteiro:     document.getElementById("agend-roteiro")?.value || "",
        turma:       document.getElementById("agend-turma")?.value.trim() || "",
        observacoes: document.getElementById("agend-obs")?.value.trim() || "",
        data:        dataEl.value,
        horaInicio:  inicioEl.value,
        horaFim:     fimEl.value,
        status:      "pendente",
      });

      if (gerarSolicitacao) {
        semEstoque.forEach(prod => {
          criarSolicitacao({
            produtoId:            prod.id,
            produto:              prod.nome,
            unidadeMedida:        prod.unidadeMedida || "",
            quantidadeSolicitada: prod.estoqueMinimo || 0,
            quantidadeDisponivel: prod.quantidade,
            estoqueMinimo:        prod.estoqueMinimo || 0,
            origem:               "professor",
            solicitante:          currentUser.name,
            agendamentoId:        agId,
            observacoes:          `Solicitado via agendamento "${nomeEl.value.trim()}"`,
          });
        });
      }

      document.getElementById("criar-agend-modal")?.classList.remove("open");
      refreshCalendar();
    };

    if (semEstoque.length > 0) {
      const nomes = semEstoque.map(p => p.nome).join(", ");
      showConfirmModal({
        title:        "Estoque Insuficiente",
        message:      `Um ou mais materiais necessários para esta prática não possuem quantidade suficiente em estoque (${nomes}). Deseja prosseguir com o agendamento e gerar uma solicitação de compra?`,
        confirmLabel: "Prosseguir e Solicitar Compra",
        confirmIcon:  "shopping_cart",
        danger:       false,
        onConfirm:    () => {
          criarAgendamento(true);
          showToast("Agendamento realizado com sucesso. Uma solicitação de compra foi encaminhada para análise da equipe auxiliar.");
        },
      });
    } else {
      criarAgendamento(false);
    }
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

  // Auto-concluir se o horário já passou
  autoConcludeAgendamento(agend);

  const isPendente  = agend.status === "pendente";
  const isPreparado = agend.status === "preparado";
  const canEdit     = isPendente;
  const canCancel   = isPendente || isPreparado;

  const card = document.getElementById("view-agend-card");
  if (card) {
    card.dataset.agendId = id;
    card.dataset.mode    = canEdit ? "edit" : "view";
  }

  const titleMap = {
    pendente:   "Editar Agendamento",
    preparado:  "Agendamento Preparado",
    concluido:  "Agendamento Concluído",
    cancelado:  "Agendamento Cancelado",
  };
  document.getElementById("view-modal-title").textContent =
    titleMap[agend.status] || "Visualizar Agendamento";

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
    if (el) el.readOnly = !canEdit;
  });
  const roteiroEl = document.getElementById("view-agend-roteiro");
  if (roteiroEl) roteiroEl.disabled = !canEdit;

  const addMatBtn = document.getElementById("view-add-mat-btn");
  if (addMatBtn) addMatBtn.style.display = canEdit ? "" : "none";

  populateViewMateriais(agend.roteiro || "", !canEdit);

  document.getElementById("view-close-btn").style.display     = canEdit   ? "none" : "";
  document.getElementById("view-save-btn").style.display       = canEdit   ? "" : "none";
  document.getElementById("view-cancel-agend-btn").style.display = canCancel ? "" : "none";

  document.getElementById("view-agend-modal")?.classList.add("open");
}

function bindCalEventClicks() {
  document.querySelectorAll(".cal-event[data-agend-id]").forEach(el => {
    el.addEventListener("click", () => openVisualizarModal(el.dataset.agendId));
  });
}

/* ================================================================
   RESERVAS — visão do auxiliar (todas as reservas, read-only)
   ================================================================ */

const RESERVA_STATUS_MAP = {
  pendente:  { label: "Pendente",  calCls: "yellow", icon: "schedule",     pillCls: "entrada-status-pendente"  },
  preparado: { label: "Preparado", calCls: "blue",   icon: "inventory_2",  pillCls: "emp-status-andamento"     },
  concluido: { label: "Concluído", calCls: "green",  icon: "check_circle", pillCls: "entrada-status-recebido"  },
  cancelado: { label: "Cancelado", calCls: "red",    icon: "cancel",       pillCls: "entrada-status-cancelado" },
};
// Alias para dados legados com status "confirmado"
const RESERVA_STATUS_ALIAS = { confirmado: RESERVA_STATUS_MAP.concluido };

function renderReservas() {
  reservasWeekOffset = 0;
  document.getElementById("main-content").innerHTML = `
    <div class="agend-page">
      <h1 class="page-section-title">Agenda</h1>
      <p class="page-section-sub">Visualize todos os agendamentos de práticas solicitados pelos professores.</p>
      <div id="reservas-cal-container">${buildReservasCalSection()}</div>
      ${buildViewReservaModal()}
    </div>
  `;
  bindReservasEvents();
}

function buildReservasCalSection() {
  const DAY_NAMES = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
  const days      = getWeekDays(reservasWeekOffset);
  const todayStr  = toDateStr(new Date());
  const agendamentos = appData.agendamentos || [];
  const hours = Array.from({ length: CAL_END - CAL_START }, (_, i) => CAL_START + i);

  const now    = new Date();
  const nowTop = (now.getHours() - CAL_START) * HOUR_PX + (now.getMinutes() / 60) * HOUR_PX;
  const showNow = reservasWeekOffset === 0 && now.getHours() >= CAL_START && now.getHours() < CAL_END;

  const dayHeaders = days.map((d, i) => {
    const isToday = toDateStr(d) === todayStr;
    return `
      <div class="cal-day-hdr">
        <span class="cal-day-name">${DAY_NAMES[i]}</span>
        <span class="cal-day-num${isToday ? " is-today" : ""}">${d.getDate().toString().padStart(2,"0")}</span>
      </div>`;
  }).join("");

  const timeLabels = hours.map(h =>
    `<div class="cal-hour-label" style="top:${(h - CAL_START) * HOUR_PX}px">${h.toString().padStart(2,"0")}:00</div>`
  ).join("");

  const dayCols = days.map(d => {
    const dateStr = toDateStr(d);
    const events  = agendamentos.filter(a => a.data === dateStr).map(evt => {
      const [sh, sm] = evt.horaInicio.split(":").map(Number);
      const [eh, em] = evt.horaFim.split(":").map(Number);
      const top    = (sh - CAL_START) * HOUR_PX + (sm / 60) * HOUR_PX;
      const height = (eh - sh) * HOUR_PX + ((em - sm) / 60) * HOUR_PX;
      const si     = RESERVA_STATUS_MAP[evt.status] || RESERVA_STATUS_ALIAS[evt.status] || { calCls: "green", icon: "event" };
      return `
        <div class="cal-event cal-event-${si.calCls}" data-reserva-id="${evt.id}"
             style="top:${top}px;height:${height}px;cursor:pointer">
          <div class="cal-evt-hdr">
            <span class="cal-evt-time">${evt.horaInicio} – ${evt.horaFim}</span>
            <span class="material-symbols-rounded cal-evt-icon">${si.icon}</span>
          </div>
          <span class="cal-evt-title">${evt.titulo}</span>
          <span class="cal-evt-turma">${evt.professor || evt.turma || ""}</span>
        </div>`;
    }).join("");
    return `<div class="cal-day-col">${events}</div>`;
  }).join("");

  const nowLine = showNow ? `
    <div class="cal-now-line" style="top:${nowTop}px;"></div>
    <div class="cal-now-dot"  style="top:${nowTop}px;"></div>
  ` : "";

  const legendItems = Object.values(RESERVA_STATUS_MAP).map(si => `
    <span class="res-legend-item">
      <span class="res-legend-dot cal-event-${si.calCls}"></span>
      ${si.label}
    </span>`).join("");

  return `
    <div class="cal-card">
      <div class="cal-toolbar">
        <div class="cal-nav-group">
          <span class="cal-label">Agenda da semana</span>
          <button class="cal-nav-btn" id="res-prev"><span class="material-symbols-rounded">chevron_left</span></button>
          <button class="cal-nav-btn" id="res-next"><span class="material-symbols-rounded">chevron_right</span></button>
          <span class="cal-range">${formatWeekRange(days)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:16px">
          <div class="res-legend">${legendItems}</div>
          ${resultBadge(agendamentos.length, "reserva(s)")}
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

function buildViewReservaModal() {
  return `
    <div class="modal-overlay" id="view-reserva-modal">
      <div class="modal-card modal-card-wide">
        <div class="modal-header">
          <span class="modal-title" id="view-res-titulo">Reserva</span>
          <button class="modal-close" id="view-res-close">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>
        <div class="modal-body" id="view-res-body"></div>
        <div class="modal-footer" id="view-res-footer">
          <button class="btn btn-outline-secondary btn-pongo" id="view-res-fechar">Fechar</button>
        </div>
      </div>
    </div>
  `;
}

function buildAgendInfoGrid(agend) {
  const si = RESERVA_STATUS_MAP[agend.status] || RESERVA_STATUS_ALIAS[agend.status] || { label: agend.status, pillCls: "", icon: "event" };
  return `
    <div class="doc-info-grid">
      <div class="doc-info-cell">
        <span class="doc-info-label">Professor</span>
        <span class="doc-info-value">${agend.professor || "—"}</span>
      </div>
      <div class="doc-info-cell">
        <span class="doc-info-label">Turma</span>
        <span class="doc-info-value">${agend.turma || "—"}</span>
      </div>
      <div class="doc-info-cell">
        <span class="doc-info-label">Data</span>
        <span class="doc-info-value">${formatDateBR(agend.data)}</span>
      </div>
      <div class="doc-info-cell">
        <span class="doc-info-label">Horário</span>
        <span class="doc-info-value">${agend.horaInicio} – ${agend.horaFim}</span>
      </div>
      <div class="doc-info-cell">
        <span class="doc-info-label">Roteiro</span>
        <span class="doc-info-value">${agend.roteiro || "—"}</span>
      </div>
      <div class="doc-info-cell">
        <span class="doc-info-label">Status</span>
        <span class="entrada-status ${si.pillCls}" style="margin-top:2px">
          <span class="material-symbols-rounded" style="font-size:13px">${si.icon}</span>
          ${si.label}
        </span>
      </div>
      ${agend.observacoes ? `
      <div class="doc-info-cell doc-info-cell--full">
        <span class="doc-info-label">Observações</span>
        <span class="doc-info-value">${agend.observacoes}</span>
      </div>` : ""}
    </div>`;
}

function openViewReserva(id) {
  const agend = (appData.agendamentos || []).find(a => a.id === id);
  if (!agend) return;

  if (agend.status === "pendente") {
    openPreparacaoModal(agend);
  } else {
    openReservaReadOnly(agend);
  }
}

function openReservaReadOnly(agend) {
  const canCancel = agend.status === "preparado";

  document.getElementById("view-res-titulo").textContent = agend.titulo;
  document.getElementById("view-res-body").innerHTML     = buildAgendInfoGrid(agend);
  document.getElementById("view-res-footer").innerHTML   = canCancel
    ? `${btnModalDanger({ id: "btn-cancelar-agend-aux", label: "Cancelar Agendamento" })}
       <div style="flex:1"></div>
       <button class="btn btn-outline-secondary btn-pongo" id="view-res-fechar">Fechar</button>`
    : `<button class="btn btn-outline-secondary btn-pongo" id="view-res-fechar">Fechar</button>`;

  const overlay = document.getElementById("view-reserva-modal");
  overlay?.classList.add("open");
  overlay.onclick = e => { if (e.target === overlay) overlay.classList.remove("open"); };

  const close = () => overlay?.classList.remove("open");
  document.getElementById("view-res-close").onclick  = close;
  document.getElementById("view-res-fechar").onclick = close;

  if (canCancel) {
    document.getElementById("btn-cancelar-agend-aux")?.addEventListener("click", () => {
      showConfirmModal({
        title:        "Cancelar Agendamento",
        message:      "Os materiais desta prática já foram preparados. Deseja realmente cancelar este agendamento?",
        confirmLabel: "Confirmar Cancelamento",
        confirmIcon:  "cancel",
        danger:       true,
        onConfirm: () => {
          cancelarAgendamento(agend);
          close();
          refreshReservasCalendar();
          showToast("Agendamento cancelado. O professor responsável foi notificado.", "warning");
        },
      });
    });
  }
}

function openPreparacaoModal(agend) {
  // Busca materiais do roteiro vinculado
  const roteiro  = (localRoteiros || []).find(r => r.titulo === agend.roteiro);
  const materiais = roteiro?.materiais || [];
  const checks    = preparacaoChecks[agend.id] || new Set();

  const checklistHtml = materiais.length === 0
    ? `<div class="materiais-empty-hint">Nenhum material cadastrado neste roteiro.</div>`
    : materiais.map((mat, idx) => {
        const prod = (localProdutos || []).find(p => p.id === mat.produtoId);
        const nome = prod?.nome || mat.produtoId;
        const dispNum  = prod?.quantidade ?? "—";
        const dispUnit = prod?.unidadeMedida || "";
        const checked  = checks.has(idx);
        const insuf    = typeof dispNum === "number" && parseQty(mat.qty || "0").num > dispNum;
        return `
          <label class="checklist-item prep-item${insuf ? " prep-item--insuf" : ""}">
            <input type="checkbox" class="prep-check" data-idx="${idx}" ${checked ? "checked" : ""}>
            <span class="checklist-check-icon"></span>
            <div class="checklist-item-body">
              <span class="checklist-item-nome">${nome}</span>
              <div class="prep-item-qtds">
                <span class="prep-qtd-label">Necessário:</span>
                <span class="checklist-item-qtd">${mat.qty || "—"}</span>
              </div>
            </div>
          </label>`;
      }).join("");

  const total   = materiais.length;
  const checked = checks.size;

  document.getElementById("view-res-titulo").textContent = "Prática Pendente";
  document.getElementById("view-res-body").innerHTML = `
    ${buildAgendInfoGrid(agend)}
    <div class="materiais-section" style="margin-top:16px">
      <div class="materiais-hdr">
        <span class="materiais-label">Checklist de preparação</span>
        <span class="checklist-counter" id="prep-counter">${checked} / ${total} preparados</span>
      </div>
      <div class="checklist-list" id="prep-checklist">${checklistHtml}</div>
    </div>
  `;

  document.getElementById("view-res-footer").innerHTML = `
    ${btnModalDanger({ id: "btn-cancelar-agend-aux", label: "Cancelar Agendamento" })}
    <div style="flex:1"></div>
    <button class="btn btn-outline-secondary btn-pongo" id="view-res-fechar">Fechar</button>
    <button class="btn btn-success btn-pongo fw-bold d-flex align-items-center gap-2" id="btn-concluir-prep">
      <span class="material-symbols-rounded" style="font-size:17px">inventory_2</span>
      Concluir Preparação
    </button>
  `;

  const overlay = document.getElementById("view-reserva-modal");
  overlay?.classList.add("open");
  overlay.onclick = e => { if (e.target === overlay) overlay.classList.remove("open"); };

  const close = () => overlay?.classList.remove("open");
  document.getElementById("view-res-close").onclick  = close;
  document.getElementById("view-res-fechar").onclick = close;

  document.getElementById("btn-cancelar-agend-aux")?.addEventListener("click", () => {
    showConfirmModal({
      title:        "Cancelar Agendamento",
      message:      "Tem certeza que deseja cancelar este agendamento?",
      confirmLabel: "Confirmar Cancelamento",
      confirmIcon:  "cancel",
      danger:       true,
      onConfirm: () => {
        cancelarAgendamento(agend);
        close();
        refreshReservasCalendar();
        showToast("Agendamento cancelado.", "warning");
      },
    });
  });

  // Persistir checks em tempo real
  document.querySelectorAll(".prep-check").forEach(cb => {
    cb.addEventListener("change", () => {
      const idx = parseInt(cb.dataset.idx, 10);
      if (!preparacaoChecks[agend.id]) preparacaoChecks[agend.id] = new Set();
      if (cb.checked) preparacaoChecks[agend.id].add(idx);
      else            preparacaoChecks[agend.id].delete(idx);

      const cur   = preparacaoChecks[agend.id].size;
      const counter = document.getElementById("prep-counter");
      if (counter) counter.textContent = `${cur} / ${total} preparados`;
    });
  });

  // Concluir Preparação
  document.getElementById("btn-concluir-prep")?.addEventListener("click", () => {
    const cur = preparacaoChecks[agend.id]?.size || 0;
    if (cur < total) {
      showToast(`Marque todos os ${total} itens antes de concluir a preparação.`, "warning");
      return;
    }
    showConfirmModal({
      title:        "Concluir Preparação",
      message:      "Todos os itens foram marcados como preparados. Deseja concluir a preparação deste agendamento? O professor responsável será notificado.",
      confirmLabel: "Concluir Preparação",
      confirmIcon:  "inventory_2",
      danger:       false,
      onConfirm: () => {
        agend.status      = "preparado";
        agend.preparadoPor = currentUser.name;
        delete preparacaoChecks[agend.id];
        close();
        refreshReservasCalendar();
        showToast("Preparação concluída com sucesso. O professor responsável foi notificado.");
      },
    });
  });
}

function refreshReservasCalendar() {
  const container = document.getElementById("reservas-cal-container");
  if (container) {
    container.innerHTML = buildReservasCalSection();
    bindReservasNavEvents();
    bindReservasEventClicks();
  }
}

function bindReservasNavEvents() {
  document.getElementById("res-prev")?.addEventListener("click", () => {
    reservasWeekOffset--;
    refreshReservasCalendar();
  });
  document.getElementById("res-next")?.addEventListener("click", () => {
    reservasWeekOffset++;
    refreshReservasCalendar();
  });
}

function bindReservasEventClicks() {
  document.querySelectorAll("[data-reserva-id]").forEach(el => {
    el.addEventListener("click", () => openViewReserva(el.dataset.reservaId));
  });
}

function bindReservasEvents() {
  bindReservasNavEvents();
  bindReservasEventClicks();
}

/* ================================================================
   MOVIMENTAÇÕES DE ESTOQUE
   ================================================================ */

const MOV_TIPO_MAP = {
  entrada: { label: "Entrada", icon: "add_circle",    color: "var(--green)"  },
  saida:   { label: "Saída",   icon: "remove_circle", color: "var(--orange)" },
};

const MOV_STATUS_MAP = {
  confirmado:  { label: "Confirmado",   cls: "entrada-status-recebido"  },
  pendente:    { label: "Pendente",     cls: "entrada-status-pendente"  },
  "em-transito":{ label: "Em trânsito", cls: "emp-status-andamento"     },
  "em-andamento":{ label: "Em andamento",cls: "emp-status-andamento"    },
  agendado:    { label: "Agendado",     cls: "emp-status-agendado"      },
  concluido:   { label: "Concluído",    cls: "entrada-status-recebido"  },
  cancelado:   { label: "Cancelado",    cls: "entrada-status-cancelado" },
};

function renderMovimentacoes() {
  movFilter = { search: "", tipo: "all" };

  document.getElementById("main-content").innerHTML = `
    <div class="agend-page">
      <h1 class="page-section-title">Movimentações de Estoque</h1>
      <p class="page-section-sub">Acompanhe todas as entradas, saídas, compras e empréstimos de materiais do laboratório.</p>
      <div class="page-toolbar">
        <label class="page-search">
          <span class="material-symbols-rounded">search</span>
          <input type="text" id="mov-search" placeholder="Buscar produto, responsável ou observação...">
        </label>
        <div class="filter-dropdown-wrap">
          <button class="filter-btn" id="mov-tipo-btn">
            <span class="material-symbols-rounded">filter_list</span>
            Filtrar tipo
            <span class="material-symbols-rounded" style="font-size:16px">expand_more</span>
          </button>
          <div class="filter-dropdown-menu" id="mov-tipo-menu">
            <div class="filter-option active" data-mov-tipo="all">Todos</div>
            <div class="filter-option" data-mov-tipo="entrada">Entrada</div>
            <div class="filter-option" data-mov-tipo="saida">Saída</div>
          </div>
        </div>
        <button class="export-btn-outline" id="mov-export-btn">
          <span class="material-symbols-rounded">download</span>
          Exportar
        </button>
      </div>
      <div id="mov-table-container">
        ${buildMovimentacoesList(localMovimentacoes || [])}
      </div>
      ${buildViewMovimentacaoModal()}
    </div>
  `;

  bindMovimentacoesEvents();
}

function buildMovimentacoesList(items) {
  const rows = items.length === 0
    ? `<tr class="table-empty-row"><td colspan="7">Nenhuma movimentação encontrada.</td></tr>`
    : items.map(m => {
        const ti = MOV_TIPO_MAP[m.tipo]     || { label: m.tipo,   icon: "swap_horiz", color: "var(--muted)" };
        const si = MOV_STATUS_MAP[m.status] || { label: m.status, cls: "" };
        return `
          <tr>
            <td style="color:var(--muted);font-size:12px">${formatDateBR(m.data)}<br>${m.hora}</td>
            <td>
              <div style="display:flex;align-items:center;gap:8px">
                <span class="material-symbols-rounded" style="font-size:16px;color:var(--purple)">science</span>
                <div>
                  <div style="font-weight:600">${m.produto}</div>
                  <div style="font-size:11px;color:var(--muted)">${m.categoria}</div>
                </div>
              </div>
            </td>
            <td style="font-weight:600">${m.quantidade}</td>
            <td>
              <div style="display:flex;align-items:center;gap:6px">
                <span class="material-symbols-rounded" style="font-size:18px;color:${ti.color}">${ti.icon}</span>
                <span style="font-weight:600;color:${ti.color}">${ti.label}</span>
              </div>
            </td>
            <td>
              <span class="entrada-status ${si.cls}">${si.label}</span>
            </td>
            <td>${m.responsavel || `<span style="color:var(--muted)">—</span>`}</td>
            <td>
              <div class="action-cell">
                <button class="action-icon-btn" title="Visualizar" data-view-mov-id="${m.id}">
                  <span class="material-symbols-rounded">visibility</span>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join("");

  return `
    <div class="list-card">
      <div class="list-card-header">
        <span class="list-card-title">Histórico de Movimentações</span>
        ${resultBadge(items.length)}
      </div>
      <div class="list-card-inner">
        <div class="table-wrap">
          <table class="produtos-table">
            <thead>
              <tr>
                <th>Data / Hora</th>
                <th>Produto</th>
                <th>Quantidade</th>
                <th>Tipo</th>
                <th>Status</th>
                <th>Responsável</th>
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

function buildViewMovimentacaoModal() {
  return `
    <div class="modal-overlay" id="view-mov-modal">
      <div class="modal-card modal-card-wide">
        <div class="modal-header">
          <span class="modal-title" id="view-mov-titulo">Movimentação</span>
          <button class="modal-close" id="view-mov-close">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>
        <div class="modal-body" id="view-mov-body"></div>
        <div class="modal-footer">
          <button class="btn btn-outline-secondary btn-pongo" id="view-mov-fechar">Fechar</button>
        </div>
      </div>
    </div>
  `;
}

function openViewMovimentacao(id) {
  const m  = (localMovimentacoes || []).find(x => x.id === id);
  if (!m) return;

  const ti = MOV_TIPO_MAP[m.tipo]     || { label: m.tipo,   icon: "swap_horiz", color: "var(--muted)" };
  const si = MOV_STATUS_MAP[m.status] || { label: m.status, cls: "" };

  document.getElementById("view-mov-titulo").textContent = `${ti.label} — ${m.produto}`;
  document.getElementById("view-mov-body").innerHTML = `
    <div class="doc-info-grid">
      <div class="doc-info-cell">
        <span class="doc-info-label">Produto</span>
        <span class="doc-info-value">${m.produto}</span>
      </div>
      <div class="doc-info-cell">
        <span class="doc-info-label">Categoria</span>
        <span class="doc-info-value">${m.categoria}</span>
      </div>
      <div class="doc-info-cell">
        <span class="doc-info-label">Quantidade</span>
        <span class="doc-info-value">${m.quantidade}</span>
      </div>
      <div class="doc-info-cell">
        <span class="doc-info-label">Tipo</span>
        <div style="display:flex;align-items:center;gap:6px;margin-top:2px">
          <span class="material-symbols-rounded" style="font-size:18px;color:${ti.color}">${ti.icon}</span>
          <span style="font-weight:700;color:${ti.color}">${ti.label}</span>
        </div>
      </div>
      <div class="doc-info-cell">
        <span class="doc-info-label">Data</span>
        <span class="doc-info-value">${formatDateBR(m.data)} às ${m.hora}</span>
      </div>
      <div class="doc-info-cell">
        <span class="doc-info-label">Responsável</span>
        <span class="doc-info-value">${m.responsavel || "—"}</span>
      </div>
      <div class="doc-info-cell">
        <span class="doc-info-label">Status</span>
        <span class="entrada-status ${si.cls}" style="margin-top:2px">${si.label}</span>
      </div>
      <div class="doc-info-cell doc-info-cell--full">
        <span class="doc-info-label">Observação</span>
        <span class="doc-info-value">${m.observacao || "—"}</span>
      </div>
    </div>
  `;

  const overlay = document.getElementById("view-mov-modal");
  overlay?.classList.add("open");
  overlay.onclick = e => { if (e.target === overlay) overlay.classList.remove("open"); };

  const close = () => overlay?.classList.remove("open");
  document.getElementById("view-mov-close").onclick  = close;
  document.getElementById("view-mov-fechar").onclick = close;
}

function refreshMovimentacoesList() {
  const q    = (movFilter.search || "").toLowerCase();
  const tipo = movFilter.tipo;
  const filtered = (localMovimentacoes || []).filter(m => {
    const matchTipo = tipo === "all" || m.tipo === tipo;
    const matchQ    = !q || m.produto.toLowerCase().includes(q) ||
      (m.responsavel || "").toLowerCase().includes(q) ||
      (m.observacao  || "").toLowerCase().includes(q);
    return matchTipo && matchQ;
  });
  const container = document.getElementById("mov-table-container");
  if (container) container.innerHTML = buildMovimentacoesList(filtered);
  bindMovViewButtons();
}

function bindMovViewButtons() {
  document.querySelectorAll("[data-view-mov-id]").forEach(btn => {
    btn.addEventListener("click", () => openViewMovimentacao(btn.dataset.viewMovId));
  });
}

function bindMovimentacoesEvents() {
  document.getElementById("mov-search")?.addEventListener("input", e => {
    movFilter.search = e.target.value;
    refreshMovimentacoesList();
  });

  bindMovViewButtons();

  const btn  = document.getElementById("mov-tipo-btn");
  const menu = document.getElementById("mov-tipo-menu");
  btn?.addEventListener("click", e => { e.stopPropagation(); menu?.classList.toggle("open"); });
  menu?.querySelectorAll("[data-mov-tipo]").forEach(opt => {
    opt.addEventListener("click", () => {
      menu.querySelectorAll(".filter-option").forEach(o => o.classList.remove("active"));
      opt.classList.add("active");
      movFilter.tipo = opt.dataset.movTipo;
      btn.classList.toggle("active-filter", movFilter.tipo !== "all");
      menu.classList.remove("open");
      refreshMovimentacoesList();
    });
  });
  document.addEventListener("click", e => {
    if (!menu?.contains(e.target) && e.target !== btn) menu?.classList.remove("open");
  });

  document.getElementById("mov-export-btn")?.addEventListener("click", () => {
    exportCSV("movimentacoes.csv",
      ["Data", "Hora", "Produto", "Categoria", "Quantidade", "Tipo", "Status", "Responsável", "Observação"],
      (localMovimentacoes || []).map(m => [
        formatDateBR(m.data), m.hora, m.produto, m.categoria, m.quantidade,
        MOV_TIPO_MAP[m.tipo]?.label || m.tipo,
        MOV_STATUS_MAP[m.status]?.label || m.status,
        m.responsavel || "", m.observacao || "",
      ])
    );
  });
}

function renderCategorias() {
  getLocalCategorias();
  const isAuxiliar = currentUser.profile === "auxiliar";

  document.getElementById("main-content").innerHTML = `
    <div class="agend-page">
      <h1 class="page-section-title">Categoria de Produtos</h1>
      <p class="page-section-sub">Gerencie as categorias de materiais e configure as permissões de empréstimo.</p>
      <div class="page-toolbar">
        <label class="page-search">
          <span class="material-symbols-rounded">search</span>
          <input type="text" id="categorias-search" placeholder="Buscar categoria...">
        </label>
        <button class="export-btn-outline" id="categorias-export-btn">
          <span class="material-symbols-rounded">download</span>
          Exportar
        </button>
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
        <div style="display:flex;align-items:center;gap:12px">
          ${resultBadge(categorias.length)}
          ${isAuxiliar ? btnCreate({ id: "new-categoria-btn", label: "Nova Categoria" }) : ""}
        </div>
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
  document.getElementById("new-categoria-btn")?.addEventListener("click", () => {
    document.getElementById("criar-categoria-modal").classList.add("open");
  });

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

  document.getElementById("categorias-export-btn")?.addEventListener("click", () => {
    exportCSV("categorias.csv",
      ["Categoria", "Permite Empréstimo"],
      localCategorias.map(c => [c.nome, c.permiteEmprestimo ? "Sim" : "Não"])
    );
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

/* ================================================================
   ENTRADAS DE MATERIAIS — documentos de recebimento multi-item
   ================================================================ */

let currentEntradaDocId = null;

function gerarCodigoEntrada() {
  const ano = new Date().getFullYear();
  const seq = String((localEntradas || []).length + 1).padStart(3, "0");
  return `REC-${ano}-${seq}`;
}

function getEntradaStatusInfo(status) {
  return ({
    recebido:  { label: "Recebido",  cls: "entrada-status-recebido",  icon: "check_circle" },
    pendente:  { label: "Pendente",  cls: "entrada-status-pendente",  icon: "schedule"     },
    cancelado: { label: "Cancelado", cls: "entrada-status-cancelado", icon: "cancel"       },
  })[status] || { label: status, cls: "", icon: "help" };
}

function renderEntradas() {
  entradasFilter = { search: "", status: "all" };

  document.getElementById("main-content").innerHTML = `
    <div class="agend-page">
      <h1 class="page-section-title">Entradas de Materiais</h1>
      <p class="page-section-sub">Gerencie documentos de recebimento de materiais e insumos no estoque do laboratório.</p>
      <div class="page-toolbar">
        <label class="page-search">
          <span class="material-symbols-rounded">search</span>
          <input type="text" id="entradas-search" placeholder="Buscar por código, NF ou fornecedor...">
        </label>
        <div class="filter-dropdown-wrap">
          <button class="filter-btn" id="entradas-status-filter-btn">
            <span class="material-symbols-rounded">filter_list</span>
            Filtrar status
            <span class="material-symbols-rounded" style="font-size:16px">expand_more</span>
          </button>
          <div class="filter-dropdown-menu" id="entradas-status-filter-menu">
            <div class="filter-option active" data-ent-status="all">Todos</div>
            <div class="filter-option" data-ent-status="pendente">Pendente</div>
            <div class="filter-option" data-ent-status="recebido">Recebido</div>
            <div class="filter-option" data-ent-status="cancelado">Cancelado</div>
          </div>
        </div>
        <button class="export-btn-outline" id="entradas-export-btn">
          <span class="material-symbols-rounded">download</span>
          Exportar
        </button>
      </div>
      <div id="entradas-table-container">
        ${buildEntradasList(localEntradas || [])}
      </div>
      ${buildCriarDocumentoModal()}
      ${buildVerDocumentoModal()}
    </div>
  `;

  bindEntradasEvents();
}

function buildEntradasList(docs) {
  const rows = docs.length === 0
    ? `<tr class="table-empty-row"><td colspan="7">Nenhum documento de entrada registrado.</td></tr>`
    : docs.map(doc => {
        const si      = getEntradaStatusInfo(doc.status);
        const idLabel = doc.notaFiscal ? `NF ${doc.notaFiscal}` : doc.codigo;
        const isPend  = doc.status === "pendente";
        return `
          <tr>
            <td>
              <div style="display:flex;align-items:center;gap:8px">
                <span class="material-symbols-rounded" style="font-size:17px;color:var(--purple)">receipt_long</span>
                <span style="font-weight:600">${idLabel}</span>
              </div>
            </td>
            <td>${doc.fornecedor || `<span style="color:var(--muted)">—</span>`}</td>
            <td>${formatDateBR(doc.dataEntrada)}</td>
            <td>${doc.responsavel || `<span style="color:var(--muted)">—</span>`}</td>
            <td>${(doc.itens || []).length} item(ns)</td>
            <td>
              <span class="entrada-status ${si.cls}">
                <span class="material-symbols-rounded" style="font-size:13px">${si.icon}</span>
                ${si.label}
              </span>
            </td>
            <td>
              <div class="action-cell">
                <button class="action-icon-btn" title="Visualizar" data-view-doc-id="${doc.id}">
                  <span class="material-symbols-rounded">visibility</span>
                </button>
                ${isPend ? `
                <button class="action-icon-btn" title="Editar" data-edit-doc-id="${doc.id}">
                  <span class="material-symbols-rounded">edit</span>
                </button>` : ""}
                ${doc.status === "cancelado" ? `
                <button class="action-icon-btn delete" title="Excluir" data-delete-doc-id="${doc.id}">
                  <span class="material-symbols-rounded">delete</span>
                </button>` : ""}
              </div>
            </td>
          </tr>
        `;
      }).join("");

  return `
    <div class="list-card">
      <div class="list-card-header">
        <span class="list-card-title">Documentos de Entrada</span>
        <div style="display:flex;align-items:center;gap:12px">
          ${resultBadge(docs.length)}
          ${btnCreate({ id: "new-entrada-btn", label: "Nova Entrada" })}
        </div>
      </div>
      <div class="list-card-inner">
        <div class="table-wrap">
          <table class="produtos-table">
            <thead>
              <tr>
                <th>Código / NF</th>
                <th>Fornecedor</th>
                <th>Data</th>
                <th>Responsável</th>
                <th>Itens</th>
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

function buildCriarDocumentoModal() {
  const produtos = localProdutos || [];
  return `
    <div class="modal-overlay" id="criar-documento-modal">
      <div class="modal-card modal-card-wide">
        <div class="modal-header">
          <span class="modal-title">Novo Documento de Entrada</span>
          <button class="modal-close" id="criar-doc-close">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>
        <div class="modal-body">

          <div class="modal-field" style="margin-bottom:4px">
            <label>Identificador <span class="required-star">*</span></label>
            <div class="doc-id-toggle">
              <button class="doc-id-btn active" id="doc-tipo-codigo" type="button">Código do sistema</button>
              <button class="doc-id-btn" id="doc-tipo-nf" type="button">Nota Fiscal</button>
            </div>
          </div>

          <div class="modal-row">
            <div class="modal-field" id="doc-codigo-wrap">
              <label>Código gerado</label>
              <input type="text" id="doc-codigo" readonly style="background:#f8f9ff;color:var(--muted);cursor:default">
            </div>
            <div class="modal-field" id="doc-nf-wrap" style="display:none">
              <label>Número da NF <span class="required-star">*</span></label>
              <input type="text" id="doc-nf" placeholder="Ex: 45821">
            </div>
            <div class="modal-field">
              <label>Fornecedor</label>
              <input type="text" id="doc-fornecedor" placeholder="Nome do fornecedor">
            </div>
          </div>

          <div class="modal-row">
            <div class="modal-field">
              <label>Data de Entrada <span class="required-star">*</span></label>
              <input type="date" id="doc-data">
            </div>
            <div class="modal-field">
              <label>Observações</label>
              <input type="text" id="doc-obs" placeholder="Informações adicionais...">
            </div>
          </div>

          <div class="materiais-section" style="margin-top:8px">
            <div class="materiais-hdr">
              <span class="materiais-label">Itens do documento <span class="required-star">*</span></span>
              <button class="add-mat-btn" id="doc-add-item-btn" type="button">
                <span class="material-symbols-rounded">add</span>
                Adicionar item
              </button>
            </div>
            <div id="doc-itens-list">
              <div class="materiais-empty-hint" id="doc-itens-empty">Clique em Adicionar item para incluir produtos.</div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          ${btnModalCancel({ id: "criar-doc-cancel" })}
          ${btnModalConfirm({ id: "criar-doc-save", label: "Salvar como Pendente", icon: "save" })}
        </div>
      </div>
    </div>
  `;
}

function buildVerDocumentoModal() {
  return `
    <div class="modal-overlay" id="ver-documento-modal">
      <div class="modal-card modal-card-wide">
        <div class="modal-header">
          <span class="modal-title" id="ver-doc-title">Documento</span>
          <button class="modal-close" id="ver-doc-close">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>
        <div class="modal-body" id="ver-doc-body"></div>
        <div class="modal-footer" id="ver-doc-footer"></div>
      </div>
    </div>
  `;
}

function openVerDocumento(docId) {
  const doc = (localEntradas || []).find(d => d.id === docId);
  if (!doc) return;
  currentEntradaDocId = docId;

  const si      = getEntradaStatusInfo(doc.status);
  const idLabel = doc.notaFiscal ? `NF ${doc.notaFiscal}` : doc.codigo;
  const isPend  = doc.status === "pendente";

  const totalItens   = (doc.itens || []).length;
  const recebidos    = (doc.itens || []).filter(i => i.recebido).length;

  const itensHtml = (doc.itens || []).map((item, idx) => `
    <label class="checklist-item${!isPend ? " checklist-item--disabled" : ""}">
      <input type="checkbox" class="doc-item-check" data-idx="${idx}"
        ${item.recebido ? "checked" : ""}
        ${!isPend       ? "disabled" : ""}>
      <span class="checklist-check-icon"></span>
      <div class="checklist-item-body">
        <span class="checklist-item-nome">${item.produto}</span>
        <span class="checklist-item-qtd">${item.quantidade}</span>
      </div>
    </label>
  `).join("");

  document.getElementById("ver-doc-title").textContent = `Documento ${idLabel}`;

  document.getElementById("ver-doc-body").innerHTML = `
    <div class="doc-info-grid">
      <div class="doc-info-cell">
        <span class="doc-info-label">Identificador</span>
        <span class="doc-info-value">${idLabel}</span>
      </div>
      <div class="doc-info-cell">
        <span class="doc-info-label">Fornecedor</span>
        <span class="doc-info-value">${doc.fornecedor || "—"}</span>
      </div>
      <div class="doc-info-cell">
        <span class="doc-info-label">Data de Entrada</span>
        <span class="doc-info-value">${formatDateBR(doc.dataEntrada)}</span>
      </div>
      <div class="doc-info-cell">
        <span class="doc-info-label">Status</span>
        <span class="entrada-status ${si.cls}">
          <span class="material-symbols-rounded" style="font-size:13px">${si.icon}</span>
          ${si.label}
        </span>
      </div>
      ${doc.observacao ? `
      <div class="doc-info-cell doc-info-cell--full">
        <span class="doc-info-label">Observações</span>
        <span class="doc-info-value">${doc.observacao}</span>
      </div>` : ""}
    </div>

    <div class="materiais-section" style="margin-top:16px">
      <div class="materiais-hdr">
        <span class="materiais-label">Checklist de itens</span>
        <span class="checklist-counter" id="checklist-counter">${recebidos} / ${totalItens} recebidos</span>
      </div>
      <div class="checklist-list">
        ${itensHtml || `<div class="materiais-empty-hint">Nenhum item neste documento.</div>`}
      </div>
    </div>
  `;

  const footer = document.getElementById("ver-doc-footer");
  if (doc.status === "pendente") {
    footer.innerHTML =
      `${btnModalDanger({ id: "ver-doc-cancelar", label: "Cancelar entrada" })}
       <div style="flex:1"></div>
       ${btnModalConfirm({ id: "ver-doc-concluir", label: "Concluir Recebimento", icon: "check_circle" })}`;
  } else if (doc.status === "recebido") {
    footer.innerHTML =
      `${btnModalDanger({ id: "ver-doc-cancelar", label: "Cancelar e estornar estoque" })}
       <div style="flex:1"></div>
       ${btnModalCancel({ id: "ver-doc-fechar", label: "Fechar" })}`;
  } else {
    footer.innerHTML = btnModalCancel({ id: "ver-doc-fechar", label: "Fechar" });
  }

  document.getElementById("ver-documento-modal")?.classList.add("open");
  bindVerDocumentoEvents(doc);
}

function bindVerDocumentoEvents(doc) {
  const overlay = document.getElementById("ver-documento-modal");

  overlay?.addEventListener("click", e => {
    if (e.target === e.currentTarget) overlay.classList.remove("open");
  }, { once: true });

  document.getElementById("ver-doc-close")?.addEventListener("click", () => {
    overlay?.classList.remove("open");
  });

  // Live checklist update
  document.querySelectorAll(".doc-item-check").forEach(cb => {
    cb.addEventListener("change", () => {
      doc.itens[parseInt(cb.dataset.idx, 10)].recebido = cb.checked;
      const total    = doc.itens.length;
      const checked  = doc.itens.filter(i => i.recebido).length;
      const counter  = document.getElementById("checklist-counter");
      if (counter) counter.textContent = `${checked} / ${total} recebidos`;
    });
  });

  if (doc.status === "pendente") {
    document.getElementById("ver-doc-concluir")?.addEventListener("click", () => {
      showConfirmModal({
        title:         "Confirmar Recebimento",
        message:       "Os itens selecionados serão adicionados ao estoque. Deseja confirmar o recebimento?",
        confirmLabel:  "Confirmar Recebimento",
        confirmIcon:   "check_circle",
        danger:        false,
        onConfirm: () => {
          doc.itens.forEach(i => { i.recebido = true; addItemToStock(i); });
          doc.status = "recebido";
          overlay?.classList.remove("open");
          refreshEntradasList();
          showToast("Entrada recebida com sucesso. Os itens foram adicionados ao estoque.");
        },
      });
    });

    document.getElementById("ver-doc-cancelar")?.addEventListener("click", () => {
      showConfirmModal({
        title:        "Cancelar Entrada",
        message:      "Tem certeza que deseja cancelar esta entrada?",
        confirmLabel: "Cancelar Entrada",
        confirmIcon:  "cancel",
        danger:       true,
        onConfirm: () => {
          doc.status = "cancelado";
          overlay?.classList.remove("open");
          refreshEntradasList();
          showToast("Entrada cancelada com sucesso.", "warning");
        },
      });
    });

  } else if (doc.status === "recebido") {
    document.getElementById("ver-doc-cancelar")?.addEventListener("click", () => {
      showConfirmModal({
        title:        "Cancelar Entrada Recebida",
        message:      "Esta entrada já foi recebida e os itens foram adicionados ao estoque. Ao cancelar o documento, o estoque será movimentado para remover os itens recebidos. Deseja continuar?",
        confirmLabel: "Sim, cancelar e estornar",
        confirmIcon:  "undo",
        danger:       true,
        onConfirm: () => {
          doc.itens.filter(i => i.recebido).forEach(i => removeItemFromStock(i));
          doc.status = "cancelado";
          overlay?.classList.remove("open");
          refreshEntradasList();
          showToast("Entrada cancelada com sucesso. O estoque foi atualizado para remover os itens recebidos.", "warning");
        },
      });
    });

    document.getElementById("ver-doc-fechar")?.addEventListener("click", () => {
      overlay?.classList.remove("open");
    });

  } else {
    document.getElementById("ver-doc-fechar")?.addEventListener("click", () => {
      overlay?.classList.remove("open");
    });
  }
}

function addDocItemRow() {
  const list  = document.getElementById("doc-itens-list");
  const empty = document.getElementById("doc-itens-empty");
  if (empty) empty.remove();

  const produtos = localProdutos || [];
  const row = document.createElement("div");
  row.className = "doc-item-row";
  row.innerHTML = `
    <select class="doc-item-select">
      <option value="">Produto...</option>
      ${produtos.map(p => `<option value="${p.id}" data-nome="${p.nome}">${p.nome}</option>`).join("")}
    </select>
    <input type="text" class="doc-item-qty" placeholder="Quantidade (ex: 500 ml)">
    <button type="button" class="doc-item-remove" title="Remover">
      <span class="material-symbols-rounded">close</span>
    </button>
  `;
  row.querySelector(".doc-item-remove").addEventListener("click", () => {
    row.remove();
    if (!list.querySelector(".doc-item-row")) {
      list.innerHTML = `<div class="materiais-empty-hint" id="doc-itens-empty">Clique em Adicionar item para incluir produtos.</div>`;
    }
  });
  list.appendChild(row);
}

function collectDocItens() {
  const itens = [];
  document.querySelectorAll(".doc-item-row").forEach(row => {
    const sel  = row.querySelector(".doc-item-select");
    const qty  = row.querySelector(".doc-item-qty");
    if (sel?.value) {
      const nome = sel.options[sel.selectedIndex]?.dataset.nome || sel.value;
      itens.push({ produtoId: sel.value, produto: nome, quantidade: qty?.value.trim() || "", recebido: false });
    }
  });
  return itens;
}

function refreshEntradasList() {
  const q      = (entradasFilter.search || "").toLowerCase();
  const status = entradasFilter.status || "all";
  const filtered = (localEntradas || []).filter(doc => {
    const matchStatus = status === "all" || doc.status === status;
    const hay = `${doc.codigo} ${doc.notaFiscal || ""} ${doc.fornecedor || ""}`.toLowerCase();
    return matchStatus && (!q || hay.includes(q));
  });
  const container = document.getElementById("entradas-table-container");
  if (container) container.innerHTML = buildEntradasList(filtered);
  bindEntradasTableButtons();
}

function bindEntradasTableButtons() {
  document.getElementById("new-entrada-btn")?.addEventListener("click", () => {
    currentEditEntradaDocId = null;
    resetCriarDocModal();
    document.querySelector("#criar-documento-modal .modal-title").textContent = "Novo Documento de Entrada";
    document.getElementById("criar-doc-save").innerHTML =
      `<span class="material-symbols-rounded" style="font-size:17px">save</span> Salvar como Pendente`;
    document.getElementById("criar-documento-modal")?.classList.add("open");
  });

  document.querySelectorAll("[data-view-doc-id]").forEach(btn => {
    btn.addEventListener("click", () => openVerDocumento(btn.dataset.viewDocId));
  });

  document.querySelectorAll("[data-edit-doc-id]").forEach(btn => {
    btn.addEventListener("click", () => openEditDocumento(btn.dataset.editDocId));
  });

  document.querySelectorAll("[data-delete-doc-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      showConfirmModal({
        title:        "Excluir Documento",
        message:      "Deseja excluir permanentemente este documento cancelado? Esta ação não pode ser desfeita.",
        confirmLabel: "Excluir",
        confirmIcon:  "delete",
        danger:       true,
        onConfirm: () => {
          localEntradas = (localEntradas || []).filter(d => d.id !== btn.dataset.deleteDocId);
          refreshEntradasList();
          showToast("Documento excluído.", "warning");
        },
      });
    });
  });
}

function resetCriarDocModal() {
  ["doc-nf", "doc-fornecedor", "doc-obs"].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ""; el.classList.remove("field-error"); }
  });
  const dataEl = document.getElementById("doc-data");
  if (dataEl) { dataEl.value = ""; dataEl.classList.remove("field-error"); }
  document.getElementById("doc-codigo").value = gerarCodigoEntrada();

  // Reset identifier toggle para "Código do sistema"
  document.querySelectorAll(".doc-id-btn").forEach(b => b.classList.remove("active"));
  document.getElementById("doc-tipo-codigo")?.classList.add("active");
  document.getElementById("doc-codigo-wrap").style.display = "";
  document.getElementById("doc-nf-wrap").style.display     = "none";

  const list = document.getElementById("doc-itens-list");
  if (list) list.innerHTML = `<div class="materiais-empty-hint" id="doc-itens-empty">Clique em Adicionar item para incluir produtos.</div>`;
}

function openEditDocumento(docId) {
  const doc = (localEntradas || []).find(d => d.id === docId);
  if (!doc || doc.status !== "pendente") return;

  currentEditEntradaDocId = docId;
  resetCriarDocModal();

  document.querySelector("#criar-documento-modal .modal-title").textContent = "Editar Documento";
  document.getElementById("criar-doc-save").innerHTML =
    `<span class="material-symbols-rounded" style="font-size:17px">save</span> Salvar Alterações`;

  // Preenche identificador
  if (doc.notaFiscal) {
    document.getElementById("doc-tipo-nf")?.click();
    document.getElementById("doc-nf").value = doc.notaFiscal;
  } else {
    document.getElementById("doc-codigo").value = doc.codigo;
  }

  document.getElementById("doc-fornecedor").value = doc.fornecedor || "";
  document.getElementById("doc-data").value        = doc.dataEntrada;
  document.getElementById("doc-obs").value         = doc.observacao || "";

  // Preenche itens
  const list = document.getElementById("doc-itens-list");
  list.innerHTML = "";
  (doc.itens || []).forEach(item => {
    addDocItemRow();
    const rows   = list.querySelectorAll(".doc-item-row");
    const lastRow = rows[rows.length - 1];
    const sel = lastRow.querySelector(".doc-item-select");
    const qty = lastRow.querySelector(".doc-item-qty");
    if (sel) sel.value = item.produtoId;
    if (qty) qty.value = item.quantidade;
  });

  document.getElementById("criar-documento-modal")?.classList.add("open");
}

function bindEntradasEvents() {
  document.getElementById("entradas-search")?.addEventListener("input", e => {
    entradasFilter.search = e.target.value;
    refreshEntradasList();
  });

  const filterBtn  = document.getElementById("entradas-status-filter-btn");
  const filterMenu = document.getElementById("entradas-status-filter-menu");
  filterBtn?.addEventListener("click", e => {
    e.stopPropagation();
    filterMenu?.classList.toggle("open");
  });
  filterMenu?.querySelectorAll("[data-ent-status]").forEach(opt => {
    opt.addEventListener("click", () => {
      filterMenu.querySelectorAll(".filter-option").forEach(o => o.classList.remove("active"));
      opt.classList.add("active");
      entradasFilter.status = opt.dataset.entStatus;
      filterBtn.classList.toggle("active-filter", entradasFilter.status !== "all");
      filterMenu.classList.remove("open");
      refreshEntradasList();
    });
  });
  document.addEventListener("click", e => {
    if (!filterMenu?.contains(e.target) && e.target !== filterBtn) filterMenu?.classList.remove("open");
  });

  document.getElementById("entradas-export-btn")?.addEventListener("click", () => {
    const rows = [];
    (localEntradas || []).forEach(doc => {
      const id = doc.notaFiscal ? `NF ${doc.notaFiscal}` : doc.codigo;
      (doc.itens || []).forEach(item => {
        rows.push([id, doc.fornecedor || "", formatDateBR(doc.dataEntrada), item.produto, item.quantidade, getEntradaStatusInfo(doc.status).label]);
      });
    });
    exportCSV("entradas.csv", ["Código/NF", "Fornecedor", "Data", "Produto", "Quantidade", "Status"], rows);
  });

  bindEntradasTableButtons();

  // Identifier type toggle
  document.getElementById("doc-tipo-codigo")?.addEventListener("click", () => {
    document.querySelectorAll(".doc-id-btn").forEach(b => b.classList.remove("active"));
    document.getElementById("doc-tipo-codigo").classList.add("active");
    document.getElementById("doc-codigo-wrap").style.display = "";
    document.getElementById("doc-nf-wrap").style.display     = "none";
    document.getElementById("doc-nf")?.classList.remove("field-error");
  });
  document.getElementById("doc-tipo-nf")?.addEventListener("click", () => {
    document.querySelectorAll(".doc-id-btn").forEach(b => b.classList.remove("active"));
    document.getElementById("doc-tipo-nf").classList.add("active");
    document.getElementById("doc-codigo-wrap").style.display = "none";
    document.getElementById("doc-nf-wrap").style.display     = "";
  });

  document.getElementById("doc-add-item-btn")?.addEventListener("click", addDocItemRow);

  document.getElementById("criar-doc-close")?.addEventListener("click", () => {
    document.getElementById("criar-documento-modal")?.classList.remove("open");
  });
  document.getElementById("criar-doc-cancel")?.addEventListener("click", () => {
    document.getElementById("criar-documento-modal")?.classList.remove("open");
  });
  document.getElementById("criar-documento-modal")?.addEventListener("click", e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove("open");
  });

  document.getElementById("criar-doc-save")?.addEventListener("click", () => {
    const isCodigo = document.getElementById("doc-tipo-codigo")?.classList.contains("active");
    const nfEl     = document.getElementById("doc-nf");
    const dataEl   = document.getElementById("doc-data");

    [nfEl, dataEl].forEach(el => el?.classList.remove("field-error"));
    let valid = true;
    if (!isCodigo && !nfEl?.value.trim()) { nfEl.classList.add("field-error"); valid = false; }
    if (!dataEl?.value)                   { dataEl.classList.add("field-error"); valid = false; }
    if (!valid) return;

    const itens = collectDocItens();
    if (itens.length === 0) {
      showToast("Adicione ao menos um item ao documento.", "warning");
      return;
    }

    if (currentEditEntradaDocId) {
      const idx = (localEntradas || []).findIndex(d => d.id === currentEditEntradaDocId);
      if (idx !== -1) {
        localEntradas[idx] = {
          ...localEntradas[idx],
          notaFiscal:  isCodigo ? "" : (nfEl?.value.trim() || ""),
          fornecedor:  document.getElementById("doc-fornecedor")?.value.trim() || "",
          dataEntrada: dataEl.value,
          observacao:  document.getElementById("doc-obs")?.value.trim() || "",
          itens,
        };
      }
      currentEditEntradaDocId = null;
      document.getElementById("criar-documento-modal")?.classList.remove("open");
      refreshEntradasList();
      showToast("Documento atualizado com sucesso!");
      return;
    }

    const novoDoc = {
      id:          `doc-${Date.now()}`,
      codigo:      document.getElementById("doc-codigo")?.value || gerarCodigoEntrada(),
      notaFiscal:  isCodigo ? "" : (nfEl?.value.trim() || ""),
      fornecedor:  document.getElementById("doc-fornecedor")?.value.trim() || "",
      dataEntrada: dataEl.value,
      responsavel: currentUser.name,
      observacao:  document.getElementById("doc-obs")?.value.trim() || "",
      status:      "pendente",
      itens,
    };

    localEntradas = [novoDoc, ...(localEntradas || [])];
    document.getElementById("criar-documento-modal")?.classList.remove("open");
    refreshEntradasList();
    showToast("Documento criado com status Pendente!");
  });

  document.getElementById("doc-nf")?.addEventListener("input", e => e.target.classList.remove("field-error"));
  document.getElementById("doc-data")?.addEventListener("change", e => e.target.classList.remove("field-error"));
}

/* ================================================================
   COMPRAS / SOLICITAÇÕES DE COMPRA
   ================================================================ */

function getSolStatusInfo(status) {
  return ({
    pendente:  { label: "Pendente",  cls: "entrada-status-pendente",  icon: "schedule"     },
    atendida:  { label: "Atendida",  cls: "entrada-status-recebido",  icon: "check_circle" },
    cancelada: { label: "Cancelada", cls: "entrada-status-cancelado", icon: "cancel"       },
  })[status] || { label: status, cls: "", icon: "help" };
}

function getSolOrigemInfo(origem) {
  return origem === "professor"
    ? { label: "Professor",       icon: "school",    cls: "notif-tipo-solicitacao" }
    : { label: "Estoque Mínimo",  icon: "smart_toy", cls: "notif-tipo-estoque"     };
}

function renderCompras() {
  solicitacoesFilter = { search: "", origem: "all", status: "all" };

  document.getElementById("main-content").innerHTML = `
    <div class="agend-page">
      <h1 class="page-section-title">Solicitações de Compra</h1>
      <p class="page-section-sub">Centralize e acompanhe todas as necessidades de compra geradas pelo sistema ou pelos professores.</p>
      <div class="page-toolbar">
        <label class="page-search">
          <span class="material-symbols-rounded">search</span>
          <input type="text" id="compras-search" placeholder="Buscar por número, produto ou solicitante...">
        </label>
        <div class="filter-dropdown-wrap">
          <button class="filter-btn" id="compras-status-btn">
            <span class="material-symbols-rounded">filter_list</span>
            Filtrar status
            <span class="material-symbols-rounded" style="font-size:16px">expand_more</span>
          </button>
          <div class="filter-dropdown-menu" id="compras-status-menu">
            <div class="filter-option active" data-sol-status="all">Todos</div>
            <div class="filter-option" data-sol-status="pendente">Pendente</div>
            <div class="filter-option" data-sol-status="atendida">Atendida</div>
            <div class="filter-option" data-sol-status="cancelada">Cancelada</div>
          </div>
        </div>
        <button class="export-btn-outline" id="compras-export-btn">
          <span class="material-symbols-rounded">download</span>
          Exportar
        </button>
      </div>
      <div id="compras-table-container">
        ${buildComprasList()}
      </div>
      ${buildVerSolicitacaoModal()}
    </div>
  `;

  bindComprasEvents();
}

function buildComprasList() {
  const q      = (solicitacoesFilter.search || "").toLowerCase();
  const origem = solicitacoesFilter.origem;
  const status = solicitacoesFilter.status;

  let items = localSolicitacoes || [];
  if (origem !== "all") items = items.filter(s => s.origem === origem);
  if (status !== "all") items = items.filter(s => s.status === status);
  if (q) items = items.filter(s =>
    s.numero.toLowerCase().includes(q) ||
    s.produto.toLowerCase().includes(q) ||
    (s.solicitante || "").toLowerCase().includes(q)
  );

  const pendentes = (localSolicitacoes || []).filter(s => s.status === "pendente").length;
  const headerBadge = pendentes > 0
    ? `<span class="badge rounded-pill" style="background:#fff8e6;color:#b45309;font-size:11px;font-weight:700;padding:5px 12px">${pendentes} pendente(s)</span>`
    : resultBadge(items.length);

  const rows = items.length === 0
    ? `<tr class="table-empty-row"><td colspan="9">Nenhuma solicitação encontrada.</td></tr>`
    : items.map(s => {
        const si = getSolStatusInfo(s.status);
        const oi = getSolOrigemInfo(s.origem);
        return `
          <tr>
            <td style="width:40px;text-align:center">
              <input type="checkbox" class="sol-checkbox" data-sol-id="${s.id}" style="width:16px;height:16px;cursor:pointer;accent-color:var(--purple)">
            </td>
            <td><span style="font-weight:700;font-size:13px">${s.numero}</span></td>
            <td>${formatDateBR(s.data)}</td>
            <td>
              <span class="notif-tipo-badge ${oi.cls}">
                <span class="material-symbols-rounded" style="font-size:13px">${oi.icon}</span>
                ${oi.label}
              </span>
            </td>
            <td>
              <div style="display:flex;align-items:center;gap:6px">
                <span class="material-symbols-rounded" style="font-size:16px;color:var(--purple)">inventory_2</span>
                ${s.produto}
              </div>
            </td>
            <td>${s.quantidadeSolicitada} ${s.unidadeMedida}</td>
            <td>${s.quantidadeDisponivel} ${s.unidadeMedida}</td>
            <td>
              <span class="entrada-status ${si.cls}">
                <span class="material-symbols-rounded" style="font-size:13px">${si.icon}</span>
                ${si.label}
              </span>
            </td>
            <td>
              <div class="action-cell">
                <button class="action-icon-btn" title="Visualizar" data-view-sol-id="${s.id}">
                  <span class="material-symbols-rounded">visibility</span>
                </button>
                ${s.status === "pendente" ? `
                <button class="action-icon-btn" title="Marcar como atendida" data-atender-sol-id="${s.id}">
                  <span class="material-symbols-rounded">check_circle</span>
                </button>
                <button class="action-icon-btn delete" title="Cancelar" data-cancelar-sol-id="${s.id}">
                  <span class="material-symbols-rounded">cancel</span>
                </button>` : `
                <button class="action-icon-btn" title="Atendida" disabled style="opacity:.35;cursor:not-allowed">
                  <span class="material-symbols-rounded">check_circle</span>
                </button>`}
              </div>
            </td>
          </tr>
        `;
      }).join("");

  return `
    <div class="lote-action-bar" id="lote-action-bar" style="display:none">
      <span id="lote-count-label">0 item(s) selecionado(s)</span>
      <button class="new-item-btn" id="gerar-pedido-btn" style="height:36px;font-size:13px;padding:0 18px">
        <span class="material-symbols-rounded" style="font-size:17px">download</span>
        Gerar Pedido de Compra (.xlsx)
      </button>
      <button class="action-icon-btn" id="lote-deselect-btn" title="Limpar seleção" style="margin-left:4px">
        <span class="material-symbols-rounded">close</span>
      </button>
    </div>
    <div class="list-card">
      <div class="list-card-header">
        <span class="list-card-title">Lista de Solicitações</span>
        ${headerBadge}
      </div>
      <div class="list-card-inner">
        <div class="table-wrap">
          <table class="produtos-table">
            <thead>
              <tr>
                <th style="width:40px;text-align:center">
                  <input type="checkbox" id="sol-select-all" style="width:16px;height:16px;cursor:pointer;accent-color:var(--purple)">
                </th>
                <th>Número</th>
                <th>Data</th>
                <th>Origem</th>
                <th>Produto</th>
                <th>Qtd Solicitada</th>
                <th>Qtd Disponível</th>
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

function buildVerSolicitacaoModal() {
  return `
    <div class="modal-overlay" id="ver-sol-modal">
      <div class="modal-card modal-card-wide">
        <div class="modal-header">
          <span class="modal-title" id="ver-sol-titulo">Solicitação</span>
          <button class="modal-close" id="ver-sol-close">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>
        <div class="modal-body" id="ver-sol-body"></div>
        <div class="modal-body" style="border-top:1px solid var(--border);padding-top:14px">
          <div class="modal-field" style="margin:0">
            <label>Observações</label>
            <input type="text" id="ver-sol-obs-input" placeholder="Registrar observação...">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline-secondary btn-pongo" id="ver-sol-fechar">Fechar</button>
          <div style="flex:1"></div>
          <button class="btn btn-success btn-pongo fw-bold d-flex align-items-center gap-2" id="ver-sol-salvar-obs">
            <span class="material-symbols-rounded" style="font-size:17px">save</span>
            Salvar obs.
          </button>
        </div>
      </div>
    </div>
  `;
}

function refreshComprasList() {
  const container = document.getElementById("compras-table-container");
  if (container) container.innerHTML = buildComprasList();
  bindComprasTableButtons();
}

function getSelectedSolIds() {
  return [...document.querySelectorAll(".sol-checkbox:checked")].map(cb => cb.dataset.solId);
}

function updateLoteBar() {
  const ids    = getSelectedSolIds();
  const bar    = document.getElementById("lote-action-bar");
  const label  = document.getElementById("lote-count-label");
  if (!bar) return;
  bar.style.display  = ids.length > 0 ? "flex" : "none";
  if (label) label.textContent = `${ids.length} item(s) selecionado(s)`;
}

function exportPedidoCompraXLSX(ids) {
  const solicitacoes = (localSolicitacoes || []).filter(s => ids.includes(s.id));
  if (!solicitacoes.length) { showToast("Nenhum item selecionado.", "warning"); return; }

  const origemLabel  = { professor: "Professor", "estoque-minimo": "Estoque mínimo" };
  const statusLabel  = { pendente: "Pendente", atendida: "Atendida", cancelada: "Cancelada" };

  const data = [
    ["Pedido de Compra — PongoEdu"],
    [`Gerado em: ${new Date().toLocaleDateString("pt-BR")} ${new Date().toLocaleTimeString("pt-BR")}`],
    [],
    ["Nº Solicitação", "Data", "Origem", "Produto", "Qtd Solicitada", "Unidade", "Qtd Disponível", "Solicitante", "Status", "Observações"],
    ...solicitacoes.map(s => [
      s.numero,
      formatDateBR(s.data),
      origemLabel[s.origem] || s.origem,
      s.produto,
      s.quantidadeSolicitada,
      s.unidadeMedida,
      s.quantidadeDisponivel,
      s.solicitante || "—",
      statusLabel[s.status] || s.status,
      s.observacoes || "",
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);

  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }];
  ws["!cols"]   = [10, 12, 16, 24, 14, 10, 14, 18, 12, 20].map(w => ({ wch: w }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pedido de Compra");
  XLSX.writeFile(wb, `Pedido_Compra_${new Date().toISOString().slice(0, 10)}.xlsx`);

  solicitacoes.forEach(s => {
    const local = (localSolicitacoes || []).find(x => x.id === s.id);
    if (local) local.status = "atendida";
  });

  refreshComprasList();
  showToast(`Pedido gerado e ${solicitacoes.length} solicitação(ões) marcada(s) como atendida.`);
}

function bindComprasTableButtons() {
  document.querySelectorAll("[data-view-sol-id]").forEach(btn => {
    btn.addEventListener("click", () => openVerSolicitacao(btn.dataset.viewSolId));
  });

  const selectAll = document.getElementById("sol-select-all");
  selectAll?.addEventListener("change", () => {
    document.querySelectorAll(".sol-checkbox").forEach(cb => cb.checked = selectAll.checked);
    updateLoteBar();
  });

  document.querySelectorAll(".sol-checkbox").forEach(cb => {
    cb.addEventListener("change", () => {
      const all = document.querySelectorAll(".sol-checkbox");
      const checked = document.querySelectorAll(".sol-checkbox:checked");
      if (selectAll) selectAll.checked = all.length === checked.length;
      updateLoteBar();
    });
  });

  document.getElementById("gerar-pedido-btn")?.addEventListener("click", () => {
    exportPedidoCompraXLSX(getSelectedSolIds());
  });

  document.getElementById("lote-deselect-btn")?.addEventListener("click", () => {
    document.querySelectorAll(".sol-checkbox").forEach(cb => cb.checked = false);
    if (document.getElementById("sol-select-all")) document.getElementById("sol-select-all").checked = false;
    updateLoteBar();
  });

  document.querySelectorAll("[data-atender-sol-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const sol = (localSolicitacoes || []).find(s => s.id === btn.dataset.atenderSolId);
      if (sol) {
        sol.status = "atendida";
        refreshComprasList();
        showToast("Solicitação marcada como atendida.");
      }
    });
  });

  document.querySelectorAll("[data-cancelar-sol-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      showConfirmModal({
        title:        "Cancelar Solicitação",
        message:      "Deseja cancelar esta solicitação de compra?",
        confirmLabel: "Cancelar Solicitação",
        confirmIcon:  "cancel",
        danger:       true,
        onConfirm: () => {
          const sol = (localSolicitacoes || []).find(s => s.id === btn.dataset.cancelarSolId);
          if (sol) {
            sol.status = "cancelada";
            refreshComprasList();
            showToast("Solicitação cancelada.", "warning");
          }
        },
      });
    });
  });
}

function openVerSolicitacao(solId) {
  const s = (localSolicitacoes || []).find(x => x.id === solId);
  if (!s) return;

  const si = getSolStatusInfo(s.status);
  const oi = getSolOrigemInfo(s.origem);

  document.getElementById("ver-sol-titulo").textContent = `Solicitação ${s.numero}`;
  document.getElementById("ver-sol-obs-input").value    = s.observacoes || "";

  document.getElementById("ver-sol-body").innerHTML = `
    <div class="doc-info-grid">
      <div class="doc-info-cell">
        <span class="doc-info-label">Número</span>
        <span class="doc-info-value">${s.numero}</span>
      </div>
      <div class="doc-info-cell">
        <span class="doc-info-label">Data</span>
        <span class="doc-info-value">${formatDateBR(s.data)}</span>
      </div>
      <div class="doc-info-cell">
        <span class="doc-info-label">Origem</span>
        <span class="notif-tipo-badge ${oi.cls}" style="margin-top:2px">
          <span class="material-symbols-rounded" style="font-size:13px">${oi.icon}</span>
          ${oi.label}
        </span>
      </div>
      <div class="doc-info-cell">
        <span class="doc-info-label">Status</span>
        <span class="entrada-status ${si.cls}" style="margin-top:2px">
          <span class="material-symbols-rounded" style="font-size:13px">${si.icon}</span>
          ${si.label}
        </span>
      </div>
      <div class="doc-info-cell">
        <span class="doc-info-label">Solicitante</span>
        <span class="doc-info-value">${s.solicitante || "—"}</span>
      </div>
      <div class="doc-info-cell">
        <span class="doc-info-label">Agendamento Vinculado</span>
        <span class="doc-info-value">${s.agendamentoId || "—"}</span>
      </div>
      <div class="doc-info-cell">
        <span class="doc-info-label">Produto</span>
        <span class="doc-info-value">${s.produto}</span>
      </div>
      <div class="doc-info-cell">
        <span class="doc-info-label">Estoque Mínimo</span>
        <span class="doc-info-value">${s.estoqueMinimo} ${s.unidadeMedida}</span>
      </div>
      <div class="doc-info-cell">
        <span class="doc-info-label">Quantidade Disponível</span>
        <span class="doc-info-value">${s.quantidadeDisponivel} ${s.unidadeMedida}</span>
      </div>
      <div class="doc-info-cell">
        <span class="doc-info-label">Quantidade Solicitada</span>
        <span class="doc-info-value">${s.quantidadeSolicitada} ${s.unidadeMedida}</span>
      </div>
    </div>
  `;

  document.getElementById("ver-sol-modal")?.classList.add("open");

  const close = () => document.getElementById("ver-sol-modal")?.classList.remove("open");
  document.getElementById("ver-sol-close").onclick  = close;
  document.getElementById("ver-sol-fechar").onclick = close;
  document.getElementById("ver-sol-modal").onclick  = e => { if (e.target === e.currentTarget) close(); };

  document.getElementById("ver-sol-salvar-obs").onclick = () => {
    s.observacoes = document.getElementById("ver-sol-obs-input").value.trim();
    close();
    refreshComprasList();
    showToast("Observação registrada.");
  };
}

function bindComprasEvents() {
  document.getElementById("compras-search")?.addEventListener("input", e => {
    solicitacoesFilter.search = e.target.value;
    refreshComprasList();
  });

  document.getElementById("compras-export-btn")?.addEventListener("click", () => {
    exportCSV("solicitacoes.csv",
      ["Número", "Data", "Origem", "Produto", "Qtd Sol.", "Qtd Disp.", "Est. Mín.", "Status", "Solicitante", "Observações"],
      (localSolicitacoes || []).map(s => [
        s.numero, formatDateBR(s.data), getSolOrigemInfo(s.origem).label,
        s.produto, `${s.quantidadeSolicitada} ${s.unidadeMedida}`,
        `${s.quantidadeDisponivel} ${s.unidadeMedida}`, `${s.estoqueMinimo} ${s.unidadeMedida}`,
        getSolStatusInfo(s.status).label, s.solicitante, s.observacoes || "",
      ])
    );
  });

  const makeFilter = (btnId, menuId, filterKey) => {
    const btn  = document.getElementById(btnId);
    const menu = document.getElementById(menuId);
    btn?.addEventListener("click", e => { e.stopPropagation(); menu?.classList.toggle("open"); });
    menu?.querySelectorAll(`[data-sol-${filterKey}]`).forEach(opt => {
      opt.addEventListener("click", () => {
        menu.querySelectorAll(".filter-option").forEach(o => o.classList.remove("active"));
        opt.classList.add("active");
        solicitacoesFilter[filterKey] = opt.dataset[`sol${filterKey.charAt(0).toUpperCase()}${filterKey.slice(1)}`];
        btn.classList.toggle("active-filter", solicitacoesFilter[filterKey] !== "all");
        menu.classList.remove("open");
        refreshComprasList();
      });
    });
    document.addEventListener("click", e => {
      if (!menu?.contains(e.target) && e.target !== btn) menu?.classList.remove("open");
    });
  };

  makeFilter("compras-status-btn", "compras-status-menu", "status");

  bindComprasTableButtons();
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