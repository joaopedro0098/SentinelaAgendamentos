import type { DashboardThemeMode } from "@/hooks/useDashboardTheme";

type MpBrickStyle = {
  theme: "default" | "dark";
  customVariables: Record<string, string>;
};

const BRAND_GREEN = "#3B8F6E";
const BRAND_GREEN_DARK = "#307458";
const BRAND_GREEN_LIGHT = "#47AD85";

/** Estilo do Card Payment Brick (assinatura). Sem borderRadius — não suportado neste Brick. */
export function getMpCardBrickStyleForDashboardTheme(mode: DashboardThemeMode): MpBrickStyle {
  if (mode === "light") {
    return {
      theme: "default",
      customVariables: {
        formBackgroundColor: "#ffffff",
        inputBackgroundColor: "#eef3f0",
        textPrimaryColor: "#121212",
        textSecondaryColor: "#666666",
        outlinePrimaryColor: "#c8ddd2",
        outlineSecondaryColor: "#e4efea",
        secondaryColor: "#f5f8f6",
        baseColor: BRAND_GREEN,
        baseColorFirstVariant: BRAND_GREEN_DARK,
        baseColorSecondVariant: BRAND_GREEN_LIGHT,
      },
    };
  }

  return {
    theme: "dark",
    customVariables: {
      formBackgroundColor: "#1e2421",
      inputBackgroundColor: "#29302c",
      textPrimaryColor: "#fafafa",
      textSecondaryColor: "#9aa39e",
      outlinePrimaryColor: "#2f3a35",
      outlineSecondaryColor: "#29302c",
      secondaryColor: "#252b28",
      baseColor: BRAND_GREEN,
      baseColorFirstVariant: BRAND_GREEN_LIGHT,
      baseColorSecondVariant: BRAND_GREEN_DARK,
    },
  };
}
