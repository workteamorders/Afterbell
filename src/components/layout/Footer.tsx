import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { CopyText } from "@/components/token/CopyText";
import { BELL_TOKEN, bellTokenExplorerUrl } from "@/lib/bell-token";
import styles from "./Footer.module.css";

const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
const BELL_EXPLORER = bellTokenExplorerUrl();

const COLUMNS: ReadonlyArray<{ title: string; links: ReadonlyArray<{ href: string; label: string }> }> = [
  {
    title: "Product",
    links: [
      { href: "/explore", label: "Explore" },
      { href: "/portfolio", label: "Portfolio" },
      { href: "/methodology", label: "Methodology" },
      { href: "/help", label: "Help" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/risk", label: "Risk" },
      { href: "/terms", label: "Terms" },
      { href: "/privacy", label: "Privacy" },
    ],
  },
];

/** Footer: navigasi sekunder, hukum, risiko, privasi, kontak, atribusi Jupiter (lisensi §8.4), dan alamat kontrak BELL (D-070). */
export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.grid}`}>
        <div className={styles.about}>
          <Logo />
          <p className="type-small muted">
            Afterbell is non-custodial. Your wallet signs every transaction and Afterbell never holds your keys or funds. Nothing here is investment advice.
          </p>
          <p className="type-small muted">
            Solana swaps are routed by <a href="https://jup.ag" rel="noopener noreferrer">Jupiter</a>. Ethereum swaps go through Uniswap v3 and Robinhood Chain swaps through Uniswap v4. Powered by Jupiter.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title} className={styles.col}>
            <h2 className="type-label">{col.title}</h2>
            <ul role="list" className={styles.list}>
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={styles.link}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
        <div className={styles.col}>
          <h2 className="type-label">Contact</h2>
          {CONTACT ? (
            <a className={styles.link} href={`mailto:${CONTACT}`}>
              {CONTACT}
            </a>
          ) : (
            <p className="type-small muted">Contact details are added before public launch.</p>
          )}
        </div>
      </div>
      <div className={`container ${styles.token}`}>
        <h2 className="type-label">BELL token</h2>
        <p className={`type-small ${styles.tokenLine}`}>
          {BELL_TOKEN.name} ({BELL_TOKEN.symbol}) on Robinhood Chain. Contract address:{" "}
          <CopyText value={BELL_TOKEN.address} label={`${BELL_TOKEN.symbol} contract address`} />
          {BELL_EXPLORER ? (
            <>
              {" "}
              <a href={BELL_EXPLORER} rel="noopener noreferrer" target="_blank">
                View on the explorer
              </a>
            </>
          ) : null}
        </p>
        <p className="type-small muted">
          Using Afterbell does not require holding BELL. Compare the contract address with the explorer yourself before you interact with any token. Nothing here is investment advice.
        </p>
      </div>
    </footer>
  );
}
