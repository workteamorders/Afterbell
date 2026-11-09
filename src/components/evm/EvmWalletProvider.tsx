"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Notice } from "@/components/ui/StateBlock";
import { KEYS, readLocal, removeLocal, writeLocal } from "@/lib/storage";
import {
  connectEvm,
  isUserRejection,
  sendTransaction,
  switchChain,
  walletChainId,
  watchEvmWallets,
  type EvmWallet,
  type TxRequest,
} from "@/lib/evm/wallet";
import type { EvmChain } from "@/lib/evm/chains";
import styles from "@/components/wallet/WalletButton.module.css";

type Status = "disconnected" | "connecting" | "connected";

interface EvmWalletState {
  wallets: EvmWallet[];
  status: Status;
  address?: string;
  walletName?: string;
  chainId: number | null;
  error?: string;
  connect: (w: EvmWallet) => Promise<void>;
  disconnect: () => void;
  /** Meminta wallet pindah ke chain yang dibutuhkan (menambahkannya bila belum dikenal). Mengembalikan true bila chain sudah benar. */
  ensureChain: (chain: EvmChain) => Promise<boolean>;
  send: (tx: Omit<TxRequest, "from">) => Promise<string>;
}

const Ctx = createContext<EvmWalletState | undefined>(undefined);

export function useEvmWallet(): EvmWalletState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useEvmWallet must be used inside AppProviders");
  return v;
}

export function EvmWalletProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<EvmWallet[]>([]);
  const [status, setStatus] = useState<Status>("disconnected");
  const [active, setActive] = useState<{ wallet: EvmWallet; address: string } | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [error, setError] = useState<string | undefined>();
  const triedAuto = useRef(false);

  useEffect(() => watchEvmWallets(setWallets), []);

  const connect = useCallback(async (wallet: EvmWallet) => {
    setStatus("connecting");
    setError(undefined);
    try {
      const address = await connectEvm(wallet.provider);
      if (!address) throw new Error("No account was shared.");
      setActive({ wallet, address });
      setChainId(await walletChainId(wallet.provider).catch(() => null));
      setStatus("connected");
      writeLocal(KEYS.lastEvmWallet, wallet.info.rdns);
    } catch (e) {
      setStatus("disconnected");
      setError(isUserRejection(e) ? "You declined the connection in your wallet." : e instanceof Error && e.message ? e.message : "The wallet did not connect.");
    }
  }, []);

  /* Sambung ulang diam-diam (eth_accounts, tanpa jendela) bila wallet terakhir sudah pernah diizinkan. */
  useEffect(() => {
    if (triedAuto.current || wallets.length === 0) return;
    const last = readLocal(KEYS.lastEvmWallet);
    const w = wallets.find((x) => x.info.rdns === last);
    if (!w) return;
    triedAuto.current = true;
    connectEvm(w.provider, true)
      .then(async (address) => {
        if (!address) return;
        setActive({ wallet: w, address });
        setChainId(await walletChainId(w.provider).catch(() => null));
        setStatus("connected");
      })
      .catch(() => undefined);
  }, [wallets]);

  /* Perubahan akun dan chain dari wallet. */
  useEffect(() => {
    const p = active?.wallet.provider;
    if (!p?.on || !p.removeListener) return;
    const onAccounts = (accts: unknown) => {
      const a = Array.isArray(accts) ? accts[0] : undefined;
      if (typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a)) setActive((cur) => (cur ? { ...cur, address: a } : cur));
      else {
        setActive(null);
        setStatus("disconnected");
      }
    };
    const onChain = (id: unknown) => {
      if (typeof id === "string" && /^0x[0-9a-fA-F]+$/.test(id)) setChainId(Number(BigInt(id)));
    };
    p.on("accountsChanged", onAccounts);
    p.on("chainChanged", onChain);
    return () => {
      p.removeListener?.("accountsChanged", onAccounts);
      p.removeListener?.("chainChanged", onChain);
    };
  }, [active?.wallet]);

  const disconnect = useCallback(() => {
    removeLocal(KEYS.lastEvmWallet);
    setActive(null);
    setStatus("disconnected");
  }, []);

  const ensureChain = useCallback(
    async (wanted: EvmChain) => {
      if (!active) return false;
      if (chainId === wanted.chainId) return true;
      try {
        const add = wanted.walletAdd ? { ...wanted.walletAdd, nativeSymbol: wanted.nativeSymbol } : undefined;
        await switchChain(active.wallet.provider, wanted.chainId, add);
        const now = await walletChainId(active.wallet.provider);
        setChainId(now);
        return now === wanted.chainId;
      } catch {
        return false;
      }
    },
    [active, chainId],
  );

  const send = useCallback(
    async (tx: Omit<TxRequest, "from">) => {
      if (!active) throw new Error("Connect a wallet first.");
      return sendTransaction(active.wallet.provider, { ...tx, from: active.address });
    },
    [active],
  );

  const value = useMemo<EvmWalletState>(
    () => ({ wallets, status, address: active?.address, walletName: active?.wallet.info.name, chainId, error, connect, disconnect, ensureChain, send }),
    [wallets, status, active, chainId, error, connect, disconnect, ensureChain, send],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Pemilih wallet EVM. Hanya wallet yang mengumumkan diri lewat EIP-6963 yang tampil. */
export function EvmWalletPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const w = useEvmWallet();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Connect an EVM wallet"
      description="Pick a wallet installed in this browser. Your wallet asks you to approve every transaction."
      actions={
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      }
    >
      {w.wallets.length === 0 ? (
        <Notice tone="info" title="No EVM wallet found in this browser">
          Install an EVM wallet extension, then reload this page. Afterbell works with wallets that announce themselves through EIP-6963.
        </Notice>
      ) : (
        <ul role="list" className={styles.list}>
          {w.wallets.map((wallet) => (
            <li key={wallet.info.uuid}>
              <button
                type="button"
                className={styles.item}
                onClick={async () => {
                  await w.connect(wallet);
                  onClose();
                }}
              >
                {wallet.info.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={wallet.info.icon} alt="" width={32} height={32} className={styles.icon} />
                ) : null}
                <span>{wallet.info.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {w.error ? (
        <Notice tone="warning" icon="alert" title="Could not connect">
          {w.error}
        </Notice>
      ) : null}
    </Dialog>
  );
}
