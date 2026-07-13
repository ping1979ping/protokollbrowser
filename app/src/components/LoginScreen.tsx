import { useState, type FormEvent } from 'react';
import { login } from '../authService';
import { getServerUrl, setServerUrl } from '../syncService';
import logo from '../assets/ping-logo.png';

interface Props {
  onLoggedIn: () => void;
}

/**
 * Login-Screen (D-11): echter Hub-JWT-Login statt Kuerzel-Stub.
 * Erscheint am App-Start, solange kein gueltiger Access-Token vorliegt.
 * Feldnutzer melden sich mit ihrem Hub-Benutzerkonto an (Benutzername ODER E-Mail).
 */
export default function LoginScreen({ onLoggedIn }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState(getServerUrl());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      // Optionale abweichende Server-URL (Dev/Preview, wenn nicht same-origin).
      const trimmed = server.trim();
      if (trimmed && trimmed !== getServerUrl()) setServerUrl(trimmed);
      await login(username, password);
      onLoggedIn();
    } catch (err) {
      setError((err as Error).message || 'Anmeldung fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-ping-bg flex flex-col items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <img src={logo} alt="PETTER INGENIEURE" className="h-14 mb-6" />
        <h1 className="text-xl font-bold text-ping-blue mb-1">Anmeldung</h1>
        <p className="text-ping-text-mid text-sm mb-8">Mit Hub-Benutzerkonto anmelden</p>

        <div className="space-y-4">
          <div>
            <label htmlFor="login-user" className="block text-sm text-ping-text-mid mb-1">
              Benutzername oder E-Mail
            </label>
            <input
              id="login-user"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border border-gray-300 rounded-xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-ping-blue"
              required
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="login-pass" className="block text-sm text-ping-text-mid mb-1">
              Passwort
            </label>
            <input
              id="login-pass"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-ping-blue"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg py-2 px-3" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-ping-blue text-white py-3 px-4 rounded-xl font-medium hover:bg-ping-blue-dark active:brightness-90 transition disabled:opacity-60"
          >
            {busy ? 'Anmelden...' : 'Anmelden'}
          </button>

          <details className="text-sm">
            <summary className="cursor-pointer text-ping-text-light hover:text-ping-blue select-none">
              Erweitert: Server-URL
            </summary>
            <div className="mt-2">
              <input
                type="url"
                inputMode="url"
                placeholder="https://hub.intern"
                value={server}
                onChange={(e) => setServer(e.target.value)}
                className="w-full border border-gray-300 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ping-blue"
              />
              <p className="mt-1 text-[11px] text-ping-text-light">
                Leer lassen, wenn die App vom Hub ausgeliefert wird (gleiche Herkunft).
              </p>
            </div>
          </details>
        </div>
      </form>
    </div>
  );
}
