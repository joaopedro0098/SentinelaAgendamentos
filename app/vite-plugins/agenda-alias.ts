import path from "node:path";
import type { Plugin } from "vite";

/**
 * `@/…` → `src/…` no app principal; `@/…` → `agenda/src/…` nos arquivos da pasta agenda.
 */
export function projectAliases(appRoot: string): Plugin {
  const appSrc = path.resolve(appRoot, "src");
  const agendaSrc = path.resolve(appRoot, "agenda/src");

  function isAgendaModule(importer: string) {
    const file = path.normalize(importer.split("?")[0]);
    return file.startsWith(agendaSrc + path.sep) || file === agendaSrc;
  }

  return {
    name: "project-aliases",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!source.startsWith("@/")) return null;
      const target = source.slice(2);
      const root = importer && isAgendaModule(importer) ? agendaSrc : appSrc;
      const id = path.resolve(root, target);
      return this.resolve(id, importer, { skipSelf: true, ...options });
    },
  };
}
