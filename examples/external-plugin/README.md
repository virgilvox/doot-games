# External plugin starter + standalone dev harness

A self-contained reference for building a **custom Doot game you register by URL**,
and for **testing it without the whole platform**. Read it with
[`docs/external-plugins.md`](../../docs/external-plugins.md) (the architecture +
security model).

## Why a plugin is safe

Your plugin is untrusted code, so Doot runs it in a **sandboxed, null-origin iframe**
(`sandbox="allow-scripts"`, no `allow-same-origin`) served from a separate origin
under a strict CSP (`connect-src 'none'`, so it can't phone home or exfiltrate). It
talks to Doot **only** through a tiny, schema-validated `MessageChannel` bridge: it
receives the redacted round content + its own input + phase, and may only `submit`.
It never sees cookies, the session, the DB, or the relay. Answers arrive only at
reveal, so it can't peek.

## Files

| File | What it is |
| --- | --- |
| `plugin.json` | the manifest you publish/point Doot at (name, version, `bundle` URL, `integrity` hash, blocks) |
| `bridge.ts` | the bridge protocol: `connectToHost` (plugin side) + `createPluginHost` (host/harness side), both Zod-validated |
| `plugin.ts` | a sample plugin (a multiple-choice "trivia" block) rendered with plain DOM, no framework needed |
| `plugin.html` | the iframe entry that loads your bundle (served from the plugins origin in prod) |
| `dev-host.html` | the **standalone dev harness**: a mock host + the real sandbox + a scriptable mock room + a bridge inspector |

## Develop & test standalone

```bash
cd examples/external-plugin
npx vite           # serves this folder with TS + HMR
# open the printed URL at /dev-host.html
```

The harness loads your plugin in the **same sandboxed iframe** production uses, then
lets you:

- **Start round** — sends redacted content (no answer).
- **Simulate other players** — fakes inputs so you can exercise scoring/aggregate.
- **Reveal** — sends the answer key (proving your plugin behaves when it's absent before reveal).
- watch the **bridge inspector** flag any message that fails the protocol, and warn
  if your plugin tries to message the window off-channel.

Edit `plugin.ts` and the iframe hot-reloads. When it plays well in the harness, it
will play the same way inside Doot, because the harness speaks the identical bridge.

## Ship it

1. Build your plugin to a single ES module (`dist/plugin.js`).
2. Host it (GitHub Pages, a release asset, or a CDN that serves a pinned commit such
   as `https://esm.sh/gh/you/your-repo@<commit-sha>/dist/plugin.js`).
3. Put that URL in `plugin.json` `bundle`, with the bundle's SHA-384 in `integrity`.
4. Host `plugin.json` somewhere public and register that URL in Doot.

> The live registration flow (Doot fetching + hash-pinning + iframe-loading your
> plugin) is being built in phases, see `docs/external-plugins.md`. This harness is
> the contract it will honor, so a plugin you build today against the harness keeps
> working when the runtime lands.
</content>
