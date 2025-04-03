'use client'

/**
 * WebSocket-based IP Supernet hook
 * Provides real-time updates for IP supernet data
 */

import { useState, useCallback, useEffect } from 'react'
import {
  useWebSocketConnection,
  WebSocketMessage,
} from '@/websockets/client/useWebSocketConnection'
import { ExtendedSupernetFields } from '@/schema/network-administration/ipam/supernet/schema'

interface IPSupernetHookResult {
  ipSupernets: ExtendedSupernetFields[]
  loading: boolean
  error: string | null
  refreshIPSupernets: () => void
  updateIPSupernet: (
    id: string,
    input: Partial<ExtendedSupernetFields>
  ) => Promise<ExtendedSupernetFields | null>
  deleteIPSupernet: (id: string) => Promise<boolean>
  isConnected: boolean
  reconnect: () => void
}

interface IPSupernetMessage extends WebSocketMessage {
  type: 'ipSupernet'
  _id: string
  company_id: string
  name: string
  description: string
  cidr: string
  supernet_address: string
  created_at: number
  updated_at: number
}

export function useIPSupernets(
  companyId: string | null,
  wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001'
): IPSupernetHookResult {
  const [ipSupernets, setIPSupernets] = useState<ExtendedSupernetFields[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Construct the WebSocket URL with companyId as a parameter
  const fullWsUrl = companyId ? `${wsUrl}?companyId=${companyId}` : wsUrl

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((message: WebSocketMessage) => {
    if (message.type === 'ipSupernet') {
      const ipSupernetMessage = message as IPSupernetMessage

      setIPSupernets(prevSupernets => {
        // Convert the incoming message to the expected format
        const newSupernet: ExtendedSupernetFields = {
          _id: ipSupernetMessage._id,
          companyId: ipSupernetMessage.company_id,
          name: ipSupernetMessage.name,
          description: ipSupernetMessage.description,
          cidr: ipSupernetMessage.cidr,
          supernetAddress: ipSupernetMessage.supernet_address,
          createdAt: ipSupernetMessage.created_at,
          updatedAt: ipSupernetMessage.updated_at,
        }

        // Update or add the supernet to the array
        const existingIndex = prevSupernets.findIndex(
          supernet => supernet._id === newSupernet._id
        )

        if (existingIndex >= 0) {
          // Update existing supernet
          const updatedSupernets = [...prevSupernets]
          updatedSupernets[existingIndex] = newSupernet
          return updatedSupernets
        } else {
          // Add new supernet
          return [...prevSupernets, newSupernet]
        }
      })
    } else if (message.type === 'initialIPSupernetData') {
      // Handle initial data load
      const initialSupernets = message.supernets.map((supernet: any) => ({
        _id: supernet._id,
        companyId: supernet.company_id,
        name: supernet.name,
        description: supernet.description,
        cidr: supernet.cidr,
        supernetAddress: supernet.supernet_address,
        createdAt: supernet.created_at,
        updatedAt: supernet.updated_at,
      }))

      setIPSupernets(initialSupernets)
      setLoading(false)
    } else if (message.type === 'deleteIPSupernet') {
      // Handle deletion message
      setIPSupernets(prevSupernets =>
        prevSupernets.filter(supernet => supernet._id !== message.id)
      )
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
      sendMessage({ type: 'requestInitialIPSupernetData' })
    },
  })

  // Fetch initial IP supernet data via REST API when WebSocket is not connected
  useEffect(() => {
    if (!companyId || isConnected) {
      return
    }

    const fetchInitialData = async () => {
      try {
        setLoading(true)

        const response = await fetch(
          `/api/network-administration/ipam/supernet?companyId=${companyId}`
        )

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()

        // Transform the data to the expected format
        const formattedData: ExtendedSupernetFields[] = data.map(
          (item: any) => ({
            _id: item._id,
            companyId: item.company_id,
            name: item.name,
            description: item.description,
            cidr: item.cidr,
            supernetAddress: item.supernet_address,
            createdAt: item.created_at,
            updatedAt: item.updated_at,
          })
        )

        setIPSupernets(formattedData)
        setFetchError(null)
      } catch (error) {
        console.error('Error fetching IP supernet data:', error)
        setFetchError(
          `Failed to fetch data: ${error instanceof Error ? error.message : String(error)}`
        )
      } finally {
        setLoading(false)
      }
    }

    fetchInitialData()
  }, [companyId, isConnected])

  // Refresh IP supernet data
  const refreshIPSupernets = useCallback(() => {
    if (isConnected) {
      // If connected via WebSocket, request a refresh
      sendMessage({ type: 'requestIPSupernetRefresh' })
    } else {
      // Otherwise, set loading to trigger the useEffect to refetch
      setLoading(true)
    }
  }, [isConnected, sendMessage])

  // Update IP supernet
  const updateIPSupernet = useCallback(
    async (
      id: string,
      input: Partial<ExtendedSupernetFields>
    ): Promise<ExtendedSupernetFields | null> => {
      if (!companyId) {
        console.error('Company ID is null')
        return null
      }

      try {
        // Try to update via WebSocket if connected
        if (isConnected) {
          sendMessage({
            type: 'updateIPSupernet',
            id,
            companyId,
            input,
          })

          // Return optimistic update in the local state
          const updatedSupernet = {
            ...input,
            _id: id,
            companyId,
          } as ExtendedSupernetFields

          setIPSupernets(prevSupernets => {
            const existingIndex = prevSupernets.findIndex(
              supernet => supernet._id === id
            )

            if (existingIndex >= 0) {
              // Update existing supernet
              const updatedSupernets = [...prevSupernets]
              updatedSupernets[existingIndex] = {
                ...updatedSupernets[existingIndex],
                ...updatedSupernet,
              }
              return updatedSupernets
            }

            return prevSupernets
          })

          return updatedSupernet
        }

        // Fallback to REST API if WebSocket is not connected
        const response = await fetch(
          `/api/network-administration/ipam/supernet/${id}`,
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
        const updatedSupernet: ExtendedSupernetFields = {
          _id: data._id,
          companyId: data.company_id,
          name: data.name,
          description: data.description,
          cidr: data.cidr,
          supernetAddress: data.supernet_address,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        }

        // Update state with the new data
        setIPSupernets(prevSupernets => {
          const existingIndex = prevSupernets.findIndex(
            supernet => supernet._id === updatedSupernet._id
          )

          if (existingIndex >= 0) {
            // Update existing supernet
            const updatedSupernets = [...prevSupernets]
            updatedSupernets[existingIndex] = updatedSupernet
            return updatedSupernets
          } else {
            // Add new supernet
            return [...prevSupernets, updatedSupernet]
          }
        })

        return updatedSupernet
      } catch (error) {
        console.error('Error updating IP supernet:', error)
        return null
      }
    },
    [companyId, isConnected, sendMessage]
  )

  // Delete IP supernet
  const deleteIPSupernet = useCallback(
    async (id: string): Promise<boolean> => {
      if (!companyId) {
        console.error('Company ID is null')
        return false
      }

      try {
        // Try to delete via WebSocket if connected
        if (isConnected) {
          sendMessage({
            type: 'deleteIPSupernet',
            id,
            companyId,
          })

          // Update local state optimistically
          setIPSupernets(prevSupernets =>
            prevSupernets.filter(supernet => supernet._id !== id)
          )

          return true
        }

        // Fallback to REST API if WebSocket is not connected
        const response = await fetch(
          `/api/network-administration/ipam/supernet/${id}`,
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
          setIPSupernets(prevSupernets =>
            prevSupernets.filter(supernet => supernet._id !== id)
          )
        }

        return success
      } catch (error) {
        console.error('Error deleting IP supernet:', error)
        return false
      }
    },
    [companyId, isConnected, sendMessage]
  )

  // Combine errors from WebSocket and fetch
  const error = wsError || fetchError

  return {
    ipSupernets,
    loading,
    error,
    refreshIPSupernets,
    updateIPSupernet,
    deleteIPSupernet,
    isConnected,
    reconnect,
  }
}
