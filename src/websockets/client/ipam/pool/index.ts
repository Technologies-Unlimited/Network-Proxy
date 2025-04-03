'use client'

/**
 * WebSocket-based IP Pool hook
 * Provides real-time updates for IP pool data
 */

import { useState, useCallback, useEffect } from 'react'
import {
  useWebSocketConnection,
  WebSocketMessage,
} from '@/websockets/client/useWebSocketConnection'
import { ExtendedPoolFields } from '@/schema/network-administration/ipam/pool/schema'

interface IPPoolHookResult {
  ipPools: ExtendedPoolFields[]
  loading: boolean
  error: string | null
  refreshIPPools: () => void
  updateIPPool: (
    id: string,
    input: Partial<ExtendedPoolFields>
  ) => Promise<ExtendedPoolFields | null>
  deleteIPPool: (id: string) => Promise<boolean>
  isConnected: boolean
  reconnect: () => void
}

interface IPPoolMessage extends WebSocketMessage {
  type: 'ipPool'
  _id: string
  company_id: string
  name: string
  start_ip: string
  end_ip: string
  description: string
  subnet_id: string
  supernet_id: string
  created_at: number
  updated_at: number
}

export function useIPPools(
  companyId: string | null,
  wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001'
): IPPoolHookResult {
  const [ipPools, setIPPools] = useState<ExtendedPoolFields[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Construct the WebSocket URL with companyId as a parameter
  const fullWsUrl = companyId ? `${wsUrl}?companyId=${companyId}` : wsUrl

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((message: WebSocketMessage) => {
    if (message.type === 'ipPool') {
      const ipPoolMessage = message as IPPoolMessage

      setIPPools(prevPools => {
        // Convert the incoming message to the expected format
        const newPool: ExtendedPoolFields = {
          _id: ipPoolMessage._id,
          companyId: ipPoolMessage.company_id,
          name: ipPoolMessage.name,
          startIp: ipPoolMessage.start_ip,
          endIp: ipPoolMessage.end_ip,
          description: ipPoolMessage.description,
          subnetId: ipPoolMessage.subnet_id,
          supernetId: ipPoolMessage.supernet_id,
          createdAt: ipPoolMessage.created_at,
          updatedAt: ipPoolMessage.updated_at,
        }

        // Update or add the pool to the array
        const existingIndex = prevPools.findIndex(
          pool => pool._id === newPool._id
        )

        if (existingIndex >= 0) {
          // Update existing pool
          const updatedPools = [...prevPools]
          updatedPools[existingIndex] = newPool
          return updatedPools
        } else {
          // Add new pool
          return [...prevPools, newPool]
        }
      })
    } else if (message.type === 'initialIPPoolData') {
      // Handle initial data load
      const initialPools = message.pools.map((pool: any) => ({
        _id: pool._id,
        companyId: pool.company_id,
        name: pool.name,
        startIp: pool.start_ip,
        endIp: pool.end_ip,
        description: pool.description,
        subnetId: pool.subnet_id,
        supernetId: pool.supernet_id,
        createdAt: pool.created_at,
        updatedAt: pool.updated_at,
      }))

      setIPPools(initialPools)
      setLoading(false)
    } else if (message.type === 'deleteIPPool') {
      // Handle deletion message
      setIPPools(prevPools => prevPools.filter(pool => pool._id !== message.id))
    }
  }, [])

  // Initialize the WebSocket connection
  const {
    isConnected,
    error: wsError,
    sendMessage,
    reconnect,
  } = useWebSocketConnection({
    url: fullWsUrl,
    onMessage: handleMessage,
    onOpen: () => {
      // Request initial data when connection opens
      sendMessage({ type: 'requestInitialIPPoolData' })
    },
  })

  // Fetch initial IP pool data via REST API when WebSocket is not connected
  useEffect(() => {
    if (!companyId || isConnected) {
      return
    }

    const fetchInitialData = async () => {
      try {
        setLoading(true)

        const response = await fetch(
          `/api/network-administration/ipam/pool?companyId=${companyId}`
        )

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()

        // Transform the data to the expected format
        const formattedData: ExtendedPoolFields[] = data.map((item: any) => ({
          _id: item._id,
          companyId: item.company_id,
          name: item.name,
          startIp: item.start_ip,
          endIp: item.end_ip,
          description: item.description,
          subnetId: item.subnet_id,
          supernetId: item.supernet_id,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
        }))

        setIPPools(formattedData)
        setFetchError(null)
      } catch (error) {
        console.error('Error fetching IP pool data:', error)
        setFetchError(
          `Failed to fetch data: ${error instanceof Error ? error.message : String(error)}`
        )
      } finally {
        setLoading(false)
      }
    }

    fetchInitialData()
  }, [companyId, isConnected])

  // Refresh IP pool data
  const refreshIPPools = useCallback(() => {
    if (isConnected) {
      // If connected via WebSocket, request a refresh
      sendMessage({ type: 'requestIPPoolRefresh' })
    } else {
      // Otherwise, set loading to trigger the useEffect to refetch
      setLoading(true)
    }
  }, [isConnected, sendMessage])

  // Update IP pool
  const updateIPPool = useCallback(
    async (
      id: string,
      input: Partial<ExtendedPoolFields>
    ): Promise<ExtendedPoolFields | null> => {
      if (!companyId) {
        console.error('Company ID is null')
        return null
      }

      try {
        // Try to update via WebSocket if connected
        if (isConnected) {
          sendMessage({
            type: 'updateIPPool',
            id,
            companyId,
            input,
          })

          // Return optimistic update in the local state
          const updatedPool = {
            ...input,
            _id: id,
            companyId,
          } as ExtendedPoolFields

          setIPPools(prevPools => {
            const existingIndex = prevPools.findIndex(pool => pool._id === id)

            if (existingIndex >= 0) {
              // Update existing pool
              const updatedPools = [...prevPools]
              updatedPools[existingIndex] = {
                ...updatedPools[existingIndex],
                ...updatedPool,
              }
              return updatedPools
            }

            return prevPools
          })

          return updatedPool
        }

        // Fallback to REST API if WebSocket is not connected
        const response = await fetch(
          `/api/network-administration/ipam/pool/${id}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              companyId,
              input,
            }),
          }
        )

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()

        // Transform the response to the expected format
        const updatedPool: ExtendedPoolFields = {
          _id: data._id,
          companyId: data.company_id,
          name: data.name,
          startIp: data.start_ip,
          endIp: data.end_ip,
          description: data.description,
          subnetId: data.subnet_id,
          supernetId: data.supernet_id,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        }

        // Update state with the new data
        setIPPools(prevPools => {
          const existingIndex = prevPools.findIndex(
            pool => pool._id === updatedPool._id
          )

          if (existingIndex >= 0) {
            // Update existing pool
            const updatedPools = [...prevPools]
            updatedPools[existingIndex] = updatedPool
            return updatedPools
          } else {
            // Add new pool
            return [...prevPools, updatedPool]
          }
        })

        return updatedPool
      } catch (error) {
        console.error('Error updating IP pool:', error)
        return null
      }
    },
    [companyId, isConnected, sendMessage]
  )

  // Delete IP pool
  const deleteIPPool = useCallback(
    async (id: string): Promise<boolean> => {
      if (!companyId) {
        console.error('Company ID is null')
        return false
      }

      try {
        // Try to delete via WebSocket if connected
        if (isConnected) {
          sendMessage({
            type: 'deleteIPPool',
            id,
            companyId,
          })

          // Update local state optimistically
          setIPPools(prevPools => prevPools.filter(pool => pool._id !== id))

          return true
        }

        // Fallback to REST API if WebSocket is not connected
        const response = await fetch(
          `/api/network-administration/ipam/pool/${id}`,
          {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              companyId,
            }),
          }
        )

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const success = await response.json()

        if (success) {
          // Update state
          setIPPools(prevPools => prevPools.filter(pool => pool._id !== id))
        }

        return success
      } catch (error) {
        console.error('Error deleting IP pool:', error)
        return false
      }
    },
    [companyId, isConnected, sendMessage]
  )

  // Combine errors from WebSocket and fetch
  const error = wsError || fetchError

  return {
    ipPools,
    loading,
    error,
    refreshIPPools,
    updateIPPool,
    deleteIPPool,
    isConnected,
    reconnect,
  }
}
