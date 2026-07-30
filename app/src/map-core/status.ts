/**
 * Statusfarben der Karte.
 *
 * Die Zuordnung liegt bewusst als Tabelle vor und nicht als Verzweigung mit
 * Sammelzweig: Ein Sammelzweig faengt neu hinzugekommene Statuscodes still
 * mit ab und faerbt sie grau, obwohl die Statusliste laengst eine andere
 * Farbe fuehrt. Genau so entstand der Fall, dass eine Restarbeit im Text
 * gelb und auf der Karte grau war. Wer die Statusliste erweitert, muss diese
 * Tabelle mit erweitern — der Regressionstest tests/mapCore.test.ts haelt
 * beide Seiten zusammen.
 */

/** Die fuenf Farben, die die Karte kennt — benannt wie die Farbworte der Statusliste. */
export const STATUS_FARBEN = {
  grau: '#6b7280',
  gelb: '#ca8a04',
  blau: '#2563eb',
  gruen: '#16a34a',
  rot: '#dc2626',
} as const;

/** Farbe fuer einen Statuscode, den die Statusliste nicht kennt. */
export const STATUS_FARBE_UNBEKANNT = STATUS_FARBEN.grau;

/**
 * Alle bekannten Statuscodes ausdruecklich — auch die grauen. Ein grauer
 * Eintrag hier ist eine Aussage, kein Durchfall.
 */
export const STATUS_FARBE: Record<number, string> = {
  0:  STATUS_FARBEN.grau,   // Neu
  10: STATUS_FARBEN.gelb,   // Offen
  11: STATUS_FARBEN.rot,    // Mangel - offen
  16: STATUS_FARBEN.gelb,   // Restarbeit (R)
  17: STATUS_FARBEN.grau,   // Erledigt (Info)
  19: STATUS_FARBEN.blau,   // Freigegeben
  20: STATUS_FARBEN.gruen,  // Erledigt
  21: STATUS_FARBEN.grau,   // Uebertragen
  25: STATUS_FARBEN.gruen,  // Mangel - beseitigt
  26: STATUS_FARBEN.gruen,  // erledigt (R)
};

/** Kartenfarbe eines Statuscodes; unbekannte Codes bleiben grau. */
export function statusColor(status: number): string {
  return STATUS_FARBE[status] ?? STATUS_FARBE_UNBEKANNT;
}
