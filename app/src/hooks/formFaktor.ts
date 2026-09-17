/**
 * Formfaktor-Regeln als reine Funktionen (ohne React), damit sie per `node --test`
 * prüfbar sind (tests/formFaktor.test.ts). Der Hook useFormFactor liest nur Fenstermaße.
 */

export type Orientation = 'quer' | 'hoch';

export interface FormFactor {
  width: number;
  height: number;
  /** Tablet/Desktop: Split- und Mehrspalten-Layouts */
  isTablet: boolean;
  isPhone: boolean;
  /** Landscape vs. Portrait — steuert 1- vs. 2-Spalten-Grids und Split vs. Stack */
  orientation: Orientation;
}

/** Mindestbreite für Tablet-Layouts (bisherige Schwelle, unverändert). */
export const TABLET_MIN_BREITE = 768;

/**
 * Mindestmaß der kürzeren Seite (H2). Seit das Manifest das Querformat erlaubt, ist ein
 * Telefon quer breiter als 768 px (z. B. 844×390, 932×430), bleibt aber ein Telefon — ein
 * Split hätte dort nur eine schmale Liste. Die kürzere Seite trennt sauber: Telefone liegen
 * darunter (≈ 360–440 px), Tablets darüber (iPad mini 744, iPad 810/820/834, 7-Zoll-Android 600);
 * 600 dp ist auch Androids eigene Tablet-Schwelle (sw600dp).
 */
export const TABLET_MIN_KURZE_SEITE = 600;

export function leiteFormFaktorAb(width: number, height: number): FormFactor {
  const isTablet = width >= TABLET_MIN_BREITE && Math.min(width, height) >= TABLET_MIN_KURZE_SEITE;
  return {
    width,
    height,
    isTablet,
    isPhone: !isTablet,
    orientation: width >= height ? 'quer' : 'hoch',
  };
}

/** Master-Detail-Split (Liste | Punkt-Detail) nur auf dem Tablet im Querformat. */
export function splitAnsicht(ff: Pick<FormFactor, 'isTablet' | 'orientation'>): boolean {
  return ff.isTablet && ff.orientation === 'quer';
}

/**
 * Oberster Punkt beim Öffnen automatisch aktivieren (Tablet-Handoff, Abschnitt 1): nur im
 * Split und nur, wenn noch kein Punkt aktiv ist. Im Hochformat und auf dem Telefon ersetzt
 * das Detail die Liste — dort bleibt die Liste stehen.
 */
export function obersterPunktAutomatisch(ff: Pick<FormFactor, 'isTablet' | 'orientation'>, detailAktiv: boolean): boolean {
  return splitAnsicht(ff) && !detailAktiv;
}
