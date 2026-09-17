import { useEffect, useState } from 'react';
import { leiteFormFaktorAb, type FormFactor } from './formFaktor';

export type { Orientation, FormFactor } from './formFaktor';

function read(): FormFactor {
  const width = typeof window !== 'undefined' ? window.innerWidth : 1194;
  const height = typeof window !== 'undefined' ? window.innerHeight : 834;
  return leiteFormFaktorAb(width, height);
}

/**
 * Reaktiver Formfaktor. Smartphone = einspaltiger Stack, auch im Querformat;
 * Tablet/Desktop (Breite ≥ 768 px und kürzere Seite ≥ 600 px) = Master-Detail-Split
 * im Querformat. Regeln in ./formFaktor. Dual-Mode-Rendering-tauglich (Panel vs. Vollseite).
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
