import type { Plugin } from "vite";
import { loadEnv } from "vite";
import { buildClientPwaManifest } from "../api/_lib/clientPwaManifest";
import { fetchBarbeariaBySlug } from "../api/_lib/supabase";

export function clientPwaApiDev(): Plugin {
  return {
    name: "client-pwa-api-dev",
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.root, "");
      for (const [key, value] of Object.entries(env)) {
        if (process.env[key] === undefined) process.env[key] = value;
      }

      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "";
        const manifestMatch = url.match(/^\/manifest\/agendar\/([^/?]+)\.webmanifest/);
        if (manifestMatch) {
          const slug = decodeURIComponent(manifestMatch[1]);
          const { data, error } = await fetchBarbeariaBySlug(slug);
          if (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: error.message }));
            return;
          }
          if (!data) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: "Barbearia não encontrada" }));
            return;
          }
          const manifest = buildClientPwaManifest({
            slug,
            nome: data.nome?.trim() || "Agendar",
          });
          res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
          res.end(JSON.stringify(manifest));
          return;
        }

        next();
      });
    },
  };
}
