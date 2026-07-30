/**
 * Statusfarben der Karte.
 */

export function statusColor(status: number): string {
  switch (status) {
    case 10: return '#ca8a04'; // yellow/offen
    case 11: return '#dc2626'; // red/mangel
    case 20: case 25: return '#16a34a'; // green/erledigt
    case 19: return '#2563eb'; // blue/freigegeben
    default: return '#6b7280'; // gray/neu
  }
}
