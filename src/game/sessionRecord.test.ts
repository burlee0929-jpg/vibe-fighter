import { describe, expect, it } from 'vitest';

import {
  createSessionRecordStore,
  SESSION_RECORD_STORAGE_KEY
} from './sessionRecord';

function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => Array.from(data.keys())[index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    }
  };
}

describe('sessionRecord', () => {
  it('starts at 0W - 0L and tracks wins, losses, and win streaks', () => {
    const storage = createMemoryStorage();
    const store = createSessionRecordStore(storage);

    expect(store.getState()).toEqual({
      wins: 0,
      losses: 0,
      matchesPlayed: 0,
      streak: 0,
      lastOutcome: null
    });

    store.recordMatch(true);
    store.recordMatch(true);
    expect(store.getState()).toEqual({
      wins: 2,
      losses: 0,
      matchesPlayed: 2,
      streak: 2,
      lastOutcome: 'win'
    });

    store.recordMatch(false);
    expect(store.getState()).toEqual({
      wins: 2,
      losses: 1,
      matchesPlayed: 3,
      streak: 0,
      lastOutcome: 'loss'
    });
  });

  it('persists record across store instances within the same session storage', () => {
    const storage = createMemoryStorage();
    const first = createSessionRecordStore(storage);
    first.recordWin();
    first.recordWin();
    first.recordLoss();

    const reloaded = createSessionRecordStore(storage);
    expect(reloaded.getState()).toEqual({
      wins: 2,
      losses: 1,
      matchesPlayed: 3,
      streak: 0,
      lastOutcome: 'loss'
    });
  });

  it('recovers cleanly from malformed sessionStorage data and supports reset', () => {
    const storage = createMemoryStorage();
    storage.setItem(SESSION_RECORD_STORAGE_KEY, '{not-valid-json');

    const store = createSessionRecordStore(storage);
    expect(store.getState().wins).toBe(0);
    expect(store.getState().losses).toBe(0);

    store.recordWin();
    expect(store.getState().wins).toBe(1);
    store.reset();
    expect(store.getState()).toEqual({
      wins: 0,
      losses: 0,
      matchesPlayed: 0,
      streak: 0,
      lastOutcome: null
    });
  });
});
