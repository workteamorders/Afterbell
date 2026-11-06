"use client";

import { EvmWalletProvider } from "@/components/evm/EvmWalletProvider";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fetchGeoStatus, type GeoStatus } from "@/lib/geo";
import { getMarketStatus, type MarketStatus } from "@/lib/market";
import { isScreenedWallet } from "@/lib/screening";
import { KEYS, readLocal, writeLocal, removeLocal } from "@/lib/storage";
import { connectWallet, disconnectWallet, listWallets, onAccountChange, signWithWallet, watchWallets, type SolanaWallet } from "@/lib/wallet/standard";
import type { WalletAccount } from "@wallet-standard/base";
import { ToastProvider } from "@/components/ui/Toast";

/* ---------- Wilayah ---------- */
const GeoContext = createContext<GeoStatus | undefined>(undefined);

/** undefined = sedang memeriksa. */
export function useGeo(): GeoStatus | undefined {
  return useContext(GeoContext);
}

/* ---------- Status pasar ---------- */
const MarketContext = createContext<MarketStatus | undefined>(undefined);

/** undefined sampai klien hidrasi (menghindari hasil berbeda antara build dan browser). */
export function useMarket(): MarketStatus | undefined {
  return useContext(MarketContext);
}

/* ---------- Wallet ---------- */
type WalletStatus = "disconnected" | "connecting" | "connected";

interface WalletState {
  wallets: SolanaWallet[];
  status: WalletStatus;
  address?: string;
  walletName?: string;
  /** Alamat ada di daftar penyaringan. */
  screened: boolean;
  error?: string;
  connect: (wallet: SolanaWallet) => Promise<void>;
  disconnect: () => Promise<void>;
  sign: (tx: Uint8Array) => Promise<Uint8Array>;
}

const WalletContext = createContext<WalletState | undefined>(undefined);

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside AppProviders");
  return ctx;
}

function WalletProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<SolanaWallet[]>([]);
  const [status, setStatus] = useState<WalletStatus>("disconnected");
  const [active, setActive] = useState<{ wallet: SolanaWallet; account: WalletAccount } | null>(null);
  const [error, setError] = useState<string | undefined>();
  const triedAuto = useRef(false);

  useEffect(() => {
    const refresh = () => setWallets(listWallets());
    refresh();
    return watchWallets(refresh);
  }, []);

  const connect = useCallback(async (wallet: SolanaWallet) => {
    setStatus("connecting");
    setError(undefined);
    try {
      const account = await connectWallet(wallet);
      if (!account) throw new Error("No account was shared.");
      setActive({ wallet, account });
      setStatus("connected");
      writeLocal(KEYS.lastWallet, wallet.name);
    } catch (e) {
      setStatus("disconnected");
      setError(e instanceof Error && e.message ? e.message : "The wallet did not connect.");
    }
  }, []);

  /* Sambung ulang diam-diam ke wallet terakhir bila sudah pernah diizinkan. */
  useEffect(() => {
    if (triedAuto.current || wallets.length === 0) return;
    const last = readLocal(KEYS.lastWallet);
    const w = wallets.find((x) => x.name === last);
    if (!w) return;
    triedAuto.current = true;
    connectWallet(w, true)
      .then((account) => {
        if (account) {
          setActive({ wallet: w, account });
          setStatus("connected");
        }
      })
      .catch(() => undefined);
  }, [wallets]);

  useEffect(() => {
    if (!active) return;
    return onAccountChange(active.wallet, (accounts) => {
      const next = accounts[0];
      if (next) setActive({ wallet: active.wallet, account: next });
      else {
        setActive(null);
        setStatus("disconnected");
      }
    });
  }, [active]);

  const disconnect = useCallback(async () => {
    if (active) await disconnectWallet(active.wallet).catch(() => undefined);
    removeLocal(KEYS.lastWallet);
    setActive(null);
    setStatus("disconnected");
  }, [active]);

  const sign = useCallback(
    async (tx: Uint8Array) => {
      if (!active) throw new Error("Connect a wallet first.");
      return signWithWallet(active.wallet, active.account, tx);
    },
    [active],
  );

  const address = active?.account.address;
  const value = useMemo<WalletState>(
    () => ({ wallets, status, address, walletName: active?.wallet.name, screened: address ? isScreenedWallet(address) : false, error, connect, disconnect, sign }),
    [wallets, status, address, active, error, connect, disconnect, sign],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [geo, setGeo] = useState<GeoStatus | undefined>();
  const [market, setMarket] = useState<MarketStatus | undefined>();

  useEffect(() => {
    let live = true;
    fetchGeoStatus().then((g) => live && setGeo(g));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const tick = () => setMarket(getMarketStatus());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <GeoContext.Provider value={geo}>
      <MarketContext.Provider value={market}>
        <ToastProvider>
          <WalletProvider>
            <EvmWalletProvider>{children}</EvmWalletProvider>
          </WalletProvider>
        </ToastProvider>
      </MarketContext.Provider>
    </GeoContext.Provider>
  );
}
