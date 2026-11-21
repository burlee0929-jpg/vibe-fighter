import {
  createUserWithEmailAndPassword,
  deleteUser,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User
} from 'firebase/auth';
import {
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
  writeBatch
} from 'firebase/firestore';

import {
  sanitizeHeroId,
  USERNAME_PATTERN,
  usernameToSyntheticEmail,
  validatePassword,
  validateUsername
} from './accountValidation';
import {
  auth,
  db,
  FIREBASE_AUTH_PROVIDERS_URL,
  handleFirestoreError,
  OperationType
} from './firebase';

export { usernameToSyntheticEmail, validatePassword, validateUsername };

export interface UserAccountProfile {
  uid: string;
  username: string;
  usernameLower: string;
  wins: number;
  losses: number;
  matchesPlayed: number;
  favoriteHero: string;
}

export interface AccountState {
  ready: boolean;
  busy: boolean;
  user: User | null;
  profile: UserAccountProfile | null;
  error: string | null;
}

export function formatAuthError(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';
  const msg = error instanceof Error ? error.message : String(error);

  if (code === 'auth/email-already-in-use') {
    return 'That username is already registered. Try signing in instead.';
  }
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'Invalid username or password.';
  }
  if (code === 'auth/weak-password') {
    return 'Password is too weak (use at least 6 characters).';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'Google sign-in popup was closed before finishing.';
  }
  if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
    return `Enable Email/Password in Firebase Auth Providers (${FIREBASE_AUTH_PROVIDERS_URL}) or use Google Sign-In.`;
  }

  return msg || 'Authentication failed. Please try again.';
}

function deriveGoogleUsername(user: User): string {
  const baseSource = user.displayName || user.email?.split('@')[0] || 'fighter';
  const cleaned = baseSource.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 13);
  const prefix = cleaned.length >= 3 ? cleaned : 'fighter';
  const suffix = user.uid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 5) || '001';
  return `${prefix}_${suffix}`.slice(0, 20);
}

class AccountService {
  private state: AccountState = {
    ready: false,
    busy: false,
    user: null,
    profile: null,
    error: null
  };

  private readonly listeners = new Set<(state: AccountState) => void>();

  constructor() {
    onAuthStateChanged(auth, (user) => {
      void this.handleAuthChanged(user);
    });
  }

  getState(): AccountState {
    return this.state;
  }

  subscribe(listener: (state: AccountState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  clearError(): void {
    if (this.state.error !== null) {
      this.setState({ error: null });
    }
  }

  async registerWithUsernamePassword(rawUsername: string, rawPassword: string): Promise<void> {
    const userCheck = validateUsername(rawUsername);
    if (!userCheck.ok) {
      this.setState({ error: userCheck.message });
      throw new Error(userCheck.message);
    }

    const passCheck = validatePassword(rawPassword);
    if (!passCheck.ok) {
      this.setState({ error: passCheck.message });
      throw new Error(passCheck.message);
    }

    this.setState({ busy: true, error: null });

    try {
      const email = usernameToSyntheticEmail(userCheck.usernameLower);
      const cred = await createUserWithEmailAndPassword(auth, email, passCheck.password);

      const usernamePath = `usernames/${userCheck.usernameLower}`;
      let existingNameSnap;
      try {
        existingNameSnap = await getDoc(doc(db, 'usernames', userCheck.usernameLower));
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, usernamePath);
      }

      if (existingNameSnap.exists()) {
        try {
          await deleteUser(cred.user);
        } catch {
          await signOut(auth);
        }
        throw new Error('That username is already taken.');
      }

      await updateProfile(cred.user, { displayName: userCheck.username });
      const profile = await this.createProfileAtomically(
        cred.user.uid,
        userCheck.username,
        userCheck.usernameLower,
        'sukuna'
      );

      this.setState({ ready: true, busy: false, user: cred.user, profile, error: null });
    } catch (error) {
      const message = formatAuthError(error);
      this.setState({ busy: false, error: message });
      throw new Error(message);
    }
  }

  async loginWithUsernamePassword(rawIdentifier: string, rawPassword: string): Promise<void> {
    const identifier = rawIdentifier.trim();
    if (!identifier) {
      const msg = 'Enter your username.';
      this.setState({ error: msg });
      throw new Error(msg);
    }

    const passCheck = validatePassword(rawPassword);
    if (!passCheck.ok) {
      this.setState({ error: passCheck.message });
      throw new Error(passCheck.message);
    }

    this.setState({ busy: true, error: null });

    try {
      let email = identifier;
      let preferredUsername = identifier;

      if (!identifier.includes('@')) {
        const userCheck = validateUsername(identifier);
        if (!userCheck.ok) {
          throw new Error(userCheck.message);
        }
        email = usernameToSyntheticEmail(userCheck.usernameLower);
        preferredUsername = userCheck.username;
      }

      const cred = await signInWithEmailAndPassword(auth, email, passCheck.password);
      const profile = await this.loadOrEnsureProfile(cred.user, preferredUsername);
      this.setState({ ready: true, busy: false, user: cred.user, profile, error: null });
    } catch (error) {
      const message = formatAuthError(error);
      this.setState({ busy: false, error: message });
      throw new Error(message);
    }
  }

  async loginWithGoogle(): Promise<void> {
    this.setState({ busy: true, error: null });

    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      const profile = await this.loadOrEnsureProfile(cred.user, deriveGoogleUsername(cred.user));
      this.setState({ ready: true, busy: false, user: cred.user, profile, error: null });
    } catch (error) {
      const message = formatAuthError(error);
      this.setState({ busy: false, error: message });
      throw new Error(message);
    }
  }

  async logout(): Promise<void> {
    this.setState({ busy: true, error: null });
    try {
      await signOut(auth);
      this.setState({ ready: true, busy: false, user: null, profile: null, error: null });
    } catch (error) {
      const message = formatAuthError(error);
      this.setState({ busy: false, error: message });
      throw new Error(message);
    }
  }

  async recordMatchOutcome(won: boolean, heroId: string): Promise<void> {
    const user = this.state.user ?? auth.currentUser;
    const currentProfile = this.state.profile;
    if (!user || !currentProfile) {
      return;
    }

    const nextWins = currentProfile.wins + (won ? 1 : 0);
    const nextLosses = currentProfile.losses + (won ? 0 : 1);
    const nextMatches = nextWins + nextLosses;
    const nextHero = sanitizeHeroId(heroId);
    const userPath = `users/${user.uid}`;

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        wins: nextWins,
        losses: nextLosses,
        matchesPlayed: nextMatches,
        favoriteHero: nextHero,
        updatedAt: serverTimestamp()
      });

      this.setState({
        profile: {
          ...currentProfile,
          wins: nextWins,
          losses: nextLosses,
          matchesPlayed: nextMatches,
          favoriteHero: nextHero
        }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, userPath);
    }
  }

  private async handleAuthChanged(user: User | null): Promise<void> {
    if (!user) {
      this.setState({ ready: true, busy: false, user: null, profile: null });
      return;
    }

    try {
      const fallbackName =
        user.displayName && USERNAME_PATTERN.test(user.displayName)
          ? user.displayName
          : deriveGoogleUsername(user);
      const profile = await this.loadOrEnsureProfile(user, fallbackName);
      this.setState({ ready: true, user, profile });
    } catch (error) {
      this.setState({
        ready: true,
        user,
        profile: null,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async loadOrEnsureProfile(user: User, fallbackUsername: string): Promise<UserAccountProfile> {
    const userPath = `users/${user.uid}`;
    let snap;
    try {
      snap = await getDoc(doc(db, 'users', user.uid));
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, userPath);
    }

    if (snap.exists()) {
      const data = snap.data();
      return {
        uid: String(data.uid ?? user.uid),
        username: String(data.username ?? fallbackUsername),
        usernameLower: String(data.usernameLower ?? fallbackUsername.toLowerCase()),
        wins: Number(data.wins ?? 0),
        losses: Number(data.losses ?? 0),
        matchesPlayed: Number(data.matchesPlayed ?? 0),
        favoriteHero: String(data.favoriteHero ?? 'sukuna')
      };
    }

    const candidateCheck = validateUsername(fallbackUsername);
    const baseName = candidateCheck.ok ? candidateCheck.username : deriveGoogleUsername(user);
    const baseLower = baseName.toLowerCase();

    return this.createProfileAtomically(user.uid, baseName, baseLower, 'sukuna');
  }

  private async createProfileAtomically(
    uid: string,
    username: string,
    usernameLower: string,
    favoriteHero: string
  ): Promise<UserAccountProfile> {
    const safeHero = sanitizeHeroId(favoriteHero);
    const batch = writeBatch(db);
    const userRef = doc(db, 'users', uid);
    const usernameRef = doc(db, 'usernames', usernameLower);

    batch.set(usernameRef, {
      uid,
      username,
      createdAt: serverTimestamp()
    });

    batch.set(userRef, {
      uid,
      username,
      usernameLower,
      wins: 0,
      losses: 0,
      matchesPlayed: 0,
      favoriteHero: safeHero,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
    }

    return {
      uid,
      username,
      usernameLower,
      wins: 0,
      losses: 0,
      matchesPlayed: 0,
      favoriteHero: safeHero
    };
  }

  private setState(patch: Partial<AccountState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

let accountService: AccountService | null = null;

export function getAccountService(): AccountService {
  if (!accountService) {
    accountService = new AccountService();
  }
  return accountService;
}
