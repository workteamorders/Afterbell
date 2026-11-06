import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import type { Issuer } from "@/lib/registry";
import styles from "./RightsPanel.module.css";

const STRUCTURE_LABEL: Record<Issuer["structure"], string> = {
  "debt-tracker-certificate": "Debt tracker certificate",
  "structured-note": "Structured note",
  "spv-claim": "Claim on a holding vehicle",
  "synthetic-spv": "Synthetic exposure",
};

/** Hak pemegang menurut penerbit. Selalu menampilkan sumber dan tanggal periksa. Ringkasan editorial, bukan nasihat hukum. */
export function RightsPanel({ issuer, heading = true }: { issuer: Issuer; heading?: boolean }) {
  return (
    <Panel as="section" aria-labelledby={`rights-${issuer.id}`} className={styles.panel}>
      {heading ? (
        <h2 id={`rights-${issuer.id}`} className="type-label">
          What you hold
        </h2>
      ) : (
        <span id={`rights-${issuer.id}`} className="sr-only">
          What you hold
        </span>
      )}
      <p className={`type-h3 ${styles.label}`}>{issuer.rightsLabel}</p>
      <div className={styles.badges}>
        <Badge tone="neutral">{STRUCTURE_LABEL[issuer.structure]}</Badge>
        <Badge tone="neutral">{issuer.name}</Badge>
      </div>
      <p className="type-body">{issuer.rightsSummary}</p>
      <dl className={styles.facts}>
        <div>
          <dt className="type-label">Exit path</dt>
          <dd>{issuer.redemptionPath}</dd>
        </div>
        <div>
          <dt className="type-label">Issuer</dt>
          <dd>{issuer.legalEntity}</dd>
        </div>
      </dl>
      <p className={`type-note ${styles.provenance}`}>
        Source:{" "}
        {issuer.sources.map((s, i) => (
          <span key={s.url}>
            {i > 0 ? ", " : ""}
            <a href={s.url} rel="noopener noreferrer" target="_blank">
              {s.label}
            </a>
          </span>
        ))}
        . Last checked <time dateTime={issuer.lastChecked}>{issuer.lastChecked}</time>. This is an editorial summary, not legal advice.{" "}
        <Link href="/methodology#rights">How labels are made</Link>.
      </p>
    </Panel>
  );
}

/** Pembatasan wilayah menurut penerbit, ditampilkan sebelum aksi. */
export function RestrictionText({ issuer }: { issuer: Issuer }) {
  return (
    <>
      {issuer.regionRestrictions} <span className="muted">(Source: {issuer.name}, checked {issuer.lastChecked}.)</span>
    </>
  );
}
