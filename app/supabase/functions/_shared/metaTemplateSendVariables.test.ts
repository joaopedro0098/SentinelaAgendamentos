import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { DEFAULT_BODY_TEXT } from "./metaTemplateProduct.ts";
import { buildMetaTemplateBodyParameters } from "./metaTemplateSendVariables.ts";

Deno.test("buildMetaTemplateBodyParameters usa ordem cliente, data, hora", () => {
  const body = DEFAULT_BODY_TEXT.confirmacao.pt_BR;
  const params = buildMetaTemplateBodyParameters(body, "pt_BR", {
    cliente_nome: "Ana",
    data: "2026-03-16",
    hora: "14:30:00",
  });
  assertEquals(params.length, 3);
  assertEquals(params[0], "Ana");
  assertEquals(params[2], "14:30");
});

Deno.test("buildMetaTemplateBodyParameters só inclui variáveis presentes no texto", () => {
  const body = "Olá ⟦cliente⟧, lembrete às ⟦hora⟧.";
  const params = buildMetaTemplateBodyParameters(body, "pt_BR", {
    cliente_nome: "João",
    data: "2026-03-16",
    hora: "09:00:00",
  });
  assertEquals(params.length, 2);
  assertEquals(params[0], "João");
  assertEquals(params[1], "09:00");
});
