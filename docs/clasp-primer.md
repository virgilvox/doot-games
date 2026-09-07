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
c.emit(address, payload?)             // one-shot EVENT: delivered to current
                                      // subscribers, never stored, no replay
c.onConnect / onDisconnect / onReconnect / onError
c.close()
```

### State vs. events, and why presence is an event

`set` writes **state**: retained, replayed to every later subscriber, expiring only
with its TTL. `emit` fires an **event**: whoever is subscribed right now receives
it, and then it is gone (`get` reports it absent).

A heartbeat is an event, and we learned that the hard way by storing it as state.
Doing so forced every presence question to become "is this timestamp, written by
*another* machine's clock, recent by *mine*?" -- which is a comparison between two
clocks that have no reason to agree. At one 145-phone party a host laptop running
about 25 seconds slow made every phone in the room report the host as gone, and
because submitting was gated on that flag, it greyed out "Lock it in" for
everybody. Storing beats also littered the relay: that room left 147 retained ping
addresses behind, and a resubscribe would replay a stale one as if it were fresh.

As an event, **arrival is the signal**. Beats carry no payload at all, so there is
no timestamp to skew, nothing to expire, and nothing left behind.

Two things the relay cannot do for us, both measured against `wss://relay.clasp.to`
rather than assumed:

- **Short TTLs are not honoured.** Values published with a 4s or 5s TTL (with and
  without `absolute`) were still readable 14s later. TTL is a tidiness hint, not an
  expiry event, so the relay cannot be the presence arbiter.
- **There is no tombstone.** Subscribers are never told that a value went away, so
  a client always has to notice absence itself.

The engine exposes this as the narrow `RelayClient` interface (`packages/engine/src/relay.ts`) and `createClaspRelay()`. Tests inject a fake relay implementing the same interface.

## Conventions the engine enforces

- Every room is namespaced under `/doot/<ROOM>/…` (see `addresses.ts`).
- Every published value carries an **absolute TTL** (default 8 hours) so the public relay stays tidy.
- The **host** is the only writer of `phase`, `round/*`, `config`, `meta`, `roster`, and `results`; each **player** writes only their own `profile`, `team`, and `input/*`, and emits its own `ping`.
- **Presence is single-writer, like everything else.** Only the host subscribes to
  `player/*/ping`; it publishes the room's roster to one `roster` address that
  everyone else reads. Every client used to track every other client's heartbeat,
  which cost the relay N deliveries per beat to each of N clients (~2,100/sec at 145
  phones) purely so 145 devices could each compute the same list. One writer, one
  value, N readers makes that linear. `packages/engine/src/roster.test.ts` measures
  the fan-out so a regression shows up as a number.
- **The beat pacing in `room.ts` is now vestigial**, and knowing that saves you
  re-deriving it. `ROSTER_STEP` / `heartbeatIntervalFor` / `MAX_HEARTBEAT_INTERVAL_MS`
  slow the heartbeat in a big room to mitigate exactly the fan-out the line above
  removed. Measured after the change: 0.2 heartbeat frames/s on a phone in a 70-player
  room, which is the host's own beat and nothing else. Slowing the beat now buys
  nothing and costs a little responsiveness, since `presenceWindowFor` widens the
  staleness window to 3x the beat and that window is also how long the room waits on
  someone who walked out. A constant 5s beat and 20s window is the simpler end state;
  it was left alone because it is a timing change in every room, not a tidy-up.
- **A room code is claimed, not sensed.** `host/session` holds `{ token, at }`. A
  different token means the code is someone else's, full stop -- no clock involved,
  so a host with a fast clock can never decide a live room looks stale and seize it.
  A matching token means our own reload, and only then is `at` read, comparing our
  clock against a value this same machine wrote.
- Answer keys are withheld from the published config and revealed per round at `round/<i>/answer`.

The public relay is `wss://relay.clasp.to`. Confirm the API against the installed package version rather than assuming, since it evolves.
