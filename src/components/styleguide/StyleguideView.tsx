"use client";

import { ButtonSection, DataSection, FormSection, OverlaySection, SurfaceSection } from "./ComponentSections";
import { ColourSection, MotifSection, ShapeSection, TypographySection } from "./TokenSections";
import styles from "./Styleguide.module.css";

const TOC: ReadonlyArray<{ id: string; label: string }> = [
  { id: "colour", label: "Colour" },
  { id: "typography", label: "Typography" },
  { id: "shape", label: "Space and shape" },
  { id: "motif", label: "Identity" },
  { id: "buttons", label: "Buttons" },
  { id: "forms", label: "Forms" },
  { id: "surfaces", label: "Panels and header" },
  { id: "overlays", label: "Overlays" },
  { id: "data", label: "Data and states" },
];

export function StyleguideView() {
  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.hero}>
        <p className="type-label muted">Afterbell · Direction B, Sounding Chart</p>
        <h1 className="type-display">Styleguide</h1>
        <p className="type-body muted">
          Tokens and components in light (chart by day) and dark (chart at night). Use the theme switch in the header. Nothing here is live data.
        </p>
        <nav aria-label="Styleguide sections">
          <ul className={styles.heroLinks}>
            {TOC.map((t) => (
              <li key={t.id} style={{ listStyle: "none" }}>
                <a href={`#${t.id}`}>{t.label}</a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <ColourSection />
      <TypographySection />
      <ShapeSection />
      <MotifSection />
      <ButtonSection />
      <FormSection />
      <SurfaceSection />
      <OverlaySection />
      <DataSection />
    </div>
  );
}
