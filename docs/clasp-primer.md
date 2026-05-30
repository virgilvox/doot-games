# CLASP primer

Doot's live state runs on [CLASP](https://github.com/lumencanvas/clasp), a real-time pub/sub relay. The relay knows nothing about games, it is plain publish/subscribe under whatever addresses Doot chooses, with value persistence (late joiners get a snapshot on subscribe) and TTL (values auto-expire).

The engine wraps it so **no game ever touches the relay directly**.

## Core surface (`@clasp-to/core`, v4.3.2)

```ts
const c = new Clasp(url, { name, reconnect: true })
await c.connect()
const off = c.on(pattern, (value, address) => { … })  // wildcards supported; returns unsubscribe
c.set(address, value, { ttl, absolute: true })         // persists; broadcast to subscribers
c.cached(address)                                       // sync read of the cached value
c.onConnect / onDisconnect / onReconnect / onError
c.close()
```

The engine exposes this as the narrow `RelayClient` interface (`packages/engine/src/relay.ts`) and `createClaspRelay()`. Tests inject a fake relay implementing the same interface.

## Conventions the engine enforces

- Every room is namespaced under `/doot/<ROOM>/…` (see `addresses.ts`).
- Every published value carries an **absolute TTL** (default 8 hours) so the public relay stays tidy.
- The **host** is the only writer of `phase`, `round/*`, `config`, `meta`, and `results`; each **player** writes only their own `profile`, `ping`, and `input/*`.
- Answer keys are withheld from the published config and revealed per round at `round/<i>/answer`.

The public relay is `wss://relay.clasp.to`. Confirm the API against the installed package version rather than assuming, since it evolves.
