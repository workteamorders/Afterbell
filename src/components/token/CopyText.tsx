"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

/** Teks yang bisa disalin (mis. alamat mint). Tombol punya label jelas dan memberi umpan balik teks. */
export function CopyText({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap", minWidth: 0 }}>
      <code style={{ overflowWrap: "anywhere" }}>{value}</code>
      <Button
        variant="ghost"
        size="sm"
        icon={done ? "check" : "copy"}
        aria-label={`Copy ${label}`}
        onClick={() => {
          navigator.clipboard
            ?.writeText(value)
            .then(() => {
              setDone(true);
              setTimeout(() => setDone(false), 1600);
            })
            .catch(() => undefined);
        }}
      >
        {done ? "Copied" : "Copy"}
      </Button>
    </span>
  );
}
