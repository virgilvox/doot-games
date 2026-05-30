# @doot-games/engine

The framework-agnostic core: a thin CLASP relay wrapper, the room runtime, and the
phase/round state machine. Knows nothing about any game.

**Public surface**
- `RoomRuntime` / `createRoom` - host + player room machinery: connect, lobby, the
  round state machine (`ready → open → locked → reveal`), roster + presence,
  late-joiner eligibility, reconnect-by-name identity, host auto-lock, answer
  withholding, and the **two-phase primitive**, runtime-derived round content
  (`LoadedGame.deriveContent`/`revealSummary` host callbacks; published to the
  `round/<i>/content` and `round/<i>/reveal` addresses; read via
  `runtimeContentFor(i)`/`roundRevealFor(i)`/`answerKeyFor(i)`). Reads via
  `getSnapshot()`/`onChange`, acts via `start`/`openVoting`/`lock`/`reveal`/`next`/
  `finish`/`submit`.
- `createClaspRelay` + the `RelayClient` interface (inject a fake in tests).
- `addr` / `patterns` - the `/doot/<ROOM>/…` address scheme (incl. `roundContent`,
  `roundReveal`) + `parseRoundSubAddress`.
- `playerId`, `computeJoinedAtIndex`, `isEligible`, `makeRoomCode`, `isValidRoomCode`.
- Types: `RoomMeta`, `Player`, `Phase`, `RoundState`, …

Vue bindings (`useDootRoom`, `provideDootRoom`, `injectDootRoom`) are at
`@doot-games/engine/vue`. The engine never imports a game.
