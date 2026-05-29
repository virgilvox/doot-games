// Shape of the session user for nuxt-auth-utils (`useUserSession`, `setUserSession`).
declare module '#auth-utils' {
  interface User {
    id: string
    email: string
  }
  interface UserSession {
    user: User
  }
}

export {}
