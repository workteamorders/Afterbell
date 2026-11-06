import type { Metadata } from "next";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/StateBlock";
import Page from "@/components/page/Page.module.css";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <div className={`container ${Page.page}`}>
      <EmptyState
        title="This page does not exist"
        action={
          <Button variant="primary" href="/explore">
            Explore tokens
          </Button>
        }
      >
        The link may be old, or the token is not in the registry. Nothing on your wallet was touched.
      </EmptyState>
    </div>
  );
}
