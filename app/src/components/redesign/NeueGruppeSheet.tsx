// Bottom-Sheet „Neue Protokollgruppe" — zwei Schritte:
//   1. Quelle wählen (Vorlage / Leer / CSV)
//   2. Formular (Gruppenname Pflicht, Vorwort optional, quellenspezifische Felder)
// Reines UI: das eigentliche Anlegen übernimmt der Orchestrator via onCreate().
import { type ChangeEvent, type ReactNode, useEffect, useState } from 'react';
import { BottomSheet, PrimaryButton, SecondaryButton } from '../../ui/primitives';
import { IconBook, IconFolder, IconPlus } from '../../ui/icons';

/* ---------- Prop-Vertrag ---------- */

export interface NeueGruppeData {
  name: string;
  quelle: 'vorlage' | 'leer' | 'csv';
  vorlageId?: string;
  vorwort?: string;
}

interface NeueGruppeSheetProps {
  open: boolean;
  onClose: () => void;
  /** Orchestrator übernimmt das eigentliche Anlegen. */
  onCreate: (data: NeueGruppeData) => void;
}

/* ---------- Konstanten ---------- */

type Quelle = NeueGruppeData['quelle'];
type Step = 'quelle' | 'form';

// Dummy-Vorlagen, bis eine echte Vorlagen-Quelle angebunden ist.
const VORLAGEN: { id: string; name: string }[] = [
  { id: 'vl-baubesprechung', name: 'Baubesprechung' },
  { id: 'vl-planerbesprechung', name: 'Planerbesprechung' },
  { id: 'vl-jourfixe', name: 'Jour Fixe' },
];

// Gemeinsame Feld-Optik: weißes Feld, dezenter Rahmen, Fokus in PING-Blau.
const inputClass =
  'w-full box-border rounded-[11px] border border-[#d7dce3] bg-white px-[13px] py-[11px] text-[14px] text-ping-text outline-none focus:border-ping-blue';

/* ---------- Auswahlkachel (nur in diesem Sheet) ---------- */

function SourceTile({
  icon,
  title,
  subtitle,
  recommended = false,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  recommended?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-[15px] border bg-white p-[15px] text-left transition active:scale-[.99] ${
        recommended ? 'border-ping-blue' : 'border-black/10 hover:border-ping-blue/40'
      }`}
    >
      <span
        className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[11px] ${
          recommended ? 'bg-ping-blue text-white' : 'bg-ping-blue-light text-ping-blue'
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-ping-text">{title}</span>
        <span className="mt-0.5 block text-[12.5px] text-ping-text-mid">{subtitle}</span>
      </span>
      {recommended && (
        <span className="shrink-0 rounded-md bg-ping-blue-light px-2 py-[3px] text-[11px] font-bold text-ping-blue">
          EMPFOHLEN
        </span>
      )}
    </button>
  );
}

/* ---------- Sheet ---------- */

export default function NeueGruppeSheet({ open, onClose, onCreate }: NeueGruppeSheetProps) {
  const [step, setStep] = useState<Step>('quelle');
  const [quelle, setQuelle] = useState<Quelle | null>(null);
  const [name, setName] = useState('');
  const [vorwort, setVorwort] = useState('');
  const [vorlageId, setVorlageId] = useState(VORLAGEN[0].id);

  // Beim Schließen (Backdrop, Esc oder Anlegen) den lokalen State zurücksetzen.
  useEffect(() => {
    if (open) return;
    setStep('quelle');
    setQuelle(null);
    setName('');
    setVorwort('');
    setVorlageId(VORLAGEN[0].id);
  }, [open]);

  const pick = (q: Quelle) => {
    setQuelle(q);
    setStep('form');
  };

  const canCreate = name.trim().length > 0;

  const handleCreate = () => {
    if (!quelle || !canCreate) return;
    const data: NeueGruppeData = { name: name.trim(), quelle };
    if (quelle === 'vorlage') data.vorlageId = vorlageId;
    const vw = vorwort.trim();
    if (vw) data.vorwort = vw;
    onCreate(data);
    onClose();
  };

  // Footer nur im Formular-Schritt (Zurück + Anlegen).
  const footer =
    step === 'form' ? (
      <div className="flex items-center gap-2">
        <SecondaryButton type="button" onClick={() => setStep('quelle')}>
          Zurück
        </SecondaryButton>
        <PrimaryButton type="button" onClick={handleCreate} disabled={!canCreate} className="flex-1">
          Anlegen
        </PrimaryButton>
      </div>
    ) : undefined;

  return (
    <BottomSheet open={open} onClose={onClose} title="Neue Protokollgruppe" footer={footer}>
      {step === 'quelle' ? (
        /* Schritt 1 — Quelle wählen */
        <div className="flex flex-col gap-3 pt-1">
          <p className="text-[13px] text-ping-text-mid">Wie möchtest du die Gruppe anlegen?</p>
          <SourceTile
            icon={<IconFolder size={21} />}
            title="Aus Vorlage"
            subtitle="Vordefinierten Gruppentyp wählen"
            recommended
            onClick={() => pick('vorlage')}
          />
          <SourceTile
            icon={<IconPlus size={22} />}
            title="Leere Gruppe"
            subtitle="Von Grund auf selbst anlegen"
            onClick={() => pick('leer')}
          />
          <SourceTile
            icon={<IconBook size={20} />}
            title="Aus CSV"
            subtitle="Gruppe aus Datei einlesen"
            onClick={() => pick('csv')}
          />
        </div>
      ) : (
        /* Schritt 2 — Formular */
        <div className="flex flex-col gap-4 pt-1">
          {/* Quelle = Vorlage: Dummy-Vorlagen-Auswahl */}
          {quelle === 'vorlage' && (
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-ping-text-mid">Vorlage</span>
              <select
                value={vorlageId}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setVorlageId(e.target.value)}
                className={inputClass}
              >
                {VORLAGEN.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Quelle = CSV: reiner UI-Hinweis, keine Verarbeitung */}
          {quelle === 'csv' && (
            <label className="block cursor-pointer rounded-[13px] border border-dashed border-ping-blue/40 bg-ping-blue-light/40 p-4 text-center">
              <IconBook size={22} className="mx-auto text-ping-blue" />
              <span className="mt-2 block text-[13px] font-semibold text-ping-text">CSV-Datei auswählen</span>
              <span className="mt-0.5 block text-[12px] text-ping-text-light">
                Nur Vorschau — die Datei wird noch nicht verarbeitet.
              </span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={() => {
                  /* Nur UI — die Auswahl wird bewusst nicht ausgewertet. */
                }}
              />
            </label>
          )}

          {/* Pflichtfeld: Gruppenname */}
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-ping-text-mid">
              Gruppenname <span className="text-ping-blue">*</span>
            </span>
            <input
              value={name}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              placeholder="z. B. Baubesprechung KW 30"
              className={inputClass}
              autoFocus
            />
          </label>

          {/* Optional: Vorwort */}
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-ping-text-mid">Vorwort (optional)</span>
            <textarea
              value={vorwort}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setVorwort(e.target.value)}
              rows={3}
              placeholder="Einleitender Text der Protokolle …"
              className={`${inputClass} resize-none leading-relaxed`}
            />
          </label>
        </div>
      )}
    </BottomSheet>
  );
}
