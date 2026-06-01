import { inferAdditionalFields, usernameClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/vue'

/**
 * The better-auth browser client (same-origin). Exposes `useSession`, `signIn`,
 * `signUp`, `signOut`, plus `updateUser` for editing the account.
 *
 * Plugins mirror the server (`server/utils/auth.ts`):
 * - `usernameClient()` adds the profile @handle API (`isUsernameAvailable`); the
 *   handle itself is set through `updateUser({ username, displayUsername })`
 *   (there is no separate `setUsername`).
 * - `inferAdditionalFields` teaches the client about the `bio` column so
 *   `updateUser({ bio })` typechecks (schema given inline to avoid importing
 *   server code into the client bundle).
 */
export const authClient = createAuthClient({
  plugins: [
    usernameClient(),
    inferAdditionalFields({ user: { bio: { type: 'string', required: false } } }),
  ],
})
