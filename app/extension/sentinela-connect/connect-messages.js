(() => {
  const state = {
    enabled: false,
    templates: [],
    clinicName: "Clínica",
    patientName: "Paciente",
    view: "hidden",
    editId: null,
    editLabel: "",
    editBody: "",
    saving: false,
    loadingTemplates: false,
    lastPatientHtml: "",
    toastTimer: null,
    nextAppointment: null,
    insertingMessage: false,
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getFooter() {
    return document.getElementById("sc-panel-footer");
  }

  function getBody() {
    return document.getElementById("sc-body");
  }

  function showToast(message, kind = "ok") {
    const body = getBody();
    if (!body) return;
    let toast = document.getElementById("sc-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "sc-toast";
      toast.className = "sc-toast";
      body.appendChild(toast);
    }
    toast.className = `sc-toast sc-toast-${kind}`;
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 3200);
  }

  function formatAgendamentoLabel(appointment) {
    if (!appointment?.data) return "";
    const parts = String(appointment.data).split("-").map(Number);
    const y = parts[0];
    const mo = parts[1];
    const d = parts[2];
    if (!y || !mo || !d) return "";
    const dateStr = `${String(d).padStart(2, "0")}/${String(mo).padStart(2, "0")}`;
    const [h, min] = String(appointment.hora ?? "00:00").slice(0, 5).split(":").map(Number);
    const hour = h || 0;
    const timeStr = min ? `${hour}h${String(min).padStart(2, "0")}` : `${hour}h`;
    const prep = hour === 1 || hour === 13 ? "ao" : "às";
    return `${dateStr} ${prep} ${timeStr}`;
  }

  function applyTemplateVariables(text) {
    const paciente = state.patientName || "Paciente";
    const clinica = state.clinicName || "Clínica";
    const agendamento = formatAgendamentoLabel(state.nextAppointment);
    return String(text ?? "")
      .replace(/%paciente%/gi, paciente)
      .replace(/%clinica%/gi, clinica)
      .replace(/%consultorio%/gi, clinica)
      .replace(/%consultório%/gi, clinica)
      .replace(/%agendamento%/gi, agendamento);
  }

  function findComposeInput() {
    const selectors = [
      '#main footer div[contenteditable="true"][role="textbox"]',
      '#main footer [data-testid="conversation-compose-box-input"]',
      '#main footer div[contenteditable="true"]',
      '#main [contenteditable="true"][data-tab="10"]',
      'footer div[contenteditable="true"][role="textbox"]',
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el?.isContentEditable) return el;
    }
    return null;
  }

  const COMPOSE_INSERT_IN = "sentinela-connect-compose-insert-req";
  const COMPOSE_INSERT_OUT = "sentinela-connect-compose-insert-res";
  let composeInsertBridgeReady = false;
  let composeInsertBridgePromise = null;

  function ensureComposeInsertBridge() {
    if (composeInsertBridgePromise) return composeInsertBridgePromise;
    composeInsertBridgePromise = new Promise((resolve) => {
      if (composeInsertBridgeReady) {
        resolve();
        return;
      }
      const scriptUrl = getExtensionResourceUrl("page-compose-insert.js");
      if (!scriptUrl) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = scriptUrl;
      script.onload = () => {
        composeInsertBridgeReady = true;
        resolve();
      };
      script.onerror = () => resolve();
      (document.head || document.documentElement).appendChild(script);
    });
    return composeInsertBridgePromise;
  }

  async function insertMessageIntoWhatsApp(text) {
    await ensureComposeInsertBridge();
    return new Promise((resolve) => {
      const requestId = crypto.randomUUID();
      const timer = window.setTimeout(() => {
        window.removeEventListener("message", handler);
        resolve({
          ok: false,
          message: "Tempo esgotado ao inserir no WhatsApp. Tente de novo.",
        });
      }, 4000);

      const handler = (event) => {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.source !== COMPOSE_INSERT_OUT || data.requestId !== requestId) return;
        window.removeEventListener("message", handler);
        clearTimeout(timer);
        resolve({
          ok: Boolean(data.ok),
          message: data.message || "",
        });
      };

      window.addEventListener("message", handler);
      window.postMessage({ source: COMPOSE_INSERT_IN, requestId, text }, "*");
    });
  }

  async function useTemplateOnWhatsApp(templateId) {
    if (state.insertingMessage) return;
    const tpl = state.templates.find((t) => t.id === templateId);
    if (!tpl) return;
    state.insertingMessage = true;
    const text = applyTemplateVariables(tpl.body);
    const result = await insertMessageIntoWhatsApp(text);
    state.insertingMessage = false;
    if (!result.ok) {
      showToast(result.message || "Não foi possível inserir.", "err");
      return;
    }
    closeTemplatesView();
    showToast("Mensagem no WhatsApp — revise e envie.");
    requestAnimationFrame(() => findComposeInput()?.focus());
  }

  function apiMessage(type, payload = {}) {
    return new Promise((resolve) => {
      sendExtensionMessage({ type, ...payload }, (response) => {
        resolve(response ?? { ok: false, message: "Sem resposta." });
      });
    });
  }

  async function loadTemplates() {
    state.loadingTemplates = true;
    render();
    const result = await apiMessage("LIST_TEMPLATES");
    state.loadingTemplates = false;
    if (!result?.ok) {
      showToast(result?.message || "Falha ao carregar mensagens.", "err");
      render();
      return false;
    }
    state.templates = Array.isArray(result.data?.templates) ? result.data.templates : [];
    if (result.data?.clinic_display_name) {
      state.clinicName = String(result.data.clinic_display_name);
    }
    render();
    return true;
  }

  function renderFooter() {
    const footer = getFooter();
    if (!footer) return;
    if (!state.enabled || state.view !== "hidden") {
      footer.innerHTML = "";
      footer.hidden = true;
      return;
    }
    footer.hidden = false;
    footer.innerHTML = `
      <button type="button" class="sc-btn sc-btn-outline sc-msg-open-btn" id="sc-msg-open">
        Enviar mensagem pré-definida
      </button>
    `;
    footer.querySelector("#sc-msg-open")?.addEventListener("click", () => {
      void openTemplatesView();
    });
  }

  function renderTemplatesList() {
    const body = getBody();
    if (!body) return;

    const cards =
      state.templates.length === 0 && !state.loadingTemplates
        ? `<p class="sc-msg-empty">Nenhuma mensagem ainda. Toque em Criar.</p>`
        : `<div class="sc-msg-cards">${state.templates
            .map(
              (t) => `
            <div class="sc-msg-card">
              <button type="button" class="sc-msg-card-main" data-use-id="${escapeHtml(t.id)}">
                <span class="sc-msg-card-title">${escapeHtml(t.label)}</span>
              </button>
              <button type="button" class="sc-msg-card-edit" data-edit-id="${escapeHtml(t.id)}" title="Editar" aria-label="Editar">✎</button>
            </div>
          `,
            )
            .join("")}</div>`;

    body.innerHTML = `
      <div class="sc-msg-view">
        <button type="button" class="sc-msg-back" id="sc-msg-back">← Voltar</button>
        <h3 class="sc-section-title">Mensagens pré-definidas</h3>
        <p class="sc-msg-hint">Toque no card para inserir no WhatsApp. Nada recarrega — revise e envie.</p>
        ${state.loadingTemplates ? `<div class="sc-section-loading"><div class="sc-spinner sc-spinner-sm"></div><span>Carregando…</span></div>` : cards}
        <button type="button" class="sc-btn sc-btn-primary sc-msg-create-btn" id="sc-msg-create">Criar</button>
      </div>
    `;

    body.querySelector("#sc-msg-back")?.addEventListener("click", closeTemplatesView);
    body.querySelector("#sc-msg-create")?.addEventListener("click", () => openEditView(null));
    body.querySelectorAll("[data-use-id]").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        useTemplateOnWhatsApp(btn.getAttribute("data-use-id"));
      });
    });
    body.querySelectorAll("[data-edit-id]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-edit-id");
        openEditView(id);
      });
    });
  }

  function renderEditView() {
    const body = getBody();
    if (!body) return;
    const isNew = !state.editId;

    body.innerHTML = `
      <div class="sc-msg-view">
        <button type="button" class="sc-msg-back" id="sc-msg-back-edit">← Voltar</button>
        <h3 class="sc-section-title">${isNew ? "Nova mensagem" : "Editar mensagem"}</h3>
        <label class="sc-msg-label" for="sc-msg-label">Nome da mensagem</label>
        <input id="sc-msg-label" class="sc-msg-input" type="text" maxlength="80" value="${escapeHtml(state.editLabel)}" />
        <label class="sc-msg-label" for="sc-msg-body">Texto</label>
        <textarea id="sc-msg-body" class="sc-msg-textarea" maxlength="2000" rows="6">${escapeHtml(state.editBody)}</textarea>
        <button type="button" class="sc-btn sc-btn-primary" id="sc-msg-save" ${state.saving ? "disabled" : ""}>
          ${state.saving ? "Salvando…" : "Salvar"}
        </button>
        ${
          !isNew
            ? `<button type="button" class="sc-btn sc-btn-ghost sc-msg-delete" id="sc-msg-delete">Excluir mensagem</button>`
            : ""
        }
        <div class="sc-msg-vars">
          <p>- Para negrito use *exemplo* (asterisco)</p>
          <p>- Use %paciente% para inserir o nome do paciente</p>
          <p>- Use %clinica% ou %consultorio% para o nome da clínica/consultório</p>
          <p>- Use %agendamento% para o próximo horário (ex.: 17/07 às 15h)</p>
        </div>
      </div>
    `;

    body.querySelector("#sc-msg-back-edit")?.addEventListener("click", () => {
      state.view = "list";
      render();
    });
    body.querySelector("#sc-msg-save")?.addEventListener("click", () => void saveTemplate());
    body.querySelector("#sc-msg-delete")?.addEventListener("click", () => void deleteTemplate());
  }

  function render() {
    renderFooter();
    if (state.view === "list") renderTemplatesList();
    if (state.view === "edit") renderEditView();
  }

  async function openTemplatesView() {
    state.view = "list";
    render();
    await loadTemplates();
  }

  function closeTemplatesView() {
    state.view = "hidden";
    const body = getBody();
    if (body && state.lastPatientHtml) {
      body.innerHTML = state.lastPatientHtml;
      window.__scAfterBodyRestore?.();
    }
    renderFooter();
  }

  function openEditView(id) {
    if (id) {
      const tpl = state.templates.find((t) => t.id === id);
      if (!tpl) return;
      state.editId = tpl.id;
      state.editLabel = tpl.label || "";
      state.editBody = tpl.body || "";
    } else {
      state.editId = null;
      state.editLabel = "";
      state.editBody = "";
    }
    state.view = "edit";
    render();
  }

  async function saveTemplate() {
    const labelEl = document.getElementById("sc-msg-label");
    const bodyEl = document.getElementById("sc-msg-body");
    const label = labelEl?.value?.trim() ?? "";
    const body = bodyEl?.value?.trim() ?? "";
    if (!label || !body) {
      showToast("Preencha nome e texto.", "err");
      return;
    }
    state.saving = true;
    renderEditView();
    const result = await apiMessage("SAVE_TEMPLATE", { id: state.editId, label, body });
    state.saving = false;
    if (!result?.ok || result.data?.error) {
      showToast(result?.message || result.data?.error || "Erro ao salvar.", "err");
      renderEditView();
      return;
    }
    await loadTemplates();
    state.view = "list";
    render();
    showToast("Mensagem salva.");
  }

  async function deleteTemplate() {
    if (!state.editId) return;
    if (!window.confirm("Excluir esta mensagem pré-definida?")) return;
    state.saving = true;
    renderEditView();
    const result = await apiMessage("DELETE_TEMPLATE", { id: state.editId });
    state.saving = false;
    if (!result?.ok || result.data?.error) {
      showToast(result?.message || "Erro ao excluir.", "err");
      renderEditView();
      return;
    }
    await loadTemplates();
    state.view = "list";
    render();
    showToast("Mensagem excluída.");
  }

  window.SentinelaConnectMessages = {
    setPatientContext({ patientName, clinicName, nextAppointment, enabled, bodyHtml, afterRestore }) {
      state.patientName = patientName || "Paciente";
      if (clinicName) state.clinicName = clinicName;
      state.nextAppointment = nextAppointment || null;
      state.enabled = Boolean(enabled);
      state.lastPatientHtml = bodyHtml || "";
      window.__scAfterBodyRestore = afterRestore || null;
      if (state.view === "hidden") renderFooter();
    },
    disable() {
      state.enabled = false;
      state.view = "hidden";
      renderFooter();
    },
    isOpen() {
      return state.view !== "hidden";
    },
  };
})();
