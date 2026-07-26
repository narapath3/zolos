import test from 'node:test';
import assert from 'node:assert/strict';

// Mock browser globals to prevent imports from crashing
globalThis.window = {
    location: { href: 'http://localhost' },
    localStorage: {
        getItem: () => null,
        setItem: () => null
    }
};
globalThis.document = {
    createElement: () => ({ style: {} }),
    head: { appendChild: () => null }
};
Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: '' },
    configurable: true,
    writable: true
});

import { getDeviceTypeFromUserAgent } from '../src/network/GameSync.js';

test('device type detection user agent maps', () => {
    // Desktop cases
    const chromeDesktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    assert.equal(getDeviceTypeFromUserAgent(chromeDesktop), 'desktop');

    const safariDesktop = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
    assert.equal(getDeviceTypeFromUserAgent(safariDesktop), 'desktop');

    // Mobile cases
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
    assert.equal(getDeviceTypeFromUserAgent(iphone), 'mobile');

    const androidPhone = 'Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36';
    assert.equal(getDeviceTypeFromUserAgent(androidPhone), 'mobile');

    // Tablet cases
    const ipad = 'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
    assert.equal(getDeviceTypeFromUserAgent(ipad), 'tablet');

    const androidTablet = 'Mozilla/5.0 (Linux; Android 10; SM-T500) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36';
    assert.equal(getDeviceTypeFromUserAgent(androidTablet), 'tablet');
});
