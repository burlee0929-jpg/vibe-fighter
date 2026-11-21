import type * as Phaser from 'phaser';

import { getAccountService } from '../game/account';

export interface AccountModalController {
  destroy: () => void;
}

export function mountAccountModal(
  viewportEl: HTMLElement,
  getGame: () => Phaser.Game | null
): AccountModalController {
  const account = getAccountService();

  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'account-toggle';
  toggleBtn.className = 'account-toggle';
  toggleBtn.type = 'button';
  toggleBtn.setAttribute('aria-label', 'Open player account menu');
  toggleBtn.innerHTML = `
    <span class="account-toggle__icon" aria-hidden="true">👤</span>
    <span class="account-toggle__label">ACCOUNT</span>
  `;

  const topActions = viewportEl.querySelector<HTMLElement>('.viewport-top-actions');
  if (topActions) {
    topActions.prepend(toggleBtn);
  } else {
    viewportEl.appendChild(toggleBtn);
  }

  const modal = document.createElement('div');
  modal.id = 'account-modal';
  modal.className = 'account-modal';
  modal.hidden = true;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'account-modal-title');
  modal.innerHTML = `
    <div class="account-modal__card">
      <div class="account-modal__header">
        <div>
          <p class="account-modal__eyebrow">STREET FIGHTER ACCOUNT</p>
          <h2 id="account-modal-title" class="account-modal__title">STREET FIGHTER LOGIN</h2>
        </div>
        <button id="account-close" class="account-modal__close" type="button" aria-label="Close">✕</button>
      </div>

      <div id="account-auth-view">
        <div class="account-tabs">
          <button id="account-tab-signup" class="account-tab is-active" type="button">CREATE ACCOUNT</button>
          <button id="account-tab-login" class="account-tab" type="button">SIGN IN</button>
        </div>

        <form id="account-form" class="account-form" novalidate>
          <label class="account-field">
            <span>USERNAME</span>
            <input
              id="account-username"
              type="text"
              minlength="3"
              maxlength="20"
              autocomplete="username"
              placeholder="e.g. Bayasaa_01"
              required
            />
          </label>

          <label class="account-field">
            <span>PASSWORD</span>
            <div class="account-password-wrap">
              <input
                id="account-password"
                type="password"
                minlength="6"
                maxlength="128"
                autocomplete="new-password"
                placeholder="At least 6 characters"
                required
              />
              <button id="account-toggle-pw" class="account-pw-btn" type="button">SHOW</button>
            </div>
          </label>

          <label id="account-confirm-row" class="account-field">
            <span>CONFIRM PASSWORD</span>
            <input
              id="account-confirm-password"
              type="password"
              minlength="6"
              maxlength="128"
              autocomplete="new-password"
              placeholder="Repeat password"
            />
          </label>

          <p id="account-error" class="account-error" hidden></p>

          <button id="account-submit" class="account-btn account-btn--primary" type="submit">
            CREATE ACCOUNT
          </button>
        </form>

        <div class="account-divider"><span>OR</span></div>

        <button id="account-google-btn" class="account-btn account-btn--google" type="button">
          CONTINUE WITH GOOGLE
        </button>
      </div>

      <div id="account-profile-view" hidden>
        <div class="account-profile-card">
          <div class="account-profile-card__name" id="account-profile-name">@fighter</div>
          <div class="account-profile-stats">
            <div class="account-stat">
              <span>WINS</span>
              <strong id="account-stat-wins">0</strong>
            </div>
            <div class="account-stat">
              <span>LOSSES</span>
              <strong id="account-stat-losses">0</strong>
            </div>
            <div class="account-stat">
              <span>MATCHES</span>
              <strong id="account-stat-matches">0</strong>
            </div>
          </div>
          <div class="account-profile-hero">
            <span>FAVORITE HERO</span>
            <strong id="account-stat-hero">SUKUNA</strong>
          </div>
        </div>

        <p id="account-profile-error" class="account-error" hidden></p>

        <div class="account-profile-actions">
          <button id="account-logout-btn" class="account-btn account-btn--danger" type="button">SIGN OUT</button>
          <button id="account-done-btn" class="account-btn account-btn--primary" type="button">BACK TO GAME</button>
        </div>
      </div>
    </div>
  `;

  viewportEl.appendChild(modal);

  const labelEl = toggleBtn.querySelector<HTMLElement>('.account-toggle__label');
  const closeBtn = modal.querySelector<HTMLButtonElement>('#account-close');
  const titleEl = modal.querySelector<HTMLElement>('#account-modal-title');
  const authView = modal.querySelector<HTMLElement>('#account-auth-view');
  const profileView = modal.querySelector<HTMLElement>('#account-profile-view');
  const tabSignup = modal.querySelector<HTMLButtonElement>('#account-tab-signup');
  const tabLogin = modal.querySelector<HTMLButtonElement>('#account-tab-login');
  const form = modal.querySelector<HTMLFormElement>('#account-form');
  const usernameInput = modal.querySelector<HTMLInputElement>('#account-username');
  const passwordInput = modal.querySelector<HTMLInputElement>('#account-password');
  const confirmRow = modal.querySelector<HTMLElement>('#account-confirm-row');
  const confirmInput = modal.querySelector<HTMLInputElement>('#account-confirm-password');
  const togglePwBtn = modal.querySelector<HTMLButtonElement>('#account-toggle-pw');
  const errorEl = modal.querySelector<HTMLElement>('#account-error');
  const submitBtn = modal.querySelector<HTMLButtonElement>('#account-submit');
  const googleBtn = modal.querySelector<HTMLButtonElement>('#account-google-btn');

  const profileNameEl = modal.querySelector<HTMLElement>('#account-profile-name');
  const statWinsEl = modal.querySelector<HTMLElement>('#account-stat-wins');
  const statLossesEl = modal.querySelector<HTMLElement>('#account-stat-losses');
  const statMatchesEl = modal.querySelector<HTMLElement>('#account-stat-matches');
  const statHeroEl = modal.querySelector<HTMLElement>('#account-stat-hero');
  const profileErrorEl = modal.querySelector<HTMLElement>('#account-profile-error');
  const logoutBtn = modal.querySelector<HTMLButtonElement>('#account-logout-btn');
  const doneBtn = modal.querySelector<HTMLButtonElement>('#account-done-btn');

  let authMode: 'signup' | 'login' = 'signup';
  let localValidationError: string | null = null;

  const setPhaserKeyboardEnabled = (enabled: boolean): void => {
    const game = getGame();
    if (game?.input?.keyboard) {
      game.input.keyboard.enabled = enabled;
    }
  };

  const openModal = (): void => {
    modal.hidden = false;
    setPhaserKeyboardEnabled(false);
    localValidationError = null;
    account.clearError();
    render();
    if (!account.getState().user) {
      usernameInput?.focus();
    }
  };

  const closeModal = (): void => {
    modal.hidden = true;
    setPhaserKeyboardEnabled(true);
    toggleBtn.blur();
  };

  const setMode = (mode: 'signup' | 'login'): void => {
    authMode = mode;
    localValidationError = null;
    account.clearError();
    if (passwordInput) {
      passwordInput.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    }
    render();
  };

  const render = (): void => {
    const state = account.getState();
    const signedIn = Boolean(state.user && state.profile);

    toggleBtn.dataset.signedIn = String(signedIn);
    if (labelEl) {
      labelEl.textContent =
        signedIn && state.profile
          ? `@${state.profile.username} • ${state.profile.wins}W-${state.profile.losses}L`
          : 'ACCOUNT';
    }

    if (authView && profileView) {
      authView.hidden = signedIn;
      profileView.hidden = !signedIn;
    }

    if (titleEl) {
      titleEl.textContent = signedIn
        ? 'STREET FIGHTER PROFILE'
        : authMode === 'signup'
          ? 'CREATE ACCOUNT'
          : 'SIGN IN';
    }

    tabSignup?.classList.toggle('is-active', authMode === 'signup');
    tabLogin?.classList.toggle('is-active', authMode === 'login');
    if (confirmRow) {
      confirmRow.hidden = authMode !== 'signup';
    }
    if (submitBtn) {
      submitBtn.textContent = state.busy
        ? 'PLEASE WAIT...'
        : authMode === 'signup'
          ? 'CREATE ACCOUNT'
          : 'SIGN IN';
      submitBtn.disabled = state.busy;
    }
    if (googleBtn) {
      googleBtn.disabled = state.busy;
    }
    if (logoutBtn) {
      logoutBtn.disabled = state.busy;
    }

    const activeError = localValidationError ?? state.error;
    if (errorEl) {
      errorEl.hidden = !activeError || signedIn;
      errorEl.textContent = activeError ?? '';
    }
    if (profileErrorEl) {
      profileErrorEl.hidden = !activeError || !signedIn;
      profileErrorEl.textContent = activeError ?? '';
    }

    if (signedIn && state.profile) {
      if (profileNameEl) profileNameEl.textContent = `@${state.profile.username}`;
      if (statWinsEl) statWinsEl.textContent = String(state.profile.wins);
      if (statLossesEl) statLossesEl.textContent = String(state.profile.losses);
      if (statMatchesEl) statMatchesEl.textContent = String(state.profile.matchesPlayed);
      if (statHeroEl) statHeroEl.textContent = state.profile.favoriteHero.toUpperCase();
    }
  };

  const unsubscribe = account.subscribe(() => render());

  const stopGameLeak = (event: Event): void => {
    event.stopPropagation();
  };

  toggleBtn.addEventListener('pointerdown', stopGameLeak);
  toggleBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    if (modal.hidden) {
      openModal();
    } else {
      closeModal();
    }
  });

  modal.addEventListener('pointerdown', stopGameLeak);
  modal.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      closeModal();
    }
  });
  modal.addEventListener('keyup', stopGameLeak);
  modal.addEventListener('keypress', stopGameLeak);

  modal.addEventListener('click', (event) => {
    event.stopPropagation();
    if (event.target === modal) {
      closeModal();
    }
  });

  closeBtn?.addEventListener('click', () => closeModal());
  doneBtn?.addEventListener('click', () => closeModal());
  tabSignup?.addEventListener('click', () => setMode('signup'));
  tabLogin?.addEventListener('click', () => setMode('login'));

  togglePwBtn?.addEventListener('click', () => {
    if (!passwordInput) return;
    const nextType = passwordInput.type === 'password' ? 'text' : 'password';
    passwordInput.type = nextType;
    if (confirmInput) confirmInput.type = nextType;
    togglePwBtn.textContent = nextType === 'password' ? 'SHOW' : 'HIDE';
  });

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    localValidationError = null;
    account.clearError();

    const username = usernameInput?.value ?? '';
    const password = passwordInput?.value ?? '';
    const confirm = confirmInput?.value ?? '';

    if (authMode === 'signup' && password !== confirm) {
      localValidationError = 'Passwords do not match.';
      render();
      return;
    }

    const action =
      authMode === 'signup'
        ? account.registerWithUsernamePassword(username, password)
        : account.loginWithUsernamePassword(username, password);

    void action
      .then(() => {
        if (passwordInput) passwordInput.value = '';
        if (confirmInput) confirmInput.value = '';
        render();
      })
      .catch(() => {
        render();
      });
  });

  googleBtn?.addEventListener('click', () => {
    localValidationError = null;
    void account.loginWithGoogle().catch(() => render());
  });

  logoutBtn?.addEventListener('click', () => {
    localValidationError = null;
    void account.logout().catch(() => render());
  });

  return {
    destroy: () => {
      unsubscribe();
      setPhaserKeyboardEnabled(true);
      toggleBtn.remove();
      modal.remove();
    }
  };
}
