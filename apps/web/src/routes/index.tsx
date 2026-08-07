import { createFileRoute, Link } from '@tanstack/react-router'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LogOutIcon, SettingsIcon, BuildingIcon } from 'lucide-react'

export const Route = createFileRoute('/')({
  component: RouteComponent,
})

function RouteComponent() {
  const { user, logout } = useAuth()
  const orgs = user?.organizations ?? []

  return (
    <div className="max-w-4xl mx-auto px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">My organizations</h1>
        <Button variant="outline" size="sm" onClick={logout}>
          <LogOutIcon />
          Sign out
        </Button>
      </div>
      {orgs.length === 0 ? (
        <p className="text-muted-foreground">No organization.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {orgs.map((org) => (
            <Link key={org.id} to="/o/$orgSlug" params={{ orgSlug: org.slug }} className="block no-underline">
              <Card className="hover:ring-2 hover:ring-primary/50 transition-all cursor-pointer h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
                      <BuildingIcon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{org.name}</CardTitle>
                      <CardDescription>{org.slug}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary">{org.role}</Badge>
                    {org.role === 'owner' && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <SettingsIcon className="w-4 h-4" />
                        Manage
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
