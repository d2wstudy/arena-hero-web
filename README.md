# Arena Hero Web

React + TypeScript + Tailwind CSS client for the Arena Hero server.

```bash
npm install
npm run dev
```

Vite listens on `http://localhost:3000` and proxies HTTP and WebSocket `/api` traffic to `http://localhost:8080`. The real client uses the session cookie, CSRF token, `/api/v1/game/ws` realtime connection, and command endpoint. It reconnects with bounded exponential backoff, restores the authoritative state and current pending plans after disconnects, synchronizes Manual edits across tabs, and displays Agent/Manual plans in the arena. In development only, `/demo` opens a deterministic local arena without a backend.

Development also exposes `/local` for the repository's step-controlled match service. Start `python -m arena_hero_lab.play` from the parent repository, then open `http://localhost:3000/local`. Manual plan edits are sent immediately, while the dedicated resolve button advances exactly one logical Tick after every local bot has prepared its private Agent plan. The local timeline can inspect persisted read-only Tick snapshots, switch among related branches, return to the active head, or create a new branch from any stored Tick without overwriting the original future. Its God-mode test console can grant full tracked-world vision only to the human browser, or switch live/history rendering to a read-only global observer snapshot containing every player, entity, private event, stored plan, resource, and materialized map chunk. Agent WebSocket states remain fog-limited.

The same development server also exposes `/official`. It deliberately skips the
human Session/OAuth flow and uses the parent repository's loopback-only bridge
instead. The bridge reads `ARENA_HERO_API_KEY` on the server, opens the official
Agent WebSocket, and forwards command bodies to the official Agent command API;
the credential never enters browser JavaScript, storage, URLs, or logs. Plans
created on this page use the official `AGENT` source, while any existing
`MANUAL` receipt keeps its normal per-object precedence. `/local` and `/official`
use separate cookies, CSRF storage, WebSockets, exploration memory, movement
goals, Ticks, states, and receipts, so they can stay open in different tabs
without overwriting one another. The normal `/arena` route is unchanged and
still uses the production human web session. The parent bridge inherits the OS
and `HTTP_PROXY`/`HTTPS_PROXY` settings; `ARENA_HERO_OFFICIAL_PROXY_URL` can
override that transport explicitly, and `ARENA_HERO_OFFICIAL_BASE_URL` can point
at a contract-compatible test server.

```bash
npm run test
npm run lint
npm run build
```

## Production build

Every push to `main` runs the **Build frontend** GitHub Actions workflow. It tests, lints, and creates a minified Vite production build with `https://api.arenahero.io` as the HTTP and WebSocket API origin.

Open the completed workflow run, then download `arena-hero-web-<commit SHA>` from its **Artifacts** section. GitHub provides the artifact as a ZIP whose contents can be extracted directly into the existing Nginx site root for `app.arenahero.io`.

Nginx must fall back to `index.html` for React routes such as `/login`, `/arena`, and OAuth callbacks:

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

The API origin can be changed without editing source code by setting the repository Actions variable `VITE_API_BASE_URL`. Because Vite substitutes this value at build time, changing it requires a new workflow run or commit.

The interface supports English and Chinese. Add future locales in `src/lib/i18n.ts`; UI code uses translation keys rather than embedded labels.

## License

[Apache License 2.0](LICENSE)
