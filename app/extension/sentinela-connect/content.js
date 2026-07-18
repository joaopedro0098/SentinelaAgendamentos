const PANEL_ID = "sentinela-connect-panel";
const BODY_CLASS = "sentinela-connect-active";
let currentPhoneKey = null;
let lookupSeq = 0;
let observer = null;

function ensurePanel() {
  if (document.getElementById(PANEL_ID)) return document.getElementById(PANEL_ID);
  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.innerHTML = `
    <div class="sc-header">
      <div class="sc-brand">
        <strong>Sentinela Connect</strong>
        <span>Painel do paciente</span>
      </div>
      <button type="button" class="sc-icon-btn" id="sc-collapse" title="Recolher painel">›</button>
    </div>
    <div class="sc-body" id="sc-body"></div>
  `;
  document.body.appendChild(panel);
  document.body.classList.add(BODY_CLASS);

  panel.querySelector("#sc-collapse")?.addEventListener("click", () => {
    panel.style.display = "none";
    document.body.classList.remove(BODY_CLASS);
  });

  return panel;
}

function setBody(html) {
  ensurePanel();
  const body = document.getElementById("sc-body");
  if (body) body.innerHTML = html;
}

function renderLoading() {
  setBody(`
    <div class="sc-state">
      <div class="sc-spinner"></div>
      Buscando no Sentinela…
    </div>
  `);
}

function renderMessage(title, message, extraHtml = "") {
  setBody(`
    <div class="sc-state">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(message)}</p>
      ${extraHtml}
    </div>
  `);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateBr(ymd) {
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-");
  if (!d) return ymd;
  return `${d}/${m}/${y}`;
}

function parsePhoneFromText(text) {
  if (!text) return null;
  const match = text.match(/\+?\d[\d\s().-]{8,}\d/);
  if (!match) return null;
  const digits = match[0].replace(/\D/g, "");
  return digits.length >= 10 ? digits : null;
}

function extractChatIdPhone() {
  const main = document.querySelector("#main");
  if (!main) return null;

  const withDataId = main.querySelector("[data-id]");
  const dataId = withDataId?.getAttribute("data-id") || "";
  if (dataId.includes("@g.us")) return { type: "group" };
  const userMatch = dataId.match(/^(\d+)@(?:c\.us|s\.whatsapp\.net)$/);
  if (userMatch) return { type: "individual", phone: userMatch[1] };
  return null;
}

function extractPhoneFromHeader() {
  const header = document.querySelector("#main header");
  if (!header) return null;

  for (const el of header.querySelectorAll("[title]")) {
    const phone = parsePhoneFromText(el.getAttribute("title"));
    if (phone) return { type: "individual", phone, via: "title" };
  }

  const phoneFromText = parsePhoneFromText(header.innerText || "");
  if (phoneFromText) return { type: "individual", phone: phoneFromText, via: "header_text" };

  return null;
}

function detectConversation() {
  const chatId = extractChatIdPhone();
  if (chatId?.type === "group") return { kind: "group" };
  if (chatId?.type === "individual" && chatId.phone) {
    return { kind: "individual", phone: chatId.phone, via: "data-id" };
  }

  const header = extractPhoneFromHeader();
  if (header?.type === "individual" && header.phone) {
    return { kind: "individual", phone: header.phone, via: header.via };
  }

  const main = document.querySelector("#main");
  if (!main || main.querySelector('[data-icon="default-user"]') == null && !main.querySelector("header")) {
    return { kind: "none" };
  }

  return { kind: "unknown" };
}

function renderMatchBlock(match, links) {
  const next = match.next_appointment;
  const recent = Array.isArray(match.recent_appointments) ? match.recent_appointments : [];
  const clientName = match.client?.nome || "Paciente";

  const nextHtml = next
    ? `<div class="sc-card sc-highlight">
        <div class="sc-label">Próxima consulta</div>
        <div class="sc-value">${escapeHtml(formatDateBr(next.data))} às ${escapeHtml(next.hora)}</div>
        <div class="sc-sub">${escapeHtml(next.profissional || "")} · ${escapeHtml(next.status || "")}</div>
      </div>`
    : `<div class="sc-card"><div class="sc-sub">Nenhuma consulta futura nesta clínica.</div></div>`;

  const recentHtml =
    recent.length > 0
      ? `<div class="sc-card">
          <div class="sc-label">Últimas consultas</div>
          <ul class="sc-list">
            ${recent
              .map(
                (item) =>
                  `<li>${escapeHtml(formatDateBr(item.data))} ${escapeHtml(item.hora)} — ${escapeHtml(item.status)} · ${escapeHtml(item.profissional || "")}</li>`,
              )
              .join("")}
          </ul>
        </div>`
      : "";

  const shopBadge =
    match.barbearia_nome && match.barbearia_nome !== "Clínica"
      ? `<span class="sc-badge">${escapeHtml(match.barbearia_nome)}</span>`
      : "";

  return `
    <div class="sc-card">
      <h2>${escapeHtml(clientName)}</h2>
      <div class="sc-sub">${shopBadge}</div>
      ${nextHtml}
      ${recentHtml}
      <div class="sc-actions">
        <a class="sc-btn sc-btn-primary" href="${escapeHtml(links.agendar)}" target="_blank" rel="noopener">Agendar consulta</a>
        <a class="sc-btn" href="${escapeHtml(links.pacientes)}" target="_blank" rel="noopener">Ver pacientes</a>
        <a class="sc-btn" href="${escapeHtml(links.panel_base)}" target="_blank" rel="noopener">Abrir painel</a>
      </div>
    </div>
  `;
}

function renderLookupResult(result, debugInfo) {
  if (!result.ok) {
    if (result.error === "configure_token") {
      renderMessage(
        "Configure a extensão",
        "Abra as opções da extensão Sentinela Connect e cole o token gerado em Configurações do Sentinela.",
        `<a class="sc-btn sc-btn-primary" href="#" id="sc-open-options">Abrir opções</a>`,
      );
      document.getElementById("sc-open-options")?.addEventListener("click", (e) => {
        e.preventDefault();
        chrome.runtime.openOptionsPage();
      });
      return;
    }
    renderMessage("Erro", result.message || "Não foi possível consultar o Sentinela.", debugInfo);
    return;
  }

  const data = result.data || {};
  const links = data.links || {};
  const matches = Array.isArray(data.matches) ? data.matches : [];

  if (!data.found || matches.length === 0) {
    renderMessage(
      "Não cadastrado",
      "Este número não tem agendamentos no seu escopo Sentinela (CT/CA).",
      `<div class="sc-actions">
        <a class="sc-btn sc-btn-primary" href="${escapeHtml(links.agendar || "#")}" target="_blank" rel="noopener">Abrir agendar no Sentinela</a>
        <a class="sc-btn" href="${escapeHtml(links.pacientes || "#")}" target="_blank" rel="noopener">Ver pacientes</a>
      </div>${debugInfo}`,
    );
    return;
  }

  const html = matches.map((m) => renderMatchBlock(m, links)).join("");
  setBody(html + debugInfo);
}

async function lookupCurrentConversation() {
  const conv = detectConversation();

  if (conv.kind === "none") {
    currentPhoneKey = null;
    renderMessage("Sentinela Connect", "Selecione uma conversa no WhatsApp Web.");
    return;
  }

  if (conv.kind === "group") {
    currentPhoneKey = "group";
    renderMessage("Grupo", "Abra uma conversa individual para ver o paciente no Sentinela.");
    return;
  }

  if (conv.kind === "unknown") {
    currentPhoneKey = "unknown";
    renderMessage(
      "Número não detectado",
      "Não foi possível ler o telefone desta conversa. Se for contato salvo só pelo nome, abra os detalhes do contato ou valide o seletor (modo debug nas opções).",
    );
    return;
  }

  const phoneKey = conv.phone;
  if (phoneKey === currentPhoneKey) return;
  currentPhoneKey = phoneKey;

  renderLoading();
  const seq = ++lookupSeq;

  chrome.runtime.sendMessage({ type: "LOOKUP", phone: phoneKey }, (response) => {
    if (seq !== lookupSeq) return;
    chrome.storage.sync.get(["debug"], (stored) => {
      const debugInfo = stored.debug
        ? `<div class="sc-debug">phone=${escapeHtml(phoneKey)} via=${escapeHtml(conv.via || "?")}</div>`
        : "";
      renderLookupResult(response || { ok: false, message: "Sem resposta da extensão." }, debugInfo);
    });
  });
}

function startObserver() {
  if (observer) observer.disconnect();
  observer = new MutationObserver(() => {
    window.clearTimeout(startObserver._t);
    startObserver._t = window.setTimeout(() => lookupCurrentConversation(), 350);
  });

  const root = document.body;
  if (!root) return;
  observer.observe(root, { childList: true, subtree: true, attributes: true });
  lookupCurrentConversation();
}

function boot() {
  ensurePanel();
  startObserver();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
