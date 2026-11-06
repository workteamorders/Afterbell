import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import { MarketBadge, MarketNotice } from "./MarketNotice";
import { LiquidityPanel } from "./LiquidityPanel";
import { PremiumNotice } from "./PremiumNotice";
import { RightsPanel } from "./RightsPanel";
import { CopyText } from "./CopyText";
import { SwapPanel } from "@/components/swap/SwapPanel";
import Link from "next/link";
import { getEvmToken, type Issuer, type Token } from "@/lib/registry";
import styles from "./TokenView.module.css";

export function TokenView({ token, issuer }: { token: Token; issuer: Issuer }) {
  const onEthereum = getEvmToken(token.symbol);
  return (
    <div className={`container ${styles.page}`}>
      <header className={styles.header}>
        <div className={styles.badges}>
          <Badge tone="neutral">{issuer.name}</Badge>
          <MarketBadge />
        </div>
        <h1 className="type-h1">
          {token.symbol} <span className="muted">{token.name}</span>
        </h1>
        <p className="type-body muted">Tokenized exposure to {token.underlying}. See what you hold, how deep the liquidity is, and the full cost before you sign.
          {onEthereum ? (
            <>
              {" "}
              Also on <Link href={`/e/${onEthereum.symbol}`}>Ethereum</Link>.
            </>
          ) : null}
        </p>
      </header>

      <div className={styles.grid}>
        <div className={styles.swap}>
          <SwapPanel token={token} issuer={issuer} />
        </div>
        <div className={styles.info}>
          <section aria-labelledby="depth-h" className={styles.block}>
            <h2 id="depth-h" className="type-h2">
              Liquidity depth
            </h2>
            <LiquidityPanel token={token} />
          </section>
          <MarketNotice />
          <PremiumNotice />
          <RightsPanel issuer={issuer} />
          <Panel as="section" aria-labelledby="details-h" tone="quiet" className={styles.details}>
            <h2 id="details-h" className="type-label">
              Token details
            </h2>
            <dl className={styles.facts}>
              <div>
                <dt className="type-label">Mint address</dt>
                <dd>
                  <CopyText value={token.mint} label={`${token.symbol} mint address`} />
                </dd>
              </div>
              <div>
                <dt className="type-label">Token program</dt>
                <dd>{token.tokenProgram === "token-2022" ? "Token-2022" : "SPL Token"}</dd>
              </div>
              <div>
                <dt className="type-label">Decimals</dt>
                <dd>{token.decimals}</dd>
              </div>
              <div>
                <dt className="type-label">Mint address source</dt>
                <dd>
                  <a href={token.mintSource.url} target="_blank" rel="noopener noreferrer">
                    {token.mintSource.label}
                  </a>
                  , checked {token.lastChecked}
                </dd>
              </div>
            </dl>
          </Panel>
        </div>
      </div>
    </div>
  );
}
