/**
 * Accounts: argon2id password hashing over the durable store. Auth is optional
 * and non-blocking — it exists only to give saved games an owner. Sessions are
 * sealed httpOnly cookies (nuxt-auth-utils); there is no server-side store.
 */
import { hash, verify } from '@node-rs/argon2'
import { z } from '@doot-games/sdk'
import { eq } from 'drizzle-orm'
import { useDb, users } from './db'

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8, 'Use at least 8 characters.').max(200),
})

export type Credentials = z.infer<typeof credentialsSchema>

/** What we keep in the session — never the hash. */
export interface SessionUser {
  id: string
  email: string
}

function newUserId(): string {
  return `u_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
}

export async function registerUser({ email, password }: Credentials): Promise<SessionUser> {
  const db = await useDb()
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (existing[0]) {
    throw createError({ statusCode: 409, statusMessage: 'That email is already registered.' })
  }
  const id = newUserId()
  await db.insert(users).values({ id, email, passwordHash: await hash(password), createdAt: Date.now() })
  return { id, email }
}

export async function authenticate({ email, password }: Credentials): Promise<SessionUser> {
  const db = await useDb()
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1)
  const row = rows[0]
  if (!row || !(await verify(row.passwordHash, password))) {
    throw createError({ statusCode: 401, statusMessage: 'Wrong email or password.' })
  }
  return { id: row.id, email: row.email }
}
