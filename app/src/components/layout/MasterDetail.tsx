import type { ReactNode } from 'react';
import { useFormFactor } from '../../hooks/useFormFactor';

interface Props {
  /** Linke Spalte (Liste). Auf Tablet/Quer immer sichtbar. */
  master: ReactNode;
  /** Rechte Spalte (Detail). Auf Phone/Hoch ersetzt das Detail die Liste. */
  detail: ReactNode;
  /** Ist gerade ein Detail aktiv? Steuert das Stack-Verhalten auf schmalen Screens. */
  detailActive: boolean;
  /** Anteil der Master-Spalte im Split (Design: 50/50). */
  split?: number; // 0..1
}

/**
 * Master-Detail-Container gemaess Tablet-Handoff:
 * - Tablet/Querformat: Liste links, Detail rechts (Split 50/50 default).
 * - Phone oder Hochformat: Detail ersetzt die Liste (volle Breite), sonst nur Liste.
 * Rein praesentational — die Screens steuern, welcher Punkt aktiv ist.
 */
export default function MasterDetail({ master, detail, detailActive, split = 0.5 }: Props) {
  const { isTablet, orientation } = useFormFactor();
  const splitView = isTablet && orientation === 'quer';

  if (splitView) {
    return (
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="min-h-0 overflow-hidden border-r border-black/10" style={{ flexBasis: `${split * 100}%`, flexGrow: 0, flexShrink: 0 }}>
          {master}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden bg-white">
          {detail}
        </div>
      </div>
    );
  }

  // Schmaler Screen / Hochformat: eine Spalte, Detail ersetzt die Liste
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {detailActive ? detail : master}
    </div>
  );
}
