import type { MetadataRoute } from "next";
import { CONFIG } from "@/lib/config";
import { evmTokenPath } from "@/lib/evm/chains";
import { EVM_TOKENS, TOKENS } from "@/lib/registry";

export const dynamic = "force-static";

const PAGES = ["/", "/explore", "/portfolio", "/methodology", "/help", "/risk", "/terms", "/privacy"];

export default function sitemap(): MetadataRoute.Sitemap {
  return [...PAGES, ...TOKENS.map((t) => `/s/${t.symbol}`), ...EVM_TOKENS.map((t) => evmTokenPath(t))].map((p) => ({ url: `${CONFIG.siteUrl}${p}` }));
}
