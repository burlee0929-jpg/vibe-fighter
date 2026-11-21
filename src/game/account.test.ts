import { describe, expect, it } from 'vitest';

import {
  sanitizeHeroId,
  usernameToSyntheticEmail,
  validatePassword,
  validateUsername
} from './accountValidation';

describe('account validation helpers', () => {
  it('accepts valid alphanumeric and underscore usernames', () => {
    const res = validateUsername('  Bayasaa_01  ');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.username).toBe('Bayasaa_01');
      expect(res.usernameLower).toBe('bayasaa_01');
      expect(usernameToSyntheticEmail(res.usernameLower)).toBe('bayasaa_01@accounts.vibefighter.app');
    }
  });

  it('rejects too-short or invalid-character usernames', () => {
    expect(validateUsername('ab').ok).toBe(false);
    expect(validateUsername('user name!').ok).toBe(false);
    expect(validateUsername('a'.repeat(21)).ok).toBe(false);
  });

  it('validates password length bounds and hero ids', () => {
    expect(validatePassword('12345').ok).toBe(false);
    expect(validatePassword('secret1').ok).toBe(true);
    expect(sanitizeHeroId('Bayasaa')).toBe('bayasaa');
    expect(sanitizeHeroId('bad hero!')).toBe('sukuna');
  });
});
