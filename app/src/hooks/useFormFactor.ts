import { useEffect, useState } from 'react';

export type Orientation = 'quer' | 'hoch';

export interface FormFactor {
  width: number;
  height: number;
  /** ab 768px echte Split-/Master-Detail-Layouts (Tablet & Desktop) */
  isTablet: boolean;
  isPhone: boolean;
  /** Landscape vs. Portrait — steuert 1- vs. 2-Spalten-Grids und Split vs. Stack */
  orientation: Orientation;
}

const TABLET_MIN = 768;

function read(): FormFactor {
  const width = typeof window !== 'undefined' ? window.innerWidth : 1194;
  const height = typeof window !== 'undefined' ? window.innerHeight : 834;
  const isTablet = width >= TABLET_MIN;
  return {
    width,
    height,
    isTablet,
    isPhone: !isTablet,
    orientation: width >= height ? 'quer' : 'hoch',
  };
}

/**
 * Reaktiver Formfaktor. Smartphone (< 768px) = einspaltiger Stack;
 * Tablet/Desktop (>= 768px) = Master-Detail-Split. Orientierung nach
 * Seitenverhaeltnis. Dual-Mode-Rendering-tauglich (Panel vs. Vollseite).
 */
export function useFormFactor(): FormFactor {
  const [ff, setFf] = useState<FormFactor>(read);
  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setFf(read()));
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  return ff;
}
