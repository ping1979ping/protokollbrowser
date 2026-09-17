import { textUebersprungenOhneZuordnung, type UploadAuswertung } from '../uploadAuswertung';
import type { UploadPunkt } from '../uploadAblauf';

interface Props {
  auswertung: UploadAuswertung;
  /** Benennung der übersprungenen Punkte (aus dem ausgewerteten Export). */
  punkte?: readonly UploadPunkt[];
  /** Nutzer bestätigt die Meldung; ohne Rückruf bleibt sie stehen. */
  onGelesen?: () => void;
}

/**
 * Meldung „Nicht alles vom Hub übernommen" (H1, B4) — dieselbe Anzeige im Export (Vordergrund)
 * und im Protokoll-Browser (Hintergrundweg). Bleibt sichtbar, bis der Nutzer „Gelesen" tippt.
 */
export default function UploadMeldung({ auswertung, punkte = [], onGelesen }: Props) {
  return (
    <div
      data-bereich="upload-auswertung"
      role="alert"
      className="rounded-xl border p-3 text-sm"
      style={{ background: 'var(--color-ping-gold-bg)', borderColor: 'var(--color-ping-gold-light)' }}
    >
      <p className="font-semibold text-ping-gold-dark">Nicht alles vom Hub übernommen</p>
      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-ping-text">
        {auswertung.duplikat && (
          <li>Dieser Export wurde bereits früher übertragen — der Hub liefert dazu keine neue Auswertung.</li>
        )}
        {auswertung.antwortUnvollstaendig && (
          <li>Die Antwort des Hub enthält keine Auswertung (Zähler fehlen).</li>
        )}
        {auswertung.abgelehnteFelder > 0 && (
          <li>
            {auswertung.abgelehnteFelder} {auswertung.abgelehnteFelder === 1 ? 'Feldänderung' : 'Feldänderungen'} abgelehnt:
            Das Protokoll ist im Hub bereits versendet, dort sind nur Status und Positionstext änderbar.
            Welche Punkte und Felder betroffen sind, meldet der Hub nicht.
          </li>
        )}
        {auswertung.uebersprungen.map(id => {
          const p = punkte.find(x => x.id === id);
          return (
            <li key={id}>
              Pos. {p?.position || '?'} „{p?.text ?? ''}“{p?.protokoll ? ` (${p.protokoll})` : ''} nicht angelegt:
              vom Hub übersprungen — neuer Punkt auf einem versendeten Protokoll, dessen Punktbestand eingefroren ist.
            </li>
          );
        })}
        {auswertung.uebersprungenOhneZuordnung.length > 0 && (
          <li>{textUebersprungenOhneZuordnung(auswertung.uebersprungenOhneZuordnung.length)}</li>
        )}
        {auswertung.nichtVerarbeitet > 0 && (
          <li>
            {auswertung.nichtVerarbeitet} von {auswertung.gesendet} Punkten meldet der Hub weder als übernommen noch als abgelehnt.
          </li>
        )}
      </ul>
      <div className="mt-1.5 flex items-end gap-2">
        <p className="min-w-0 flex-1 text-xs text-ping-text-mid">
          {auswertung.markenLoeschen.length > 0
            ? 'Die Änderungsmarken der nicht übernommenen Punkte bleiben erhalten.'
            : 'Alle Änderungsmarken bleiben erhalten.'}
        </p>
        {onGelesen && (
          <button
            type="button"
            onClick={onGelesen}
            className="shrink-0 rounded-lg bg-ping-gold px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-ping-gold-dark"
          >
            Gelesen
          </button>
        )}
      </div>
    </div>
  );
}
