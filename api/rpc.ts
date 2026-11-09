import { handleRpc, type RpcEnv } from "../src/server/rpc-handler.js";

/**
 * Vercel Function: /api/rpc (setara functions/api/rpc.ts di Cloudflare Pages). Logika ada di src/server/rpc-handler.ts.
 * Variabel lingkungan dibaca dari process.env (Project Settings > Environment Variables); VERCEL=1 diset oleh Vercel.
 */
export default {
  fetch: (request: Request): Promise<Response> => handleRpc(request, process.env as unknown as RpcEnv),
};
