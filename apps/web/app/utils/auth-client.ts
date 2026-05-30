import { createAuthClient } from 'better-auth/vue'

/** The better-auth browser client (same-origin). Exposes `useSession`,
 *  `signIn`, `signUp`, `signOut`. */
export const authClient = createAuthClient()
