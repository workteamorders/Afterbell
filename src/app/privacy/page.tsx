import type { Metadata } from "next";
import { DocPage, type DocSection } from "@/components/page/DocPage";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What data Afterbell handles, what stays in your browser, and which third parties see requests. Draft awaiting legal review.",
  alternates: { canonical: "/privacy" },
};

const sections: DocSection[] = [
  {
    id: "browser",
    title: "What stays in your browser",
    body: (
      <ul>
        <li>Your theme, slippage setting, last Solana and Ethereum wallet names, and the fact that you read the risk notice are saved in local storage.</li>
        <li>Your swap history for this visit is kept in session storage and disappears when you close the tab.</li>
        <li>There are no accounts and no sign-up.</li>
      </ul>
    ),
  },
  {
    id: "requests",
    title: "What leaves your browser",
    body: (
      <ul>
        <li>
          <strong>Afterbell&apos;s relay</strong> (<code>/api/rpc</code>) receives Solana and Ethereum requests, such as balance lookups, price quotes from Uniswap&apos;s on-chain quoter, and transaction simulations, and passes them to an RPC provider. It also reads your country from the network edge to decide whether buying and selling are on. It does not store your address or country.
        </li>
        <li>
          <strong>Jupiter</strong> receives quote and swap requests, including your wallet address when you review a swap.
        </li>
        <li>
          <strong>Your wallet</strong> handles signing. Afterbell never receives your keys.
        </li>
        <li>The hosting provider may keep standard server logs.</li>
      </ul>
    ),
  },
  {
    id: "none",
    title: "What Afterbell does not do",
    body: (
      <ul>
        <li>No advertising trackers and no cross-site profiles.</li>
        <li>No sale of data.</li>
        <li>No collection of seed phrases or private keys. Anyone who asks for them is not Afterbell.</li>
      </ul>
    ),
  },
  {
    id: "public",
    title: "Blockchain data is public",
    body: <p>Transactions on Solana and Ethereum are public and permanent. Anyone can see them with your wallet address.</p>,
  },
];

export default function PrivacyPage() {
  return <DocPage eyebrow="Legal" title="Privacy" lead="What Afterbell handles, and what it does not." draft sections={sections} />;
}
