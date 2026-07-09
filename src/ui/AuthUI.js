import { signUp, signIn, signInAnonymously, getSession, getProfile, subscribeOnlineCount, getDeterministicGuestName, isPlaceholderName } from '../network/SupabaseClient.js';

export class AuthUI {
    constructor(onAuthSuccess) {
        this.onAuthSuccess = onAuthSuccess;
        this.screen = document.getElementById('auth-screen');
        this.statusEl = document.getElementById('auth-status');
        this._unsubOnlineCount = null;
        this._isRegisterMode = false;
        this._sessionData = null;

        // BGM initialization
        this._bgm = new Audio('/src/login.mp3');
        this._bgm.loop = true;
        this._bgm.volume = 0.3;
        this._bgmPlayed = false;
        this._autoplayTrigger = null;

        this._setupButtons();
        this._createParticles();
        this._subscribeOnlineCount();
        this._checkExistingSession();
        this._setupBGMAutoplay();
    }

    _setupButtons() {
        this._charnameEl = document.getElementById('auth-charname');
        this._loginBtn = document.getElementById('btn-login');
        this._registerBtn = document.getElementById('btn-register');

        this._loginBtn.addEventListener('click', () => {
            if (this._sessionData) {
                this._enterGameWithSession();
            } else if (this._isRegisterMode) {
                this._setMode(false);
            } else {
                this._handleLogin();
            }
        });

        this._registerBtn.addEventListener('click', () => {
            if (this._sessionData) {
                this._handleSignOut();
            } else if (!this._isRegisterMode) {
                this._setMode(true);
            } else {
                this._handleRegister();
            }
        });

        document.getElementById('btn-guest').addEventListener('click', () => this._handleGuest());

        // Enter key support
        document.getElementById('auth-password').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (this._isRegisterMode) {
                    this._charnameEl.focus();
                } else {
                    this._handleLogin();
                }
            }
        });
        this._charnameEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this._handleRegister();
        });
    }

    _setMode(isRegister) {
        this._isRegisterMode = isRegister;
        this._charnameEl.style.display = isRegister ? '' : 'none';
        if (!isRegister) this._charnameEl.value = '';
        this._registerBtn.textContent = isRegister ? '📜 Create Account' : '📜 Register';
        this._loginBtn.textContent = isRegister ? '← Back to Login' : '⚔️ Login';
        this._setStatus(isRegister ? 'Choose your character name!' : '', 'info');
        if (isRegister) this._charnameEl.focus();
    }

    _createParticles() {
        const container = document.getElementById('auth-particles');
        for (let i = 0; i < 30; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            p.style.left = Math.random() * 100 + '%';
            p.style.animationDelay = Math.random() * 8 + 's';
            p.style.animationDuration = (6 + Math.random() * 6) + 's';
            container.appendChild(p);
        }
    }

    async _checkExistingSession() {
        try {
            const session = await getSession();
            if (session) {
                const profile = await getProfile(session.user.id);
                let username = profile?.username;
                if (!username || isPlaceholderName(username)) {
                    username = getDeterministicGuestName(session.user.id);
                }
                this._sessionData = {
                    userId: session.user.id,
                    username,
                    isGuest: session.user.is_anonymous === true,
                };
                this._setStatus('Found active session for ' + username + '.', 'info');
                this._showSessionMode(username);
            }
        } catch (e) {
            // No session, show login
        }
    }

    _showSessionMode(username) {
        document.getElementById('auth-username').style.display = 'none';
        document.getElementById('auth-password').style.display = 'none';
        if (this._charnameEl) this._charnameEl.style.display = 'none';

        this._loginBtn.textContent = `⚔️ Enter Game as ${username}`;
        this._registerBtn.textContent = '🚪 Switch Account';

        const guestBtn = document.getElementById('btn-guest');
        if (guestBtn) guestBtn.style.display = 'none';

        const dividers = document.querySelectorAll('.auth-divider');
        dividers.forEach(el => el.style.display = 'none');
    }

    _enterGameWithSession() {
        if (!this._sessionData) return;
        this._setStatus('Connecting to world... ⚔️', 'success');
        setTimeout(() => {
            this.onAuthSuccess(this._sessionData);
            this.hide();
        }, 500);
    }

    async _handleSignOut() {
        this._setStatus('Signing out...', 'info');
        try {
            const { clearActiveSession, supabase } = await import('../network/SupabaseClient.js');
            clearActiveSession();
            if (supabase) {
                await supabase.auth.signOut();
            }
        } catch (e) {
            console.error('Sign out error:', e);
        }

        // Reset session state
        this._sessionData = null;

        // Restore normal inputs and buttons
        document.getElementById('auth-username').style.display = '';
        document.getElementById('auth-password').style.display = '';
        document.getElementById('auth-username').value = '';
        document.getElementById('auth-password').value = '';

        const guestBtn = document.getElementById('btn-guest');
        if (guestBtn) guestBtn.style.display = '';

        const dividers = document.querySelectorAll('.auth-divider');
        dividers.forEach(el => el.style.display = '');

        // Restore register button to default
        this._isRegisterMode = false;
        this._loginBtn.textContent = '⚔️ Login';
        this._registerBtn.textContent = '📜 Register';
        this._setStatus('', 'info');
    }

    async _handleLogin() {
        const input = document.getElementById('auth-username').value.trim();
        const password = document.getElementById('auth-password').value.trim();
        if (!input || !password) {
            this._setStatus('Please enter email/username and password', 'error');
            return;
        }

        this._setStatus('Logging in...', 'info');
        try {
            const email = input.includes('@') ? input : `${input}@zolos.game`;
            const data = await signIn(email, password);
            const profile = await getProfile(data.user.id);
            this._setStatus('Welcome back! ⚔️', 'success');
            setTimeout(() => {
                this.onAuthSuccess({
                    userId: data.user.id,
                    username: profile?.username || input,
                    isGuest: false,
                });
                this.hide();
            }, 500);
        } catch (e) {
            let errorMsg = e.message || 'Login failed';
            if (errorMsg.toLowerCase().includes('rate limit') || errorMsg.toLowerCase().includes('rate_limit')) {
                errorMsg += ' (Try Guest Mode or check Supabase settings)';
            }
            this._setStatus(errorMsg, 'error');
        }
    }

    async _handleRegister() {
        const input = document.getElementById('auth-username').value.trim();
        const password = document.getElementById('auth-password').value.trim();
        const charName = this._charnameEl.value.trim();

        if (!input || !password) {
            this._setStatus('Please enter email/username and password', 'error');
            return;
        }
        if (!charName) {
            this._setStatus('Please enter a character name', 'error');
            this._charnameEl.focus();
            return;
        }
        if (charName.length < 2 || charName.length > 16) {
            this._setStatus('Character name must be 2-16 characters', 'error');
            return;
        }
        if (password.length < 6) {
            this._setStatus('Password must be at least 6 characters', 'error');
            return;
        }

        this._setStatus('Creating account...', 'info');
        try {
            const email = input.includes('@') ? input : `${input}@zolos.game`;
            const data = await signUp(email, password, charName);
            this._setStatus('Account created! Welcome, ' + charName + '! ⚔️', 'success');
            setTimeout(() => {
                this.onAuthSuccess({
                    userId: data.user.id,
                    username: charName,
                    isGuest: false,
                });
                this.hide();
            }, 800);
        } catch (e) {
            let errorMsg = e.message || 'Registration failed';
            if (errorMsg.toLowerCase().includes('rate limit') || errorMsg.toLowerCase().includes('rate_limit')) {
                errorMsg += ' (Try Guest Mode or disable Email Confirmation in Supabase settings)';
            }
            this._setStatus(errorMsg, 'error');
        }
    }

    async _handleGuest() {
        this._setStatus('Starting as guest...', 'info');
        try {
            const data = await signInAnonymously();
            const username = data.guestName || getDeterministicGuestName(data.user?.id);
            this._setStatus('Welcome, ' + username + '! 🎮', 'success');
            setTimeout(() => {
                this.onAuthSuccess({
                    userId: data.user.id,
                    username,
                    isGuest: true,
                });
                this.hide();
            }, 500);
        } catch (e) {
            this._setStatus(e.message || 'Guest login failed', 'error');
        }
    }

    _setStatus(msg, type) {
        this.statusEl.textContent = msg;
        this.statusEl.style.color = type === 'error' ? '#ff6080'
            : type === 'success' ? '#40e080'
                : '#60a0ff';
    }

    _subscribeOnlineCount() {
        const el = document.getElementById('online-players-auth');
        if (!el) return;
        this._unsubOnlineCount = subscribeOnlineCount((count) => {
            el.textContent = count;
        });
    }

    _setupBGMAutoplay() {
        const playAttempt = () => {
            if (this._bgmPlayed) return;
            this._bgm.play().then(() => {
                this._bgmPlayed = true;
                this._removeAutoplayListeners();
            }).catch((err) => {
                console.log('Autoplay blocked. Waiting for interaction to play BGM.', err);
            });
        };

        this._autoplayTrigger = playAttempt;

        // Try playing immediately
        playAttempt();

        // Listen for interaction if it was blocked
        document.addEventListener('click', this._autoplayTrigger);
        document.addEventListener('keydown', this._autoplayTrigger);
        document.addEventListener('touchstart', this._autoplayTrigger);
    }

    _removeAutoplayListeners() {
        if (this._autoplayTrigger) {
            document.removeEventListener('click', this._autoplayTrigger);
            document.removeEventListener('keydown', this._autoplayTrigger);
            document.removeEventListener('touchstart', this._autoplayTrigger);
        }
    }

    _fadeOutBGM() {
        if (!this._bgm) return;

        const fadeInterval = 50; // ms
        const fadeDuration = 500; // ms
        const steps = fadeDuration / fadeInterval;
        const volumeStep = this._bgm.volume / steps;

        const fade = setInterval(() => {
            if (!this._bgm) {
                clearInterval(fade);
                return;
            }
            if (this._bgm.volume > volumeStep) {
                this._bgm.volume -= volumeStep;
            } else {
                this._bgm.volume = 0;
                this._bgm.pause();
                clearInterval(fade);
            }
        }, fadeInterval);
    }

    hide() {
        if (this._unsubOnlineCount) {
            this._unsubOnlineCount();
            this._unsubOnlineCount = null;
        }
        this._removeAutoplayListeners();
        this._fadeOutBGM();
        this.screen.style.display = 'none';
    }

    show() {
        this.screen.style.display = 'flex';
        if (this._bgm) {
            this._bgm.volume = 0.3;
            this._bgmPlayed = false;
            this._setupBGMAutoplay();
        }
    }
}
