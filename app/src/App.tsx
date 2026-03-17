import { useState, useRef } from 'react';
import type { Protokoll, Protokollelement, Protokollgruppe } from './types';
import { getProtokolleByGruppe, getOrCreateDraftProtokoll } from './db';
import ImportScreen from './components/ImportScreen';
import ProjektAuswahl from './components/ProjektAuswahl';
import ProtokollUebersicht from './components/ProtokollUebersicht';
import type { UebersichtState } from './components/ProtokollUebersicht';
import ElementDetail from './components/ElementDetail';
import NeuesElement from './components/NeuesElement';
import ExportScreen from './components/ExportScreen';

type Screen =
  | { name: 'import' }
  | { name: 'projektauswahl' }
  | { name: 'uebersicht'; gruppeId: string }
  | { name: 'detail'; element: Protokollelement; protokoll: Protokoll; gruppe: Protokollgruppe; filteredIds?: string[] }
  | { name: 'neu'; protokoll: Protokoll; gruppe: Protokollgruppe; vorgaenger?: Protokollelement }
  | { name: 'export'; protokoll: Protokoll; gruppe: Protokollgruppe };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'import' });
  const [key, setKey] = useState(0);
  const uebersichtStateRef = useRef<UebersichtState | undefined>(undefined);

  function refresh() { setKey(k => k + 1); }

  function goUebersicht(gruppeId: string) {
    setScreen({ name: 'uebersicht', gruppeId });
  }

  switch (screen.name) {
    case 'import':
      return <ImportScreen onImported={() => setScreen({ name: 'projektauswahl' })} />;
    case 'projektauswahl':
      return (
        <ProjektAuswahl
          onSelect={(gruppeId) => { uebersichtStateRef.current = undefined; setScreen({ name: 'uebersicht', gruppeId }); }}
          onZurueck={() => setScreen({ name: 'import' })}
          onNeuesImport={() => setScreen({ name: 'import' })}
        />
      );
    case 'uebersicht':
      return (
        <ProtokollUebersicht
          key={key}
          gruppeId={screen.gruppeId}
          initialState={uebersichtStateRef.current}
          onStateChange={(s) => { uebersichtStateRef.current = s; }}
          onSelectElement={(elem, prot, grp, filteredIds) => setScreen({ name: 'detail', element: elem, protokoll: prot, gruppe: grp, filteredIds })}
          onNeuesElement={(prot, grp) => setScreen({ name: 'neu', protokoll: prot, gruppe: grp })}
          onExport={(prot, grp) => setScreen({ name: 'export', protokoll: prot, gruppe: grp })}
          onZurueck={() => setScreen({ name: 'projektauswahl' })}
        />
      );
    case 'detail':
      return (
        <ElementDetail
          key={screen.element.Id}
          element={screen.element}
          protokoll={screen.protokoll}
          gruppe={screen.gruppe}
          filteredIds={screen.filteredIds}
          onBack={() => { refresh(); goUebersicht(screen.gruppe.Id); }}
          onNachfolger={async (vorgaenger) => {
            const draft = await getOrCreateDraftProtokoll(screen.gruppe.Id, {
              Name: screen.protokoll.Name,
              Ort: screen.protokoll.Ort,
              Autor: screen.protokoll.Autor,
            });
            setScreen({ name: 'neu', protokoll: draft, gruppe: screen.gruppe, vorgaenger });
          }}
          onNavigate={async (elem) => {
            let prot = screen.protokoll;
            if (elem.ProtokollId !== screen.protokoll.Id) {
              const prots = await getProtokolleByGruppe(screen.gruppe.Id);
              const found = prots.find(p => p.Id === elem.ProtokollId);
              if (found) prot = found;
            }
            setScreen({ name: 'detail', element: elem, protokoll: prot, gruppe: screen.gruppe, filteredIds: screen.filteredIds });
          }}
        />
      );
    case 'neu':
      return (
        <NeuesElement
          protokoll={screen.protokoll}
          gruppe={screen.gruppe}
          vorgaenger={screen.vorgaenger}
          onBack={() => goUebersicht(screen.gruppe.Id)}
          onSaved={() => { refresh(); goUebersicht(screen.gruppe.Id); }}
        />
      );
    case 'export':
      return (
        <ExportScreen
          protokoll={screen.protokoll}
          onBack={() => goUebersicht(screen.gruppe.Id)}
        />
      );
  }
}
