import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildMetaBodyPayload,
  buildMetaTemplateComponents,
  generateMetaTemplateName,
  inferCategoryFromMetaTemplateName,
  translateRejectionReason,
  validateBodyDisplayText,
} from "./metaTemplateProduct.ts";

Deno.test("generateMetaTemplateName é estável e compatível com Meta", () => {
  const shopId = "78d6e7e3-b8a9-45f3-b421-9e567bf24458";
  assertEquals(generateMetaTemplateName("confirmacao", shopId), "sentinela_confirmacao_78d6e7e3");
  assertEquals(generateMetaTemplateName("lembrete", shopId), "sentinela_lembrete_78d6e7e3");
});

Deno.test("inferCategoryFromMetaTemplateName reconhece prefixos Sentinela", () => {
  assertEquals(inferCategoryFromMetaTemplateName("sentinela_confirmacao_abc"), "confirmacao");
  assertEquals(inferCategoryFromMetaTemplateName("sentinela_lembrete_xyz"), "lembrete");
  assertEquals(inferCategoryFromMetaTemplateName("outro_template"), null);
});

Deno.test("buildMetaBodyPayload converte marcadores para {{n}}", () => {
  const body =
    "Olá ⟦cliente⟧, confirme em ⟦estabelecimento⟧ no dia ⟦data⟧ às ⟦hora⟧.";
  const result = buildMetaBodyPayload(body, "pt_BR");
  assertEquals(
    result.text,
    "Olá {{1}}, confirme em {{2}} no dia {{3}} às {{4}}.",
  );
  assertEquals(result.example.body_text[0].length, 4);
});

Deno.test("validateBodyDisplayText exige todas as variáveis", () => {
  const full = "Olá ⟦cliente⟧ em ⟦estabelecimento⟧ dia ⟦data⟧ ⟦hora⟧";
  assertEquals(validateBodyDisplayText(full), null);
  const err = validateBodyDisplayText("Olá cliente");
  assertEquals(typeof err, "string");
});

Deno.test("buildMetaTemplateComponents inclui BUTTONS QUICK_REPLY", () => {
  const body = DEFAULT_BODY("confirmacao", "pt_BR");
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

function DEFAULT_BODY(category: "confirmacao" | "lembrete", lang: "pt_BR") {
  return category === "confirmacao"
    ? "Olá ⟦cliente⟧, confirme seu horário em ⟦estabelecimento⟧ no dia ⟦data⟧ às ⟦hora⟧."
    : "Olá ⟦cliente⟧, lembrete em ⟦estabelecimento⟧ no dia ⟦data⟧ às ⟦hora⟧.";
}

Deno.test("buildMetaBodyPayload falha sem variável obrigatória", () => {
  assertThrows(() => buildMetaBodyPayload("texto sem variáveis", "pt_BR"));
});
