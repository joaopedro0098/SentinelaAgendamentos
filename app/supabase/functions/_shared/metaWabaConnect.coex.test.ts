import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  COEX_SMB_APP_DATA_SYNC_WINDOW_MS,
  isWithinCoexSmbAppDataWindow,
} from "./metaWabaConnect.ts";

Deno.test("isWithinCoexSmbAppDataWindow: null connected_at trata como elegível", () => {
  assertEquals(isWithinCoexSmbAppDataWindow(null, 1_000_000), true);
});

Deno.test("isWithinCoexSmbAppDataWindow: dentro de 24h", () => {
  const now = 1_700_000_000_000;
  const connected = new Date(now - COEX_SMB_APP_DATA_SYNC_WINDOW_MS + 60_000).toISOString();
  assertEquals(isWithinCoexSmbAppDataWindow(connected, now), true);
});

Deno.test("isWithinCoexSmbAppDataWindow: após 24h", () => {
  const now = 1_700_000_000_000;
  const connected = new Date(now - COEX_SMB_APP_DATA_SYNC_WINDOW_MS - 1).toISOString();
  assertEquals(isWithinCoexSmbAppDataWindow(connected, now), false);
});
