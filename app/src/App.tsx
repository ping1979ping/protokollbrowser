import { useState, useRef, useEffect } from 'react';
import type { Protokoll, Protokollelement, Protokollgruppe } from './types';
import { getProtokolleByGruppe, getOrCreateDraftProtokoll, findBautagebuchProtokoll } from './db';
import ImportScreen from './components/ImportScreen';
import ProjektAuswahl from './components/ProjektAuswahl';
import ProtokollUebersicht from './components/ProtokollUebersicht';
import type { UebersichtState } from './components/ProtokollUebersicht';
import ElementDetail from './components/ElementDetail';
import NeuesElement from './components/NeuesElement';
import ExportScreen from './components/ExportScreen';
import SchnellErstellung from './components/SchnellErstellung';
import ServerImportScreen from './components/ServerImportScreen';
import SyncSettings from './components/SyncSettings';
import LoginScreen from './components/LoginScreen';
import { isLoggedIn } from './authService';

type Screen =
  | { name: 'import' }
  | { name: 'projektauswahl' }
  | { name: 'server-import' }
  | { name: 'sync-settings' }
  | { name: 'uebersicht'; gruppeId: string }
  | { name: 'detail'; element: Protokollelement; protokoll: Protokoll; gruppe: Protokollgruppe; filteredIds?: string[] }
  | { name: 'neu'; protokoll: Protokoll; gruppe: Protokollgruppe; vorgaenger?: Protokollelement; clone?: { thema: string; status: number; termin: string; verantwOid: string; geoLat: number | null; geoLon: number | null; geoAcc: number | null; geoHeading: number | null; geoText: string }; isBautagebuch?: boolean }
  | { name: 'export'; protokoll: Protokoll; gruppe: Protokollgruppe }
  | { name: 'schnell'; protokoll: Protokoll; gruppe: Protokollgruppe };

export default function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [screen, setScreen] = useState<Screen>({ name: 'import' });
  const [key, setKey] = useState(0);
  const uebersichtStateRef = useRef<UebersichtState | undefined>(undefined);

  // Session-Ablauf abfangen: schlug ein Refresh fehl, hat syncService.logout()
  // die Tokens geloescht -> beim naechsten Fenster-Fokus zurueck zum Login (T-06-06-02).
  useEffect(() => {
    const check = () => setLoggedIn(isLoggedIn());
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, []);

  if (!loggedIn) {
    return <LoginScreen onLoggedIn={() => setLoggedIn(true)} />;
  }

  function refresh() { setKey(k => k + 1); }

  function goUebersicht(gruppeId: string) {
    setScreen({ name: 'uebersicht', gruppeId });
  }

  switch (screen.name) {
    case 'import':
      return (
        <ImportScreen
          onImported={() => setScreen({ name: 'projektauswahl' })}
          onServerImport={() => setScreen({ name: 'server-import' })}
          onSettings={() => setScreen({ name: 'sync-settings' })}
        />
      );
    case 'server-import':
      return (
        <ServerImportScreen
          onImported={() => setScreen({ name: 'projektauswahl' })}
          onZurueck={() => setScreen({ name: 'import' })}
          onSettings={() => setScreen({ name: 'sync-settings' })}
        />
      );
    case 'sync-settings':
      return <SyncSettings onBack={() => setScreen({ name: 'import' })} />;
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
          onBautagebuch={async (grp) => {
            const btProt = await findBautagebuchProtokoll(grp.id);
            if (!btProt) {
              alert('Kein Bautagebuch-Protokoll in diesem Projekt gefunden.');
              return;
            }
            setScreen({ name: 'neu', protokoll: btProt, gruppe: grp, isBautagebuch: true });
          }}
          onSchnellErstellung={(prot, grp) => setScreen({ name: 'schnell', protokoll: prot, gruppe: grp })}
          onExport={(prot, grp) => setScreen({ name: 'export', protokoll: prot, gruppe: grp })}
          onZurueck={() => setScreen({ name: 'projektauswahl' })}
        />
      );
    case 'detail':
      return (
        <ElementDetail
          key={screen.element.id}
          element={screen.element}
          protokoll={screen.protokoll}
          gruppe={screen.gruppe}
          filteredIds={screen.filteredIds}
          onBack={() => { refresh(); goUebersicht(screen.gruppe.id); }}
          onNachfolger={async (vorgaenger) => {
            const prot = screen.protokoll.nummer < 0 ? screen.protokoll : await getOrCreateDraftProtokoll(screen.gruppe.id, {
              name: screen.protokoll.name,
              ort: screen.protokoll.ort,
              autor: screen.protokoll.autor,
            });
            setScreen({ name: 'neu', protokoll: prot, gruppe: screen.gruppe, vorgaenger });
          }}
          onNavigate={async (elem) => {
            let prot = screen.protokoll;
            if (elem.protokoll_id !== screen.protokoll.id) {
              const prots = await getProtokolleByGruppe(screen.gruppe.id);
              const found = prots.find(p => p.id === elem.protokoll_id);
              if (found) prot = found;
            }
            setScreen({ name: 'detail', element: elem, protokoll: prot, gruppe: screen.gruppe, filteredIds: screen.filteredIds });
          }}
          onClone={async (clone) => {
            const prot = screen.protokoll.nummer < 0 ? screen.protokoll : await getOrCreateDraftProtokoll(screen.gruppe.id, {
              name: screen.protokoll.name,
              ort: screen.protokoll.ort,
              autor: screen.protokoll.autor,
            });
            setScreen({ name: 'neu', protokoll: prot, gruppe: screen.gruppe, clone });
          }}
        />
      );
    case 'neu':
      return (
        <NeuesElement
          key={key}
          protokoll={screen.protokoll}
          gruppe={screen.gruppe}
          vorgaenger={screen.vorgaenger}
          clone={screen.clone}
          isBautagebuch={screen.isBautagebuch}
          onBack={() => goUebersicht(screen.gruppe.id)}
          onSaved={() => { refresh(); goUebersicht(screen.gruppe.id); }}
          onSavedAndNew={() => { refresh(); setScreen({ name: 'neu', protokoll: screen.protokoll, gruppe: screen.gruppe }); }}
          onSavedAndClone={(clone) => { refresh(); setScreen({ name: 'neu', protokoll: screen.protokoll, gruppe: screen.gruppe, clone }); }}
        />
      );
    case 'export':
      return (
        <ExportScreen
          protokoll={screen.protokoll}
          gruppe={screen.gruppe}
          onBack={() => goUebersicht(screen.gruppe.id)}
        />
      );
    case 'schnell':
      return (
        <SchnellErstellung
          protokoll={screen.protokoll}
          gruppe={screen.gruppe}
          onBack={() => goUebersicht(screen.gruppe.id)}
          onDone={() => { refresh(); goUebersicht(screen.gruppe.id); }}
        />
      );
  }
}
