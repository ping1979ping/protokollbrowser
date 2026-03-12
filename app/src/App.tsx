import { useState } from 'react';
import type { Protokoll, Protokollelement, Protokollgruppe } from './types';
import { getProtokolleByGruppe } from './db';
import ImportScreen from './components/ImportScreen';
import ProjektAuswahl from './components/ProjektAuswahl';
import ProtokollUebersicht from './components/ProtokollUebersicht';
import ElementDetail from './components/ElementDetail';
import NeuesElement from './components/NeuesElement';
import ExportScreen from './components/ExportScreen';

type Screen =
  | { name: 'import' }
  | { name: 'projektauswahl' }
  | { name: 'uebersicht'; gruppeId: string }
  | { name: 'detail'; element: Protokollelement; protokoll: Protokoll; gruppe: Protokollgruppe }
  | { name: 'neu'; protokoll: Protokoll; gruppe: Protokollgruppe; vorgaenger?: Protokollelement }
  | { name: 'export'; protokoll: Protokoll; gruppe: Protokollgruppe };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'import' });
  const [key, setKey] = useState(0);

  function refresh() { setKey(k => k + 1); }

  switch (screen.name) {
    case 'import':
      return <ImportScreen onImported={() => setScreen({ name: 'projektauswahl' })} />;
    case 'projektauswahl':
      return (
        <ProjektAuswahl
          onSelect={(gruppeId) => setScreen({ name: 'uebersicht', gruppeId })}
          onZurueck={() => setScreen({ name: 'import' })}
        />
      );
    case 'uebersicht':
      return (
        <ProtokollUebersicht
          key={key}
          gruppeId={screen.gruppeId}
          onSelectElement={(elem, prot, grp) => setScreen({ name: 'detail', element: elem, protokoll: prot, gruppe: grp })}
          onNeuesElement={(prot, grp) => setScreen({ name: 'neu', protokoll: prot, gruppe: grp })}
          onExport={(prot, grp) => setScreen({ name: 'export', protokoll: prot, gruppe: grp })}
          onZurueck={() => setScreen({ name: 'projektauswahl' })}
        />
      );
    case 'detail':
      return (
        <ElementDetail
          element={screen.element}
          protokoll={screen.protokoll}
          gruppe={screen.gruppe}
          onBack={() => { refresh(); setScreen({ name: 'uebersicht', gruppeId: screen.gruppe.Id }); }}
          onNachfolger={(vorgaenger) => setScreen({ name: 'neu', protokoll: screen.protokoll, gruppe: screen.gruppe, vorgaenger })}
          onNavigate={async (elem) => {
            // Element könnte in anderem Protokoll sein — richtiges Protokoll suchen
            let prot = screen.protokoll;
            if (elem.ProtokollId !== screen.protokoll.Id) {
              const prots = await getProtokolleByGruppe(screen.gruppe.Id);
              const found = prots.find(p => p.Id === elem.ProtokollId);
              if (found) prot = found;
            }
            setScreen({ name: 'detail', element: elem, protokoll: prot, gruppe: screen.gruppe });
          }}
        />
      );
    case 'neu':
      return (
        <NeuesElement
          protokoll={screen.protokoll}
          vorgaenger={screen.vorgaenger}
          onBack={() => setScreen({ name: 'uebersicht', gruppeId: screen.gruppe.Id })}
          onSaved={() => { refresh(); setScreen({ name: 'uebersicht', gruppeId: screen.gruppe.Id }); }}
        />
      );
    case 'export':
      return (
        <ExportScreen
          protokoll={screen.protokoll}
          onBack={() => setScreen({ name: 'uebersicht', gruppeId: screen.gruppe.Id })}
        />
      );
  }
}
