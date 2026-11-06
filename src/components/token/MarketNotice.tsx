"use client";

import { useMarket } from "@/components/providers/AppProviders";
import { describeMarket } from "@/lib/market";
import { Badge } from "@/components/ui/Badge";
import { Notice } from "@/components/ui/StateBlock";
import { Skeleton } from "@/components/ui/Skeleton";

function nextText(next?: Date, kind?: "open" | "close"): string | null {
  if (!next || !kind) return null;
  const when = next.toLocaleString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
  return `${kind === "open" ? "Opens" : "Closes"} ${when}`;
}

/** Lencana ringkas: Open atau Closed, dengan ikon dan kata. */
export function MarketBadge() {
  const m = useMarket();
  if (!m) return <Skeleton shape="pill" />;
  if (m.state === "open") return <Badge tone="success">US market open</Badge>;
  if (m.state === "closed") return <Badge tone="warning" icon="clock">US market closed</Badge>;
  return <Badge tone="neutral" icon="info">Market hours unknown</Badge>;
}

/** Penjelasan jujur tentang jam pasar dan harga. Tidak menjanjikan apa pun. */
export function MarketNotice() {
  const m = useMarket();
  if (!m) return <Skeleton shape="block" />;
  const d = describeMarket(m);
  const next = nextText(m.nextChange, m.nextChangeKind);
  return (
    <Notice tone={m.state === "open" ? "success" : m.state === "closed" ? "warning" : "info"} icon={m.state === "open" ? "check" : m.state === "closed" ? "clock" : "info"} title={d.title}>
      {d.body}
      {next ? ` ${next}.` : ""}
    </Notice>
  );
}
