import { createFileRoute, Link } from '@tanstack/react-router'
import { useOrg } from '@/hooks/use-auth'
import { useAccounts, useInstallAccount, useSetCredentials, useDeleteCredentials, useRemoveAccount, useConnectTwitch, useConnectionStatus, useAccountConnection, useDisconnectAccount, useReconnectAccount, usePingAccount } from '@/hooks/use-accounts'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ArrowLeftIcon, PlusIcon, TrashIcon, KeyIcon, UnplugIcon, PlugIcon, RefreshCwIcon, ActivityIcon, TvIcon, TriangleAlertIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import type { Account } from '@module-twitch/shared/validation'

export const Route = createFileRoute('/o/$orgSlug/')({
  component: RouteComponent,
})

function RouteComponent() {
  const org = useOrg()
  const { data: accounts, isLoading } = useAccounts(org.id)
  useConnectionStatus(org.id)
  const connectTwitch = useConnectTwitch(org.id)
  const removeAccount = useRemoveAccount(org.id)
  const disconnectAccount = useDisconnectAccount(org.id)
  const reconnectAccount = useReconnectAccount(org.id)

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-6 sm:py-8">
      <div className="flex items-center gap-3 sm:gap-4 mb-6">
        <Link to="/">
          <Button variant="ghost" size="icon">
            <ArrowLeftIcon />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold truncate">{org.name}</h1>
          <p className="text-muted-foreground text-sm">Twitch accounts</p>
        </div>
      </div>

      <div className="flex justify-end mb-4">
        <Button onClick={() => connectTwitch.mutate()} disabled={connectTwitch.isPending} className="w-full sm:w-auto">
          <PlusIcon />
          Connect Twitch account
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading...</p>
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
  const [enrollmentToken, setEnrollmentToken] = useState('')

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
                Credentials
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
              This account was re-enrolled in Rawtoh, so its signing key is no longer trusted. Enroll again with a fresh token.
            </p>
          )}
        </CardHeader>
      </Card>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Rawtoh instance — {account.twitchDisplayName}</SheetTitle>
            <SheetDescription>
              {account.hasCredentials
                ? `Instance ID: ${account.instanceId}`
                : 'This account is not enrolled in Rawtoh yet.'}
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
                <p className="text-muted-foreground text-sm">
                  Provisions the module instance in Rawtoh automatically using your account.
                </p>
              </div>
            )}
            <details className="text-sm">
              <summary className="text-muted-foreground cursor-pointer">Enrollment token (advanced)</summary>
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
                <p className="text-muted-foreground text-xs">
                  From Rawtoh → Module instances → Get enrollment token. Single use, valid 15 minutes.
                </p>
                <Button type="submit" disabled={!enrollmentToken.trim() || setCredentials.isPending}>
                  Enroll
                </Button>
              </form>
            </details>
          </div>
          <SheetFooter>
            {account.hasCredentials && (
              <Button
                variant="outline"
                onClick={() =>
                  deleteCredentials.mutate(account.id, {
                    onSuccess: () => {
                      toast.success('Signing key deleted')
                      setDrawerOpen(false)
                    },
                    onError: (err) => toast.error(err.message),
                  })
                }
              >
                Delete signing key
              </Button>
            )}
            <SheetClose asChild>
              <Button variant="ghost">Close</Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}
