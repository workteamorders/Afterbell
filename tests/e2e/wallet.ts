import type { Page } from "@playwright/test";

/**
 * Wallet tiruan (Wallet Standard) untuk uji. Tidak menyimpan kunci apa pun dan tidak menandatangani apa pun:
 * signTransaction mengembalikan byte yang sama. Dipakai hanya bersama jaringan palsu (mocks.ts).
 */
export const TEST_ADDRESS = "Vote111111111111111111111111111111111111111";

export async function installFakeWallet(page: Page, opts: { reject?: boolean } = {}) {
  await page.addInitScript(
    ({ address, reject }) => {
      const publicKey = new Uint8Array(32).fill(7);
      const account = { address, publicKey, chains: ["solana:mainnet"], features: ["solana:signTransaction"] };
      const listeners: Record<string, Array<(p: unknown) => void>> = {};
      const wallet = {
        version: "1.0.0",
        name: "Test Wallet",
        icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiI+PC9zdmc+",
        chains: ["solana:mainnet"],
        accounts: [] as unknown[],
        features: {
          "standard:connect": {
            version: "1.0.0",
            connect: async () => {
              wallet.accounts = [account];
              return { accounts: [account] };
            },
          },
          "standard:disconnect": {
            version: "1.0.0",
            disconnect: async () => {
              wallet.accounts = [];
            },
          },
          "standard:events": {
            version: "1.0.0",
            on: (event: string, cb: (p: unknown) => void) => {
              (listeners[event] ??= []).push(cb);
              return () => undefined;
            },
          },
          "solana:signTransaction": {
            version: "1.0.0",
            supportedTransactionVersions: ["legacy", 0],
            signTransaction: async (...inputs: Array<{ transaction: Uint8Array }>) => {
              if (reject) throw new Error("User rejected the request");
              return inputs.map((i) => ({ signedTransaction: i.transaction }));
            },
          },
        },
      };
      const register = (api: { register: (w: unknown) => void }) => api.register(wallet);
      window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: register }));
      window.addEventListener("wallet-standard:app-ready", (e) => register((e as CustomEvent).detail));
    },
    { address: TEST_ADDRESS, reject: opts.reject ?? false },
  );
}
