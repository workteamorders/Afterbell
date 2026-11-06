"use client";

import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/StateBlock";
import Page from "@/components/page/Page.module.css";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className={`container ${Page.page}`}>
      <ErrorState
        title="Something went wrong on this page"
        what="The page hit an unexpected error and stopped."
        safety="Nothing was sent from your wallet, and Afterbell holds none of your funds."
        next="Try again. If it keeps happening, reload the page."
        actions={
          <>
            <Button variant="primary" icon="refresh" onClick={reset}>
              Try again
            </Button>
            <Button variant="ghost" href="/">
              Go home
            </Button>
          </>
        }
      />
    </div>
  );
}
