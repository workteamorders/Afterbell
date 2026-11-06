/** localStorage dan sessionStorage hanya untuk preferensi. Setiap akses dibungkus try/catch; aplikasi benar tanpa keduanya. */
export function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* tidak tersedia: abaikan */
  }
}

export function removeLocal(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* abaikan */
  }
}

export function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSession(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* abaikan */
  }
}

export const KEYS = {
  theme: "ab-theme",
  lastWallet: "ab-last-wallet",
  lastEvmWallet: "ab-last-evm-wallet",
  riskAck: "ab-risk-ack-v1",
  history: "ab-history-v1",
  slippage: "ab-slippage-bps",
} as const;
