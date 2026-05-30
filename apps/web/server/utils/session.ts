/** Session helpers over better-auth, for the games/uploads routes. */
import type { H3Event } from 'h3'

export interface AuthUser {
  id: string
  email: string
}

async function sessionUser(event: H3Event): Promise<AuthUser | null> {
  const result = await useAuth().api.getSession({ headers: event.headers })
  if (!result?.user) return null
  return { id: result.user.id, email: result.user.email }
}

/** The signed-in user, or 401. */
export async function requireUser(event: H3Event): Promise<AuthUser> {
  const user = await sessionUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Sign in required.' })
  return user
}

/** The signed-in user, or null if anonymous. */
export async function optionalUser(event: H3Event): Promise<AuthUser | null> {
  return sessionUser(event)
}
