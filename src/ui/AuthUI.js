import { signUp, signIn, signInAnonymously, getSession, getProfile, subscribeOnlineCount, getDeterministicGuestName, isPlaceholderName, sendPasswordResetEmail } from '../network/SupabaseClient.js';

export class AuthUI {
    constructor(onAuthSuccess) {
        this.onAuthSuccess = onAuthSuccess;
        this.screen = document.getElementById('auth-screen');
        this.screen?.setAttribute('data-auth-state', 'title');
        this.statusEl = document.getElementById('auth-status');
        this._unsubOnlineCount = null;
        this._isRegisterMode = false;
        this._isForgotPwMode = false;
        this._sessionData = null;
        this._selectedClass = 'swordman';

        // BGM initialization
        this._bgm = new Audio('/assets/ZOLOSOnline.mp3');
        this._bgm.loop = true;
        this._bgm.volume = 0.3;
        this._bgmPlayed = false;
        this._bgmMuted = false;
        this._autoplayTrigger = null;
        this._bgmFadeInterval = null;

        this._pingInterval = null;
        this._pingEl = null;

        this._setupButtons();
        this._bindEvents();
        this._setup3DCardTilt();
        this._createParticles();
        this._subscribeOnlineCount();
        this._checkExistingSession();
        this._setupBGMAutoplay();
        this._startPingMonitor();
    }

    _setupButtons() {
        this._charnameEl = document.getElementById('auth-charname');
        this._charnameWrapEl = document.getElementById('charname-wrap');
        this._classSelectorEl = document.getElementById('auth-class-selector');
        this._loginBtn = document.getElementById('btn-login');
        this._registerBtn = document.getElementById('btn-register');
        this._startBtn = document.getElementById('btn-start-game');
        this._splashEl = document.getElementById('auth-splash');
        this._formWrapperEl = document.getElementById('auth-form-wrapper');
        this._changeAccountBtn = document.getElementById('btn-change-account');
        this._forgotPwBtn = document.getElementById('btn-forgot-password');
        this._bgmToggleBtn = document.getElementById('btn-auth-bgm');

        // BGM Toggle
        if (this._bgmToggleBtn) {
            this._bgmToggleBtn.addEventListener('click', () => {
                this._bgmMuted = !this._bgmMuted;
                if (this._bgm) {
                    this._bgm.muted = this._bgmMuted;
                }
                this._bgmToggleBtn.textContent = this._bgmMuted ? '🔇 BGM OFF' : '🎵 BGM ON';
            });
        }

        // Starter Class Badges (Register Mode)
        const classBadges = document.querySelectorAll('.class-badge');
        classBadges.forEach(badge => {
            badge.addEventListener('click', () => {
                classBadges.forEach(b => b.classList.remove('active'));
                badge.classList.add('active');
                classBadges.forEach(b => b.setAttribute('aria-pressed', String(b === badge)));
                this._selectedClass = badge.getAttribute('data-class') || 'swordman';
            });
        });

        // Gender selection (register mode only) — drives the character model
        this._genderRowEl = document.getElementById('auth-gender-row');
        this._genderMaleBtn = document.getElementById('auth-gender-male');
        this._genderFemaleBtn = document.getElementById('auth-gender-female');
        this._selectedGender = 'male';

        const styleGenderButtons = () => {
            if (this._genderMaleBtn) this._genderMaleBtn.classList.toggle('active', this._selectedGender === 'male');
            if (this._genderFemaleBtn) this._genderFemaleBtn.classList.toggle('active', this._selectedGender === 'female');
        };
        if (this._genderMaleBtn) this._genderMaleBtn.addEventListener('click', () => {
            this._selectedGender = 'male';
            styleGenderButtons();
        });
        if (this._genderFemaleBtn) this._genderFemaleBtn.addEventListener('click', () => {
            this._selectedGender = 'female';
            styleGenderButtons();
        });

        // Redesigned splash: welcome chip + secondary actions (session only)
        this._welcomeEl = document.getElementById('auth-welcome');
        this._welcomeAvatarEl = document.getElementById('auth-welcome-avatar');
        this._welcomeNameEl = document.getElementById('auth-welcome-name');
        this._splashAltEl = document.getElementById('auth-splash-alt');
        this._splashSwitchBtn = document.getElementById('btn-splash-switch');
        this._splashGuestBtn = document.getElementById('btn-splash-guest');
        this._splashStartBtn = document.getElementById('auth-splash-start-btn');

        if (this._startBtn) {
            this._startBtn.addEventListener('click', () => {
                if (this._sessionData) {
                    this._enterGameWithSession();
                    return;
                }
                this._splashEl.style.opacity = '0';
                this._splashEl.style.transform = 'translateY(-20px)';
                this._splashEl.style.transition = 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)';

                setTimeout(() => {
                    this._splashEl.style.display = 'none';
                    this.screen?.setAttribute('data-auth-state', 'login');
                    this._setMode('login');
                    this._formWrapperEl.style.display = 'block';
                    this._formWrapperEl.classList.add('fade-in');
                }, 400);
            });
        }

        // "เปลี่ยนบัญชี": drop the session and reveal the login form.
        if (this._splashSwitchBtn) {
            this._splashSwitchBtn.addEventListener('click', () => {
                this._hideWelcomeChip();
                this._splashEl.style.display = 'none';
                this.screen?.setAttribute('data-auth-state', 'login');
                this._setMode('login');
                this._formWrapperEl.style.display = 'block';
                this._formWrapperEl.classList.add('fade-in');
                this._handleSignOut();
            });
        }
        // "เล่นเป็น Guest" straight from the splash.
        if (this._splashGuestBtn) {
            this._splashGuestBtn.addEventListener('click', () => this._handleGuest());
        }
    }

    _bindEvents() {
        this._loginBtn.addEventListener('click', () => {
            if (this._isForgotPwMode) {
                this._handleForgotPassword();
            } else if (this._isResetPasswordMode) {
                this._handleUpdatePassword();
            } else if (this._sessionData) {
                this._enterGameWithSession();
            } else if (this._isRegisterMode) {
                this._setMode('login');
            } else {
                this._handleLogin();
            }
        });

        this._registerBtn.addEventListener('click', () => {
            if (this._isForgotPwMode || this._isResetPasswordMode) {
                this._setMode('login');
            } else if (this._sessionData) {
                this._handleSignOut();
            } else if (!this._isRegisterMode) {
                this._setMode('register');
            } else {
                this._handleRegister();
            }
        });

        if (this._forgotPwBtn) {
            this._forgotPwBtn.addEventListener('click', (e) => {
                if (e) e.preventDefault();
                this._setMode('forgot');
            });
        }

        document.getElementById('btn-guest').addEventListener('click', () => this._handleGuest());

        // Enter key support
        document.getElementById('auth-username').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (this._isForgotPwMode) {
                    this._handleForgotPassword();
                } else if (!this._isRegisterMode && !this._isResetPasswordMode) {
                    document.getElementById('auth-password').focus();
                }
            }
        });

        document.getElementById('auth-password').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (this._isResetPasswordMode) {
                    this._handleUpdatePassword();
                } else if (this._isRegisterMode) {
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

    _setMode(mode) {
        // mode can be: 'login', 'register', 'forgot', 'reset_password'
        this._isRegisterMode = mode === 'register';
        this._isForgotPwMode = mode === 'forgot';
        this._isResetPasswordMode = mode === 'reset_password';

        // Set data-auth-mode attribute on #auth-form-wrapper
        if (this._formWrapperEl) {
            this._formWrapperEl.setAttribute('data-auth-mode', mode);
        }
        this.screen?.setAttribute('data-auth-state', mode);

        const usernameInput = document.getElementById('auth-username');
        const passwordWrapper = document.getElementById('auth-password').parentElement.parentElement;
        const passwordInput = document.getElementById('auth-password');

        if (mode === 'forgot') {
            if (this._charnameWrapEl) this._charnameWrapEl.style.display = 'none';
            if (this._classSelectorEl) this._classSelectorEl.style.display = 'none';
            if (this._genderRowEl) this._genderRowEl.style.display = 'none';
            usernameInput.style.display = 'block';
            passwordWrapper.style.display = 'none';
            usernameInput.placeholder = 'Enter your email (กรอกอีเมลของคุณ)';

            this._loginBtn.style.display = 'inline-flex';
            this._loginBtn.className = 'btn-primary';
            this._loginBtn.innerHTML = `<svg class="svg-icon btn-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg><span>ส่งลิงก์รีเซ็ตรหัสผ่าน</span>`;

            this._registerBtn.style.display = 'inline-flex';
            this._registerBtn.className = 'btn-secondary';
            this._registerBtn.innerHTML = `<span>← BACK TO LOGIN</span>`;

            if (this._forgotPwBtn) this._forgotPwBtn.style.display = 'none';

            this._setStatus('Enter your email to receive password reset link', 'info');

            const dividers = document.querySelectorAll('.auth-divider');
            const guestBtn = document.getElementById('btn-guest');
            dividers.forEach(el => el.style.display = 'none');
            if (guestBtn) guestBtn.style.display = 'none';

            usernameInput.focus();
        } else if (mode === 'reset_password') {
            if (this._charnameWrapEl) this._charnameWrapEl.style.display = 'none';
            if (this._classSelectorEl) this._classSelectorEl.style.display = 'none';
            if (this._genderRowEl) this._genderRowEl.style.display = 'none';
            usernameInput.style.display = 'none';
            passwordWrapper.style.display = 'flex';
            passwordInput.value = '';
            passwordInput.placeholder = 'Enter new password (รหัสผ่านใหม่)';

            this._loginBtn.style.display = 'inline-flex';
            this._loginBtn.className = 'btn-primary';
            this._loginBtn.innerHTML = `<svg class="svg-icon btn-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg><span>บันทึกรหัสผ่านใหม่</span>`;

            this._registerBtn.style.display = 'none';
            if (this._forgotPwBtn) this._forgotPwBtn.style.display = 'none';

            this._setStatus('Enter a new password for your account', 'info');

            const dividers = document.querySelectorAll('.auth-divider');
            const guestBtn = document.getElementById('btn-guest');
            dividers.forEach(el => el.style.display = 'none');
            if (guestBtn) guestBtn.style.display = 'none';

            passwordInput.focus();
        } else {
            const isRegister = mode === 'register';
            if (this._charnameWrapEl) this._charnameWrapEl.style.display = isRegister ? 'flex' : 'none';
            if (this._classSelectorEl) this._classSelectorEl.style.display = isRegister ? 'flex' : 'none';
            if (this._genderRowEl) this._genderRowEl.style.display = isRegister ? 'flex' : 'none';
            usernameInput.style.display = 'block';
            passwordWrapper.style.display = 'flex';
            usernameInput.placeholder = 'Email or Username';

            if (this._forgotPwBtn) {
                this._forgotPwBtn.style.display = isRegister ? 'none' : 'block';
                this._forgotPwBtn.textContent = 'Forgot Password?';
                this._forgotPwBtn.className = 'btn-forgot-pw';
            }

            this._registerBtn.style.display = 'inline-flex';
            this._registerBtn.className = 'btn-secondary';
            this._loginBtn.style.display = 'inline-flex';
            this._loginBtn.className = 'btn-primary';

            const dividers = document.querySelectorAll('.auth-divider');
            const guestBtn = document.getElementById('btn-guest');
            dividers.forEach(el => el.style.display = isRegister ? 'none' : '');
            if (guestBtn) guestBtn.style.display = isRegister ? 'none' : '';
            this._registerBtn.innerHTML = isRegister
                ? `<svg class="svg-icon btn-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="13" y2="15"/></svg><span>สร้างตัวละคร</span>`
                : `<svg class="svg-icon btn-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="13" y2="15"/></svg><span>สร้างบัญชีใหม่</span>`;
            this._loginBtn.innerHTML = isRegister
                ? `<span>← กลับเข้าสู่ระบบ</span>`
                : `<svg class="svg-icon btn-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6 2 2-6-3-3-5 5z"/><path d="M9.5 6.5L21 18v3h-3L6.5 9.5"/><path d="M11 5L5 3 3 9l3 3 5-5z"/></svg><span>เข้าสู่โลก ZOLOS</span>`;

            this._setStatus(isRegister ? 'ตั้งชื่อตัวละครและเลือกอาชีพเริ่มต้น' : '', 'info');
            if (isRegister) this._charnameEl.focus();
        }
    }

    _createParticles() {
        const container = document.getElementById('auth-particles');
        if (!container) return;
        container.innerHTML = '';
        // Mix of gold, blue, and white particles for magical atmosphere
        const colors = [
            'rgba(240, 192, 64, 0.7)',    // gold
            'rgba(96, 160, 255, 0.5)',     // blue
            'rgba(255, 255, 255, 0.4)',    // white
            'rgba(120, 40, 160, 0.5)',     // purple
            'rgba(240, 192, 64, 0.4)',     // gold (dim)
        ];
        for (let i = 0; i < 60; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            p.style.left = Math.random() * 100 + '%';
            p.style.bottom = '0';
            const duration = 12 + Math.random() * 25;
            const delay = Math.random() * 25;
            p.style.setProperty('--duration', `${duration}s`);
            p.style.animationDelay = `${-delay}s`;
            const peakOpacity = 0.4 + Math.random() * 0.6;
            p.style.setProperty('--peak-opacity', peakOpacity);
            const drift = (Math.random() - 0.5) * 80;
            p.style.setProperty('--drift', `${drift}px`);
            const size = 1.5 + Math.random() * 5;
            p.style.width = `${size}px`;
            p.style.height = `${size}px`;
            p.style.background = colors[Math.floor(Math.random() * colors.length)];
            p.style.filter = `blur(${size > 3.5 ? 1.5 : 0}px)`;
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

                const { isOfflineMode } = await import('../network/SupabaseClient.js');
                if (isOfflineMode) {
                    this._setStatus('Found active session (OFFLINE MODE) for ' + username + '.', 'info');
                } else {
                    this._setStatus('Found active session for ' + username + '.', 'info');
                }
                this._showSessionMode(username);
                this._showWelcomeChip(username);
            }
        } catch (e) {
            // No session, show login
        }
    }

    _showWelcomeChip(username) {
        const name = username || 'Adventurer';
        if (this._welcomeNameEl) this._welcomeNameEl.textContent = name;
        if (this._welcomeAvatarEl) {
            const initial = name.trim().charAt(0).toUpperCase() || '?';
            this._welcomeAvatarEl.textContent = initial;
        }
        if (this._welcomeEl) this._welcomeEl.style.display = 'flex';
        if (this._splashAltEl) this._splashAltEl.style.display = 'flex';
    }

    _hideWelcomeChip() {
        if (this._welcomeEl) this._welcomeEl.style.display = 'none';
        if (this._splashAltEl) this._splashAltEl.style.display = 'none';
    }

    _showSessionMode(username) {
        if (this._formWrapperEl) {
            this._formWrapperEl.setAttribute('data-auth-mode', 'session');
        }
        document.getElementById('auth-username').style.display = 'none';
        document.getElementById('auth-password').parentElement.style.display = 'none';
        if (this._charnameEl) this._charnameEl.style.display = 'none';
        if (this._changeAccountBtn) this._changeAccountBtn.style.display = 'inline-flex';

        this._loginBtn.innerHTML = `<svg class="svg-icon btn-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6 2 2-6-3-3-5 5z"/><path d="M9.5 6.5L21 18v3h-3L6.5 9.5"/><path d="M11 5L5 3 3 9l3 3 5-5z"/></svg><span></span>`;
        this._loginBtn.querySelector('span').textContent = `Enter Game as ${username}`;
        this._registerBtn.style.display = 'none';

        const guestBtn = document.getElementById('btn-guest');
        if (guestBtn) guestBtn.style.display = 'none';

        const dividers = document.querySelectorAll('.auth-divider');
        dividers.forEach(el => el.style.display = 'none');
    }

    _enterGameWithSession() {
        if (!this._sessionData) return;
        this._setStatus('Connecting to world...', 'success');
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
        document.getElementById('auth-password').parentElement.style.display = 'flex';
        document.getElementById('auth-username').value = '';
        document.getElementById('auth-password').value = '';
        if (this._changeAccountBtn) this._changeAccountBtn.style.display = 'none';
        if (this._forgotPwBtn) this._forgotPwBtn.style.display = 'block';

        const guestBtn = document.getElementById('btn-guest');
        if (guestBtn) guestBtn.style.display = '';

        const dividers = document.querySelectorAll('.auth-divider');
        dividers.forEach(el => el.style.display = '');

        // Restore register button to default
        this._isRegisterMode = false;
        if (this._formWrapperEl) {
            this._formWrapperEl.setAttribute('data-auth-mode', 'login');
        }
        this._loginBtn.innerHTML = `<svg class="svg-icon btn-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6 2 2-6-3-3-5 5z"/><path d="M9.5 6.5L21 18v3h-3L6.5 9.5"/><path d="M11 5L5 3 3 9l3 3 5-5z"/></svg><span>Login</span>`;
        this._registerBtn.style.display = '';
        this._registerBtn.innerHTML = `<svg class="svg-icon btn-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="13" y2="15"/></svg><span>Register</span>`;
        this._setStatus('', 'info');
    }

    async _handleForgotPassword() {
        const email = document.getElementById('auth-username').value.trim();
        if (!email || !email.includes('@')) {
            this._setStatus('Please enter a valid email address', 'error');
            return;
        }

        this._setStatus('Sending reset link...', 'info');
        try {
            await sendPasswordResetEmail(email);
            this._setStatus('✅ Reset link sent! Check your email inbox.', 'success');
        } catch (e) {
            this._setStatus(e.message || 'Failed to send reset link', 'error');
        }
    }

    async _handleUpdatePassword() {
        const newPassword = document.getElementById('auth-password').value.trim();
        if (!newPassword || newPassword.length < 6) {
            this._setStatus('Password must be at least 6 characters', 'error');
            return;
        }

        this._setStatus('Saving new password...', 'info');
        try {
            await updatePassword(newPassword);
            this._setStatus('✅ Password updated! You can now login.', 'success');
            setTimeout(() => this._setMode('login'), 2000);
        } catch (e) {
            this._setStatus(e.message || 'Failed to update password', 'error');
        }
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

            // Part 2.1: Robust nickname fallback
            let username = profile?.username;
            if (!username || isPlaceholderName(username)) {
                username = getDeterministicGuestName(data.user.id);
            }

            this._setStatus('Welcome back! ⚔️', 'success');
            setTimeout(() => {
                this.onAuthSuccess({
                    userId: data.user.id,
                    username: username,
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
            const data = await signUp(email, password, charName, this._selectedGender);
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

            // Part 2.1: Check profiles table for guest username fallback
            const profile = await getProfile(data.user.id);
            let username = profile?.username;
            if (!username || isPlaceholderName(username)) {
                username = getDeterministicGuestName(data.user.id);
            }

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
        if (this._unsubOnlineCount) return;
        const el = document.getElementById('online-players-auth');
        if (!el) return;
        this._unsubOnlineCount = subscribeOnlineCount((count) => {
            el.textContent = count;
        });
    }

    // ============ Real Server Latency Monitor ============
    _startPingMonitor() {
        if (this._pingInterval) return;
        this._pingEl = document.getElementById('ro-server-ping');
        if (!this._pingEl) return;

        // Measure immediately, then every 5 seconds
        this._measurePing();
        this._pingInterval = setInterval(() => this._measurePing(), 5000);
    }

    _stopPingMonitor() {
        if (this._pingInterval) {
            clearInterval(this._pingInterval);
            this._pingInterval = null;
        }
    }

    async _measurePing() {
        if (!this._pingEl || this._pingInFlight || document.hidden) return;
        this._pingInFlight = true;
        let ms = null;
        try {
            const { measurePing } = await import('../network/SocketClient.js');
            ms = await measurePing();
        } catch (e) {
            console.warn('[AuthUI] Failed to measure ping:', e);
        } finally {
            this._pingInFlight = false;
        }
        this._updatePingDisplay(ms);
    }

    _updatePingDisplay(ms) {
        if (!this._pingEl) return;

        const dot = this._pingEl.querySelector('.ping-dot');

        if (ms === null) {
            this._pingEl.innerHTML = '<span class="ping-dot" style="background:#ff4444;box-shadow:0 0 8px #ff4444;"></span>OFFLINE';
            this._pingEl.style.color = '#ff4444';
            this._pingEl.style.background = 'rgba(255, 68, 68, 0.15)';
            this._pingEl.style.borderColor = 'rgba(255, 68, 68, 0.3)';
            return;
        }

        let color, bgColor, borderColor, label;
        if (ms < 80) {
            color = '#40e080'; bgColor = 'rgba(64, 224, 128, 0.15)'; borderColor = 'rgba(64, 224, 128, 0.3)'; label = 'EXCELLENT';
        } else if (ms < 150) {
            color = '#f0c040'; bgColor = 'rgba(240, 192, 64, 0.15)'; borderColor = 'rgba(240, 192, 64, 0.3)'; label = 'GOOD';
        } else if (ms < 300) {
            color = '#ff8040'; bgColor = 'rgba(255, 128, 64, 0.15)'; borderColor = 'rgba(255, 128, 64, 0.3)'; label = 'FAIR';
        } else {
            color = '#ff4444'; bgColor = 'rgba(255, 68, 68, 0.15)'; borderColor = 'rgba(255, 68, 68, 0.3)'; label = 'HIGH';
        }

        this._pingEl.innerHTML = `<span class="ping-dot" style="background:${color};box-shadow:0 0 8px ${color};"></span>${ms}ms`;
        this._pingEl.style.color = color;
        this._pingEl.style.background = bgColor;
        this._pingEl.style.borderColor = borderColor;
    }

    _setupBGMAutoplay() {
        this._removeAutoplayListeners();
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
        clearInterval(this._bgmFadeInterval);
        this._bgmFadeInterval = null;

        const fadeInterval = 50; // ms
        const fadeDuration = 500; // ms
        const steps = fadeDuration / fadeInterval;
        const volumeStep = this._bgm.volume / steps;

        this._bgmFadeInterval = setInterval(() => {
            if (!this._bgm) {
                clearInterval(this._bgmFadeInterval);
                this._bgmFadeInterval = null;
                return;
            }
            if (this._bgm.volume > volumeStep) {
                this._bgm.volume -= volumeStep;
            } else {
                this._bgm.volume = 0;
                this._bgm.pause();
                clearInterval(this._bgmFadeInterval);
                this._bgmFadeInterval = null;
            }
        }, fadeInterval);
    }

    _setup3DCardTilt() {
        const card = document.querySelector('.ro-ornate-card');
        if (!card) return;

        let bounds;

        const rotateToMouse = (e) => {
            if (!bounds) bounds = card.getBoundingClientRect();
            const mouseX = e.clientX;
            const mouseY = e.clientY;
            const leftX = mouseX - bounds.left;
            const topY = mouseY - bounds.top;
            const center = {
                x: leftX - bounds.width / 2,
                y: topY - bounds.height / 2
            };
            card.style.transform = `
                perspective(1000px)
                rotateX(${center.y / -25}deg)
                rotateY(${center.x / 25}deg)
                scale3d(1.02, 1.02, 1.02)
            `;
        };

        const resetCard = () => {
            bounds = null;
            card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
            card.style.transition = 'transform 0.5s ease';
        };

        const onMouseEnter = () => {
            bounds = card.getBoundingClientRect();
            card.style.transition = 'none';
        };

        card.addEventListener('mouseenter', onMouseEnter);
        card.addEventListener('mousemove', rotateToMouse);
        card.addEventListener('mouseleave', resetCard);
    }

    hide() {
        if (this._unsubOnlineCount) {
            this._unsubOnlineCount();
            this._unsubOnlineCount = null;
        }
        this._stopPingMonitor();
        this._removeAutoplayListeners();
        this._fadeOutBGM();
        this.screen.style.display = 'none';
    }

    show() {
        clearInterval(this._bgmFadeInterval);
        this._bgmFadeInterval = null;
        this.screen.style.display = 'flex';
        this._subscribeOnlineCount();
        if (this._bgm) {
            this._bgm.volume = 0.3;
            this._bgmPlayed = false;
            this._setupBGMAutoplay();
        }
        this._startPingMonitor();
    }
}
