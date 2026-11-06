"use client";

import { useState } from "react";
import { Badge, Chip } from "@/components/ui/Badge";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { CheckboxField, RadioField, SelectField, SliderField, SwitchField, TextField } from "@/components/ui/Field";
import { LiquidityMeter } from "@/components/ui/LiquidityMeter";
import { Panel, PanelLink } from "@/components/ui/Panel";
import { Skeleton, SkeletonRow } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState, Notice } from "@/components/ui/StateBlock";
import { Tabs } from "@/components/ui/Tabs";
import { ToastCard, useToast } from "@/components/ui/Toast";
import { InfoTip } from "@/components/ui/Tooltip";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Group, Row, Section, Specimen } from "./Section";
import styles from "./Styleguide.module.css";

const VARIANTS: readonly ButtonVariant[] = ["primary", "secondary", "ghost", "danger"];

export function ButtonSection() {
  return (
    <Section
      id="buttons"
      title="Buttons"
      intro="One primary action per screen. Every state is drawn, and every target is at least 44px tall."
    >
      <Group title="Variant by state" note="Hover and pressed are forced here so they can be seen. Focus is the keyboard ring.">
        {VARIANTS.map((v) => (
          <Row key={v}>
            <Specimen caption={`${v} · default`}>
              <Button variant={v}>Continue</Button>
            </Specimen>
            <Specimen caption="hover">
              <Button variant={v} forceState="hover">
                Continue
              </Button>
            </Specimen>
            <Specimen caption="pressed">
              <Button variant={v} forceState="active">
                Continue
              </Button>
            </Specimen>
            <Specimen caption="focus">
              <Button variant={v} forceState="focus">
                Continue
              </Button>
            </Specimen>
            <Specimen caption="disabled">
              <Button variant={v} disabled>
                Continue
              </Button>
            </Specimen>
            <Specimen caption="loading (same width)">
              <Button variant={v} loading>
                Continue
              </Button>
            </Specimen>
          </Row>
        ))}
      </Group>
      <Group title="Sizes and icons">
        <Row>
          <Specimen caption="sm">
            <Button size="sm">Small</Button>
          </Specimen>
          <Specimen caption="md">
            <Button size="md">Medium</Button>
          </Specimen>
          <Specimen caption="lg">
            <Button size="lg">Large</Button>
          </Specimen>
          <Specimen caption="icon start">
            <Button variant="secondary" icon="wallet">
              Connect wallet
            </Button>
          </Specimen>
          <Specimen caption="icon end">
            <Button variant="secondary" icon="arrow-right" iconPosition="end">
              Review swap
            </Button>
          </Specimen>
          <Specimen caption="icon only, labelled">
            <Button variant="secondary" iconOnly icon="copy">
              Copy address
            </Button>
          </Specimen>
          <Specimen caption="link as button">
            <Button variant="ghost" href="#colour">
              Jump to colour
            </Button>
          </Specimen>
        </Row>
      </Group>
    </Section>
  );
}

export function FormSection() {
  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState<string | undefined>();
  const [slippage, setSlippage] = useState(0.5);
  const [check, setCheck] = useState(true);
  const [radio, setRadio] = useState("a");
  const [sw, setSw] = useState(false);
  const balance = 250;

  const validate = (raw: string) => {
    const n = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(n) || n <= 0 || n > balance) {
      setAmountError("Amount must be more than 0 and no more than your balance");
    } else {
      setAmountError(undefined);
    }
  };

  return (
    <Section
      id="forms"
      title="Forms"
      intro="Labels sit above fields. Errors validate on blur and say what to change. Every state is visible."
    >
      <Group title="Text field by state">
        <div className={styles.cols}>
          <TextField label="Default" placeholder="0.00" suffix="USDC" help="Help text sits under the field." />
          <TextField label="Hover" placeholder="0.00" suffix="USDC" forceState="hover" />
          <TextField label="Focus" placeholder="0.00" suffix="USDC" forceState="focus" />
          <TextField label="Filled" defaultValue="125.50" suffix="USDC" />
          <TextField label="Error" defaultValue="0" suffix="USDC" error="Amount must be more than 0 and no more than your balance" />
          <TextField label="Success" defaultValue="125.50" suffix="USDC" success="Amount is within your balance" />
          <TextField label="Disabled" defaultValue="125.50" suffix="USDC" disabled />
          <TextField label="Optional, with counter" optional maxLength={40} placeholder="Note" />
        </div>
      </Group>
      <Group title="Live validation" note="Type an amount, then leave the field. Balance is 250 (example).">
        <div className={styles.stack}>
          <TextField
            label="Amount to sell"
            inputMode="decimal"
            placeholder="0.00"
            suffix="USDC"
            value={amount}
            error={amountError}
            help={amountError ? undefined : "Example balance: 250 USDC"}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={(e) => validate(e.target.value)}
          />
        </div>
      </Group>
      <Group title="Select, choices, slider">
        <div className={styles.cols}>
          <SelectField
            label="Sort by"
            options={[
              { value: "liq", label: "Liquidity" },
              { value: "name", label: "Name" },
              { value: "chg", label: "24h change" },
            ]}
          />
          <SelectField label="Select with error" error="Choose an option" defaultValue="" options={[{ value: "", label: "Choose…" }, { value: "a", label: "Option A" }]} />
          <CheckboxField label="I understand the risks" help="Required before the first swap." checked={check} onChange={(e) => setCheck(e.target.checked)} />
          <CheckboxField label="Checkbox, focus" forceState="focus" defaultChecked />
          <CheckboxField label="Checkbox, disabled" disabled />
          <div role="radiogroup" aria-label="Route preference" className={styles.stack}>
            <RadioField label="Best price" name="route" value="a" checked={radio === "a"} onChange={() => setRadio("a")} />
            <RadioField label="Fewest hops" name="route" value="b" checked={radio === "b"} onChange={() => setRadio("b")} />
            <RadioField label="Disabled" name="route" value="c" disabled />
          </div>
          <SwitchField label="Show amounts in USD" checked={sw} onChange={(e) => setSw(e.target.checked)} />
          <SwitchField label="Switch, disabled" disabled />
          <SliderField
            label="Slippage tolerance"
            min={0.1}
            max={3}
            step={0.1}
            value={slippage}
            format={(n) => `${n.toFixed(1)}%`}
            onValueChange={setSlippage}
            help="Higher tolerance lets a trade succeed at a worse price."
          />
        </div>
      </Group>
    </Section>
  );
}

export function SurfaceSection() {
  const [chip, setChip] = useState(true);
  return (
    <Section id="surfaces" title="Panels, badges, tabs, header" intro="Containers separate by tint and a hairline. Only linked panels respond to hover.">
      <Group title="Panels">
        <div className={styles.cols}>
          <Panel>
            <h4 className="type-h3">Raised panel</h4>
            <p className="type-small muted">Static. Does nothing on hover.</p>
          </Panel>
          <Panel tone="quiet">
            <h4 className="type-h3">Quiet panel</h4>
            <p className="type-small muted">Flat, hairline only.</p>
          </Panel>
          <PanelLink href="#colour" title="Linked panel">
            <p className="type-small muted">One target, one link.</p>
          </PanelLink>
          <PanelLink href="#colour" title="Linked panel, hover" forceState="hover">
            <p className="type-small muted">Forced hover state.</p>
          </PanelLink>
        </div>
      </Group>
      <Group title="Badges" note="Meaning comes from icon and word. There is no verified or safe badge by design.">
        <Row>
          <Badge>Neutral</Badge>
          <Badge tone="success">Deep liquidity</Badge>
          <Badge tone="warning">Market closed</Badge>
          <Badge tone="danger">Thin liquidity</Badge>
          <Badge tone="info">Token-2022</Badge>
          <Badge tone="info" icon="lock">
            Non-custodial
          </Badge>
        </Row>
      </Group>
      <Group title="Chips">
        <Row>
          <Chip pressed={chip} onPressedChange={setChip}>
            Deep only
          </Chip>
          <Chip pressed={false} onPressedChange={() => undefined}>
            Off
          </Chip>
          <Chip pressed={false} onPressedChange={() => undefined} forceState="hover">
            Hover
          </Chip>
          <Chip pressed={false} onPressedChange={() => undefined} disabled>
            Disabled
          </Chip>
        </Row>
      </Group>
      <Group title="Tabs" note="Left and right arrows, Home and End move between tabs.">
        <Tabs
          label="Token details"
          items={[
            { id: "overview", label: "Overview", content: <p className="type-body">Example overview content for a token page.</p> },
            { id: "rights", label: "Holder rights", content: <p className="type-body">Example text about what the token does and does not give.</p> },
            { id: "docs", label: "Documents", content: <p className="type-body">Example list of issuer documents.</p> },
          ]}
        />
      </Group>
      <Group title="Header" note="Active item shows aria-current and an underline. Shown here as a static copy.">
        <div className={styles.demoHeader}>
          <SiteHeader
            currentOverride="/explore"
            walletSlot={
              <Button size="sm" variant="primary" icon="wallet">
                Connect wallet
              </Button>
            }
          />
        </div>
      </Group>
    </Section>
  );
}

export function OverlaySection() {
  const [dialog, setDialog] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const toast = useToast();
  return (
    <Section id="overlays" title="Dialogs, toasts, hints" intro="Floating layers are the only places a shadow appears. All trap focus, close with Esc, and return focus.">
      <Group title="Dialog and drawer" note="On phones the dialog becomes a bottom sheet.">
        <Row>
          <Button variant="secondary" onClick={() => setDialog(true)}>
            Open dialog
          </Button>
          <Button variant="secondary" onClick={() => setDrawer(true)}>
            Open drawer
          </Button>
        </Row>
        <Dialog
          open={dialog}
          onClose={() => setDialog(false)}
          title="Disconnect wallet?"
          description="Afterbell never holds your keys. Disconnecting only ends this browser session."
          actions={
            <>
              <Button variant="ghost" onClick={() => setDialog(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => setDialog(false)}>
                Disconnect
              </Button>
            </>
          }
        />
        <Dialog
          open={drawer}
          onClose={() => setDrawer(false)}
          variant="drawer"
          title="Swap settings"
          description="Example drawer content."
          actions={
            <Button variant="primary" onClick={() => setDrawer(false)}>
              Done
            </Button>
          }
        >
          <p className="type-body">Drawers hold secondary settings without leaving the page.</p>
        </Dialog>
      </Group>
      <Group title="Toast" note="Five seconds, pauses on hover or focus, announced to screen readers.">
        <Row>
          <Button size="sm" variant="secondary" onClick={() => toast.push({ title: "Address copied", tone: "neutral" })}>
            Neutral
          </Button>
          <Button size="sm" variant="secondary" onClick={() => toast.push({ title: "Swap confirmed", body: "Example transaction", tone: "success" })}>
            Success
          </Button>
          <Button size="sm" variant="secondary" onClick={() => toast.push({ title: "Quote is stale", body: "Refresh to continue.", tone: "warning" })}>
            Warning
          </Button>
          <Button size="sm" variant="secondary" onClick={() => toast.push({ title: "Swap failed", body: "Nothing was sent.", tone: "danger" })}>
            Error
          </Button>
        </Row>
        <div className={styles.toastStatic}>
          <ToastCard title="Address copied" tone="neutral" />
          <ToastCard title="Swap confirmed" body="Example transaction" tone="success" onClose={() => undefined} />
          <ToastCard title="Quote is stale" body="Refresh to continue." tone="warning" />
          <ToastCard title="Swap failed" body="Nothing was sent." tone="danger" />
        </div>
      </Group>
      <Group title="Hint">
        <div className={styles.tipRow}>
          <span>Price impact</span>
          <InfoTip label="About price impact">How much your own trade moves the price. Larger orders usually move it more.</InfoTip>
          <span className="muted">Open by default:</span>
          <InfoTip label="About slippage" forceOpen>
            The most the price may move against you before the swap is cancelled.
          </InfoTip>
        </div>
      </Group>
    </Section>
  );
}

interface ExampleRow {
  symbol: string;
  name: string;
  liquidity: "Deep" | "Medium" | "Thin";
  price: number;
  change: number;
}

const ROWS: readonly ExampleRow[] = [
  { symbol: "EXAMPLE-A", name: "Example token A", liquidity: "Deep", price: 182.4, change: 1.2 },
  { symbol: "EXAMPLE-B", name: "Example token B", liquidity: "Medium", price: 41.05, change: -0.8 },
  { symbol: "EXAMPLE-C", name: "Example token C", liquidity: "Thin", price: 905.6, change: 0.1 },
  { symbol: "EXAMPLE-D", name: "Example token D", liquidity: "Deep", price: 12.77, change: -2.4 },
];

const COLUMNS: ReadonlyArray<Column<ExampleRow>> = [
  {
    key: "name",
    header: "Token",
    sortValue: (r) => r.name,
    cell: (r) => (
      <span>
        <strong>{r.symbol}</strong> <span className="muted">{r.name}</span>
      </span>
    ),
  },
  {
    key: "liq",
    header: "Liquidity",
    sortValue: (r) => r.liquidity,
    cell: (r) => <Badge tone={r.liquidity === "Deep" ? "success" : r.liquidity === "Medium" ? "warning" : "danger"}>{r.liquidity}</Badge>,
  },
  { key: "price", header: "Price (USD)", numeric: true, sortValue: (r) => r.price, cell: (r) => r.price.toFixed(2) },
  { key: "chg", header: "24h", numeric: true, sortValue: (r) => r.change, cell: (r) => `${r.change > 0 ? "+" : ""}${r.change.toFixed(1)}%` },
];

export function DataSection() {
  return (
    <Section id="data" title="Data and states" intro="All sample data on this page is marked as an example.">
      <Group title="Table" note="Click a header to sort. Below 48rem each row becomes a card.">
        <DataTable caption="Example tokens (sample data)" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.symbol} initialSort={{ key: "liq", dir: "asc" }} />
      </Group>
      <Group title="Liquidity meter" note="Ready, loading, unavailable. Depth is measured by effective price at three order sizes.">
        <div className={styles.cols}>
          <LiquidityMeter
            level="deep"
            route="JupiterZ RFQ"
            source="Jupiter quote, example data"
            sample
            points={[
              { notionalUsd: 100, impactPct: 0.02 },
              { notionalUsd: 1000, impactPct: 0.05 },
              { notionalUsd: 10000, impactPct: 0.18 },
            ]}
          />
          <LiquidityMeter
            level="thin"
            route="Orca Whirlpool"
            source="Jupiter quote, example data"
            sample
            points={[
              { notionalUsd: 100, impactPct: 0.4 },
              { notionalUsd: 1000, impactPct: 2.8 },
              { notionalUsd: 10000, impactPct: 14.2 },
            ]}
          />
          <LiquidityMeter state="loading" />
          <LiquidityMeter state="unavailable" retry={<Button size="sm" variant="secondary" icon="refresh">Try again</Button>} />
        </div>
      </Group>
      <Group title="Skeleton">
        <div className={styles.fill} aria-busy="true" style={{ maxWidth: "22rem" }}>
          <Skeleton shape="title" />
          <Skeleton shape="line" />
          <Skeleton shape="block" />
          <SkeletonRow cols={4} />
        </div>
      </Group>
      <Group title="Empty, error, notice">
        <div className={styles.cols}>
          <EmptyState title="No tokens held yet" action={<Button variant="primary" href="/explore">Explore tokens</Button>}>
            When you hold a supported token, it appears here. Reading your balances never needs a signature.
          </EmptyState>
          <ErrorState
            title="Could not load a quote"
            what="The quote service did not answer in time."
            safety="Nothing was sent from your wallet."
            next="Try again in a moment, or choose a smaller amount."
            actions={
              <Button variant="secondary" icon="refresh">
                Try again
              </Button>
            }
          />
        </div>
        <div className={styles.fill}>
          <Notice tone="warning" icon="clock" title="US market is closed">
            Prices from the issuer follow the stock market. Quotes may be wider until it opens.
          </Notice>
          <Notice tone="info" title="Information">
            Neutral informational notice.
          </Notice>
          <Notice tone="danger" title="Region not supported">
            Swaps are not available in your region.
          </Notice>
          <Notice tone="success" title="Simulation passed">
            The transaction simulated without errors. This does not guarantee the outcome.
          </Notice>
        </div>
      </Group>
    </Section>
  );
}
