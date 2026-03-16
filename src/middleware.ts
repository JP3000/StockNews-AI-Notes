import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'


export async function middleware(request: NextRequest) {
    return await updateSession(request)
  }

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });
  const appOrigin = request.nextUrl.origin;
  // console.log('middleware ran');

  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const safeGetUser = async () => {
    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error) {
        if (error.name === "AuthSessionMissingError") {
          return null;
        }

        console.error(error);
        return null;
      }

      return user;
    } catch (error) {
      if (error instanceof Error && error.name === "AuthSessionMissingError") {
        return null;
      }

      console.error(error);
      return null;
    }
  };

  const isAuthRoute = request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/sign-up"

  if (isAuthRoute) {
    const user = await safeGetUser();
    if (user) {
      return NextResponse.redirect(new URL("/", appOrigin))
    }
  }

  const {searchParams, pathname} = new URL(request.url)
  if(!searchParams.get("noteId") && pathname === "/" ) { 
    const user = await safeGetUser();
    if (user) {
      try {
        const newestNoteUrl = new URL("/api/fetch-newest-note", appOrigin);
        newestNoteUrl.searchParams.set("userId", user.id);

        const newestNoteResponse = await fetch(newestNoteUrl, { cache: "no-store" });
        if (!newestNoteResponse.ok) {
          console.error("Failed to fetch newest note", newestNoteResponse.status);
          return supabaseResponse;
        }

        const { newestNoteId } = await newestNoteResponse.json();

        if (newestNoteId) {
          const url = request.nextUrl.clone();
          url.searchParams.set("noteId", newestNoteId);
          return NextResponse.redirect(url);
        }

        const createNoteUrl = new URL("/api/create-new-note", appOrigin);
        createNoteUrl.searchParams.set("userId", user.id);

        const createNoteResponse = await fetch(createNoteUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!createNoteResponse.ok) {
          console.error("Failed to create note", createNoteResponse.status);
          return supabaseResponse;
        }

        const { noteId } = await createNoteResponse.json();
        const url = request.nextUrl.clone();
        url.searchParams.set("noteId", noteId);
        return NextResponse.redirect(url);
      } catch (error) {
        console.error(error);
        return supabaseResponse;
      }
    }
  }




  return supabaseResponse
}