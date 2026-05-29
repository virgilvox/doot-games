# Authoring a game type

A game type is a small package that satisfies the `GamePlugin` contract from `@doot-games/sdk`. The engine handles rooms, roster, the round state machine, late joiners, reconnects, timers, and answer withholding — you write content and views.

## The contract

```ts
import { definePlugin } from '@doot-games/sdk'

export const myGame = definePlugin<MyConfig, MyInput, MyResults>({
  manifest: { id: 'my-game', name: 'My Game', version: '0.1.0', author: 'you', capabilities: ['timer'] },
  configSchema,                 // a Zod schema; the editor auto-generates a form from it
  defaultConfig,                // seed content for a new game
  rounds: (config) => [...],    // map config to RoundSpec[] (the primitives)
  score: (ctx) => ({...}),      // pure aggregation → results payload
  components: { Host, Player, Results },
  redactConfig,                 // optional: strip answers before publishing
  answerKeys,                   // optional: answer per round index, revealed at reveal
})
```

## Round primitives (the game types)

`rounds(config)` returns a list of `RoundSpec`s. Each carries `timer: number | null`. Kinds: `multiple-choice` (Guess), `rating` (Rate), `free-text` (Quip), `draw`, `poll`, `reaction` (Buzz), `rank`. A single-type game uses one kind; a composite (like VoteBox) mixes them.

## Views

`Host`, `Player`, and `Results` are Vue components. They reach the live room with `injectDootRoom()` from `@doot-games/engine/vue` (the shell calls `provideDootRoom`). Build them from `@doot-games/ui` pieces (`OptionGrid`, `RatingStrip`, `CountdownRing`, `VoteBars`, `Leaderboard`, `ControlBar`, …) so they are theme-aware automatically.

Reactive reads: `room.phase`, `room.round`, `room.players`, `room.config`, `room.results`, `room.me`, `room.ready`. Player action: `room.submit(input)`. Host actions: `room.host.openVoting()`, `lock()`, `reveal()`, `next()`, `finish(summary)`, and `room.host.can(action)` to gate controls.

## Scoring

`score(ctx)` is pure and unit-testable. `ctx` gives `config`, `rounds`, eligible `players` (with `joinedAtIndex`), `inputsFor(roundIndex)`, and `answerKeys`. Only count rounds a player was eligible for (`isEligible` from the engine). Return a payload the Results view renders (see `StandardResults` for the shape the built-in widgets understand).

## Answer withholding

If your game has correct answers, implement `redactConfig` (strip them from the published config) and `answerKeys` (the answer per round index). The engine publishes the redacted config and reveals each answer only at that round's reveal, so spectators reading the relay cannot cheat.

## The worked example

VoteBox (`packages/games/src/votebox/`) is the reference: a Zod deck schema, a `rounds` mapping to `multiple-choice` + `rating`, a tested `score` (`score.test.ts`), and shared Host/Player/Results views. **Guess** and **Rate** show how to ship single-type plugins by reusing that engine.

To start: copy `packages/plugin-template` *(planned)* or model on `packages/games/src/votebox/`.
