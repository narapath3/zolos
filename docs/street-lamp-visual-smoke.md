# Street lamp visual smoke test

- Local Vite preview launched successfully on port 3003 after ports 3000–3002 were already occupied.
- Login landing screen rendered successfully at http://localhost:3003 with the existing ZOLOS branding.
- Guest entry was clickable and the loading screen rendered successfully, showing the game loading to Prontera Field.
- The browser session reset to about:blank while waiting for the 3D scene; no final in-game screenshot was captured in this pass.
- Production build and source tests remain the authoritative automated checks for this change; a later browser pass can verify the final in-game silhouette if needed.

A second browser pass successfully rendered the returning Guest screen, entered the game, and exposed the Prontera Field HUD plus the job selection/daily reward overlays in extracted DOM content. The browser screenshot upload/reset again returned about:blank, so no reliable visual screenshot of the 3D world was used as acceptance evidence. The implementation was therefore validated through source-level route/exclusion tests, the full test suite, and production build.

A runtime smoke-test pass reached the real ZOLOS loading screen with Prontera Field HUD content and a visible 3D-themed loading background. The browser runtime became unavailable before SceneManager diagnostics could be queried, so the next fix must not rely on browser-only evidence.
