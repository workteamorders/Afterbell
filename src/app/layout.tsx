import type { Metadata, Viewport } from "next";
import { archivo, redHatMono } from "./fonts";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Footer } from "@/components/layout/Footer";
import { GlobalNotices } from "@/components/layout/GlobalNotices";
import { AppProviders } from "@/components/providers/AppProviders";
import { WalletButton } from "@/components/wallet/WalletButton";
import { CONFIG } from "@/lib/config";
import "@/styles/tokens.css";
import "@/styles/base.css";
import { LiveBackground } from "@/components/brand/LiveBackground";

export const metadata: Metadata = {
  metadataBase: new URL(CONFIG.siteUrl),
  title: { default: "Afterbell", template: "%s · Afterbell" },
  description:
    "Buy, sell, and understand tokenized US stocks on Solana and Ethereum, and Stock Tokens on Robinhood Chain. See what you hold, how deep the liquidity is, whether the US market is open, and the full cost before you sign.",
  applicationName: "Afterbell",
  openGraph: { siteName: "Afterbell", type: "website", images: [{ url: "/og.png", width: 1200, height: 630, alt: "Afterbell: tokenized US stocks on Solana" }] },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f8f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1517" },
  ],
};

/**
 * Menerapkan tema tersimpan sebelum cat pertama agar tidak berkedip.
 * Dibungkus try/catch: tanpa localStorage, aplikasi mengikuti tema sistem.
 */
const THEME_BOOT = `try{var t=localStorage.getItem("ab-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${redHatMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        <LiveBackground />
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <AppProviders>
          <SiteHeader walletSlot={<WalletButton />} />
          <GlobalNotices />
          <main id="main" tabIndex={-1}>
            {children}
          </main>
          <Footer />
        </AppProviders>
      </body>
    </html>
  );
}
