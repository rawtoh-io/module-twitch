import { Outlet, createRootRoute } from '@tanstack/react-router'
import { ThemeProvider } from '@/components/theme-provider'
import { useAuth } from '@/hooks/use-auth'
import { Login } from '@/components/Login'
import { Toaster } from '@/components/ui/sonner'

import '../styles.css'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  const { user, loading } = useAuth()

  if (loading) return <div className="flex items-center justify-center min-h-screen text-muted-foreground">Loading...</div>

  if (!user) {
    return (
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <Login />
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <Outlet />
      <Toaster />
    </ThemeProvider>
  )
}
