import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { LiquidityPanel } from "@/components/token/LiquidityPanel";
import { MarketBadge, MarketNotice } from "@/components/token/MarketNotice";
import { RightsPanel } from "@/components/token/RightsPanel";
import type { Issuer, Token } from "@/lib/registry";
import styles from "./Home.module.css";

/** Cuplikan produk nyata: data langsung untuk satu token dari registry. Bukan contoh. */
export function HomeSnapshot({ token, issuer }: { token: Token; issuer: Issuer }) {
  return (
    <section aria-labelledby="snap-h" className={styles.snapshot}>
      <div className={styles.snapHead}>
        <h2 id="snap-h" className="type-h2">
          Right now: {token.symbol}
        </h2>
        <MarketBadge />
      </div>
      <div className={styles.snapGrid}>
        <div className={styles.snapCol}>
          <LiquidityPanel token={token} />
          <MarketNotice />
          <p>
            <Link href={`/s/${token.symbol}`}>Open {token.symbol}</Link>
          </p>
        </div>
        <RightsPanel issuer={issuer} heading />
      </div>
    </section>
  );
}

export function Pillars() {
  const items = [
    { title: "Know what you hold", body: "A plain label for each token: a claim on the issuer, a note, or a share vehicle. With sources and the date we checked them." },
    { title: "See the depth", body: "Live quotes at $100, $1,000, and $10,000 show how far a trade moves the price, before you try it." },
    { title: "See the full cost", body: "Network fee, our fee, route, and the least you will receive, all listed before your wallet asks for a signature." },
  ];
  return (
    <ul role="list" className={styles.pillars}>
      {items.map((i) => (
        <li key={i.title}>
          <Panel tone="quiet" className={styles.pillar}>
            <h3 className="type-h3">{i.title}</h3>
            <p className="muted">{i.body}</p>
          </Panel>
        </li>
      ))}
    </ul>
  );
}
