# SoundON

A client-side music streaming aggregator PWA. Spotify supplies the catalog and artwork, and the Piped API (a privacy-friendly YouTube frontend) resolves a playable audio stream in the background. There is no custom backend: audio streams straight from the resolved URL into an HTML5 `<audio>` element and is never saved.

Stack: Vite, React, Tailwind CSS, Zustand, axios, lucide-react, Vitest.

## Develop

```bash
npm install
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm test` | Run the unit tests once |
| `npm run lint` | Lint with ESLint |
| `npm run build` | Production build into `dist/` |

## Layout

- `src/store/usePlayerStore.js`: global player state (current track, queue, playback, volume, errors). It holds intent only; the AudioEngine component applies it to the `<audio>` element.

See [CHANGELOG.md](CHANGELOG.md) for build status by phase.
