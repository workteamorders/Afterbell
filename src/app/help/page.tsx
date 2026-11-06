import type { Metadata } from "next";
import Link from "next/link";
import { DocPage, type DocSection } from "@/components/page/DocPage";

export const metadata: Metadata = {
  title: "Help",
  description: "Answers to common questions about connecting a wallet, buying and selling tokenized stocks on Solana and Ethereum, fees, missing balances, and failed swaps.",
  alternates: { canonical: "/help" },
};

const sections: DocSection[] = [
  {
    id: "start",
    title: "Getting started",
    body: (
      <>
        <ol>
          <li>Install a Solana wallet that supports Wallet Standard, such as Phantom, Backpack, or Solflare.</li>
          <li>Hold USDC and a little SOL for network fees in that wallet.</li>
          <li>
            Pick a token on <Link href="/explore">Explore</Link>, read what you hold and how deep the liquidity is, then choose Buy.
          </li>
          <li>Check the review screen. Approve in your wallet only if the numbers look right.</li>
        </ol>
      </>
    ),
  },
  {
    id: "wallet",
    title: "My wallet does not appear",
    body: (
      <>
        <p>Afterbell lists wallets that the browser announces through Wallet Standard. If yours is missing:</p>
        <ul>
          <li>Make sure the wallet extension is installed and unlocked, then reload the page.</li>
          <li>Use a desktop browser with the extension, or open Afterbell inside your wallet&apos;s own browser on mobile.</li>
          <li>Check that the wallet is set to Solana mainnet.</li>
        </ul>
      </>
    ),
  },
  {
    id: "balances",
    title: "A balance is missing or looks wrong",
    body: (
      <>
        <p>
          Afterbell reads the standard token account for each token in its registry. Tokens held in a different account, or tokens that are not in the registry, are not shown. Your wallet may show more than Afterbell does.
        </p>
        <p>
          Some tokens use a multiplier so one token tracks a share after events such as splits. Afterbell applies the active multiplier to the amount it shows, so the figure can differ from the raw on-chain number.
        </p>
      </>
    ),
  },
  {
    id: "viewonly",
    title: "Why are Buy and Sell missing?",
    body: (
      <>
        <p>
          Buying and selling are switched off in some regions, and whenever Afterbell cannot tell where you are. This is deliberate: it fails closed. You can still read every page, see liquidity, and review your portfolio.
        </p>
        <p>Using a VPN to get around this is not allowed under the draft <Link href="/terms">terms</Link>.</p>
      </>
    ),
  },
  {
    id: "failed",
    title: "A swap failed or I am not sure it went through",
    body: (
      <>
        <ul>
          <li>If the pre-check failed, nothing was sent and your funds did not move. Get a fresh quote and try again.</li>
          <li>If you declined in your wallet, nothing was sent.</li>
          <li>If Afterbell lost contact with Jupiter while sending, the result is unknown. Open the explorer link on the screen, or check your wallet history, before you repeat the swap.</li>
          <li>On Ethereum, a transaction that was sent but not yet confirmed can still go through. Wait and check the explorer before repeating it. A swap that reverts still costs the network fee.</li>
          <li>A swap that did not land does not move your tokens.</li>
        </ul>
      </>
    ),
  },
  {
    id: "cost",
    title: "What does a swap cost?",
    body: (
      <p>
        The review screen shows the network fee, the Afterbell fee, any Jupiter platform fee, price impact, and the minimum you receive. See <Link href="/methodology#fees">Methodology</Link> for how each is worked out.
      </p>
    ),
  },
  {
    id: "ethereum",
    title: "Why did my Ethereum swap ask for two approvals?",
    body: (
      <>
        <ul>
          <li>The first request lets Uniswap move the exact amount you are swapping. The second is the swap itself. If you already allowed enough earlier, only the swap is asked.</li>
          <li>Both cost a network fee in ETH. A wallet with no ETH cannot send either.</li>
          <li>If the swap says no pool can fill your amount, try a smaller amount. Pools for some tokens on Ethereum are small.</li>
          <li>You can cancel an unused approval from your wallet or a token-approval tool.</li>
        </ul>
      </>
    ),
  },
  {
    id: "closed",
    title: "The US market is closed. Can I still trade?",
    body: (
      <p>
        The tokens trade on Solana at any hour. When the US market is closed there is no live stock price, so the token price follows on-chain demand and liquidity can be thinner. The depth meter shows the current state.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Still stuck?",
    body: (
      <p>
        Contact details are listed in the footer once they are published. Never share your seed phrase or private key with anyone, including anyone who says they are from Afterbell. We will never ask for them.
      </p>
    ),
  },
];

export default function HelpPage() {
  return <DocPage eyebrow="Help" title="Questions, answered plainly" lead="Short answers for connecting, trading, and checking what happened." sections={sections} />;
}
