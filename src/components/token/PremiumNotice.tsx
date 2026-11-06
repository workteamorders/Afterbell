import Link from "next/link";
import { Notice } from "@/components/ui/StateBlock";

/**
 * Premium atau diskon terhadap harga saham dasar: tidak tersedia (D-013).
 * Tidak ada sumber harga saham gratis dengan izin penggunaan yang jelas, dan Afterbell tidak melakukan scraping.
 */
export function PremiumNotice() {
  return (
    <Notice tone="info" icon="info" title="Premium or discount to the stock price: not available">
      Afterbell has no free source of stock prices with clear terms of use, so it does not show how far the token price sits from the stock price. It does not scrape prices.{" "}
      <Link href="/methodology#premium">Why</Link>.
    </Notice>
  );
}
