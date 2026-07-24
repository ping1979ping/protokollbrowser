/**
 * termNorm — kanonische Namens-Normalisierung + Offline-Fuzzy-Match des
 * Projektwoerterbuchs (Phase 06.5-09, PWA-Welle).
 *
 * EIN Spiegel der DB-/Python-/Hub-TS-Regel (O-PW-10): online und offline duerfen
 * NICHT auseinanderlaufen. Deckungsgleich mit
 *   - DB (Migration 0087, autoritativ): lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))
 *   - Python (services/term_norm.name_norm):  re.sub(r"\s+", " ", s.strip()).lower()
 *   - Hub-Frontend (frontend/src/lib/protokoll/termNorm.ts): s.trim().replace(/\s+/g," ").toLowerCase()
 *
 * Bewusst abhaengigkeitsfrei (kein npm-Fuzzy-Dep — die PWA bleibt schlank). Der
 * Fuzzy-Match ist ein hand-gerollter Trigramm-Dice-Koeffizient (~30 LOC), weil er
 * dem serverseitigen ``pg_trgm``-Match semantisch nahe ist (beide trigramm-basiert,
 * gleiche Normalisierung → Online/Offline decken sich, O-PW-10).
 *
 * Beispiele:
 *   nameNorm("  Nachträge ")  === "nachträge"
 *   nameNorm("Bau  Ablauf")   === "bau ablauf"
 */
export const nameNorm = (s: string): string =>
  s.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Trigramme eines Strings — mit demselben Padding-Geist wie ``pg_trgm``: der
 * normalisierte Text wird vorne mit zwei Leerzeichen, hinten mit einem Leerzeichen
 * gepolstert, damit Wortanfaenge/-enden mit-gewichtet werden.
 */
function trigrams(s: string): Set<string> {
  const t = `  ${nameNorm(s)} `;
  const grams = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) {
    grams.add(t.slice(i, i + 3));
  }
  return grams;
}

/** Dice-Koeffizient zweier Strings ueber ihre Trigramm-Mengen (0..1). */
export function dice(a: string, b: string): number {
  const na = nameNorm(a);
  const nb = nameNorm(b);
  if (na === nb) return 1;
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter++;
  return (2 * inter) / (ta.size + tb.size);
}

/** Minimaler Term-Vertrag fuer den Offline-Match/die Kaskade. */
export interface TermLike {
  id: string;
  name: string;
  name_norm: string;
  synonyme?: string[];
  is_active?: boolean;
  sort_order?: number;
}

/**
 * Bester unscharfer Treffer oberhalb der Schwelle (Default 0.3 — gespiegelt zur
 * ``pg_trgm``-Default-Schwelle des Servers). Exakte Treffer (gleiche name_norm)
 * werden ausgeschlossen: sie sind kein „Meintest du?"-Fall, sondern eine direkte
 * Auswahl (der Aufrufer prueft die Exaktheit vorab ueber ``nameNorm``).
 */
export function bestMatch<T extends TermLike>(
  input: string,
  terms: T[],
  threshold = 0.3,
): T | null {
  const inNorm = nameNorm(input);
  let best: T | null = null;
  let bestScore = 0;
  for (const t of terms) {
    if (t.name_norm === inNorm) continue; // exakt -> kein Abgleich-Dialog
    const score = dice(input, t.name);
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return bestScore >= threshold ? best : null;
}

// ============================================================
// Vorschlagskaskade Stufe 1 (§6.5 Regeln 1-4) — rule-identisch zum Hub
// (frontend/src/lib/protokoll/kaskade.ts, 06.5-07). Deterministisch, erster
// Treffer gewinnt; erzeugt NUR einen sichtbaren Vorschlag, NIE eine stille
// Auto-Zuordnung (W-4/D-11).
// ============================================================

/** Welche der vier §6.5-Regeln den Vorschlag geliefert hat. */
export type KaskadenRegel = 1 | 2 | 3 | 4;

/** Regel -> sichtbare Begruendung (UI-SPEC §3, verbatim zum Hub). */
export const KASKADEN_REASON: Record<KaskadenRegel, string> = {
  1: "aus Vorgänger übernommen",
  2: "Stichwort-Treffer",
  3: "Position im Protokoll",
  4: "Standard-Thema",
};

export interface KaskadenVorschlagErgebnis {
  term: TermLike;
  reason: string;
  regel: KaskadenRegel;
}

export interface KaskadenEingabe {
  /** Regel 1 (hart): aus dem Vorgaenger-Element vererbtes Thema. */
  inheritedTerm?: TermLike | null;
  /** Regel 2: Rohtext des Elements (Positionstitel/-text) fuer den Stichwort-Treffer. */
  elementText?: string;
  /** Regel 4/2: die Themen der Gruppe (aktive werden in sort_order durchlaufen). */
  groupThemes: TermLike[];
  /** Regel 3: das zuletzt im Protokoll gesetzte Thema (Positions-Kontext). */
  lastElementTerm?: TermLike | null;
}

/** Aktive Themen in stabiler sort_order. */
function aktiveThemen(themen: TermLike[]): TermLike[] {
  return themen
    .filter((t) => t.is_active !== false)
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

/**
 * Berechnet den sichtbaren Kaskaden-Vorschlag (§6.5). Erster Treffer gewinnt;
 * ``null``, wenn keine Regel greift.
 */
export function computeSuggestion({
  inheritedTerm,
  elementText = "",
  groupThemes,
  lastElementTerm,
}: KaskadenEingabe): KaskadenVorschlagErgebnis | null {
  // Regel 1 — Erbe (hart): schlaegt alles andere.
  if (inheritedTerm) {
    return { term: inheritedTerm, reason: KASKADEN_REASON[1], regel: 1 };
  }

  const themen = aktiveThemen(groupThemes);

  // Regel 2 — Stichwort/Synonym: normalisierter Elementtext enthaelt den
  // normalisierten Themen-Namen oder ein normalisiertes Synonym als Teilstring.
  const textNorm = nameNorm(elementText);
  if (textNorm) {
    for (const t of themen) {
      const nameTreffer = t.name_norm.length > 0 && textNorm.includes(t.name_norm);
      const synonymTreffer = (t.synonyme ?? []).some((syn) => {
        const s = nameNorm(syn);
        return s.length > 0 && textNorm.includes(s);
      });
      if (nameTreffer || synonymTreffer) {
        return { term: t, reason: KASKADEN_REASON[2], regel: 2 };
      }
    }
  }

  // Regel 3 — Positions-Kontext: das zuletzt gesetzte Thema.
  if (lastElementTerm) {
    return { term: lastElementTerm, reason: KASKADEN_REASON[3], regel: 3 };
  }

  // Regel 4 — Fallback: erstes aktives Gruppen-Thema (keine Restgruppe, D-04).
  if (themen.length > 0) {
    return { term: themen[0], reason: KASKADEN_REASON[4], regel: 4 };
  }

  return null;
}
