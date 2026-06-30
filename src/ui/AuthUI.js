// Auth UI — Login/Register/Guest screen
import { signUp, signIn, signInAnonymously, getSession, getProfile } from '../network/SupabaseClient.js';

export class AuthUI {
    constructor(onAuthSuccess) {
        this.onAuthSuccess = onAuthSuccess;
        this.screen = document.getElementById('auth-screen');
        this.statusEl = document.getElementById('auth-status');

        this._setupButtons();
        this._createParticles();
        this._checkExistingSession();
    }

    _setupButtons() {
        document.getElementById('btn-login').addEventListener('click', () => this._handleLogin());
        document.getElementById('btn-register').addEventListener('click', () => this._handleRegister());
        document.getElementById('btn-guest').addEventListener('click', () => this._handleGuest());

        // Enter key support
        document.getElementById('auth-password').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this._handleLogin();
        });
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
                const username = profile?.username || 'Adventurer';
                this._setStatus('Welcome back, ' + username + '!', 'success');
                setTimeout(() => {
                    this.onAuthSuccess({
                        userId: session.user.id,
                        username,
                        isGuest: session.user.is_anonymous === true,
                    });
                    this.hide();
                }, 800);
            }
        } catch (e) {
            // No session, show login
        }
    }

    async _handleLogin() {
        const username = document.getElementById('auth-username').value.trim();
        const password = document.getElementById('auth-password').value.trim();
        if (!username || !password) {
            this._setStatus('Please enter username and password', 'error');
            return;
        }

        this._setStatus('Logging in...', 'info');
        try {
            const email = username.includes('@') ? username : `${username}@zolos.game`;
            const data = await signIn(email, password);
            const profile = await getProfile(data.user.id);
            this._setStatus('Welcome back! ⚔️', 'success');
            setTimeout(() => {
                this.onAuthSuccess({
                    userId: data.user.id,
                    username: profile?.username || username,
                    isGuest: false,
                });
                this.hide();
            }, 500);
        } catch (e) {
            this._setStatus(e.message || 'Login failed', 'error');
        }
    }

    async _handleRegister() {
        const username = document.getElementById('auth-username').value.trim();
        const password = document.getElementById('auth-password').value.trim();
        if (!username || !password) {
            this._setStatus('Please enter username and password', 'error');
            return;
        }
        if (password.length < 6) {
            this._setStatus('Password must be at least 6 characters', 'error');
            return;
        }

        this._setStatus('Creating account...', 'info');
        try {
            const email = `${username}@zolos.game`;
            const data = await signUp(email, password, username);
            this._setStatus('Account created! Welcome, ' + username + '! ⚔️', 'success');
            setTimeout(() => {
                this.onAuthSuccess({
                    userId: data.user.id,
                    username,
                    isGuest: false,
                });
                this.hide();
            }, 800);
        } catch (e) {
            this._setStatus(e.message || 'Registration failed', 'error');
        }
    }

    async _handleGuest() {
        this._setStatus('Starting as guest...', 'info');
        try {
            const data = await signInAnonymously();
            const username = data.guestName || 'Guest';
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

    hide() {
        this.screen.style.display = 'none';
    }

    show() {
        this.screen.style.display = 'flex';
    }
}
