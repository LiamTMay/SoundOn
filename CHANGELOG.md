# Changelog

Status: SHIPPED (deployed, revert handle recorded), BUILT (committed, not deployed), QUEUED (planned).

## Phase 1: Scaffolding and player state (BUILT 2026-10-11)

- Vite 8 + React 19 (create-vite 9.2.1, ESLint variant), Tailwind CSS 4 via `@tailwindcss/vite`, Zustand 5, axios, lucide-react, Vitest 5.
- `src/store/usePlayerStore.js`: `currentTrack`, `queue`, `queueIndex`, `isPlaying`, `isLoading`, `progress`, `duration`, `volume`, `error`, `seekRequest`; actions `playTrack`, `pause`, `resume`, `togglePlay`, `nextTrack`, `prevTrack`, `seek`, `setVolume`, `setProgress`, `setDuration`, `clearError`.
- Stream resolution is pluggable through `setStreamResolver`. Superseded resolutions are aborted and ignored; a failed resolution sets `error` and skips to the next track.
- 19 store tests (`npm test`).
- Revert handle: none yet (not deployed).

## QUEUED

- Phase 2: `spotifyService.js` (Client Credentials token, `searchTracks`, unified track mapping).
- Phase 3: `pipedService.js` resolver wired in through `setStreamResolver`.
- Phase 4: `AudioEngine.jsx`, `BottomPlayerBar.jsx`, `Search.jsx` with `TrackCard`.
- PWA manifest and service worker (not covered by phases 1 to 4).
