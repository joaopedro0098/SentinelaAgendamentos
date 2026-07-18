const PANEL_ID = "sentinela-connect-panel";
const BODY_CLASS = "sentinela-connect-active";
const WA_STORE_IN = "sentinela-connect-wa-store-req";
const WA_STORE_OUT = "sentinela-connect-wa-store";
const HISTORY_PREVIEW = 4;

let currentClientKey = null;
let currentDisplayName = "";
let lookupSeq = 0;
let observer = null;
let waStoreInjected = false;
let showAllHistory = false;
let appointmentsTab = "past";
let futureRefreshSeq = 0;

function ensureWaStoreBridge() {
  if (waStoreInjected) return;
  if (document.querySelector('script[data-sc-wa-store="1"]')) {
    waStoreInjected = true;
    return;
  }
  const scriptUrl = getExtensionResourceUrl("page-wa-store.js");
  if (!scriptUrl) return;
  waStoreInjected = true;
  const script = document.createElement("script");
  script.src = scriptUrl;
  script.dataset.scWaStore = "1";
  (document.head || document.documentElement).appendChild(script);
}

function requestActiveChatFromStore(timeoutMs = 800) {
  ensureWaStoreBridge();
  return new Promise((resolve) => {
    const requestId = crypto.randomUUID();
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", handler);
      resolve(null);
    }, timeoutMs);

    const handler = (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.source !== WA_STORE_OUT || data.requestId !== requestId) return;
      window.removeEventListener("message", handler);
      clearTimeout(timer);
      resolve(data);
    };

    window.addEventListener("message", handler);
    window.postMessage({ source: WA_STORE_IN, requestId }, "*");
  });
}

async function requestActiveChatFromStoreWithRetry(maxWaitMs = 20000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < maxWaitMs) {
    last = await requestActiveChatFromStore(Math.min(2500, maxWaitMs));
    if (last?.chat?.kind === "individual" && last.chat.phone) return last;
    if (last?.chat?.kind === "group") return last;
    if (last?.chat?.kind === "lid") return last;
    if (last?.diag?.reason === "lid_without_phone") return last;
    if (last?.diag?.reason === "ok") return last;
    const retryable = /wa_js_(timeout|not_ready|unavailable)/.test(String(last?.diag?.reason ?? ""));
    if (!retryable && last?.diag?.reason && last.diag.reason !== "no_active_chat") return last;
    await new Promise((r) => setTimeout(r, 500));
  }
  return last;
}

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
    <div class="sc-panel-footer" id="sc-panel-footer" hidden></div>
  `;
  document.body.appendChild(panel);
  document.body.classList.add(BODY_CLASS);
  document.documentElement.classList.add(BODY_CLASS);
  panel.querySelector("#sc-collapse")?.addEventListener("click", () => {
    panel.style.display = "none";
    document.body.classList.remove(BODY_CLASS);
    document.documentElement.classList.remove(BODY_CLASS);
  });
  return panel;
}

function setBody(html) {
  ensurePanel();
  const body = document.getElementById("sc-body");
  if (body) body.innerHTML = html;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatPhoneDisplay(digits) {
  const d = String(digits ?? "").replace(/\D/g, "");
  const local = d.startsWith("55") && d.length >= 12 ? d.slice(2) : d;
  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return d;
}

function timeToMinutes(hhmm) {
  const [h, m] = String(hhmm ?? "").slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToTime(mins) {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

function occupiedSlotStarts(hora, duracaoMinutos, slotInterval) {
  const start = timeToMinutes(hora);
  const end = start + Math.max(1, Number(duracaoMinutos) || 30);
  const step = Math.max(1, Number(slotInterval) || 30);
  const out = [];
  for (let t = start; t < end; t += step) {
    out.push(minutesToTime(t));
  }
  return out.length ? out : [String(hora ?? "").slice(0, 5)];
}

function formatSlotHourLabel(hhmm) {
  const [h, m] = String(hhmm).slice(0, 5).split(":").map(Number);
  if (!m) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

function formatHistoryWhenLine(item) {
  const [y, mo, d] = String(item.data).split("-").map(Number);
  const dt = new Date(y, (mo || 1) - 1, d || 1);
  let weekday = dt.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  weekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const dateStr = `${String(d).padStart(2, "0")}/${String(mo).padStart(2, "0")}/${y}`;
  const slots = occupiedSlotStarts(item.hora, item.duracao_minutos, item.slot_minutos);
  const times = slots.map(formatSlotHourLabel).join(", ");
  return `${weekday}, ${dateStr} · ${times}`;
}

function anotacaoText(text) {
  const t = String(text ?? "").trim();
  return t || "Sem anotação registrada.";
}

function patientDisplayName(patient) {
  return patient?.nome || currentDisplayName || "Paciente";
}

function renderAvatarSlot(patient) {
  const nome = patientDisplayName(patient);
  const initial = escapeHtml(nome.slice(0, 1).toUpperCase() || "?");
  const avatarUrl = String(patient?.avatar_url ?? "").trim();

  if (!avatarUrl) {
    return `<div class="sc-avatar sc-avatar-fallback">${initial}</div>`;
  }

  return `
    <div class="sc-avatar-wrap">
      <img class="sc-avatar sc-avatar-photo" data-sc-avatar-url="${escapeHtml(avatarUrl)}" alt="" hidden />
      <div class="sc-avatar sc-avatar-fallback">${initial}</div>
    </div>
  `;
}

function hydratePanelAvatars() {
  const body = document.getElementById("sc-body");
  if (!body) return;

  body.querySelectorAll("img[data-sc-avatar-url]").forEach((img) => {
    const url = img.getAttribute("data-sc-avatar-url");
    if (!url || img.dataset.scAvatarLoaded) return;
    img.dataset.scAvatarLoaded = "pending";

    sendExtensionMessage({ type: "FETCH_AVATAR", url }, (response) => {
      if (!response?.ok || !response.dataUrl) {
        delete img.dataset.scAvatarLoaded;
        return;
      }
      img.src = response.dataUrl;
      img.hidden = false;
      img.dataset.scAvatarLoaded = "done";
    });
  });
}

function renderPatientShell(displayName, phoneDigits) {
  disableMessagesModule();
  const nome = displayName || "Paciente";
  setBody(`
    ${renderPatientHeader({ nome, avatar_url: null }, phoneDigits)}
    <div class="sc-section-loading">
      <div class="sc-spinner sc-spinner-sm"></div>
      <span>Carregando agendamentos…</span>
    </div>
  `);
}

function renderMessage(title, message, extraHtml = "") {
  disableMessagesModule();
  setBody(`
    <div class="sc-state">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(message)}</p>
      ${extraHtml}
    </div>
  `);
}

function renderDebugInfo(clientWhatsappId, via, diag) {
  if (!diag && !via) return "";
  const bits = [];
  if (clientWhatsappId) bits.push(`id=${clientWhatsappId}`);
  if (via) bits.push(`via=${via}`);
  if (diag?.reason) bits.push(`store=${diag.reason}`);
  if (diag?.engine) bits.push(`engine=${diag.engine}`);
  if (diag?.serialized) bits.push(`jid=${diag.serialized}`);
  return bits.length ? `<div class="sc-debug">${escapeHtml(bits.join(" · "))}</div>` : "";
}

function renderPatientHeader(patient, phoneDigits) {
  const nome = patientDisplayName(patient);

  return `
    <div class="sc-patient-header">
      ${renderAvatarSlot(patient)}
      <div class="sc-patient-meta">
        <p class="sc-patient-name">${escapeHtml(nome)}</p>
        <p class="sc-patient-phone">${escapeHtml(formatPhoneDisplay(phoneDigits))}</p>
      </div>
    </div>
  `;
}

function getAppointmentStatusKind(item) {
  if (item?.status_kind) return item.status_kind;
  const status = String(item?.status ?? "");
  if (status === "aguardando_pagamento") return "aguardando_pagamento";
  if (status === "cancelado") return "cancelado";
  if (status === "nao_veio") return "faltou";
  if (status === "concluido") return "concluido";
  if (item?.requires_client_confirmation && !item?.client_confirmed_at) return "nao_confirmado";
  return "confirmado";
}

function formatAppointmentStatusLabel(kind) {
  const map = {
    confirmado: "Confirmado",
    nao_confirmado: "Não confirmado",
    aguardando_pagamento: "Aguardando pagamento",
    cancelado: "Cancelado",
    faltou: "Faltou",
    concluido: "Concluído",
  };
  return map[String(kind ?? "")] || "";
}

function renderAppointmentProfLine(item) {
  const servicos = Array.isArray(item.servicos_nomes) ? item.servicos_nomes.filter(Boolean) : [];
  return servicos.length
    ? `${item.barbeiro_nome || "Profissional"} · ${servicos.join(", ")}`
    : item.barbeiro_nome || "Profissional";
}

function renderHistoryCard(item, index) {
  const whenLine = formatHistoryWhenLine(item);
  const profLine = renderAppointmentProfLine(item);
  const note = anotacaoText(item.anotacao_conteudo);
  const hasNote = Boolean(String(item.anotacao_conteudo ?? "").trim());

  return `
    <article class="sc-history-card" data-idx="${index}">
      <button type="button" class="sc-history-head" data-toggle-idx="${index}" aria-expanded="false">
        <div class="sc-history-summary">
          <p class="sc-history-when-line">${escapeHtml(whenLine)}</p>
          <p class="sc-history-prof">${escapeHtml(profLine)}</p>
        </div>
        ${
          hasNote
            ? `<span class="sc-history-chevron" aria-hidden="true">›</span>`
            : `<span class="sc-history-chevron sc-history-chevron-muted" aria-hidden="true">·</span>`
        }
      </button>
      ${
        hasNote
          ? `<div class="sc-history-note" hidden>
              <div class="sc-history-note-inner">${escapeHtml(note)}</div>
            </div>`
          : ""
      }
    </article>
  `;
}

function renderFutureCard(item) {
  const whenLine = formatHistoryWhenLine(item);
  const profLine = renderAppointmentProfLine(item);
  const statusKind = getAppointmentStatusKind(item);
  const statusLabel = formatAppointmentStatusLabel(statusKind);

  return `
    <article class="sc-future-card sc-future-card-${escapeHtml(statusKind)}" data-agendamento-id="${escapeHtml(item.agendamento_id ?? "")}">
      <p class="sc-history-when-line">${escapeHtml(whenLine)}</p>
      <p class="sc-history-prof">${escapeHtml(profLine)}</p>
      ${statusLabel ? `<p class="sc-future-status sc-future-status-${escapeHtml(statusKind)}">${escapeHtml(statusLabel)}</p>` : ""}
    </article>
  `;
}

function buildFutureAppointmentsHtml(data) {
  let future = Array.isArray(data?.future_appointments) ? data.future_appointments : [];
  if (future.length === 0 && data?.next_appointment) {
    future = [data.next_appointment];
  }
  return future.length === 0
    ? `<p class="sc-history-empty">Nenhum agendamento futuro.</p>`
    : `<div class="sc-history-list">${future.map((item) => renderFutureCard(item)).join("")}</div>`;
}

function patchFutureAppointmentsData(data) {
  if (!window.__scLastPatientData) return;
  window.__scLastPatientData = {
    ...window.__scLastPatientData,
    future_appointments: data.future_appointments ?? [],
    next_appointment: data.next_appointment ?? null,
  };

  const panel = document.querySelector(".sc-appts-panel");
  if (panel && appointmentsTab === "future") {
    panel.innerHTML = buildFutureAppointmentsHtml(window.__scLastPatientData);
  }

  if (window.SentinelaConnectMessages && !window.SentinelaConnectMessages.isOpen()) {
    syncMessagesModule();
  } else if (window.SentinelaConnectMessages?.isOpen()) {
    window.SentinelaConnectMessages.setPatientContext({
      patientName: window.__scLastPatientData.patient?.nome || currentDisplayName || "Paciente",
      clinicName: window.__scLastPatientData.clinic_display_name || "Clínica",
      nextAppointment:
        window.__scLastPatientData.next_appointment ||
        window.__scLastPatientData.future_appointments?.[0] ||
        null,
      enabled: true,
      bodyHtml: document.getElementById("sc-body")?.innerHTML || "",
      afterRestore: window.__scAfterBodyRestore,
    });
  }
}

// Sem polling por intervalo (não escala bem com muitos profissionais
// conectados ao mesmo tempo). A atualização é 100% orientada a evento:
// 1) broadcast em tempo real quando o status muda (ver background.js);
// 2) o próprio canal do realtime reavisa quando reconecta (cobre o caso de
//    ter perdido um broadcast por queda de rede/aba suspensa);
// 3) refetch único quando a aba volta a ficar visível, para não depender só
//    do WebSocket ter sobrevivido enquanto a aba estava em segundo plano.
function onVisibilityChange() {
  if (document.visibilityState !== "visible") return;
  if (!currentClientKey || currentClientKey === "group") return;
  refreshFutureAppointmentsFromServer();
}

function watchPatientAppointments(phone) {
  sendExtensionMessageFireAndForget({ type: "WATCH_APPOINTMENTS", phone });
}

function unwatchPatientAppointments() {
  sendExtensionMessageFireAndForget({ type: "UNWATCH_APPOINTMENTS" });
}

function renderExtensionReloadPrompt(debugInfo = "") {
  disableMessagesModule();
  setBody(`
    <div class="sc-state">
      <strong>Extensão atualizada</strong>
      <p>${escapeHtml(EXTENSION_RELOAD_MESSAGE)}</p>
      <button type="button" class="sc-btn sc-btn-primary" id="sc-reload-tab">Recarregar aba</button>
      ${debugInfo}
    </div>
  `);
  document.getElementById("sc-reload-tab")?.addEventListener("click", () => {
    location.reload();
  });
}

function refreshFutureAppointmentsFromServer() {
  if (!currentClientKey || currentClientKey === "group") return;
  const seq = ++futureRefreshSeq;
  sendExtensionMessage(
    { type: "LOOKUP", phone: currentClientKey, displayName: currentDisplayName || "" },
    (response) => {
      if (seq !== futureRefreshSeq) return;
      if (response?.error === "extension_reloaded") return;
      if (!response?.ok || !response.data) return;
      patchFutureAppointmentsData(response.data);
    },
  );
}

function renderPatientPanel(data, debugInfo) {
  window.__scLastPatientData = data;
  window.__scLastDebugInfo = debugInfo;
  const patient = data.patient || {};
  const phoneDigits = data.phone_digits || patient.whatsapp_digits || "";
  const history = Array.isArray(data.history) ? data.history : [];
  let future = Array.isArray(data.future_appointments) ? data.future_appointments : [];
  if (future.length === 0 && data.next_appointment) {
    future = [data.next_appointment];
  }
  const visible = showAllHistory ? history : history.slice(0, HISTORY_PREVIEW);
  const hasMore = (Boolean(data.history_has_more) || history.length > HISTORY_PREVIEW) && !showAllHistory;

  const historyHtml =
    visible.length === 0
      ? `<p class="sc-history-empty">Nenhum agendamento passado.</p>`
      : `<div class="sc-history-list">${visible.map((item, i) => renderHistoryCard(item, i)).join("")}</div>`;

  const futureHtml = buildFutureAppointmentsHtml({ future_appointments: future, next_appointment: data.next_appointment });

  const pastPanelHtml = `
    ${historyHtml}
    ${
      hasMore
        ? `<button type="button" class="sc-btn sc-btn-ghost sc-btn-compact" id="sc-history-more">Ver mais</button>`
        : ""
    }
  `;

  setBody(`
    ${renderPatientHeader(patient, phoneDigits)}
    <button type="button" class="sc-btn sc-btn-primary sc-btn-agendar" id="sc-agendar" disabled title="Em breve">Agendar</button>
    <div class="sc-appts-section">
      <h3 class="sc-section-title">Agendamentos</h3>
      <div class="sc-appts-tabs" role="tablist" aria-label="Agendamentos">
        <button
          type="button"
          class="sc-appts-tab${appointmentsTab === "past" ? " sc-appts-tab-active" : ""}"
          data-appts-tab="past"
          role="tab"
          aria-selected="${appointmentsTab === "past"}"
        >Últimos</button>
        <button
          type="button"
          class="sc-appts-tab${appointmentsTab === "future" ? " sc-appts-tab-active" : ""}"
          data-appts-tab="future"
          role="tab"
          aria-selected="${appointmentsTab === "future"}"
        >Futuros</button>
      </div>
      <div class="sc-appts-panel" role="tabpanel">
        ${appointmentsTab === "past" ? pastPanelHtml : futureHtml}
      </div>
    </div>
    ${debugInfo || ""}
  `);

  hydratePanelAvatars();

  document.getElementById("sc-history-more")?.addEventListener("click", () => {
    showAllHistory = true;
    renderPatientPanel(data, debugInfo);
  });

  bindApptsTabs(data, debugInfo);
  bindHistoryToggles();
  watchPatientAppointments(phoneDigits);
  syncMessagesModule();
}

function bindApptsTabs(data, debugInfo) {
  document.querySelectorAll("[data-appts-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-appts-tab");
      if (!tab || tab === appointmentsTab) return;
      appointmentsTab = tab;
      renderPatientPanel(data, debugInfo);
    });
  });
}

function syncMessagesModule() {
  const body = document.getElementById("sc-body");
  if (!window.SentinelaConnectMessages || !body) return;
  const patient = window.__scLastPatientData?.patient || {};
  window.SentinelaConnectMessages.setPatientContext({
    patientName: patient.nome || currentDisplayName || "Paciente",
    clinicName: window.__scLastPatientData?.clinic_display_name || "Clínica",
    nextAppointment:
      window.__scLastPatientData?.next_appointment ||
      window.__scLastPatientData?.future_appointments?.[0] ||
      null,
    enabled: true,
    bodyHtml: body.innerHTML,
    afterRestore: () => {
      hydratePanelAvatars();
      bindApptsTabs(window.__scLastPatientData || {}, window.__scLastDebugInfo || "");
      bindHistoryToggles();
      document.getElementById("sc-history-more")?.addEventListener("click", () => {
        showAllHistory = true;
        renderPatientPanel(window.__scLastPatientData || {}, window.__scLastDebugInfo || "");
      });
    },
  });
}

function disableMessagesModule() {
  unwatchPatientAppointments();
  window.__scLastPatientData = null;
  window.SentinelaConnectMessages?.disable?.();
}

function bindHistoryToggles() {
  document.querySelectorAll("[data-toggle-idx]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".sc-history-card");
      const note = card?.querySelector(".sc-history-note");
      if (!note) return;
      const open = note.hasAttribute("hidden");
      note.toggleAttribute("hidden", !open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      card?.classList.toggle("sc-history-card-open", open);
    });
  });
}

function parseUserJidFromDataId(dataId) {
  if (!dataId || typeof dataId !== "string") return null;
  if (dataId.includes("@g.us")) return { type: "group" };
  if (dataId.includes("@lid")) return { type: "lid" };
  const direct = dataId.match(/^(\d{10,13})@(?:c\.us|s\.whatsapp\.net)$/);
  if (direct) {
    const phone = normalizeBrazilWhatsappId(direct[1]);
    if (phone) return { type: "individual", phone, via: "data-id" };
  }
  const embedded = dataId.match(/(\d{10,13})@(?:c\.us|s\.whatsapp\.net)/);
  if (embedded) {
    const phone = normalizeBrazilWhatsappId(embedded[1]);
    if (phone) return { type: "individual", phone, via: "data-id" };
  }
  return null;
}

function parseDataIdsInRoot(root) {
  if (!root) return null;
  for (const node of root.querySelectorAll("[data-id]")) {
    const parsed = parseUserJidFromDataId(node.getAttribute("data-id"));
    if (!parsed) continue;
    if (parsed.type === "group") return { kind: "group" };
    if (parsed.type === "lid") continue;
    return { kind: "individual", phone: parsed.phone, via: "dom" };
  }
  return null;
}

function extractFromSelectedChatRow() {
  const pane = document.querySelector("#pane-side");
  if (!pane) return null;
  const selected =
    pane.querySelector('[aria-selected="true"]') ||
    pane.querySelector('.focusable-list-item[tabindex="0"]');
  if (!selected) return null;
  const row = selected.closest('[role="row"]') || selected.closest('[role="listitem"]') || selected;
  return parseDataIdsInRoot(row);
}

function extractPhoneFromHeader() {
  const header =
    document.querySelector('#main header[data-testid="conversation-header"]') ||
    document.querySelector("#main header");
  if (!header) return null;

  for (const el of header.querySelectorAll("[data-id]")) {
    const dataId = el.getAttribute("data-id") || "";
    if (dataId.includes("@lid")) return { kind: "lid", via: "header" };
    const parsed = parseUserJidFromDataId(dataId);
    if (parsed?.type === "individual") return { kind: "individual", phone: parsed.phone, via: "header" };
  }

  for (const el of header.querySelectorAll("[title]")) {
    const parsed = parseUserJidFromDataId(el.getAttribute("title"));
    if (parsed?.type === "individual") return { kind: "individual", phone: parsed.phone, via: "header" };
    const phone = normalizeBrazilWhatsappId(el.getAttribute("title"));
    if (phone) return { kind: "individual", phone, via: "header" };
  }

  for (const el of header.querySelectorAll('span[dir="auto"], span[title], div[title]')) {
    const phone = normalizeBrazilWhatsappId(el.textContent || el.getAttribute("title") || "");
    if (phone) return { kind: "individual", phone, via: "header-text" };
  }

  return null;
}

function extractDisplayNameFromHeader() {
  const header =
    document.querySelector('#main header[data-testid="conversation-header"] span[dir="auto"]') ||
    document.querySelector("#main header span[dir='auto']");
  const name = header?.textContent?.trim();
  return name && !/^\d[\d\s().+-]+$/.test(name) ? name : "";
}

function extractFromContactDrawer() {
  const drawer =
    document.querySelector('section[data-testid="contact-info-drawer"]') ||
    document.querySelector("#drawer-right");
  if (!drawer) return null;
  for (const el of drawer.querySelectorAll("[title], span")) {
    const parsed = parseUserJidFromDataId(el.getAttribute?.("title") || "");
    if (parsed?.type === "individual") return { kind: "individual", phone: parsed.phone, via: "drawer" };
    const phone = normalizeBrazilWhatsappId(el.textContent || el.getAttribute?.("title") || "");
    if (phone) return { kind: "individual", phone, via: "drawer" };
  }
  return null;
}

function hasOpenConversation() {
  return Boolean(document.querySelector("#main header"));
}

async function detectConversation() {
  const storeResult = await requestActiveChatFromStoreWithRetry();
  const storeChat = storeResult?.chat;
  const storeDiag = storeResult?.diag || null;

  if (storeChat?.kind === "group") return { kind: "group", diag: storeDiag };
  if (storeChat?.kind === "individual" && storeChat.phone) {
    return {
      kind: "individual",
      phone: storeChat.phone,
      via: storeChat.via || "wa-store",
      displayName: extractDisplayNameFromHeader(),
      diag: storeDiag,
    };
  }
  if (storeChat?.kind === "lid") return { kind: "lid", diag: storeDiag };

  for (const fn of [extractPhoneFromHeader, extractFromSelectedChatRow, extractFromContactDrawer]) {
    const result = fn();
    if (result?.kind === "group") return { kind: "group", diag: storeDiag };
    if (result?.kind === "lid") return { kind: "lid", diag: storeDiag };
    if (result?.kind === "individual" && result.phone) {
      return { ...result, displayName: extractDisplayNameFromHeader(), diag: storeDiag };
    }
  }

  if (!hasOpenConversation()) return { kind: "none", diag: storeDiag };
  return { kind: "unknown", diag: storeDiag };
}

function runLookup(clientWhatsappId, displayName, via, diag) {
  renderPatientShell(displayName, clientWhatsappId);
  showAllHistory = false;
  appointmentsTab = "past";
  const seq = ++lookupSeq;

  sendExtensionMessage(
    { type: "LOOKUP", phone: clientWhatsappId, displayName: displayName || "" },
    (response) => {
      if (seq !== lookupSeq) return;

      const finishLookup = (debugInfo) => {
        if (response?.error === "extension_reloaded") {
          renderExtensionReloadPrompt(debugInfo);
          return;
        }
        if (!response?.ok) {
          if (response?.error === "configure_token") {
            renderMessage(
              "Configure a extensão",
              "O token ainda não está neste navegador. Abra Opções da extensão, cole o sc_live_… da aba Connect, salve e clique em Testar conexão.",
              `<button type="button" class="sc-btn sc-btn-primary" id="sc-open-options">Abrir opções</button>${debugInfo}`,
            );
            document.getElementById("sc-open-options")?.addEventListener("click", () => {
              openExtensionOptionsPage();
            });
            return;
          }
          renderMessage("Erro", response?.message || "Falha ao consultar o Sentinela.", debugInfo);
          return;
        }

        renderPatientPanel(response.data || {}, debugInfo);
      };

      if (!isExtensionContextValid()) {
        finishLookup("");
        return;
      }

      try {
        chrome.storage.sync.get(["debug"], (stored) => {
          const debugInfo = stored.debug ? renderDebugInfo(clientWhatsappId, via, diag) : "";
          finishLookup(debugInfo);
        });
      } catch {
        finishLookup("");
      }
    },
  );
}

async function lookupCurrentConversation() {
  const conv = await detectConversation();

  if (conv.kind === "none") {
    currentClientKey = null;
    renderMessage("Sentinela Connect", "Selecione uma conversa no WhatsApp Web.");
    return;
  }

  if (conv.kind === "group") {
    currentClientKey = "group";
    renderMessage("Grupo", "Abra uma conversa individual.");
    return;
  }

  if (conv.kind === "lid" || conv.kind === "unknown") {
    if (currentClientKey !== "unknown") {
      currentClientKey = "unknown";
      renderMessage(
        "Cliente não identificado",
        "Abra os detalhes do contato (nome no topo) para expor o WhatsApp.",
        renderDebugInfo(null, null, conv.diag),
      );
    }
    return;
  }

  const clientKey = conv.phone;
  if (!normalizeBrazilWhatsappId(clientKey)) {
    if (currentClientKey !== "invalid") {
      currentClientKey = "invalid";
      renderMessage(
        "Cliente não identificado",
        "WhatsApp retornou um ID inválido. Abra os detalhes do contato.",
        renderDebugInfo(clientKey, conv.via, conv.diag),
      );
    }
    return;
  }

  const displayName = conv.displayName || extractDisplayNameFromHeader();
  if (clientKey === currentClientKey && displayName === currentDisplayName) return;

  currentClientKey = clientKey;
  currentDisplayName = displayName;
  runLookup(clientKey, displayName, conv.via, conv.diag);
}

function startObserver() {
  if (observer) observer.disconnect();
  observer = new MutationObserver(() => {
    clearTimeout(startObserver._t);
    startObserver._t = setTimeout(() => void lookupCurrentConversation(), 400);
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true });
  void lookupCurrentConversation();
}

function boot() {
  ensurePanel();
  ensureWaStoreBridge();
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "APPOINTMENT_UPDATED") return;
    const phone = String(message.phone ?? "").replace(/\D/g, "");
    if (!phone || phone !== currentClientKey) return;
    refreshFutureAppointmentsFromServer();
  });
  document.addEventListener("visibilitychange", onVisibilityChange);
  startObserver();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
