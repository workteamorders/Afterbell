import Link from "next/link";
import { EvmLiquidityPanel } from "@/components/evm/EvmLiquidityPanel";
import { EvmSwapPanel } from "@/components/evm/EvmSwapPanel";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import { CopyText } from "@/components/token/CopyText";
import { MarketBadge, MarketNotice } from "@/components/token/MarketNotice";
import { PremiumNotice } from "@/components/token/PremiumNotice";
import { RightsPanel } from "@/components/token/RightsPanel";
import styles from "@/components/token/TokenView.module.css";
import { getEvmChain } from "@/lib/evm/chains";
import { notFound } from "next/navigation";
import { getToken, type EvmToken, type Issuer } from "@/lib/registry";


export function EvmTokenView({ token, issuer }: { token: EvmToken; issuer: Issuer }) {
  const chain = getEvmChain(token.chain);
  if (!chain) notFound();
  const onSolana = getToken(token.symbol);
  return (
    <div className={`container ${styles.page}`}>
      <header className={styles.header}>
        <div className={styles.badges}>
          <Badge tone="neutral">{issuer.name}</Badge>
          <Badge tone="neutral">{chain.name}</Badge>
          <MarketBadge />
        </div>
        <h1 className="type-h1">
          {token.symbol} <span className="muted">{token.name}</span>
        </h1>
        <p className="type-body muted">
          Tokenized exposure to {token.underlying} on {chain.name}. See what you hold, how deep the liquidity is, and the full cost before you sign.
          {onSolana ? (
            <>
              {" "}
              Also on <Link href={`/s/${onSolana.symbol}`}>Solana</Link>.
            </>
          ) : null}
        </p>
      </header>

      <div className={styles.grid}>
        <div className={styles.swap}>
          <EvmSwapPanel chain={chain} token={token} issuer={issuer} />
        </div>
        <div className={styles.info}>
          <section aria-labelledby="depth-h" className={styles.block}>
            <h2 id="depth-h" className="type-h2">
              Liquidity depth
            </h2>
            <EvmLiquidityPanel chain={chain} token={token} />
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
                <dt className="type-label">Contract address</dt>
                <dd>
                  <CopyText value={token.address} label={`${token.symbol} contract address`} />
                </dd>
              </div>
              <div>
                <dt className="type-label">Network</dt>
                <dd>
                  {chain.name} (chain ID {chain.chainId})
                </dd>
              </div>
              <div>
                <dt className="type-label">Decimals</dt>
                <dd>Read from the contract when you open this page</dd>
              </div>
              <div>
                <dt className="type-label">Contract address source</dt>
                <dd>
                  <a href={token.addressSource.url} target="_blank" rel="noopener noreferrer">
                    {token.addressSource.label}
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
