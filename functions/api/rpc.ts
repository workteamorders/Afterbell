import { handleRpc, type RpcEnv } from "../../src/server/rpc-handler";

/** Cloudflare Pages Function: /api/rpc. Logika ada di src/server/rpc-handler.ts supaya bisa diuji. */
export const onRequest: PagesFunction<RpcEnv> = (context) => handleRpc(context.request, context.env);
