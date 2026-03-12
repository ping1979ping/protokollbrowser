import { useState } from 'react';
import type { Protokoll, Protokollelement } from './types';
import ImportScreen from './components/ImportScreen';
import ProtokollUebersicht from './components/ProtokollUebersicht';
import ElementDetail from './components/ElementDetail';
import NeuesElement from './components/NeuesElement';
import ExportScreen from './components/ExportScreen';

type Screen =
  | { name: 'import' }
  | { name: 'uebersicht' }
  | { name: 'detail'; element: Protokollelement; protokoll: Protokoll }
  | { name: 'neu'; protokoll: Protokoll }
  | { name: 'export'; protokoll: Protokoll };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'import' });
  const [key, setKey] = useState(0);

  function refresh() {
    setKey(k => k + 1);
  }

  switch (screen.name) {
    case 'import':
      return <ImportScreen onImported={() => setScreen({ name: 'uebersicht' })} />;
    case 'uebersicht':
      return (
        <ProtokollUebersicht
          key={key}
          onSelectElement={(elem, prot) => setScreen({ name: 'detail', element: elem, protokoll: prot })}
          onNeuesElement={(prot) => setScreen({ name: 'neu', protokoll: prot })}
          onExport={(prot) => setScreen({ name: 'export', protokoll: prot })}
          onZurueck={() => setScreen({ name: 'import' })}
        />
      );
    case 'detail':
      return (
        <ElementDetail
          element={screen.element}
          protokoll={screen.protokoll}
          onBack={() => { refresh(); setScreen({ name: 'uebersicht' }); }}
        />
      );
    case 'neu':
      return (
        <NeuesElement
          protokoll={screen.protokoll}
          onBack={() => setScreen({ name: 'uebersicht' })}
          onSaved={() => { refresh(); setScreen({ name: 'uebersicht' }); }}
        />
      );
    case 'export':
      return (
        <ExportScreen
          protokoll={screen.protokoll}
          onBack={() => setScreen({ name: 'uebersicht' })}
        />
      );
  }
}
