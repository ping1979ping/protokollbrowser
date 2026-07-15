import { useState, useRef, useEffect } from 'react';
import type { Protokoll, Protokollelement, Protokollgruppe } from './types';
import { getProtokolleByGruppe, getOrCreateDraftProtokoll, findBautagebuchProtokoll } from './db';
import ImportScreen from './components/ImportScreen';
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
import { useFormFactor } from './hooks/useFormFactor';
// Redesign-Screens (PING Protokoll Design System, Smartphone + Tablet)
import AboHome from './components/redesign/AboHome';
import ProjektAuswahlNeu from './components/redesign/ProjektAuswahlNeu';
import AbonnierenScreen from './components/redesign/AbonnierenScreen';
import Gruppenuebersicht from './components/redesign/Gruppenuebersicht';
import GruppeDetail from './components/redesign/GruppeDetail';
import NeueGruppeSheet from './components/redesign/NeueGruppeSheet';

type Sel = { element: Protokollelement; protokoll: Protokoll; gruppe: Protokollgruppe; filteredIds?: string[] };

type Screen =
  | { name: 'abos' }
  | { name: 'abonnieren' }
  | { name: 'projekte' }
  | { name: 'gruppen'; projektNummer: string }
  | { name: 'gruppeDetail'; gruppeId: string }
  | { name: 'import' }
  | { name: 'server-import' }
  | { name: 'sync-settings' }
  | { name: 'uebersicht'; gruppeId: string }
  | { name: 'detail'; element: Protokollelement; protokoll: Protokoll; gruppe: Protokollgruppe; filteredIds?: string[] }
  | { name: 'neu'; protokoll: Protokoll; gruppe: Protokollgruppe; vorgaenger?: Protokollelement; clone?: { thema: string; status: number; termin: string; verantwOid: string; geoLat: number | null; geoLon: number | null; geoAcc: number | null; geoHeading: number | null; geoText: string }; isBautagebuch?: boolean }
  | { name: 'export'; protokoll: Protokoll; gruppe: Protokollgruppe }
  | { name: 'schnell'; protokoll: Protokoll; gruppe: Protokollgruppe };

export default function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [screen, setScreen] = useState<Screen>({ name: 'abos' });
  const [key, setKey] = useState(0);
  const [neueGruppeOpen, setNeueGruppeOpen] = useState(false);
  const [tabletDetail, setTabletDetail] = useState<Sel | null>(null);
  const uebersichtStateRef = useRef<UebersichtState | undefined>(undefined);
  const { isTablet, orientation } = useFormFactor();

  // Session-Ablauf abfangen (T-06-06-02).
  useEffect(() => {
    const check = () => setLoggedIn(isLoggedIn());
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, []);

  if (!loggedIn) {
    return <LoginScreen onLoggedIn={() => setLoggedIn(true)} />;
  }

  function refresh() { setKey(k => k + 1); }
  function goUebersicht(gruppeId: string) { setScreen({ name: 'uebersicht', gruppeId }); }
  function openBrowser(gruppeId: string) { uebersichtStateRef.current = undefined; setTabletDetail(null); setScreen({ name: 'uebersicht', gruppeId }); }

  // Protokoll gezielt im Browser oeffnen (Zeilenklick aus Gruppen-Detail)
  function bearbeiteProtokoll(gruppeId: string, protokollId: string) {
    uebersichtStateRef.current = { ansicht: 'einzeln', filter: '', statusFilter: null, gewaehlteProtId: protokollId };
    setTabletDetail(null);
    setScreen({ name: 'uebersicht', gruppeId });
  }

  // Entwurf-Protokoll anlegen (fuer Nachfolger/Clone aus dem Punkt-Detail)
  async function draftProt(sel: Sel): Promise<Protokoll> {
    return sel.protokoll.nummer < 0 ? sel.protokoll : await getOrCreateDraftProtokoll(sel.gruppe.id, {
      name: sel.protokoll.name, ort: sel.protokoll.ort, autor: sel.protokoll.autor,
    });
  }

  // Punkt-Detail als Node — wiederverwendet fuer Vollseite (Phone) und Tablet-Split-Pane
  function elementDetailNode(sel: Sel, opts: { embedded?: boolean; onBack: () => void; onNavigate: (elem: Protokollelement) => void }) {
    return (
      <ElementDetail
        key={sel.element.id}
        element={sel.element}
        protokoll={sel.protokoll}
        gruppe={sel.gruppe}
        filteredIds={sel.filteredIds}
        embedded={opts.embedded}
        onBack={opts.onBack}
        onNachfolger={async (vorgaenger) => {
          const prot = await draftProt(sel);
          setScreen({ name: 'neu', protokoll: prot, gruppe: sel.gruppe, vorgaenger });
        }}
        onNavigate={opts.onNavigate}
        onClone={async (clone) => {
          const prot = await draftProt(sel);
          setScreen({ name: 'neu', protokoll: prot, gruppe: sel.gruppe, clone });
        }}
      />
    );
  }

  // Im Tablet-Split zu einem anderen Punkt springen (Protokoll ggf. nachladen)
  async function navigateTabletDetail(elem: Protokollelement, cur: Sel) {
    let prot = cur.protokoll;
    if (elem.protokoll_id !== prot.id) {
      const prots = await getProtokolleByGruppe(cur.gruppe.id);
      const found = prots.find(p => p.id === elem.protokoll_id);
      if (found) prot = found;
    }
    setTabletDetail({ element: elem, protokoll: prot, gruppe: cur.gruppe, filteredIds: cur.filteredIds });
  }

  // Browser-Node (embedded steuert Voll- vs. Split-Layout)
  function browserNode(gruppeId: string, embedded: boolean, onSelect: (elem: Protokollelement, prot: Protokoll, grp: Protokollgruppe, ids?: string[]) => void) {
    return (
      <ProtokollUebersicht
        key={key}
        gruppeId={gruppeId}
        embedded={embedded}
        initialState={uebersichtStateRef.current}
        onStateChange={(s) => { uebersichtStateRef.current = s; }}
        onSelectElement={onSelect}
        onNeuesElement={(prot, grp) => setScreen({ name: 'neu', protokoll: prot, gruppe: grp })}
        onBautagebuch={async (grp) => {
          const btProt = await findBautagebuchProtokoll(grp.id);
          if (!btProt) { alert('Kein Bautagebuch-Protokoll in diesem Projekt gefunden.'); return; }
          setScreen({ name: 'neu', protokoll: btProt, gruppe: grp, isBautagebuch: true });
        }}
        onSchnellErstellung={(prot, grp) => setScreen({ name: 'schnell', protokoll: prot, gruppe: grp })}
        onExport={(prot, grp) => setScreen({ name: 'export', protokoll: prot, gruppe: grp })}
        onZurueck={() => setScreen({ name: 'gruppeDetail', gruppeId })}
      />
    );
  }

  const content = (() => {
    switch (screen.name) {
      case 'abos':
        return (
          <AboHome
            onOpenGruppeDetail={(gruppeId) => setScreen({ name: 'gruppeDetail', gruppeId })}
            onOpenBrowser={openBrowser}
            onAbonnieren={() => setScreen({ name: 'abonnieren' })}
            onAlleProjekte={() => setScreen({ name: 'projekte' })}
            onSettings={() => setScreen({ name: 'import' })}
          />
        );
      case 'abonnieren':
        return <AbonnierenScreen onBack={() => setScreen({ name: 'abos' })} onFertig={() => setScreen({ name: 'abos' })} />;
      case 'projekte':
        return (
          <ProjektAuswahlNeu
            onSelectProjekt={(projektNummer) => setScreen({ name: 'gruppen', projektNummer })}
            onBack={() => setScreen({ name: 'abos' })}
          />
        );
      case 'gruppen':
        return (
          <Gruppenuebersicht
            projektNummer={screen.projektNummer}
            onOpenGruppeDetail={(gruppeId) => setScreen({ name: 'gruppeDetail', gruppeId })}
            onNeueGruppe={() => setNeueGruppeOpen(true)}
            onBack={() => setScreen({ name: 'projekte' })}
          />
        );
      case 'gruppeDetail':
        return (
          <GruppeDetail
            gruppeId={screen.gruppeId}
            onBack={() => setScreen({ name: 'abos' })}
            onOpenBrowser={openBrowser}
            onNeuesProtokoll={(gruppeId) => openBrowser(gruppeId)}
            onProtokollBearbeiten={bearbeiteProtokoll}
          />
        );
      case 'import':
        return (
          <ImportScreen
            onImported={() => setScreen({ name: 'projekte' })}
            onServerImport={() => setScreen({ name: 'server-import' })}
            onSettings={() => setScreen({ name: 'sync-settings' })}
          />
        );
      case 'server-import':
        return (
          <ServerImportScreen
            onImported={() => setScreen({ name: 'projekte' })}
            onZurueck={() => setScreen({ name: 'import' })}
            onSettings={() => setScreen({ name: 'sync-settings' })}
          />
        );
      case 'sync-settings':
        return <SyncSettings onBack={() => setScreen({ name: 'abos' })} />;
      case 'uebersicht': {
        // Tablet + Querformat: Master-Detail-Split (Liste links, Punkt-Detail rechts)
        if (isTablet && orientation === 'quer') {
          return (
            <div className="flex h-[100dvh] overflow-hidden bg-ping-surface">
              <div className="relative w-1/2 min-w-0 border-r border-black/10">
                {browserNode(screen.gruppeId, true, (elem, prot, grp, ids) => setTabletDetail({ element: elem, protokoll: prot, gruppe: grp, filteredIds: ids }))}
              </div>
              <div className="relative w-1/2 min-w-0 bg-white">
                {tabletDetail
                  ? elementDetailNode(tabletDetail, {
                      embedded: true,
                      onBack: () => setTabletDetail(null),
                      onNavigate: (elem) => { void navigateTabletDetail(elem, tabletDetail); },
                    })
                  : <div className="flex h-full items-center justify-center px-6 text-center text-sm text-ping-text-light">Punkt aus der Liste auswaehlen</div>}
              </div>
            </div>
          );
        }
        // Phone / Hochformat: Liste als Vollseite, Detail per Navigation
        return browserNode(screen.gruppeId, false, (elem, prot, grp, ids) => setScreen({ name: 'detail', element: elem, protokoll: prot, gruppe: grp, filteredIds: ids }));
      }
      case 'detail':
        return elementDetailNode(screen, {
          onBack: () => { refresh(); goUebersicht(screen.gruppe.id); },
          onNavigate: async (elem) => {
            let prot = screen.protokoll;
            if (elem.protokoll_id !== screen.protokoll.id) {
              const prots = await getProtokolleByGruppe(screen.gruppe.id);
              const found = prots.find(p => p.id === elem.protokoll_id);
              if (found) prot = found;
            }
            setScreen({ name: 'detail', element: elem, protokoll: prot, gruppe: screen.gruppe, filteredIds: screen.filteredIds });
          },
        });
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
        return <ExportScreen protokoll={screen.protokoll} gruppe={screen.gruppe} onBack={() => goUebersicht(screen.gruppe.id)} />;
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
  })();

  return (
    <>
      {content}
      <NeueGruppeSheet
        open={neueGruppeOpen}
        onClose={() => setNeueGruppeOpen(false)}
        onCreate={(data) => {
          // Front-end-only: das eigentliche Anlegen in DocuFrame/DB folgt (Server-Wiring).
          alert(`Neue Protokollgruppe „${data.name}" (${data.quelle}) — Anlegen wird im naechsten Schritt mit dem Server verdrahtet.`);
          setNeueGruppeOpen(false);
        }}
      />
    </>
  );
}
