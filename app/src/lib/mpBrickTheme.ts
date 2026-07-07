import type { DashboardThemeMode } from "@/hooks/useDashboardTheme";

type MpBrickStyle = {
  theme: "default" | "dark";
  customVariables: Record<string, string>;
};

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
        outlinePrimaryColor: "#d4e5dc",
        outlineSecondaryColor: "#e8efeb",
        secondaryColor: "#f5f8f6",
        baseColor: "#2e9b56",
        baseColorFirstVariant: "#247a44",
        baseColorSecondVariant: "#3bc06a",
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
      baseColor: "#2e9b56",
      baseColorFirstVariant: "#3bc06a",
      baseColorSecondVariant: "#247a44",
    },
  };
}

/** Estilo do Payment Brick (agendamentos). */
export function getMpBrickStyleForDashboardTheme(mode: DashboardThemeMode): MpBrickStyle {
  if (mode === "light") {
    return {
      theme: "default",
      customVariables: {
        formBackgroundColor: "#ffffff",
        inputBackgroundColor: "#eef3f0",
        textPrimaryColor: "#121212",
        textSecondaryColor: "#666666",
        outlinePrimaryColor: "#d4e5dc",
        outlineSecondaryColor: "#e8efeb",
        secondaryColor: "#f5f8f6",
        baseColor: "#2e9b56",
        baseColorFirstVariant: "#247a44",
        baseColorSecondVariant: "#3bc06a",
        borderRadius: "12px",
        borderRadiusMedium: "12px",
        borderRadiusLarge: "12px",
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
      baseColor: "#2e9b56",
      baseColorFirstVariant: "#3bc06a",
      baseColorSecondVariant: "#247a44",
      borderRadius: "12px",
      borderRadiusMedium: "12px",
      borderRadiusLarge: "12px",
    },
  };
}

/** @deprecated use getMpBrickStyleForDashboardTheme */
export function getMpBrickVisualForDashboardTheme(mode: DashboardThemeMode) {
  return getMpBrickStyleForDashboardTheme(mode).customVariables;
}
