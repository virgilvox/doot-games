# @doot-games/plugin-bridge

The typed, Zod-validated `postMessage` bridge between **Doot** (the trusted host)
and an **untrusted game plugin** running in a sandboxed, null-origin iframe. This is
the only channel between the two; the host trusts nothing the plugin sends.

It is the production graduation of the reference implementation in
[`examples/external-plugin/bridge.ts`](../../examples/external-plugin/bridge.ts).
Design and threat model: [`docs/external-plugins.md`](../../docs/external-plugins.md);
the broader authoring plan: [`docs/plugin-authoring-roadmap.md`](../../docs/plugin-authoring-roadmap.md).

## Guarantees

- **Answer-withholding by construction.** The plugin learns the answer key only via
  the `answer` message, which the host sends *only* at reveal. There is no earlier
  path to it.
- **Submit-only.** The plugin's single actionable verb is `submit`. Passing the
  bridge schema is necessary but not sufficient - the host **must** re-validate
  `input` against the block's own schema before publishing to the relay.
- **Validated both ways.** Every inbound message is `safeParse`d; off-protocol
  messages are dropped (and, on the host, surfaced via `onInvalid`).

## Surface

```ts
// Host side (trusted Doot app)
import { createPluginHost, createPortHost } from '@doot-games/plugin-bridge'

const host = createPluginHost(iframeEl, {
  onReady: () => host.send({ t: 'init', block: 'trivia', role: 'player', theme }),
  onSubmit: (input) => { /* re-validate vs block schema, then publish */ },
})
iframeEl.addEventListener('load', () => host.bootstrap())

// Plugin side (inside the sandboxed iframe)
import { connectToHost } from '@doot-games/plugin-bridge'

const conn = await connectToHost({
  onRound: (m) => render(m.content),
  onAnswer: (m) => reveal(m.key), // only ever fires at reveal
})
conn.submit({ choice: 1 })
```

`createPortHost` / `attachPluginPort` are the transport-agnostic cores (they take a
`MessagePort` directly) used by the DOM entry points above and by the unit tests.

## Protocol

`HostToPlugin`: `init` · `round` · `state` · `answer` (reveal only).
`PluginToHost`: `ready` · `submit` · `resize` (bounded 0–4000).
