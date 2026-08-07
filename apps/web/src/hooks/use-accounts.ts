import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { query } from '@/api/client'
import type { Account } from '@module-twitch/shared/validation'

export function useAccounts(orgId: string) {
  return useQuery({
    queryKey: ['accounts', orgId],
    queryFn: () => query.get(`api/orgs/${orgId}/accounts`).json<Account[]>(),
  })
}

export function useInstallAccount(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (accountId: string) =>
      query.post(`api/orgs/${orgId}/accounts/${accountId}/install`).json<{ ok: boolean; warning?: string; error?: string }>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts', orgId] }),
  })
}

export function useSetCredentials(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ accountId, enrollmentToken }: { accountId: string; enrollmentToken: string }) =>
      query.put(`api/orgs/${orgId}/accounts/${accountId}/credentials`, { json: { enrollmentToken } }).json<{ ok: boolean; warning?: string; error?: string }>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts', orgId] }),
  })
}

export function useDeleteCredentials(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (accountId: string) =>
      query.delete(`api/orgs/${orgId}/accounts/${accountId}/credentials`).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts', orgId] }),
  })
}

export function useRemoveAccount(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (accountId: string) =>
      query.delete(`api/orgs/${orgId}/accounts/${accountId}`).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts', orgId] }),
  })
}

export function useConnectionStatus(orgId: string) {
  const qc = useQueryClient()
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    const es = new EventSource(`/api/orgs/${orgId}/accounts/events`)
    eventSourceRef.current = es

    es.onmessage = (e) => {
      const data = JSON.parse(e.data)
      if (data.type === 'init') {
        for (const account of data.accounts) {
          qc.setQueryData(['account-connection', orgId, account.accountId], { connected: account.connected, reason: account.reason ?? null })
        }
      } else if (data.type === 'status') {
        qc.setQueryData(['account-connection', orgId, data.accountId], { connected: data.connected, reason: data.reason ?? null })
      }
    }

    return () => {
      es.close()
      eventSourceRef.current = null
    }
  }, [orgId, qc])
}

// Read-only subscription to the cache populated by useConnectionStatus SSE stream — no fetching needed
export function useAccountConnection(orgId: string, accountId: string) {
  return useQuery({
    queryKey: ['account-connection', orgId, accountId],
    queryFn: () => ({ connected: false, reason: null as string | null }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    enabled: false,
  })
}

export function useDisconnectAccount(orgId: string) {
  return useMutation({
    mutationFn: (accountId: string) =>
      query.post(`api/orgs/${orgId}/accounts/${accountId}/disconnect`).json(),
  })
}

export function useReconnectAccount(orgId: string) {
  return useMutation({
    mutationFn: (accountId: string) =>
      query.post(`api/orgs/${orgId}/accounts/${accountId}/reconnect`).json(),
  })
}

export function usePingAccount(orgId: string) {
  return useMutation({
    mutationFn: (accountId: string) =>
      query.post(`api/orgs/${orgId}/accounts/${accountId}/ping`).json<{ latency: number }>(),
  })
}

export function useConnectTwitch(orgId: string) {
  return useMutation({
    mutationFn: async () => {
      const res = await query.get(`api/orgs/${orgId}/twitch/connect`).json<{ url: string }>()
      window.location.href = res.url
    },
  })
}
