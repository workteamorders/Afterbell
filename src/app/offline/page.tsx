import type { Metadata } from "next";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/StateBlock";
import Page from "@/components/page/Page.module.css";

export const metadata: Metadata = { title: "Offline", robots: { index: false } };

export default function OfflinePage() {
  return (
    <div className={`container ${Page.page}`}>
      <EmptyState
        title="You are offline"
        action={
          <Button variant="primary" href="/">
            Try again
          </Button>
        }
      >
        Afterbell needs a connection for prices and balances. Nothing was sent from your wallet. Reconnect, then try again.
      </EmptyState>
    </div>
  );
}
