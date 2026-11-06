import localFont from "next/font/local";

/**
 * Font self-host, sudah di-subset ke Latin dasar dan rentang sumbu yang dipakai:
 * - Archivo: wght 400-700, wdth 75-125 (normal) dan wght 400-500 (italic untuk anotasi).
 * - Red Hat Mono: wght 300-700, untuk angka, alamat, dan hash.
 * adjustFontFallback membuat fallback ber-size-adjust agar layout tidak melompat saat font masuk.
 */
export const archivo = localFont({
  src: [
    { path: "../fonts/archivo-var.woff2", style: "normal", weight: "400 700" },
    { path: "../fonts/archivo-italic.woff2", style: "italic", weight: "400 500" },
  ],
  variable: "--font-archivo",
  display: "swap",
  adjustFontFallback: "Arial",
  declarations: [{ prop: "font-stretch", value: "75% 125%" }],
});

export const redHatMono = localFont({
  src: [{ path: "../fonts/red-hat-mono.woff2", style: "normal", weight: "300 700" }],
  variable: "--font-red-hat-mono",
  display: "swap",
  adjustFontFallback: "Arial",
});
