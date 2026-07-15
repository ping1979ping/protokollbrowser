import { STATUS_MAP } from '../types';

// Design-verbindliche Status-Farben (PING Protokoll Design, Handoff 2026-07-14).
// Status NIE frei einfaerben — immer ueber diese Map.
const STATUS_STYLE: Record<number, { bg: string; fg: string }> = {
  0:  { bg: '#EEF0F3', fg: '#5B6472' }, // Neu (grau)
  10: { bg: '#FDF0C8', fg: '#8A6D1A' }, // Offen (gelb)
  11: { bg: '#FEF2F2', fg: '#DC2626' }, // Mangel - offen (rot)
  17: { bg: '#EEF0F3', fg: '#5B6472' }, // Erledigt (Info) (grau)
  19: { bg: '#E6EEF7', fg: '#004899' }, // Freigegeben (blau)
  20: { bg: '#EAFAF0', fg: '#16803C' }, // Erledigt (gruen)
  21: { bg: '#EEF0F3', fg: '#5B6472' }, // Uebertragen (grau)
  25: { bg: '#EAFAF0', fg: '#16803C' }, // Mangel - beseitigt (gruen)
};

const FALLBACK = { bg: '#EEF0F3', fg: '#5B6472' };

export function statusLabel(status: number): string {
  return STATUS_MAP[status]?.label ?? `Status ${status}`;
}

export default function StatusBadge({ status, size = 'md' }: { status: number; size?: 'sm' | 'md' }) {
  const style = STATUS_STYLE[status] ?? FALLBACK;
  const pad = size === 'sm' ? '2px 8px' : '3px 10px';
  const fontSize = size === 'sm' ? 11 : 12;
  return (
    <span
      className="inline-flex items-center rounded-full font-semibold whitespace-nowrap"
      style={{ background: style.bg, color: style.fg, padding: pad, fontSize, lineHeight: 1.3 }}
    >
      {statusLabel(status)}
    </span>
  );
}
