"use client";

import {
  useId,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/icons/Icon";
import styles from "./Field.module.css";

/** Pembungkus: label selalu terlihat, teks bantu, pesan galat spesifik, pesan sukses. */
interface ShellProps {
  id: string;
  label: string;
  help?: string;
  error?: string;
  success?: string;
  counter?: { count: number; max: number };
  optional?: boolean;
  children: ReactNode;
}

function Shell({ id, label, help, error, success, counter, optional, children }: ShellProps) {
  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <label htmlFor={id} className={styles.label}>
          {label}
          {optional ? <span className={styles.optional}> (optional)</span> : null}
        </label>
        {counter ? (
          <span className={cx(styles.counter, "type-num")} aria-live="off">
            {counter.count}/{counter.max}
          </span>
        ) : null}
      </div>
      {children}
      {help ? (
        <p id={`${id}-help`} className={styles.help}>
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-msg`} className={cx(styles.msg, styles.msgError)} role="alert">
          <Icon name="alert" size={16} />
          <span>{error}</span>
        </p>
      ) : success ? (
        <p id={`${id}-msg`} className={cx(styles.msg, styles.msgSuccess)}>
          <Icon name="check" size={16} />
          <span>{success}</span>
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, help?: string, error?: string, success?: string): string | undefined {
  const ids = [help ? `${id}-help` : null, error || success ? `${id}-msg` : null].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

/* Input teks. `suffix` dipakai untuk simbol token atau satuan. */
interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  help?: string;
  error?: string;
  success?: string;
  suffix?: ReactNode;
  optional?: boolean;
  forceState?: "hover" | "focus";
}

export function TextField({ label, help, error, success, suffix, optional, forceState, className, maxLength, onChange, ...rest }: TextFieldProps) {
  const id = useId();
  const [count, setCount] = useState(String(rest.value ?? rest.defaultValue ?? "").length);
  const handle = (e: ChangeEvent<HTMLInputElement>) => {
    setCount(e.target.value.length);
    onChange?.(e);
  };
  return (
    <Shell
      id={id}
      label={label}
      help={help}
      error={error}
      success={success}
      optional={optional}
      counter={maxLength ? { count, max: maxLength } : undefined}
    >
      <div
        className={cx(styles.control, error && styles.invalid, rest.disabled && styles.disabled, className)}
        data-force={forceState}
      >
        <input
          {...rest}
          id={id}
          className={styles.input}
          maxLength={maxLength}
          onChange={handle}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, help, error, success)}
        />
        {suffix ? <span className={cx(styles.suffix, "type-num")}>{suffix}</span> : null}
      </div>
    </Shell>
  );
}

/* Select native dengan penanda panah dari keluarga ikon yang sama. */
interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  label: string;
  help?: string;
  error?: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}

export function SelectField({ label, help, error, options, className, ...rest }: SelectFieldProps) {
  const id = useId();
  return (
    <Shell id={id} label={label} help={help} error={error}>
      <div className={cx(styles.control, error && styles.invalid, rest.disabled && styles.disabled, className)}>
        <select
          {...rest}
          id={id}
          className={cx(styles.input, styles.select)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, help, error)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Icon name="chevron-down" size={20} className={styles.chevron} />
      </div>
    </Shell>
  );
}

/* Pilihan: checkbox, radio, dan switch memakai input native yang disembunyikan secara visual. */
interface ChoiceProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type" | "children"> {
  label: string;
  help?: string;
  forceState?: "focus";
}

export function CheckboxField({ label, help, forceState, ...rest }: ChoiceProps) {
  const id = useId();
  return (
    <div className={styles.choiceWrap}>
      <label className={styles.choice} htmlFor={id} data-force={forceState}>
        <input {...rest} id={id} type="checkbox" className={styles.native} aria-describedby={help ? `${id}-help` : undefined} />
        <span className={cx(styles.mark, styles.box)} aria-hidden="true">
          <Icon name="check" size={16} strokeWidth={2.25} />
        </span>
        <span>{label}</span>
      </label>
      {help ? (
        <p id={`${id}-help`} className={cx(styles.help, styles.choiceHelp)}>
          {help}
        </p>
      ) : null}
    </div>
  );
}

export function RadioField({ label, help, forceState, ...rest }: ChoiceProps) {
  const id = useId();
  return (
    <div className={styles.choiceWrap}>
      <label className={styles.choice} htmlFor={id} data-force={forceState}>
        <input {...rest} id={id} type="radio" className={styles.native} aria-describedby={help ? `${id}-help` : undefined} />
        <span className={cx(styles.mark, styles.radio)} aria-hidden="true">
          <span className={styles.dot} />
        </span>
        <span>{label}</span>
      </label>
      {help ? (
        <p id={`${id}-help`} className={cx(styles.help, styles.choiceHelp)}>
          {help}
        </p>
      ) : null}
    </div>
  );
}

export function SwitchField({ label, help, forceState, ...rest }: ChoiceProps) {
  const id = useId();
  return (
    <div className={styles.choiceWrap}>
      <label className={cx(styles.choice, styles.switchRow)} htmlFor={id} data-force={forceState}>
        <span>{label}</span>
        <input {...rest} id={id} type="checkbox" role="switch" className={styles.native} aria-describedby={help ? `${id}-help` : undefined} />
        <span className={styles.track} aria-hidden="true">
          <span className={styles.thumb} />
        </span>
      </label>
      {help ? (
        <p id={`${id}-help`} className={cx(styles.help, styles.choiceHelp)}>
          {help}
        </p>
      ) : null}
    </div>
  );
}

/* Slider: nilai selalu terlihat sebagai teks; dipakai untuk toleransi slippage. */
interface SliderFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type" | "children" | "onChange"> {
  label: string;
  help?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (n: number) => string;
  onValueChange: (n: number) => void;
}

export function SliderField({ label, help, format, value, onValueChange, ...rest }: SliderFieldProps) {
  const id = useId();
  return (
    <Shell id={id} label={label} help={help}>
      <div className={styles.sliderRow}>
        <input
          {...rest}
          id={id}
          type="range"
          value={value}
          className={styles.range}
          onChange={(e) => onValueChange(Number(e.target.value))}
          aria-valuetext={format(value)}
          aria-describedby={describedBy(id, help)}
        />
        <output htmlFor={id} className={cx(styles.sliderValue, "type-num")}>
          {format(value)}
        </output>
      </div>
    </Shell>
  );
}
