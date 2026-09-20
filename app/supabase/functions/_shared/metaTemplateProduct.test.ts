import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildMetaBodyPayload,
  buildMetaTemplateComponents,
  DEFAULT_BODY_TEXT,
  exampleWeekdayForTemplate,
  allocateMetaTemplateName,
  generateMetaTemplateName,
  inferCategoryFromMetaTemplateName,
  sentinelaCategoryForWhatsAppTemplateKind,
  translateRejectionReason,
  validateBodyDisplayText,
  validateMetaTemplateName,
} from "./metaTemplateProduct.ts";

Deno.test("validateMetaTemplateName aceita nomes Sentinela e rejeita inválidos", () => {
  assertEquals(validateMetaTemplateName("sentinela_confirmacao_78d6e7e3"), null);
  assertEquals(validateMetaTemplateName(""), "Nome do template inválido: não pode ficar vazio.");
  assertEquals(
    validateMetaTemplateName("Template-Maiúsculo"),
    "Nome do template inválido: use apenas letras minúsculas, números e underscore (_).",
  );
});

Deno.test("generateMetaTemplateName é estável e compatível com Meta", () => {
  const shopId = "78d6e7e3-b8a9-45f3-b421-9e567bf24458";
  assertEquals(generateMetaTemplateName("confirmacao", shopId), "sentinela_confirmacao_78d6e7e3");
  assertEquals(generateMetaTemplateName("lembrete", shopId), "sentinela_lembrete_78d6e7e3");
  assertEquals(generateMetaTemplateName("lembrete", shopId, 2), "sentinela_lembrete_78d6e7e3_2");
});

Deno.test("allocateMetaTemplateName evita colisão com nomes existentes", () => {
  const shopId = "78d6e7e3-b8a9-45f3-b421-9e567bf24458";
  const base = generateMetaTemplateName("confirmacao", shopId);
  assertEquals(allocateMetaTemplateName("confirmacao", shopId, [base]), `${base}_1`);
});

Deno.test("sentinelaCategoryForWhatsAppTemplateKind mapeia D-1 e 3h", () => {
  assertEquals(sentinelaCategoryForWhatsAppTemplateKind("lembrete_d1"), "confirmacao");
  assertEquals(sentinelaCategoryForWhatsAppTemplateKind("lembrete_3h"), "lembrete");
  assertEquals(sentinelaCategoryForWhatsAppTemplateKind("alerta_profissional"), null);
});

Deno.test("buildMetaTemplateComponents lembrete sem botões", () => {
  const body = DEFAULT_BODY_TEXT.lembrete.pt_BR;
  const components = buildMetaTemplateComponents(body, "pt_BR", "lembrete", []);
  assertEquals(components.length, 1);
  assertEquals(components[0]?.type, "BODY");
});

Deno.test("DEFAULT_BODY_TEXT lembrete usa só cliente e hora", () => {
  const body = DEFAULT_BODY_TEXT.lembrete.pt_BR;
  assertEquals(body.includes("⟦data⟧"), false);
  assertEquals(body.includes("⟦cliente⟧"), true);
  assertEquals(body.includes("⟦hora⟧"), true);
});

Deno.test("inferCategoryFromMetaTemplateName reconhece prefixos Sentinela", () => {
  assertEquals(inferCategoryFromMetaTemplateName("sentinela_confirmacao_abc"), "confirmacao");
  assertEquals(inferCategoryFromMetaTemplateName("sentinela_lembrete_xyz"), "lembrete");
  assertEquals(inferCategoryFromMetaTemplateName("outro_template"), null);
});

Deno.test("buildMetaBodyPayload converte marcadores para {{n}}", () => {
  const body =
    "Olá ⟦cliente⟧, confirme na Barbearia Central no dia ⟦data⟧ às ⟦hora⟧.";
  const result = buildMetaBodyPayload(body, "pt_BR");
  assertEquals(
    result.text,
    "Olá {{1}}, confirme na Barbearia Central no dia {{2}} às {{3}}.",
  );
  assertEquals(result.example.body_text[0].length, 3);
  assertEquals(result.example.body_text[0][1], exampleWeekdayForTemplate("pt_BR", 1));
});

Deno.test("validateBodyDisplayText exige variáveis habilitadas coerentes", () => {
  const full = "Olá ⟦cliente⟧ na Barbearia Central dia ⟦data⟧ ⟦hora⟧";
  assertEquals(validateBodyDisplayText(full), null);
  const err = validateBodyDisplayText("Olá cliente");
  assertEquals(typeof err, "string");
  const partial = "Olá ⟦cliente⟧, horário às ⟦hora⟧.";
  assertEquals(validateBodyDisplayText(partial, ["cliente", "hora"]), null);
});

Deno.test("buildMetaBodyPayload renumerar só variáveis presentes", () => {
  const body = "Olá ⟦cliente⟧, horário às ⟦hora⟧.";
  const result = buildMetaBodyPayload(body, "pt_BR", ["cliente", "hora"]);
  assertEquals(result.text, "Olá {{1}}, horário às {{2}}.");
  assertEquals(result.example.body_text[0], ["Maria", "14:00"]);
});

Deno.test("buildMetaTemplateComponents inclui BUTTONS QUICK_REPLY", () => {
  const body = DEFAULT_BODY_TEXT.confirmacao.pt_BR;
  const components = buildMetaTemplateComponents(body, "pt_BR", "confirmacao", [
    "confirmar",
    "cancelar",
  ]);
  assertEquals(components.length, 2);
  assertEquals(components[1]?.type, "BUTTONS");
});

Deno.test("translateRejectionReason simplifica motivos Meta", () => {
  assertEquals(
    translateRejectionReason("PROMOTIONAL").includes("promocional"),
    true,
  );
});

Deno.test("buildMetaBodyPayload falha sem variável obrigatória", () => {
  assertThrows(() => buildMetaBodyPayload("texto sem variáveis", "pt_BR"));
});
