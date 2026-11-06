import type { Metadata } from "next";
import { StyleguideView } from "@/components/styleguide/StyleguideView";

export const metadata: Metadata = {
  title: "Styleguide",
  description: "Internal reference for Afterbell design tokens and components.",
  robots: { index: false, follow: false },
};

export default function StyleguidePage() {
  return <StyleguideView />;
}
