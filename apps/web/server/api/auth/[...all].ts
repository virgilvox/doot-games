/** All better-auth endpoints (sign-up, sign-in, sign-out, session, …). */
export default defineEventHandler((event) => useAuth().handler(toWebRequest(event)))
