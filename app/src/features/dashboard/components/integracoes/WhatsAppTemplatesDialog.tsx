import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { TemplateBodyEditor } from "@/features/dashboard/components/integracoes/TemplateBodyEditor";
import {
  CATEGORY_BUTTON_OPTIONS,
  CATEGORY_DISPLAY_LABEL,
  DEFAULT_BODY_TEXT,
  TEMPLATE_LANGUAGE_OPTIONS,
  validateBodyDisplayText,
  statusBadgeLabel,
  type SentinelaTemplateCategory,
  type TemplateLanguage,
} from "@/features/dashboard/lib/metaTemplateProduct";
import {
  createWabaMessageTemplate,
  linkWabaMessageTemplate,
  resubmitWabaMessageTemplate,
  syncWabaMessageTemplates,
  type TemplateSlotState,
  type UnlinkedApprovedTemplate,
  type WabaTemplatesSyncResult,
} from "@/features/dashboard/lib/wabaTemplatesApi";

type WhatsAppTemplatesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const CATEGORIES: SentinelaTemplateCategory[] = ["confirmacao", "lembrete"];

function statusBadgeClass(status: string): string {
  if (status === "APPROVED") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
  if (status === "REJECTED") return "bg-destructive/15 text-destructive";
  if (status === "PENDING" || status === "IN_APPEAL") return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return "bg-secondary text-muted-foreground";
}

type FormState = {
  body: string;
  language: TemplateLanguage;
  enabledButtons: Record<string, boolean>;
};

function defaultForm(category: SentinelaTemplateCategory, language: TemplateLanguage): FormState {
  const buttons = CATEGORY_BUTTON_OPTIONS[category];
  return {
    body: DEFAULT_BODY_TEXT[category][language],
    language,
    enabledButtons: Object.fromEntries(buttons.map((b) => [b.id, true])),
  };
}

function formFromLinked(
  category: SentinelaTemplateCategory,
  linked: NonNullable<TemplateSlotState["linked"]>,
): FormState {
  const buttons = CATEGORY_BUTTON_OPTIONS[category];
  const enabled: Record<string, boolean> = {};
  for (const b of buttons) {
    const label = b.label[linked.language as TemplateLanguage] ?? b.label.pt_BR;
    enabled[b.id] = linked.quick_reply_labels.includes(label);
  }
  return {
    body: linked.body_display_text,
    language: (linked.language as TemplateLanguage) ?? "pt_BR",
    enabledButtons: enabled,
  };
}

export function WhatsAppTemplatesDialog({ open, onOpenChange }: WhatsAppTemplatesDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [syncData, setSyncData] = useState<Extract<WabaTemplatesSyncResult, { ok: true }> | null>(null);
  const [activeForm, setActiveForm] = useState<SentinelaTemplateCategory | null>(null);
  const [forms, setForms] = useState<Record<SentinelaTemplateCategory, FormState>>({
    confirmacao: defaultForm("confirmacao", "pt_BR"),
    lembrete: defaultForm("lembrete", "pt_BR"),
  });

  const runSync = useCallback(async () => {
    setLoading(true);
    const result = await syncWabaMessageTemplates();
    setLoading(false);

    if (!result.ok) {
      toast({ title: "Não foi possível carregar templates", description: result.error, variant: "destructive" });
      return;
    }

    setSyncData(result);
  }, [toast]);

  useEffect(() => {
    if (open) {
      setActiveForm(null);
      void runSync();
    }
  }, [open, runSync]);

  function updateForm(category: SentinelaTemplateCategory, patch: Partial<FormState>) {
    setForms((prev) => ({ ...prev, [category]: { ...prev[category], ...patch } }));
  }

  function openCreateForm(category: SentinelaTemplateCategory) {
    const slot = syncData?.slots[category];
    if (slot?.linked && slot.linked.meta_status === "REJECTED") {
      setForms((prev) => ({
        ...prev,
        [category]: formFromLinked(category, slot.linked!),
      }));
    } else {
      setForms((prev) => ({
        ...prev,
        [category]: defaultForm(category, prev[category].language),
      }));
    }
    setActiveForm(category);
  }

  async function handleSubmit(category: SentinelaTemplateCategory) {
    const form = forms[category];
    const validation = validateBodyDisplayText(form.body, form.language);
    if (validation) {
      toast({ title: "Revise o texto", description: validation, variant: "destructive" });
      return;
    }

    const enabledIds = CATEGORY_BUTTON_OPTIONS[category]
      .filter((b) => form.enabledButtons[b.id])
      .map((b) => b.id);

    setSubmitting(true);
    const slot = syncData?.slots[category];
    const isResubmit = slot?.linked?.meta_status === "REJECTED";
    const result = isResubmit
      ? await resubmitWabaMessageTemplate({
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

    toast({
      title: isResubmit ? "Template reenviado" : "Template enviado",
      description: "A Meta vai analisar em breve. Você será avisado quando houver atualização.",
    });
    setSyncData(result);
    setActiveForm(null);
  }

  async function handleLink(
    template: UnlinkedApprovedTemplate,
    category: SentinelaTemplateCategory,
  ) {
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

  function renderSlot(category: SentinelaTemplateCategory) {
    const slot = syncData?.slots[category];
    const form = forms[category];
    const linked = slot?.linked;
    const showForm = activeForm === category;

    return (
      <div key={category} className="rounded-lg border p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h4 className="font-medium text-sm">{CATEGORY_DISPLAY_LABEL[category]}</h4>
            {linked && (
              <span
                className={`inline-flex mt-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(linked.meta_status)}`}
              >
                {statusBadgeLabel(linked.meta_status)}
              </span>
            )}
          </div>
          {slot?.can_create && !showForm && (
            <Button type="button" size="sm" variant="outline" onClick={() => openCreateForm(category)}>
              {linked?.meta_status === "REJECTED" ? "Editar e reenviar" : "Criar"}
            </Button>
          )}
        </div>

        {linked?.needs_reconnect && (
          <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 rounded-md px-2 py-1.5">
            Este registro é de uma conexão anterior. Reconecte o WhatsApp para sincronizar novamente.
          </p>
        )}

        {linked && !showForm && (
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="whitespace-pre-wrap text-foreground/80">{linked.body_display_text.replace(/⟦(\w+)⟧/g, "[$1]")}</p>
            {linked.quick_reply_labels.length > 0 && (
              <p>Botões: {linked.quick_reply_labels.join(", ")}</p>
            )}
            <p>Idioma: {TEMPLATE_LANGUAGE_OPTIONS.find((o) => o.value === linked.language)?.label ?? linked.language}</p>
          </div>
        )}

        {linked?.meta_status === "REJECTED" && linked.rejection_user_message && !showForm && (
          <p className="text-xs text-destructive bg-destructive/10 rounded-md px-2 py-1.5">
            {linked.rejection_user_message}
          </p>
        )}

        {showForm && (
          <div className="space-y-3 pt-1 border-t">
            <div className="space-y-1.5">
              <Label className="text-xs">Idioma</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.language}
                disabled={submitting}
                onChange={(e) => {
                  const lang = e.target.value as TemplateLanguage;
                  updateForm(category, {
                    language: lang,
                    body: DEFAULT_BODY_TEXT[category][lang],
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

            <TemplateBodyEditor
              value={form.body}
              language={form.language}
              disabled={submitting}
              onChange={(body) => updateForm(category, { body })}
            />

            <div className="space-y-2">
              <Label className="text-xs">Botões de resposta rápida</Label>
              <div className="space-y-2">
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

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" size="sm" disabled={submitting} onClick={() => setActiveForm(null)}>
                Cancelar
              </Button>
              <Button type="button" size="sm" disabled={submitting} onClick={() => void handleSubmit(category)}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Enviando…
                  </>
                ) : linked?.meta_status === "REJECTED" ? (
                  "Reenviar para aprovação"
                ) : (
                  "Enviar para aprovação"
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
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
            slots={syncData!.slots}
            submitting={submitting}
            onLink={(cat) => void handleLink(t, cat)}
          />
        ))}
      </div>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Templates WhatsApp</AlertDialogTitle>
          <AlertDialogDescription>
            Crie ou vincule templates de confirmação e lembrete. A Meta precisa aprovar antes do uso nas mensagens.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {CATEGORIES.map(renderSlot)}
            {renderUnlinked()}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Fechar</AlertDialogCancel>
          <Button type="button" variant="outline" disabled={loading || submitting} onClick={() => void runSync()}>
            Atualizar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function UnlinkedTemplateRow({
  template,
  slots,
  submitting,
  onLink,
}: {
  template: UnlinkedApprovedTemplate;
  slots: Extract<WabaTemplatesSyncResult, { ok: true }>["slots"];
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
        {inferred && !slots[inferred].linked && (
          <Button type="button" size="sm" disabled={submitting} onClick={() => onLink(inferred)}>
            Usar como {CATEGORY_DISPLAY_LABEL[inferred]}
          </Button>
        )}
        {!slots.confirmacao.linked && inferred !== "confirmacao" && (
          <Button type="button" size="sm" variant="outline" disabled={submitting} onClick={() => onLink("confirmacao")}>
            Usar como confirmação
          </Button>
        )}
        {!slots.lembrete.linked && inferred !== "lembrete" && (
          <Button type="button" size="sm" variant="outline" disabled={submitting} onClick={() => onLink("lembrete")}>
            Usar como lembrete
          </Button>
        )}
      </div>
    </div>
  );
}
