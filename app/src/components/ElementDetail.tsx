import { useState, useEffect, useRef } from 'react';
import type { Protokoll, Protokollelement, Teilnehmer } from '../types';
import { STATUS_MAP } from '../types';
import { updateElement, saveFoto, getFotos, deleteFoto } from '../db';

interface Props {
  element: Protokollelement;
  protokoll: Protokoll;
  onBack: () => void;
}

const AENDERBARE_STATUS = [0, 10, 19, 20, 11, 25];

export default function ElementDetail({ element, protokoll, onBack }: Props) {
  const [elem, setElem] = useState<Protokollelement>({ ...element });
  const [fotos, setFotos] = useState<{ fotoId: string; blob: Blob; fileName: string; url?: string }[]>([]);
  const [gespeichert, setGespeichert] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ladenFotos();
    return () => { fotos.forEach(f => f.url && URL.revokeObjectURL(f.url)); };
  }, []);

  async function ladenFotos() {
    const dbFotos = await getFotos(elem.Id);
    setFotos(dbFotos.map(f => ({ ...f, url: URL.createObjectURL(f.blob) })));
  }

  function update(patch: Partial<Protokollelement>) {
    setElem(prev => ({ ...prev, ...patch, _geaendert: true }));
    setGespeichert(false);
  }

  function updateMobile(patch: Partial<Protokollelement['MobileErfassung']>) {
    setElem(prev => ({
      ...prev,
      _geaendert: true,
      MobileErfassung: { ...prev.MobileErfassung, ...patch },
    }));
    setGespeichert(false);
  }

  async function speichern() {
    await updateElement(elem);
    setGespeichert(true);
  }

  async function gpsErfassen() {
    if (!navigator.geolocation) {
      alert('GPS wird von diesem Browser nicht unterstützt.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const accuracy = Math.round(pos.coords.accuracy);
        const text = `Standort: ${lat.toFixed(7)}, ${lon.toFixed(7)} (Genauigkeit ${accuracy} m)`;
        updateMobile({ GeoLat: lat, GeoLon: lon, GeoAccuracy: accuracy, GeoText: text });
      },
      (err) => alert('GPS-Fehler: ' + err.message),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  function sprachErkennung() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert('Spracherkennung wird von diesem Browser nicht unterstützt.');
      return;
    }
    const recognition = new SR();
    recognition.lang = 'de-DE';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      updateMobile({
        Transkript: (elem.MobileErfassung.Transkript || '') + (elem.MobileErfassung.Transkript ? ' ' : '') + transcript,
      });
    };
    recognition.start();
  }

  async function fotoHinzufuegen(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      const fotoId = `foto-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const fileName = `PE-${elem.Id.replace(/[^a-zA-Z0-9]/g, '')}_${String(fotos.length + 1).padStart(3, '0')}.jpg`;
      await saveFoto(fotoId, elem.Id, file, fileName);
    }
    await ladenFotos();

    const aktFotos = await getFotos(elem.Id);
    const fotoRefs = aktFotos.map(f => ({
      FileName: f.fileName,
      RelativePath: `photos/${f.fileName}`,
      ZielPfad: '',
    }));
    updateMobile({ Fotos: fotoRefs } as any);

    if (fotoRef.current) fotoRef.current.value = '';
  }

  async function fotoLoeschen(fotoId: string) {
    await deleteFoto(fotoId);
    await ladenFotos();
  }

  const alleTeilnehmer: Teilnehmer[] = [
    ...protokoll.Teilnehmer,
    ...protokoll.Verteiler.filter(v => !protokoll.Teilnehmer.some(t => t.Oid === v.Oid)),
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-blue-700 text-white p-4">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="text-blue-200 hover:text-white text-sm">&larr; Zurück</button>
          <span className="text-xs text-blue-200">Pos. {elem.Position}</span>
        </div>
        <h1 className="text-lg font-bold mt-1">{elem.Positionstitel}</h1>
      </div>

      <div className="p-4 space-y-5">
        {/* Positionstext */}
        {elem.Positionstext && (
          <div className="bg-white rounded-xl p-3 border border-gray-100">
            <label className="text-xs text-gray-400 font-medium">Positionstext</label>
            <p className="text-sm text-gray-700 mt-1">{elem.Positionstext}</p>
          </div>
        )}

        {/* Status */}
        <div className="bg-white rounded-xl p-3 border border-gray-100">
          <label className="text-xs text-gray-400 font-medium block mb-2">Status</label>
          <div className="flex gap-1.5 flex-wrap">
            {AENDERBARE_STATUS.map(s => (
              <button
                key={s}
                onClick={() => update({ Status: s })}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  elem.Status === s
                    ? STATUS_MAP[s].css + ' ring-2 ring-blue-400'
                    : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                }`}
              >
                {STATUS_MAP[s].label}
              </button>
            ))}
          </div>
        </div>

        {/* Termin */}
        <div className="bg-white rounded-xl p-3 border border-gray-100">
          <label className="text-xs text-gray-400 font-medium block mb-1">Termin</label>
          <input
            type="date"
            value={elem.Termin ? elem.Termin.slice(0, 10) : ''}
            onChange={(e) => update({ Termin: e.target.value ? e.target.value + 'T00:00:00' : '' })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        {/* Verantwortlicher */}
        <div className="bg-white rounded-xl p-3 border border-gray-100">
          <label className="text-xs text-gray-400 font-medium block mb-1">Verantwortlicher</label>
          <select
            value={elem.VerantwortlicherOid}
            onChange={(e) => {
              const t = alleTeilnehmer.find(t => t.Oid === e.target.value);
              if (t) update({
                VerantwortlicherOid: t.Oid,
                VerantwortlicherId: t.Nummer,
                VerantwortlicherName: t.Name,
              });
            }}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {alleTeilnehmer.map(t => (
              <option key={t.Oid} value={t.Oid}>{t.Name}{t.Rolle ? ` (${t.Rolle})` : ''}</option>
            ))}
          </select>
        </div>

        {/* Bemerkung */}
        <div className="bg-white rounded-xl p-3 border border-gray-100">
          <label className="text-xs text-gray-400 font-medium block mb-1">Bemerkung</label>
          <textarea
            value={elem.Bemerkung}
            onChange={(e) => update({ Bemerkung: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          />
        </div>

        {/* Notiz */}
        <div className="bg-white rounded-xl p-3 border border-gray-100">
          <label className="text-xs text-gray-400 font-medium block mb-1">Notiz</label>
          <textarea
            value={elem.MobileErfassung.Notiz || ''}
            onChange={(e) => updateMobile({ Notiz: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          />
        </div>

        {/* Transkript */}
        <div className="bg-white rounded-xl p-3 border border-gray-100">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-400 font-medium">Transkript</label>
            <button
              onClick={sprachErkennung}
              className="bg-red-500 text-white px-3 py-1 rounded-lg text-xs hover:bg-red-600 active:bg-red-700"
            >
              🎤 Aufnehmen
            </button>
          </div>
          <textarea
            value={elem.MobileErfassung.Transkript || ''}
            onChange={(e) => updateMobile({ Transkript: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          />
        </div>

        {/* GPS */}
        <div className="bg-white rounded-xl p-3 border border-gray-100">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-400 font-medium">GPS-Standort</label>
            <button
              onClick={gpsErfassen}
              className="bg-green-600 text-white px-3 py-1 rounded-lg text-xs hover:bg-green-700 active:bg-green-800"
            >
              📍 Erfassen
            </button>
          </div>
          {elem.MobileErfassung.GeoText && (
            <p className="text-sm text-gray-600">{elem.MobileErfassung.GeoText}</p>
          )}
        </div>

        {/* Fotos */}
        <div className="bg-white rounded-xl p-3 border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-gray-400 font-medium">Fotos</label>
            <button
              onClick={() => fotoRef.current?.click()}
              className="bg-purple-600 text-white px-3 py-1 rounded-lg text-xs hover:bg-purple-700"
            >
              📷 Foto hinzufügen
            </button>
            <input
              ref={fotoRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={fotoHinzufuegen}
              className="hidden"
            />
          </div>
          {fotos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {fotos.map(f => (
                <div key={f.fotoId} className="relative">
                  <img src={f.url} alt={f.fileName} className="w-full h-24 object-cover rounded-lg" />
                  <button
                    onClick={() => fotoLoeschen(f.fotoId)}
                    className="absolute top-1 right-1 bg-red-500 text-white w-5 h-5 rounded-full text-xs flex items-center justify-center"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Speichern */}
        <button
          onClick={speichern}
          className={`w-full py-3 rounded-xl font-medium text-white transition ${
            gespeichert ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
          }`}
        >
          {gespeichert ? '✓ Gespeichert' : 'Speichern'}
        </button>
      </div>
    </div>
  );
}
