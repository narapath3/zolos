// test_settings_mismatch.js
import { saveCharacter } from './src/network/GameSync.js';
import { CharacterManager } from './src/engine/CharacterManager.js';

// Mock global localStorage
const store = new Map();
global.localStorage = {
    getItem: (key) => store.get(key) || null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
};

// Mock THREE
global.THREE = {
    Group: class { },
    BoxGeometry: class { },
    MeshLambertMaterial: class { },
    Mesh: class { },
    SphereGeometry: class { },
    CylinderGeometry: class { },
    CircleGeometry: class { },
    TorusGeometry: class { },
    CanvasTexture: class { },
    SpriteMaterial: class { },
    Sprite: class { },
    Vector3: class {
        constructor(x = 0, y = 0, z = 0) {
            this.x = x;
            this.y = y;
            this.z = z;
        }
    },
};

// Mock document for GUI elements
global.document = {
    createElement: () => ({
        getContext: () => ({
            fillRect: () => { },
            fillText: () => { },
        })
    }),
};

async function runTest() {
    console.log('🧪 Starting settings storage offline/online logic test...');

    const characterId = 'test_char_123';
    const updates = {
        level: 10,
        sound_enabled: false,
        graphics_quality: 'high',
        fps_enabled: true
    };

    // Test saveCharacter
    console.log('Testing saveCharacter...');
    await saveCharacter(characterId, updates);

    // Check if settings were correctly written to mock localStorage
    const settingsKey = `zolos_settings_${characterId}`;
    const storedSettingsRaw = global.localStorage.getItem(settingsKey);
    console.log('Stored settings in localStorage:', storedSettingsRaw);
    if (!storedSettingsRaw) {
        throw new Error('Settings were not stored in localStorage!');
    }

    const storedSettings = JSON.parse(storedSettingsRaw);
    if (storedSettings.sound_enabled !== false ||
        storedSettings.graphics_quality !== 'high' ||
        storedSettings.fps_enabled !== true) {
        throw new Error(`Settings mismatch in localStorage: ${JSON.stringify(storedSettings)}`);
    }

    console.log('✅ LocalStorage saving passed!');

    // Test character class loading settings
    console.log('Testing CharacterManager loading settings...');

    // Custom mock data where DB has no settings (simulating online schema mismatch where fields are stripped/empty)
    const dbData = {
        id: characterId,
        name: 'TestHero',
        level: 10,
        hp: 100,
        max_hp: 100,
        sp: 50,
        max_sp: 50,
    };

    // Instantiate character mock scene/etc
    const sceneMock = {
        add: () => { }
    };
    const char = new CharacterManager(sceneMock);
    char.loadStats(dbData);

    console.log('Loaded gameSettings:', char.gameSettings);
    if (char.gameSettings.sound_enabled !== false ||
        char.gameSettings.graphics_quality !== 'high' ||
        char.gameSettings.fps_enabled !== true) {
        throw new Error(`Load settings fallback failed! Result: ${JSON.stringify(char.gameSettings)}`);
    }

    console.log('✅ Fallback loading passed!');
    console.log('🎉 All tests completed successfully!');
}

runTest().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
