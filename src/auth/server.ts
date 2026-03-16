import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function isAuthSessionMissingError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === 'AuthSessionMissingError' ||
      error.message.includes('Auth session missing'))
  )
}

export async function createClient() {
  const cookieStore = await cookies()

  const client = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {

          }
        },
      },
    }
  )
  return client;
}

export async function getUser() {
    try {
      const {auth} = await createClient()
      const userObject = await auth.getUser()

      if (userObject.error) {
        if (isAuthSessionMissingError(userObject.error)) {
          return null
        }

        console.error(userObject.error)
        return null
      }

      return userObject.data.user
    } catch (error) {
      if (isAuthSessionMissingError(error)) {
        return null
      }

      console.error(error)
      return null
    }
}