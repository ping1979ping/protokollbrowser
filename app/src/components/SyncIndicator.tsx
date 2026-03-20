import type { SyncStatus } from '../useSyncStatus';

interface Props {
  sync: SyncStatus;
}

export default function SyncIndicator({ sync }: Props) {
  const timeStr = sync.lastSync
    ? new Date(sync.lastSync).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="flex items-center gap-2 text-xs">
      {/* Status-Punkt */}
      <span
        className={`w-2 h-2 rounded-full ${
          sync.serverReachable ? 'bg-green-500' : sync.isOnline ? 'bg-yellow-500' : 'bg-red-500'
        }`}
      />

      {/* Pending Badge */}
      {sync.pendingCount > 0 && (
        <span className="bg-orange-500 text-white px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none">
          {sync.pendingCount}
        </span>
      )}

      {/* Letzte Sync-Zeit */}
      {timeStr && (
        <span className="text-white/60">{timeStr}</span>
      )}

      {/* Sync-Button */}
      <button
        onClick={sync.syncNow}
        disabled={sync.isSyncing || !sync.serverReachable}
        className="text-white/80 hover:text-white disabled:text-white/30 transition"
        title={sync.serverReachable ? 'Jetzt synchronisieren' : 'Server nicht erreichbar'}
      >
        <svg
          className={`w-4 h-4 ${sync.isSyncing ? 'animate-spin' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    </div>
  );
}
