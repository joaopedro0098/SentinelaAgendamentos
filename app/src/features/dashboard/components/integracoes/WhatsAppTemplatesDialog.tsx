import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  TemplateBodyEditor,
  type TemplateBodyEditorHandle,
} from "@/features/dashboard/components/integracoes/TemplateBodyEditor";
import { WhatsAppTemplatePhonePreview } from "@/features/dashboard/components/integracoes/WhatsAppTemplatePhonePreview";
import {
  CATEGORY_BUTTON_OPTIONS,
  CATEGORY_DISPLAY_LABEL,
  DEFAULT_BODY_TEXT,
  TEMPLATE_LANGUAGE_OPTIONS,
  VARIABLE_ORDER,
  VARIABLE_UI_LABELS,
  variableKeysForCategory,
  addVariableToBody,
  enabledVariablesRecordFromBody,
  removeVariableFromBody,
  validateBodyDisplayText,
  statusBadgeLabel,
  type SentinelaTemplateCategory,
  type TemplateLanguage,
  type TemplateVariableKey,
} from "@/features/dashboard/lib/metaTemplateProduct";
import {
  createWabaMessageTemplate,
  deleteWabaMessageTemplate,
  linkWabaMessageTemplate,
  resubmitWabaMessageTemplate,
  selectWabaMessageTemplate,
  syncWabaMessageTemplates,
  type UnlinkedApprovedTemplate,
  type WabaTemplateRecord,
  type WabaTemplatesSyncResult,
} from "@/features/dashboard/lib/wabaTemplatesApi";
import {
  clearWabaTemplateDraft,
  loadWabaTemplateDraft,
  saveAllWabaTemplateDrafts,
  saveWabaTemplateDraft,
} from "@/features/dashboard/lib/wabaTemplateFormDraft";

type WhatsAppTemplatesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const CATEGORIES: SentinelaTemplateCategory[] = ["confirmacao", "lembrete"];

type TemplateBrowseTab = "aprovados" | "analise" | "rejeitados";

type ActiveForm = {
  category: SentinelaTemplateCategory;
  templateId?: string;
};

function tabForStatus(status: string): TemplateBrowseTab {
  if (status === "APPROVED") return "aprovados";
  if (status === "PENDING" || status === "IN_APPEAL") return "analise";
  if (status === "REJECTED") return "rejeitados";
  return "analise";
}

const TAB_LABELS: Record<TemplateBrowseTab, string> = {
  aprovados: "Aprovados",
  analise: "Em análise",
  rejeitados: "Rejeitados",
};

const CATEGORY_PICKER_HINT: Record<SentinelaTemplateCategory, string> = {
  confirmacao:
    "Enviado 1 dia antes do dia agendado, o cliente clica em confirmar, remarcar ou cancelar.",
  lembrete:
    "Enviado cerca de 3 horas antes do horário agendado, apenas como lembrete para o cliente.",
};

const PENDING_CATEGORY_TOAST_MESSAGE =
  "Aguarde o template anterior ser aprovado pela Meta; após, você poderá enviar outro.";

function statusBadgeClass(status: string): string {
  if (status === "APPROVED") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
  if (status === "REJECTED") return "bg-destructive/15 text-destructive";
  if (status === "PENDING" || status === "IN_APPEAL") return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return "bg-secondary text-muted-foreground";
}

function formatDeletionDeadline(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(d);
}

type FormState = {
  body: string;
  language: TemplateLanguage;
  enabledButtons: Record<string, boolean>;
  enabledVariables: Record<TemplateVariableKey, boolean>;
};

function defaultForm(category: SentinelaTemplateCategory, language: TemplateLanguage): FormState {
  const buttons = CATEGORY_BUTTON_OPTIONS[category];
  const body = DEFAULT_BODY_TEXT[category][language];
  return {
    body,
    language,
    enabledButtons: Object.fromEntries(buttons.map((b) => [b.id, true])),
    enabledVariables: enabledVariablesRecordFromBody(body),
  };
}

function formFromTemplate(template: WabaTemplateRecord): FormState {
  const category = template.sentinela_category;
  const buttons = CATEGORY_BUTTON_OPTIONS[category];
  const enabled: Record<string, boolean> = {};
  for (const b of buttons) {
    const label = b.label[template.language as TemplateLanguage] ?? b.label.pt_BR;
    enabled[b.id] = template.quick_reply_labels.includes(label);
  }
  return {
    body: template.body_display_text,
    language: (template.language as TemplateLanguage) ?? "pt_BR",
    enabledButtons: enabled,
    enabledVariables: enabledVariablesRecordFromBody(template.body_display_text),
  };
}

function enabledVariableKeys(form: FormState): TemplateVariableKey[] {
  return VARIABLE_ORDER.filter((k) => form.enabledVariables[k]);
}

export function WhatsAppTemplatesDialog({ open, onOpenChange }: WhatsAppTemplatesDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [syncData, setSyncData] = useState<Extract<WabaTemplatesSyncResult, { ok: true }> | null>(null);
  const [activeForm, setActiveForm] = useState<ActiveForm | null>(null);
  const [browseTab, setBrowseTab] = useState<TemplateBrowseTab>("aprovados");
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [submitSuccessMode, setSubmitSuccessMode] = useState<"create" | "resubmit" | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<SentinelaTemplateCategory, FormState>>({
    confirmacao: defaultForm("confirmacao", "pt_BR"),
    lembrete: defaultForm("lembrete", "pt_BR"),
  });
  const formsRef = useRef(forms);
  formsRef.current = forms;
  const activeFormRef = useRef(activeForm);
  activeFormRef.current = activeForm;
  const editorRef = useRef<TemplateBodyEditorHandle>(null);
  const wabaIdRef = useRef<string | null>(null);
  wabaIdRef.current = syncData?.waba_id ?? null;

  const buildFormsSnapshot = useCallback((): Record<SentinelaTemplateCategory, FormState> => {
    const snapshot: Record<SentinelaTemplateCategory, FormState> = {
      confirmacao: { ...formsRef.current.confirmacao },
      lembrete: { ...formsRef.current.lembrete },
    };
    const editing = activeFormRef.current;
    if (!editing) return snapshot;

    const bodyFromEditor = editorRef.current?.readDisplayText();
    if (bodyFromEditor == null) return snapshot;

    snapshot[editing.category] = {
      ...snapshot[editing.category],
      body: bodyFromEditor,
      enabledVariables: enabledVariablesRecordFromBody(bodyFromEditor),
    };
    return snapshot;
  }, []);

  const persistAllDraftsNow = useCallback(() => {
    const id = wabaIdRef.current;
    if (!id) return;
    const snapshot = buildFormsSnapshot();
    saveAllWabaTemplateDrafts(id, snapshot);
    formsRef.current = snapshot;
    setForms(snapshot);
  }, [buildFormsSnapshot]);

  const closeEditor = useCallback(() => {
    persistAllDraftsNow();
    setActiveForm(null);
  }, [persistAllDraftsNow]);

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        persistAllDraftsNow();
        setActiveForm(null);
        setDeleteConfirmId(null);
        setCategoryPickerOpen(false);
        setSubmitSuccessMode(null);
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange, persistAllDraftsNow],
  );

  const runSync = useCallback(async () => {
    setLoading(true);
    const result = await syncWabaMessageTemplates();
    setLoading(false);

    if (!result.ok) {
      toast({ title: "Não foi possível carregar templates", description: result.error, variant: "destructive" });
      return;
    }

    setSyncData(result);
    if (result.waba_id) {
      setForms((prev) => {
        const next = { ...prev };
        for (const category of CATEGORIES) {
          const draft = loadWabaTemplateDraft(result.waba_id, category);
          if (draft) next[category] = draft;
        }
        return next;
      });
    }
  }, [toast]);

  useEffect(() => {
    if (open) {
      setActiveForm(null);
      setCategoryPickerOpen(false);
      setSubmitSuccessMode(null);
      void runSync();
    }
  }, [open, runSync]);

  function updateForm(category: SentinelaTemplateCategory, patch: Partial<FormState>) {
    setForms((prev) => {
      const updated = { ...prev, [category]: { ...prev[category], ...patch } };
      const id = wabaIdRef.current;
      if (id) {
        saveWabaTemplateDraft(id, category, updated[category]);
      }
      return updated;
    });
  }

  function openCreateForm(category: SentinelaTemplateCategory) {
    const id = wabaIdRef.current;
    const draft = id ? loadWabaTemplateDraft(id, category) : null;
    if (draft) {
      setForms((prev) => ({ ...prev, [category]: draft }));
    } else {
      setForms((prev) => ({ ...prev, [category]: defaultForm(category, prev[category].language) }));
    }
    setActiveForm({ category });
  }

  function openResubmitForm(template: WabaTemplateRecord) {
    setForms((prev) => ({
      ...prev,
      [template.sentinela_category]: formFromTemplate(template),
    }));
    setActiveForm({ category: template.sentinela_category, templateId: template.id });
  }

  async function handleSubmit() {
    if (!activeForm) return;
    const { category, templateId } = activeForm;
    const form = forms[category];
    const validation = validateBodyDisplayText(form.body, form.language, enabledVariableKeys(form));
    if (validation) {
      toast({ title: "Revise o texto", description: validation, variant: "destructive" });
      return;
    }

    const enabledIds = CATEGORY_BUTTON_OPTIONS[category]
      .filter((b) => form.enabledButtons[b.id])
      .map((b) => b.id);

    setSubmitting(true);
    const isResubmit = Boolean(templateId);
    const result = isResubmit
      ? await resubmitWabaMessageTemplate({
          template_id: templateId!,
          sentinela_category: category,
          body_display_text: form.body,
          language: form.language,
          enabled_button_ids: enabledIds,
        })
      : await createWabaMessageTemplate({
          sentinela_category: category,
          body_display_text: form.body,
          language: form.language,
          enabled_button_ids: enabledIds,
        });
    setSubmitting(false);

    if (!result.ok) {
      toast({ title: "Não foi possível enviar", description: result.error, variant: "destructive" });
      return;
    }

    setSyncData(result);
    if (result.waba_id) {
      clearWabaTemplateDraft(result.waba_id, category);
    }
    setBrowseTab("analise");
    setActiveForm(null);
    setCategoryPickerOpen(false);
    setSubmitSuccessMode(isResubmit ? "resubmit" : "create");
  }

  function handleSubmitSuccessEntendi() {
    setSubmitSuccessMode(null);
    handleDialogOpenChange(false);
  }

  function tryOpenCreateForCategory(category: SentinelaTemplateCategory) {
    if (!syncData?.can_create_by_category[category]) {
      toast({
        title: CATEGORY_DISPLAY_LABEL[category],
        description: PENDING_CATEGORY_TOAST_MESSAGE,
      });
      return;
    }
    setCategoryPickerOpen(false);
    openCreateForm(category);
  }

  async function confirmDelete() {
    if (!deleteConfirmId) return;
    const removedId = deleteConfirmId;
    setSubmitting(true);
    const result = await deleteWabaMessageTemplate(removedId);
    setSubmitting(false);
    setDeleteConfirmId(null);

    if (!result.ok) {
      toast({ title: "Não foi possível excluir", description: result.error, variant: "destructive" });
      return;
    }

    const stillPending = result.templates.find((t) => t.id === removedId)?.deletion_pending_at;
    toast({
      title: stillPending ? "Exclusão em andamento" : "Template excluído",
      description: stillPending
        ? "O template continuará disponível até o último agendamento atrelado ser atendido."
        : "Removido da Meta e do Sentinela.",
    });
    setSyncData(result);
  }

  async function handleSelect(template: WabaTemplateRecord) {
    setSubmitting(true);
    const result = await selectWabaMessageTemplate(template.id);
    setSubmitting(false);

    if (!result.ok) {
      toast({ title: "Não foi possível selecionar", description: result.error, variant: "destructive" });
      return;
    }

    toast({ title: "Template selecionado", description: CATEGORY_DISPLAY_LABEL[template.sentinela_category] });
    setSyncData(result);
  }

  async function handleLink(template: UnlinkedApprovedTemplate, category: SentinelaTemplateCategory) {
    setSubmitting(true);
    const result = await linkWabaMessageTemplate({
      meta_template_id: template.meta_template_id,
      meta_template_name: template.meta_template_name,
      language: template.language,
      sentinela_category: category,
    });
    setSubmitting(false);

    if (!result.ok) {
      toast({ title: "Não foi possível vincular", description: result.error, variant: "destructive" });
      return;
    }

    toast({ title: "Template vinculado", description: CATEGORY_DISPLAY_LABEL[category] });
    setSyncData(result);
  }

  function renderTemplateCard(template: WabaTemplateRecord) {
    const category = template.sentinela_category;
    const inDeletion = Boolean(template.deletion_pending_at);

    return (
      <div key={template.id} className="rounded-lg border p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h4 className="font-medium text-sm">{CATEGORY_DISPLAY_LABEL[category]}</h4>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[240px]">
              {template.meta_template_name}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(template.meta_status)}`}
              >
                {statusBadgeLabel(template.meta_status)}
              </span>
              {template.is_selected && !inDeletion && (
                <span className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium bg-primary/15 text-primary">
                  Selecionado
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            {browseTab === "aprovados" && template.meta_status === "APPROVED" && !inDeletion && !template.is_selected && (
              <Button type="button" size="sm" variant="outline" disabled={submitting} onClick={() => void handleSelect(template)}>
                Usar este
              </Button>
            )}
            {template.meta_status === "REJECTED" && (
              <Button type="button" size="sm" variant="outline" onClick={() => openResubmitForm(template)}>
                Editar e reenviar
              </Button>
            )}
            {template.meta_status !== "PENDING" && template.meta_status !== "IN_APPEAL" && !inDeletion && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={submitting}
                onClick={() => setDeleteConfirmId(template.id)}
              >
                Excluir
              </Button>
            )}
          </div>
        </div>

        {inDeletion && (
          <div className="text-xs space-y-1 rounded-md bg-muted/60 px-2 py-2">
            <p className="font-medium text-foreground">Exclusão em andamento</p>
            <p className="text-muted-foreground">
              Aguardando o último agendamento atrelado
              {template.deletion_last_appointment_at
                ? ` (previsto para ${formatDeletionDeadline(template.deletion_last_appointment_at)})`
                : ""}
              .
            </p>
            {template.deletion_meta_error && (
              <p className="text-destructive">{template.deletion_meta_error}</p>
            )}
          </div>
        )}

        {template.needs_reconnect && (
          <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 rounded-md px-2 py-1.5">
            Este registro é de uma conexão anterior. Reconecte o WhatsApp para sincronizar novamente.
          </p>
        )}

        <div className="text-xs text-muted-foreground space-y-1">
          <p className="whitespace-pre-wrap text-foreground/80">
            {template.body_display_text.replace(/⟦(\w+)⟧/g, "[$1]")}
          </p>
          {template.quick_reply_labels.length > 0 && <p>Botões: {template.quick_reply_labels.join(", ")}</p>}
          <p>Idioma: {TEMPLATE_LANGUAGE_OPTIONS.find((o) => o.value === template.language)?.label ?? template.language}</p>
        </div>

        {template.meta_status === "REJECTED" && template.rejection_user_message && (
          <p className="text-xs text-destructive bg-destructive/10 rounded-md px-2 py-1.5">
            {template.rejection_user_message}
          </p>
        )}
      </div>
    );
  }

  function renderCategoryPicker() {
    if (!syncData) return null;

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Escolha qual template deseja criar:</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                disabled={submitting}
                onClick={() => tryOpenCreateForCategory(category)}
                className="rounded-lg border p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/40"
              >
                <span className="font-medium text-sm block">{CATEGORY_DISPLAY_LABEL[category]}</span>
                <span className="text-xs text-muted-foreground mt-1 block">{CATEGORY_PICKER_HINT[category]}</span>
              </button>
            ))}
        </div>
        <Button type="button" variant="ghost" size="sm" className="px-0" onClick={() => setCategoryPickerOpen(false)}>
          Voltar para a lista
        </Button>
      </div>
    );
  }

  function renderBrowseTabs() {
    return (
      <div className="flex flex-wrap gap-1 border-b border-border pb-2">
        {(Object.keys(TAB_LABELS) as TemplateBrowseTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setBrowseTab(tab)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              browseTab === tab
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>
    );
  }

  function renderBrowsePanel() {
    if (!syncData) return null;

    if (categoryPickerOpen) {
      return renderCategoryPicker();
    }

    const templates = syncData.templates ?? [];
    const cardsForTab = templates
      .filter((t) => tabForStatus(t.meta_status) === browseTab)
      .map((t) => renderTemplateCard(t));

    return (
      <div className="space-y-4">
        {renderBrowseTabs()}

        {cardsForTab.length > 0 ? (
          <div className="space-y-3">{cardsForTab}</div>
        ) : (
          <p className="text-sm text-muted-foreground py-4">Nenhum template nesta lista.</p>
        )}

        {browseTab === "aprovados" ? renderUnlinked() : null}
      </div>
    );
  }

  function renderEditorPanel() {
    if (!activeForm) return null;
    const category = activeForm.category;
    const form = forms[category];
    const resubmitTemplate = activeForm.templateId
      ? syncData?.templates.find((t) => t.id === activeForm.templateId)
      : undefined;

    return (
      <>
        <AlertDialogHeader className="shrink-0 space-y-1.5 text-left">
          <AlertDialogTitle className="text-xl">{CATEGORY_DISPLAY_LABEL[category]}</AlertDialogTitle>
          <AlertDialogDescription className="text-sm">
            Texto, variáveis e botões. O celular ao lado atualiza em tempo real.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          <div className="shrink-0 space-y-1.5">
            <Label className="text-sm">Idioma</Label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.language}
              disabled={submitting}
              onChange={(e) => {
                const lang = e.target.value as TemplateLanguage;
                const body = DEFAULT_BODY_TEXT[category][lang];
                updateForm(category, {
                  language: lang,
                  body,
                  enabledVariables: enabledVariablesRecordFromBody(body),
                });
              }}
            >
              {TEMPLATE_LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            <TemplateBodyEditor
              ref={editorRef}
              value={form.body}
              language={form.language}
              enabledVariableKeys={enabledVariableKeys(form)}
              disabled={submitting}
              onChange={(body) =>
                updateForm(category, {
                  body,
                  enabledVariables: enabledVariablesRecordFromBody(body),
                })
              }
            />
          </div>

          <div
            className={cn(
              "grid shrink-0 gap-x-6 gap-y-1.5 border-t pt-3",
              CATEGORY_BUTTON_OPTIONS[category].length > 0 ? "grid-cols-2" : "grid-cols-1",
            )}
          >
            {CATEGORY_BUTTON_OPTIONS[category].length > 0 && (
              <div>
                <Label className="text-sm text-muted-foreground">Botões</Label>
                <div className="mt-1 space-y-1">
                  {CATEGORY_BUTTON_OPTIONS[category].map((btn) => (
                    <label key={btn.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(form.enabledButtons[btn.id])}
                        disabled={submitting}
                        onChange={(e) =>
                          updateForm(category, {
                            enabledButtons: { ...form.enabledButtons, [btn.id]: e.target.checked },
                          })
                        }
                        className="rounded border-input"
                      />
                      <span>{btn.label[form.language]}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div>
              <Label className="text-sm text-muted-foreground">Variáveis</Label>
              <div className="mt-1 space-y-1">
                {variableKeysForCategory(category).map((varKey) => (
                  <label key={varKey} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(form.enabledVariables[varKey])}
                      disabled={submitting}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        const nextVars = { ...form.enabledVariables, [varKey]: checked };
                        const nextBody = checked
                          ? addVariableToBody(form.body, varKey)
                          : removeVariableFromBody(form.body, varKey);
                        updateForm(category, {
                          enabledVariables: nextVars,
                          body: nextBody,
                        });
                      }}
                      className="rounded border-input"
                    />
                    <span>{VARIABLE_UI_LABELS[form.language][varKey]}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        <AlertDialogFooter className="shrink-0 flex-row justify-end gap-2 border-t pt-2 sm:justify-end">
          <Button type="button" variant="outline" size="sm" disabled={submitting} onClick={() => closeEditor()}>
            Voltar
          </Button>
          <AlertDialogCancel disabled={submitting} className="mt-0" onClick={() => persistAllDraftsNow()}>
            Fechar
          </AlertDialogCancel>
          <Button type="button" size="sm" disabled={submitting} onClick={() => void handleSubmit()}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Enviando…
              </>
            ) : resubmitTemplate?.meta_status === "REJECTED" ? (
              "Reenviar"
            ) : (
              "Enviar"
            )}
          </Button>
        </AlertDialogFooter>
      </>
    );
  }

  function renderUnlinked() {
    const unlinked = syncData?.meta_approved_unlinked ?? [];
    if (unlinked.length === 0) return null;

    return (
      <div className="rounded-lg border border-dashed p-4 space-y-3">
        <div>
          <h4 className="font-medium text-sm">Templates já aprovados na sua conta WhatsApp</h4>
          <p className="text-xs text-muted-foreground mt-1">
            Encontramos templates na Meta que ainda não estão vinculados aqui. Escolha como usá-los para evitar duplicidade.
          </p>
        </div>
        {unlinked.map((t) => (
          <UnlinkedTemplateRow
            key={`${t.meta_template_id}-${t.language}`}
            template={t}
            submitting={submitting}
            onLink={(cat) => void handleLink(t, cat)}
          />
        ))}
      </div>
    );
  }

  return (
    <>
      <AlertDialog open={open} onOpenChange={handleDialogOpenChange}>
        {activeForm ? (
          <AlertDialogPortal>
            <AlertDialogOverlay />
            <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none p-4 sm:p-6">
              <div className="flex max-h-full w-full max-w-[min(100%,72rem)] items-center justify-center gap-6 min-[1080px]:gap-8 pointer-events-none">
                <AlertDialogPrimitive.Content
                  className={cn(
                    "pointer-events-auto relative flex max-h-[calc(100vh-2rem)] w-full max-w-[min(720px,48vw)] min-w-[min(100%,320px)] flex-col gap-3 overflow-hidden",
                    "translate-x-0 translate-y-0 border bg-background p-5 shadow-lg sm:rounded-lg sm:p-6",
                    "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
                  )}
                >
                  {loading ? (
                    <div className="flex justify-center py-10">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    renderEditorPanel()
                  )}
                </AlertDialogPrimitive.Content>

                {!loading && activeForm ? (
                  <div
                    aria-hidden
                    className="pointer-events-none hidden min-[1080px]:block shrink-0 self-center"
                    style={{
                      height: "min(660px, calc(100vh - 2rem))",
                      aspectRatio: "340 / 640",
                      width: "auto",
                    }}
                  >
                    <WhatsAppTemplatePhonePreview
                      body={forms[activeForm.category].body}
                      language={forms[activeForm.category].language}
                      quickReplyLabels={CATEGORY_BUTTON_OPTIONS[activeForm.category]
                        .filter((b) => forms[activeForm.category].enabledButtons[b.id])
                        .map((b) => b.label[forms[activeForm.category].language])}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </AlertDialogPortal>
        ) : (
          <AlertDialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0">
            <div className="relative flex max-h-[90vh] flex-col gap-4 overflow-y-auto p-6">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={submitting}
              className="absolute right-3 top-3 z-10 h-8 w-8 rounded-sm opacity-70 ring-offset-background hover:opacity-100"
              onClick={() => handleDialogOpenChange(false)}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Fechar</span>
            </Button>
            <AlertDialogHeader className="gap-3 pr-10 sm:space-y-1.5">
              <AlertDialogTitle>Templates WhatsApp</AlertDialogTitle>
              <AlertDialogDescription>
                Confirmação (~1 dia antes) e lembrete (~3h antes). Selecione qual template aprovado usar em cada
                categoria.
              </AlertDialogDescription>
            </AlertDialogHeader>

            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              renderBrowsePanel()
            )}

            <AlertDialogFooter className="sm:justify-between gap-2">
              {!categoryPickerOpen && syncData && !loading ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={submitting}
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() => setCategoryPickerOpen(true)}
                >
                  Criar
                </Button>
              ) : (
                <span className="hidden sm:block" aria-hidden />
              )}
              <Button type="button" variant="outline" disabled={loading || submitting} onClick={() => void runSync()}>
                Atualizar
              </Button>
            </AlertDialogFooter>
            </div>
          </AlertDialogContent>
        )}
      </AlertDialog>

      <AlertDialog open={submitSuccessMode != null} onOpenChange={(o) => !o && setSubmitSuccessMode(null)}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader className="text-center sm:text-center">
            <AlertDialogTitle className="text-xl">
              {submitSuccessMode === "resubmit" ? "Template reenviado" : "Template enviado"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base leading-relaxed pt-1">
              A Meta vai analisar seu template. Em breve o status aparecerá aqui em &quot;Em análise&quot;. Você será
              avisado quando houver atualização.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center pt-2">
            <Button type="button" className="min-w-[8rem]" onClick={handleSubmitSuccessEntendi}>
              Entendi
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteConfirmId != null} onOpenChange={(o) => !o && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir template?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir? Essa ação não pode ser revertida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
            <Button type="button" variant="destructive" disabled={submitting} onClick={() => void confirmDelete()}>
              Confirmar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function UnlinkedTemplateRow({
  template,
  submitting,
  onLink,
}: {
  template: UnlinkedApprovedTemplate;
  submitting: boolean;
  onLink: (category: SentinelaTemplateCategory) => void;
}) {
  const inferred = template.inferred_category;
  const langLabel = TEMPLATE_LANGUAGE_OPTIONS.find((o) => o.value === template.language)?.label ?? template.language;

  return (
    <div className="rounded-md bg-muted/40 p-3 text-sm space-y-2">
      <p className="font-medium">{template.meta_template_name}</p>
      <p className="text-xs text-muted-foreground">Idioma: {langLabel}</p>
      <div className="flex flex-wrap gap-2">
        {inferred && (
          <Button type="button" size="sm" disabled={submitting} onClick={() => onLink(inferred)}>
            Usar como {CATEGORY_DISPLAY_LABEL[inferred]}
          </Button>
        )}
        {inferred !== "confirmacao" && (
          <Button type="button" size="sm" variant="outline" disabled={submitting} onClick={() => onLink("confirmacao")}>
            Usar como confirmação
          </Button>
        )}
        {inferred !== "lembrete" && (
          <Button type="button" size="sm" variant="outline" disabled={submitting} onClick={() => onLink("lembrete")}>
            Usar como lembrete
          </Button>
        )}
      </div>
    </div>
  );
}
