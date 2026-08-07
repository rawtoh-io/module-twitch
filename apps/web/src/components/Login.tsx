import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/hooks/use-auth'

export function Login() {
  const { login } = useAuth()

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Twitch</CardTitle>
          <CardDescription>Sign in to manage your Twitch accounts</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={login} className="w-full" size="lg">
            Sign in with Rawtoh
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
