import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Styleguide",
  description: "Internal reference for Afterbell design tokens and components.",
  robots: { index: false, follow: false },
};

/** Halaman ini berisi data contoh. Hanya dibangun bila NEXT_PUBLIC_STYLEGUIDE=1 (pengembangan dan tangkapan layar); di produksi menjadi 404. */
export default async function StyleguidePage() {
  if (process.env.NEXT_PUBLIC_STYLEGUIDE !== "1") notFound();
  // Impor dinamis supaya kode dan data contoh tidak ikut terkirim di build produksi.
  const { StyleguideView } = await import("@/components/styleguide/StyleguideView");
  return <StyleguideView />;
}
