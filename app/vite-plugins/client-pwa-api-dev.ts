import type { Plugin } from "vite";
import { loadEnv } from "vite";
import { buildClientPwaManifest } from "../src/lib/clientPwaManifest";
import { fetchBarbeariaBySlug, fetchShopIconResponse } from "../api/_lib/clientPwaServer";

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
        const manifestMatch = url.match(/^\/api\/manifest\/agendar\/([^/?]+)/);
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
          const origin = `http://${req.headers.host ?? "localhost:8080"}`;
          const manifest = buildClientPwaManifest(
            { slug, nome: data.nome?.trim() || "Agendar" },
            origin,
          );
          res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
          res.end(JSON.stringify(manifest));
          return;
        }

        const iconMatch = url.match(/^\/api\/pwa-icon\/agendar\/([^/?]+)\/(192|512)/);
        if (iconMatch) {
          const slug = decodeURIComponent(iconMatch[1]);
          const size = iconMatch[2] as "192" | "512";
          const { data, error } = await fetchBarbeariaBySlug(slug);
          if (error || !data) {
            res.statusCode = error ? 500 : 404;
            res.end(error?.message ?? "Barbearia não encontrada");
            return;
          }
          const origin = `http://${req.headers.host ?? "localhost:8080"}`;
          const response = await fetchShopIconResponse(origin, data.logo_url, size);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          const buffer = Buffer.from(await response.arrayBuffer());
          res.end(buffer);
          return;
        }

        next();
      });
    },
  };
}
