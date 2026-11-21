export const SESSION_RECORD_STORAGE_KEY = 'street-fighter-session-record';

export interface SessionMatchRecord {
  wins: number;
  losses: number;
  matchesPlayed: number;
  streak: number;
  lastOutcome: 'win' | 'loss' | null;
}

export type SessionRecordListener = (record: SessionMatchRecord) => void;

export interface SessionRecordStore {
  getState: () => SessionMatchRecord;
  subscribe: (listener: SessionRecordListener) => () => void;
  recordWin: () => SessionMatchRecord;
  recordLoss: () => SessionMatchRecord;
  recordMatch: (won: boolean) => SessionMatchRecord;
  reset: () => SessionMatchRecord;
}

export const DEFAULT_SESSION_RECORD: SessionMatchRecord = {
  wins: 0,
  losses: 0,
  matchesPlayed: 0,
  streak: 0,
  lastOutcome: null
};

function sanitizeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

export function normalizeSessionRecord(raw: unknown): SessionMatchRecord {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_SESSION_RECORD };
  }

  const candidate = raw as Partial<SessionMatchRecord>;
  const wins = sanitizeCount(candidate.wins);
  const losses = sanitizeCount(candidate.losses);
  const streak = sanitizeCount(candidate.streak);
  const lastOutcome =
    candidate.lastOutcome === 'win' || candidate.lastOutcome === 'loss' ? candidate.lastOutcome : null;

  return {
    wins,
    losses,
    matchesPlayed: wins + losses,
    streak,
    lastOutcome
  };
}

function getDefaultSessionStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function createSessionRecordStore(
  storage: Storage | null = getDefaultSessionStorage()
): SessionRecordStore {
  let state: SessionMatchRecord = loadRecord(storage);
  const listeners = new Set<SessionRecordListener>();

  const emit = (): void => {
    listeners.forEach((listener) => listener({ ...state }));
  };

  const commit = (next: SessionMatchRecord): SessionMatchRecord => {
    state = normalizeSessionRecord(next);
    saveRecord(storage, state);
    emit();
    return { ...state };
  };

  return {
    getState: () => ({ ...state }),
    subscribe: (listener) => {
      listeners.add(listener);
      listener({ ...state });
      return () => {
        listeners.delete(listener);
      };
    },
    recordWin: () =>
      commit({
        wins: state.wins + 1,
        losses: state.losses,
        matchesPlayed: state.wins + state.losses + 1,
        streak: state.streak + 1,
        lastOutcome: 'win'
      }),
    recordLoss: () =>
      commit({
        wins: state.wins,
        losses: state.losses + 1,
        matchesPlayed: state.wins + state.losses + 1,
        streak: 0,
        lastOutcome: 'loss'
      }),
    recordMatch: (won: boolean) =>
      won
        ? commit({
            wins: state.wins + 1,
            losses: state.losses,
            matchesPlayed: state.wins + state.losses + 1,
            streak: state.streak + 1,
            lastOutcome: 'win'
          })
        : commit({
            wins: state.wins,
            losses: state.losses + 1,
            matchesPlayed: state.wins + state.losses + 1,
            streak: 0,
            lastOutcome: 'loss'
          }),
    reset: () => commit({ ...DEFAULT_SESSION_RECORD })
  };
}

function loadRecord(storage: Storage | null): SessionMatchRecord {
  if (!storage) {
    return { ...DEFAULT_SESSION_RECORD };
  }

  try {
    const raw = storage.getItem(SESSION_RECORD_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_SESSION_RECORD };
    }
    return normalizeSessionRecord(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SESSION_RECORD };
  }
}

function saveRecord(storage: Storage | null, record: SessionMatchRecord): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(SESSION_RECORD_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Ignore storage quota / private mode failures
  }
}

let sharedStore: SessionRecordStore | null = null;

export function getSessionRecordStore(): SessionRecordStore {
  if (!sharedStore) {
    sharedStore = createSessionRecordStore();
  }
  return sharedStore;
}
