// Linie-2-Abgleich (§6.7, D-09) — PWA-Welle 06.5-09.
// Wird ausgeloest, wenn eine Ad-hoc-Eingabe unscharf (Trigramm-Dice, gleiche
// name_norm-Regel wie online, O-PW-10) einem bestehenden Projekt-Thema aehnelt.
// Copy VERBATIM zum Hub-Desktop: „Meintest du '{treffer}'?" [Übernehmen]
// [Trotzdem neu anlegen]. PWA-eigene Designsprache (44px Touch), KEINE Hub-Optik.
import { PrimaryButton, SecondaryButton } from '../ui/primitives';

interface Props {
  /** Die freie Eingabe des Nutzers. */
  eingabe: string;
  /** Der beste unscharfe Bestandstreffer (Name). */
  treffer: string;
  /** „Übernehmen" — den bestehenden Term nehmen. */
  onUebernehmen: () => void;
  /** „Trotzdem neu anlegen" — Ad-hoc trotz Treffer (abgleich_treffer_ignoriert). */
  onTrotzdem: () => void;
  /** Backdrop/Abbruch — schliesst ohne Auswahl. */
  onClose: () => void;
}

export default function ThemaAbgleichDialog({ eingabe, treffer, onUebernehmen, onTrotzdem, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative w-full max-w-[380px] rounded-2xl bg-white p-5 shadow-2xl"
        style={{ animation: 'fadein .2s ease' }}
      >
        <h2 className="text-[17px] font-bold text-ping-text">
          {`Meintest du '${treffer}'?`}
        </h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ping-text-mid">
          {`'${eingabe}' ähnelt einem bestehenden Thema.`}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <PrimaryButton block onClick={onUebernehmen} className="min-h-[44px]">
            Übernehmen
          </PrimaryButton>
          <SecondaryButton block onClick={onTrotzdem} className="min-h-[44px]">
            Trotzdem neu anlegen
          </SecondaryButton>
        </div>
      </div>
    </div>
  );
}
