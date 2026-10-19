import { createFileRoute } from '@tanstack/react-router'
import { useOrg } from '@/hooks/use-auth'
import { useAccounts, useInstallAccount, useSetCredentials, useDeleteCredentials, useRemoveAccount, useConnectTwitch, useConnectionStatus, useAccountConnection, useDisconnectAccount, useReconnectAccount, usePingAccount, useReauthorizeTwitch } from '@/hooks/use-accounts'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AccessDenied } from '@/components/access-denied'
import { PlusIcon, TrashIcon, KeyIcon, UnplugIcon, PlugIcon, RefreshCwIcon, ActivityIcon, TvIcon, TriangleAlertIcon, KeyRoundIcon, SettingsIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import type { Account } from '@module-twitch/shared/validation'

export const Route = createFileRoute('/o/$orgSlug/')({
  component: RouteComponent,
})

function RouteComponent() {
  const org = useOrg()
  const canManage = org.role === 'owner'
  const { data: accounts, isLoading, error } = useAccounts(org.id, canManage)
  useConnectionStatus(org.id, canManage)
  const connectTwitch = useConnectTwitch(org.id)
  const removeAccount = useRemoveAccount(org.id)
  const disconnectAccount = useDisconnectAccount(org.id)
  const reconnectAccount = useReconnectAccount(org.id)

  return (
    <div className="max-w-4xl mx-auto w-full">

      {!canManage ? (
        <AccessDenied role={org.role} orgName={org.name} resource="Twitch accounts" />
      ) : (
        <>
          {accounts?.some((a) => !a.hasCredentials) && (
            <Alert className="mb-4 border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 [&>svg]:text-current">
              <TriangleAlertIcon />
              <AlertTitle>Not connected to Rawtoh</AlertTitle>
              <AlertDescription>
                An account below is not installed with Rawtoh yet, so your automations will not receive its events. Click Install with Rawtoh on that account.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex justify-end mb-4">
            <Button onClick={() => connectTwitch.mutate()} disabled={connectTwitch.isPending} className="w-full sm:w-auto">
              <PlusIcon />
              Connect Twitch account
            </Button>
          </div>

          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : error ? (
            <Alert variant="destructive">
              <TriangleAlertIcon />
              <AlertTitle>Could not load Twitch accounts</AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          ) : !accounts || accounts.length === 0 ? (
            <p className="text-muted-foreground">No Twitch accounts connected.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {accounts.map((account) => (
                <AccountCard
                  key={account.id}
                  orgId={org.id}
                  account={account}
                  onRemove={() =>
                    removeAccount.mutate(account.id, {
                      onSuccess: () => toast.success('Account removed'),
                      onError: (err) => toast.error(err.message),
                    })
                  }
                  onDisconnect={() =>
                    disconnectAccount.mutate(account.id, {
                      onSuccess: () => toast.success('Disconnected'),
                      onError: (err) => toast.error(err.message),
                    })
                  }
                  onReconnect={() =>
                    reconnectAccount.mutate(account.id, {
                      onSuccess: () => toast.success('Reconnecting...'),
                      onError: (err) => toast.error(err.message),
                    })
                  }
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function AccountCard({
  orgId,
  account,
  onRemove,
  onDisconnect,
  onReconnect,
}: {
  orgId: string
  account: Account
  onRemove: () => void
  onDisconnect: () => void
  onReconnect: () => void
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { data: connectionStatus } = useAccountConnection(orgId, account.id)
  const isConnected = connectionStatus?.connected ?? false
  const rotated = !isConnected && connectionStatus?.reason === 'key-rotated'
  const pingAccount = usePingAccount(orgId)
  const installAccount = useInstallAccount(orgId)
  const setCredentials = useSetCredentials(orgId)
  const deleteCredentials = useDeleteCredentials(orgId)
  const reauthorizeTwitch = useReauthorizeTwitch(orgId)
  const [enrollmentToken, setEnrollmentToken] = useState('')
  const [advanced, setAdvanced] = useState(false)

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-xl bg-purple-500/10">
                <TvIcon className="w-6 h-6 text-purple-500" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-lg font-semibold truncate">{account.twitchDisplayName}</CardTitle>
                <CardDescription className="truncate">@{account.twitchLogin}</CardDescription>
              </div>
              {!account.hasCredentials ? (
                <Badge variant="outline" className="border-yellow-500/40 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 flex-shrink-0 gap-1.5 px-2.5 py-1">
                  <TriangleAlertIcon className="h-3.5 w-3.5" />
                  Not installed
                </Badge>
              ) : rotated ? (
                <Badge variant="outline" className="border-yellow-500/40 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 flex-shrink-0 gap-1.5 px-2.5 py-1">
                  <TriangleAlertIcon className="h-3.5 w-3.5" />
                  Key rotated
                </Badge>
              ) : (
                <Badge variant="outline" className={`flex-shrink-0 gap-1.5 px-2.5 py-1 ${isConnected ? 'border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400' : 'border-gray-400/40 bg-gray-400/10 text-muted-foreground'}`}>
                  <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
                  {isConnected ? 'Online' : 'Offline'}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {!account.hasCredentials && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={installAccount.isPending}
                  onClick={() =>
                    installAccount.mutate(account.id, {
                      onSuccess: (data) => {
                        if (data.warning) toast.warning(data.warning)
                        else toast.success('Installed with Rawtoh')
                      },
                      onError: (err) => toast.error(err.message),
                    })
                  }
                >
                  <PlugIcon className="h-4 w-4" />
                  {installAccount.isPending ? 'Installing…' : 'Install with Rawtoh'}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setDrawerOpen(true)}>
                <KeyIcon className="h-4 w-4" />
                Rawtoh instance
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={reauthorizeTwitch.isPending}
                title="Revoke the Twitch token and request a new one with the current scopes"
                onClick={() =>
                  reauthorizeTwitch.mutate(account.id, {
                    onError: (err) => toast.error(err.message),
                  })
                }
              >
                <KeyRoundIcon className="h-4 w-4" />
                {reauthorizeTwitch.isPending ? 'Redirecting…' : 'Reauthorize Twitch'}
              </Button>
              {account.hasCredentials && (
                <>
                  {isConnected ? (
                    <Button variant="outline" size="sm" onClick={onDisconnect}>
                      <UnplugIcon className="h-4 w-4" />
                      Disconnect
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={onReconnect}>
                      <PlugIcon className="h-4 w-4" />
                      Connect
                    </Button>
                  )}
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={onReconnect} title="Reconnect">
                    <RefreshCwIcon className="h-4 w-4" />
                  </Button>
                  {isConnected && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pingAccount.isPending}
                      onClick={() =>
                        pingAccount.mutate(account.id, {
                          onSuccess: (data) => toast.success(`Pong! ${data.latency}ms`),
                          onError: (err) => toast.error(err.message),
                        })
                      }
                    >
                      <ActivityIcon className="h-4 w-4" />
                      {pingAccount.isPending ? '...' : 'Ping'}
                    </Button>
                  )}
                </>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onRemove} title="Remove account">
                <TrashIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {rotated && (
            <p className="mt-3 text-sm text-yellow-600 dark:text-yellow-400">
              This account was re-enrolled in Rawtoh, so its signing key is no longer trusted. Delete the signing key, then click Install with Rawtoh again.
            </p>
          )}
        </CardHeader>
      </Card>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <div className="flex items-center justify-between gap-2 pr-6">
              <SheetTitle>Rawtoh instance — {account.twitchDisplayName}</SheetTitle>
              {!account.hasCredentials && (
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="Advanced" onClick={() => setAdvanced(true)}><SettingsIcon className="h-4 w-4" /></Button>
              )}
            </div>
            <SheetDescription>
              {account.hasCredentials
                ? `Instance ID: ${account.instanceId}`
                : 'This account is not enrolled in Rawtoh yet. Install with Rawtoh does everything in one click: it creates the instance and connects it with your account.'}
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 flex flex-col gap-4">
            {!account.hasCredentials && (
              <div className="flex flex-col items-start gap-2">
                <Button
                  disabled={installAccount.isPending}
                  onClick={() =>
                    installAccount.mutate(account.id, {
                      onSuccess: (data) => {
                        if (data.warning) toast.warning(data.warning)
                        else toast.success('Installed with Rawtoh')
                        setDrawerOpen(false)
                      },
                      onError: (err) => toast.error(err.message),
                    })
                  }
                >
                  <PlugIcon className="h-4 w-4" />
                  {installAccount.isPending ? 'Installing…' : 'Install with Rawtoh'}
                </Button>
              </div>
            )}
          </div>
          <SheetFooter>
            {account.hasCredentials && (
              <Button
                variant="destructive"
                onClick={() =>
                  deleteCredentials.mutate(account.id, {
                    onSuccess: () => {
                      toast.success('Uninstalled — the instance is still in your Rawtoh dashboard')
                      setDrawerOpen(false)
                    },
                    onError: (err) => toast.error(err.message),
                  })
                }
              >
                Uninstall from Rawtoh
              </Button>
            )}
            <SheetClose asChild>
              <Button variant="ghost">Close</Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <Sheet open={advanced} onOpenChange={setAdvanced}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Manual enrollment</SheetTitle>
            <SheetDescription>From Rawtoh → Module instances → Get enrollment token. Single use, valid 15 minutes.</SheetDescription>
          </SheetHeader>
          <div className="px-4 text-sm space-y-3">
            <Alert variant="destructive">
              <TriangleAlertIcon className="h-4 w-4" />
              <AlertTitle>Advanced: manual enrollment</AlertTitle>
              <AlertDescription>Install with Rawtoh already does this for you. Only paste a token here if you created the instance by hand in the Rawtoh dashboard and know exactly what you are doing.</AlertDescription>
            </Alert>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!enrollmentToken.trim()) return
                setCredentials.mutate(
                  { accountId: account.id, enrollmentToken: enrollmentToken.trim() },
                  {
                    onSuccess: (data) => {
                      if (data.warning) toast.warning(data.warning)
                      else toast.success('Enrolled')
                      setEnrollmentToken('')
                      setDrawerOpen(false)
                    },
                    onError: (err) => toast.error(err.message),
                  }
                )
              }}
              className="mt-3 flex flex-col gap-3"
            >
              <Input
                placeholder="Enrollment token (rth_e_...)"
                value={enrollmentToken}
                onChange={(e) => setEnrollmentToken(e.target.value)}
                className="font-mono"
              />
              <Button type="submit" disabled={!enrollmentToken.trim() || setCredentials.isPending}>
                Enroll
              </Button>
            </form>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
