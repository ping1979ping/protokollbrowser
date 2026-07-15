import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useEffect } from 'react';
import { IconArrowLeft, IconSearch, IconX } from './icons';

/* ---------- Screen-Gerüst ---------- */

/** Blauer App-Header (bg-ping-blue). Optionaler Zurück-Button, Titel, Rechts-Slot. */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  backLabel,
  right,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  right?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="shrink-0 bg-ping-blue text-white">
      <div className="flex items-center gap-3 px-4 pt-3 pb-3">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-ping-blue-light hover:text-white text-sm shrink-0"
          >
            <IconArrowLeft size={18} />
            {backLabel && <span className="hidden sm:inline">{backLabel}</span>}
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[22px] font-bold leading-tight">{title}</h1>
          {subtitle && <p className="truncate text-[13px] text-ping-blue-light">{subtitle}</p>}
        </div>
        {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
      </div>
      {children && <div className="px-4 pb-3">{children}</div>}
    </header>
  );
}

/** Standard-Seitengerüst: Header (shrink-0) + genau ein scrollender Content-Bereich. */
export function Screen({ header, children, footer }: { header?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex h-[100dvh] flex-col bg-ping-surface">
      {header}
      <main className="ping-scroll min-h-0 flex-1 overflow-y-auto">{children}</main>
      {footer}
    </div>
  );
}

/** Sticky-Fußzeile (z.B. primäre Aktion unten rechts). */
export function StickyFooter({ children }: { children: ReactNode }) {
  return (
    <div className="shrink-0 border-t border-black/5 bg-white/80 px-4 py-3 backdrop-blur">
      <div className="flex items-center justify-end gap-2">{children}</div>
    </div>
  );
}

/* ---------- Container ---------- */

export function Card({
  children,
  className = '',
  active = false,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl bg-white ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{
        boxShadow: active ? '0 0 0 2px var(--color-ping-blue)' : 'var(--shadow-card)',
        background: active ? '#EEF4FB' : '#fff',
      }}
    >
      {children}
    </div>
  );
}

/** Kleine Statistik-Kachel (Zahl groß, Label klein). */
export function StatTile({ value, label, tone = 'neutral' }: { value: ReactNode; label: string; tone?: 'neutral' | 'blue' | 'gold' | 'success' | 'danger' }) {
  const colors: Record<string, string> = {
    neutral: 'var(--color-ping-text)',
    blue: 'var(--color-ping-blue)',
    gold: 'var(--color-ping-gold-dark)',
    success: 'var(--color-ping-success-dark)',
    danger: 'var(--color-ping-danger)',
  };
  return (
    <div className="rounded-xl bg-ping-bg px-3 py-2 text-center">
      <div className="text-lg font-bold" style={{ color: colors[tone] }}>{value}</div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ping-text-light">{label}</div>
    </div>
  );
}

/** Abschnitts-Überschrift (grau, uppercase) analog "PROTOKOLLE"/"PROTOKOLLGRUPPE". */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ping-text-light">{children}</div>;
}

/* ---------- Chips & Pills ---------- */

export function Chip({
  children,
  active = false,
  onClick,
  tone = 'blue',
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  tone?: 'blue' | 'gold' | 'neutral';
}) {
  const activeBg = tone === 'gold' ? 'var(--color-ping-gold)' : tone === 'neutral' ? 'var(--color-ping-text)' : 'var(--color-ping-blue)';
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-3 py-1 text-[13px] font-medium transition"
      style={
        active
          ? { background: activeBg, color: '#fff' }
          : { background: 'var(--color-ping-blue-light)', color: 'var(--color-ping-blue)' }
      }
    >
      {children}
    </button>
  );
}

/** Projekt-Nummer-Chip (bg-ping-blue). */
export function ProjektChip({ nummer }: { nummer: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-ping-blue px-2 py-0.5 font-mono text-[12px] font-semibold text-white">
      {nummer}
    </span>
  );
}

/** Statuspunkt (gold=neu / grün=synchron). */
export function StatusDot({ tone }: { tone: 'neu' | 'sync' }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{ background: tone === 'neu' ? 'var(--color-ping-gold)' : 'var(--color-ping-success)' }}
    />
  );
}

/* ---------- Buttons ---------- */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { block?: boolean };

export function PrimaryButton({ block, className = '', children, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-ping-blue px-4 py-[13px] text-[15px] font-semibold text-white transition hover:bg-ping-blue-dark active:scale-[.99] disabled:opacity-40 ${block ? 'w-full' : ''} ${className}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ block, className = '', children, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-ping-blue-light px-4 py-[13px] text-[15px] font-semibold text-ping-blue transition hover:brightness-95 active:scale-[.99] disabled:opacity-40 ${block ? 'w-full' : ''} ${className}`}
    >
      {children}
    </button>
  );
}

export function DangerButton({ block, className = '', children, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-[13px] text-[15px] font-semibold text-white transition active:scale-[.99] disabled:opacity-40 ${block ? 'w-full' : ''} ${className}`}
      style={{ background: 'var(--color-ping-danger)' }}
    >
      {children}
    </button>
  );
}

/* ---------- Segmented Control ---------- */

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label?: string; icon?: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-xl bg-black/10 p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[13px] font-semibold transition ${active ? 'bg-white text-ping-blue shadow-sm' : 'text-ping-text-mid'}`}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Suchfeld ---------- */

export function SearchInput({
  value,
  onChange,
  placeholder = 'Suchen…',
  onHeader = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onHeader?: boolean;
}) {
  return (
    <div className="relative">
      <IconSearch
        size={18}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
        style={{ color: onHeader ? 'rgba(255,255,255,.7)' : 'var(--color-ping-text-light)' }}
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={
          onHeader
            ? 'w-full rounded-xl bg-white/15 py-2 pl-10 pr-9 text-[14px] text-white placeholder-white/60 outline-none focus:bg-white/25'
            : 'w-full rounded-xl border border-black/10 bg-white py-2 pl-10 pr-9 text-[14px] outline-none focus:border-ping-blue'
        }
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 hover:bg-black/10"
          style={{ color: onHeader ? '#fff' : 'var(--color-ping-text-light)' }}
          aria-label="Löschen"
        >
          <IconX size={15} />
        </button>
      )}
    </div>
  );
}

/* ---------- Bottom-Sheet ---------- */

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative flex max-h-[92vh] w-full max-w-[640px] flex-col bg-white"
        style={{ borderRadius: '26px 26px 0 0', animation: 'sheetin .25s ease' }}
      >
        <div className="flex flex-col items-center pt-2">
          <span className="h-1 w-10 rounded-full bg-black/15" />
        </div>
        {title && (
          <div className="shrink-0 px-5 pb-2 pt-2 text-center text-[16px] font-bold">{title}</div>
        )}
        <div className="ping-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="shrink-0 border-t border-black/5 p-4">{footer}</div>}
      </div>
    </div>
  );
}

/** Zentriertes Overlay-Popover (z.B. Mini-Kalender) — Klick daneben schließt. */
export function CenterPopover({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative rounded-2xl bg-white p-3 shadow-2xl" style={{ animation: 'fadein .2s ease' }}>
        {children}
      </div>
    </div>
  );
}

/* ---------- Toast ---------- */

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      className="pointer-events-none fixed bottom-6 left-1/2 z-[60] max-w-[88%] rounded-full bg-ping-text px-4 py-2 text-center text-[13px] font-medium text-white shadow-lg"
      style={{ animation: 'toastin .25s ease' }}
    >
      {message}
    </div>
  );
}

/* ---------- Empty-State ---------- */

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      {icon && <div className="text-ping-text-light">{icon}</div>}
      <p className="text-[15px] font-semibold text-ping-text-mid">{title}</p>
      {hint && <p className="text-[13px] text-ping-text-light">{hint}</p>}
    </div>
  );
}
