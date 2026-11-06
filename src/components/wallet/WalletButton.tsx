"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Notice } from "@/components/ui/StateBlock";
import { useToast } from "@/components/ui/Toast";
import { useWallet } from "@/components/providers/AppProviders";
import styles from "./WalletButton.module.css";

export function shortAddress(a: string): string {
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

/** Tombol wallet di header: Connect wallet, atau alamat singkat yang membuka dialog akun. */
export function WalletButton({ size = "sm" }: { size?: "sm" | "md" }) {
  const w = useWallet();
  const toast = useToast();
  const [picker, setPicker] = useState(false);
  const [account, setAccount] = useState(false);
  const [confirm, setConfirm] = useState(false);

  if (w.status === "connected" && w.address) {
    const address = w.address;
    return (
      <>
        <Button variant="secondary" size={size} icon="wallet" onClick={() => setAccount(true)} aria-haspopup="dialog">
          {shortAddress(address)}
        </Button>
        <Dialog
          open={account}
          onClose={() => setAccount(false)}
          title="Wallet"
          description={`Connected with ${w.walletName ?? "your wallet"}. Afterbell never holds your keys.`}
          actions={
            <>
              <Button variant="ghost" onClick={() => setAccount(false)}>
                Close
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setAccount(false);
                  setConfirm(true);
                }}
              >
                Disconnect wallet
              </Button>
            </>
          }
        >
          <p className={styles.address} translate="no">
            {address}
          </p>
          <Button
            variant="secondary"
            size="sm"
            icon="copy"
            onClick={() => {
              navigator.clipboard?.writeText(address).then(
                () => toast.push({ title: "Address copied", tone: "neutral" }),
                () => toast.push({ title: "Could not copy", body: "Select the address and copy it by hand.", tone: "warning" }),
              );
            }}
          >
            Copy address
          </Button>
        </Dialog>
        <Dialog
          open={confirm}
          onClose={() => setConfirm(false)}
          title="Disconnect wallet?"
          description="This ends the Afterbell session for this wallet. Your funds stay in your wallet. You can connect again at any time."
          actions={
            <>
              <Button variant="ghost" onClick={() => setConfirm(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setConfirm(false);
                  void w.disconnect();
                }}
              >
                Disconnect wallet
              </Button>
            </>
          }
        />
      </>
    );
  }

  return (
    <>
      <Button variant="primary" size={size} icon="wallet" loading={w.status === "connecting"} onClick={() => setPicker(true)} aria-haspopup="dialog">
        Connect wallet
      </Button>
      <WalletPicker open={picker} onClose={() => setPicker(false)} />
    </>
  );
}

export function WalletPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const w = useWallet();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Connect a wallet"
      description="Pick a Solana wallet installed in this browser. Your wallet asks you to approve every transaction."
      actions={
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      }
    >
      {w.wallets.length === 0 ? (
        <Notice tone="info" title="No Solana wallet found in this browser">
          Install a Solana wallet extension, then reload this page. Afterbell works with wallets that support the Wallet Standard.
        </Notice>
      ) : (
        <ul role="list" className={styles.list}>
          {w.wallets.map((wallet) => (
            <li key={wallet.name}>
              <button
                type="button"
                className={styles.item}
                onClick={async () => {
                  await w.connect(wallet);
                  onClose();
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={wallet.icon} alt="" width={32} height={32} className={styles.icon} />
                <span>{wallet.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {w.error ? (
        <Notice tone="danger" title="The wallet did not connect">
          {w.error} Nothing was sent. Try again, or pick another wallet.
        </Notice>
      ) : null}
    </Dialog>
  );
}
