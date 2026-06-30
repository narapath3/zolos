// Input Manager — WASD keyboard controls for manual character movement

export class InputManager {
    constructor() {
        this.keys = {};
        this.enabled = true;

        window.addEventListener('keydown', (e) => this._onKeyDown(e));
        window.addEventListener('keyup', (e) => this._onKeyUp(e));

        // Reset keys on window blur (prevents stuck keys)
        window.addEventListener('blur', () => { this.keys = {}; });

        this.onSkillHotkeyCallback = null;
    }

    _onKeyDown(e) {
        // Ignore if typing in an input/textarea
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

        this.keys[e.code] = true;

        // Skill hotkeys triggers: 1, 2, 3
        if ((e.key === '1' || e.key === '2' || e.key === '3') && this.onSkillHotkeyCallback) {
            // Map key '1' -> 'bash', '2' -> 'heal', '3' -> 'magnumBreak'
            const skillId = e.key === '1' ? 'bash' : e.key === '2' ? 'heal' : 'magnumBreak';
            this.onSkillHotkeyCallback(skillId);
        }
    }

    _onKeyUp(e) {
        this.keys[e.code] = false;
    }

    setupSkillHotkey(callback) {
        this.onSkillHotkeyCallback = callback;
    }

    /**
     * Returns a normalized movement direction vector {x, z} based on WASD keys.
     * Returns null if no movement keys are pressed.
     * Uses camera-relative directions (W=forward/negative-Z, S=back, A=left, D=right)
     */
    getMovementDirection() {
        if (!this.enabled) return null;

        let x = 0;
        let z = 0;

        if (this.keys['KeyW'] || this.keys['ArrowUp']) z -= 1;
        if (this.keys['KeyS'] || this.keys['ArrowDown']) z += 1;
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) x -= 1;
        if (this.keys['KeyD'] || this.keys['ArrowRight']) x += 1;

        if (x === 0 && z === 0) return null;

        // Normalize for diagonal movement
        const len = Math.sqrt(x * x + z * z);
        return { x: x / len, z: z / len };
    }

    /**
     * Returns true if the sprint key (Space) is held.
     */
    isRunning() {
        return !!(this.keys['Space']);
    }

    /**
     * Returns true if any movement key is currently pressed.
     */
    hasMovementInput() {
        return !!(
            this.keys['KeyW'] || this.keys['KeyA'] ||
            this.keys['KeyS'] || this.keys['KeyD'] ||
            this.keys['ArrowUp'] || this.keys['ArrowDown'] ||
            this.keys['ArrowLeft'] || this.keys['ArrowRight']
        );
    }
}
