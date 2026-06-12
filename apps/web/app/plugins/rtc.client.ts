/**
 * Configure the WebRTC ICE servers for the Retro Arcade spectator stream from
 * runtime env, once, at app start. Default is STUN-only; set a TURN relay to carry
 * media for viewers behind NATs that STUN can't traverse. CLASP is signaling-only
 * (pub/sub), so TURN is a SEPARATE server (e.g. coturn) you provision and point at
 * here via NUXT_PUBLIC_TURN_URL / _TURN_USERNAME / _TURN_CREDENTIAL. See docs/deploy.md.
 */
import { setRtcConfig } from '@doot-games/games'

export default defineNuxtPlugin(() => {
  const cfg = useRuntimeConfig().public
  const url = (cfg.turnUrl as string) || ''
  if (!url) return // STUN-only default; nothing to configure
  setRtcConfig({
    url,
    username: (cfg.turnUsername as string) || undefined,
    credential: (cfg.turnCredential as string) || undefined,
  })
})
