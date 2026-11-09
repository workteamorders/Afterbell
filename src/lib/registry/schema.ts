import { z } from "zod";

/** Alamat Solana dalam base58: 32 sampai 44 karakter. Keberadaan on-chain diperiksa oleh `pnpm registry:check`. */
export const solanaAddress = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Not a base58 Solana address");

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const httpsUrl = z.url({ protocol: /^https$/ });

const source = z.object({ label: z.string().min(1), url: httpsUrl }).strict();

export const STRUCTURES = ["debt-tracker-certificate", "structured-note", "spv-claim", "synthetic-spv", "debt-security"] as const;

/** Entri tanpa sumber dan tanggal periksa tidak boleh masuk. */
export const issuerSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().min(1),
    legalEntity: z.string().min(1),
    structure: z.enum(STRUCTURES),
    rightsLabel: z.string().min(1),
    rightsSummary: z.string().min(20),
    redemptionPath: z.string().min(1),
    regionRestrictions: z.string().min(1),
    restrictsUsPersons: z.boolean(),
    sources: z.array(source).min(1),
    lastChecked: isoDate,
  })
  .strict();

export const tokenSchema = z
  .object({
    symbol: z.string().min(1).max(12),
    name: z.string().min(1),
    underlying: z.string().min(1),
    mint: solanaAddress,
    tokenProgram: z.enum(["token", "token-2022"]),
    decimals: z.number().int().min(0).max(18),
    issuer: z.string(),
    mintSource: source,
    lastChecked: isoDate,
  })
  .strict();

export const issuersSchema = z.array(issuerSchema).superRefine((rows, ctx) => {
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    if (seen.has(r.id)) ctx.addIssue({ code: "custom", path: [i, "id"], message: `Duplicate issuer id ${r.id}` });
    seen.add(r.id);
  });
});

export const tokensSchema = z.array(tokenSchema).superRefine((rows, ctx) => {
  const syms = new Set<string>();
  const mints = new Set<string>();
  rows.forEach((r, i) => {
    if (syms.has(r.symbol.toLowerCase())) ctx.addIssue({ code: "custom", path: [i, "symbol"], message: `Duplicate symbol ${r.symbol}` });
    if (mints.has(r.mint)) ctx.addIssue({ code: "custom", path: [i, "mint"], message: `Duplicate mint ${r.mint}` });
    syms.add(r.symbol.toLowerCase());
    mints.add(r.mint);
  });
});

export type Issuer = z.infer<typeof issuerSchema>;
export type Token = z.infer<typeof tokenSchema>;

/** Validasi silang: setiap token merujuk penerbit yang ada. */
export function validateRegistry(issuersRaw: unknown, tokensRaw: unknown): { issuers: Issuer[]; tokens: Token[] } {
  const issuers = issuersSchema.parse(issuersRaw);
  const tokens = tokensSchema.parse(tokensRaw);
  const ids = new Set(issuers.map((i) => i.id));
  for (const t of tokens) {
    if (!ids.has(t.issuer)) throw new Error(`Token ${t.symbol} refers to unknown issuer "${t.issuer}"`);
  }
  return { issuers, tokens };
}
