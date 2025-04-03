'use client'

/**
 * WebSocket-based IP Subnet hook
 * Provides real-time updates for IP subnet data
 */

import { useState, useCallback, useEffect } from 'react'
import {
  useWebSocketConnection,
  WebSocketMessage,
} from '@/websockets/client/useWebSocketConnection'
import { ExtendedSubnetFields } from '@/schema/network-administration/ipam/subnet/schema'

interface IPSubnetHookResult {
  ipSubnets: ExtendedSubnetFields[]
  loading: boolean
  error: string | null
  refreshIPSubnets: () => void
  updateIPSubnet: (
    id: string,
    input: Partial<ExtendedSubnetFields>
  ) => Promise<ExtendedSubnetFields | null>
  deleteIPSubnet: (id: string) => Promise<boolean>
  isConnected: boolean
  reconnect: () => void
}

interface IPSubnetMessage extends WebSocketMessage {
  type: 'ipSubnet'
  _id: string
  company_id: string
  name: string
  cidr: string
  subnet_address: string
  gateway: string
  description: string
  supernet_id: string
  created_at: number
  updated_at: number
}

export function useIPSubnets(
  companyId: string | null,
  wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001'
): IPSubnetHookResult {
  const [ipSubnets, setIPSubnets] = useState<ExtendedSubnetFields[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Construct the WebSocket URL with companyId as a parameter
  const fullWsUrl = companyId ? `${wsUrl}?companyId=${companyId}` : wsUrl

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((message: WebSocketMessage) => {
    if (message.type === 'ipSubnet') {
      const ipSubnetMessage = message as IPSubnetMessage

      setIPSubnets(prevSubnets => {
        // Convert the incoming message to the expected format
        const newSubnet: ExtendedSubnetFields = {
          _id: ipSubnetMessage._id,
          companyId: ipSubnetMessage.company_id,
          name: ipSubnetMessage.name,
          cidr: ipSubnetMessage.cidr,
          subnetAddress: ipSubnetMessage.subnet_address,
          gateway: ipSubnetMessage.gateway,
          description: ipSubnetMessage.description,
          supernetId: ipSubnetMessage.supernet_id,
          createdAt: ipSubnetMessage.created_at,
          updatedAt: ipSubnetMessage.updated_at,
        }

        // Update or add the subnet to the array
        const existingIndex = prevSubnets.findIndex(
          subnet => subnet._id === newSubnet._id
        )

        if (existingIndex >= 0) {
          // Update existing subnet
          const updatedSubnets = [...prevSubnets]
          updatedSubnets[existingIndex] = newSubnet
          return updatedSubnets
        } else {
          // Add new subnet
          return [...prevSubnets, newSubnet]
        }
      })
    } else if (message.type === 'initialIPSubnetData') {
      // Handle initial data load
      const initialSubnets = message.subnets.map((subnet: any) => ({
        _id: subnet._id,
        companyId: subnet.company_id,
        name: subnet.name,
        cidr: subnet.cidr,
        subnetAddress: subnet.subnet_address,
        gateway: subnet.gateway,
        description: subnet.description,
        supernetId: subnet.supernet_id,
        createdAt: subnet.created_at,
        updatedAt: subnet.updated_at,
      }))

      setIPSubnets(initialSubnets)
      setLoading(false)
    } else if (message.type === 'deleteIPSubnet') {
      // Handle deletion message
      setIPSubnets(prevSubnets =>
        prevSubnets.filter(subnet => subnet._id !== message.id)
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
      sendMessage({ type: 'requestInitialIPSubnetData' })
    },
  })

  // Fetch initial IP subnet data via REST API when WebSocket is not connected
  useEffect(() => {
    if (!companyId || isConnected) {
      return
    }

    const fetchInitialData = async () => {
      try {
        setLoading(true)

        const response = await fetch(
          `/api/network-administration/ipam/subnet?companyId=${companyId}`
        )

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()

        // Transform the data to the expected format
        const formattedData: ExtendedSubnetFields[] = data.map((item: any) => ({
          _id: item._id,
          companyId: item.company_id,
          name: item.name,
          cidr: item.cidr,
          subnetAddress: item.subnet_address,
          gateway: item.gateway,
          description: item.description,
          supernetId: item.supernet_id,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
        }))

        setIPSubnets(formattedData)
        setFetchError(null)
      } catch (error) {
        console.error('Error fetching IP subnet data:', error)
        setFetchError(
          `Failed to fetch data: ${error instanceof Error ? error.message : String(error)}`
        )
      } finally {
        setLoading(false)
      }
    }

    fetchInitialData()
  }, [companyId, isConnected])

  // Refresh IP subnet data
  const refreshIPSubnets = useCallback(() => {
    if (isConnected) {
      // If connected via WebSocket, request a refresh
      sendMessage({ type: 'requestIPSubnetRefresh' })
    } else {
      // Otherwise, set loading to trigger the useEffect to refetch
      setLoading(true)
    }
  }, [isConnected, sendMessage])

  // Update IP subnet
  const updateIPSubnet = useCallback(
    async (
      id: string,
      input: Partial<ExtendedSubnetFields>
    ): Promise<ExtendedSubnetFields | null> => {
      if (!companyId) {
        console.error('Company ID is null')
        return null
      }

      try {
        // Try to update via WebSocket if connected
        if (isConnected) {
          sendMessage({
            type: 'updateIPSubnet',
            id,
            companyId,
            input,
          })

          // Return optimistic update in the local state
          const updatedSubnet = {
            ...input,
            _id: id,
            companyId,
          } as ExtendedSubnetFields

          setIPSubnets(prevSubnets => {
            const existingIndex = prevSubnets.findIndex(
              subnet => subnet._id === id
            )

            if (existingIndex >= 0) {
              // Update existing subnet
              const updatedSubnets = [...prevSubnets]
              updatedSubnets[existingIndex] = {
                ...updatedSubnets[existingIndex],
                ...updatedSubnet,
              }
              return updatedSubnets
            }

            return prevSubnets
          })

          return updatedSubnet
        }

        // Fallback to REST API if WebSocket is not connected
        const response = await fetch(
          `/api/network-administration/ipam/subnet/${id}`,
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
        const updatedSubnet: ExtendedSubnetFields = {
          _id: data._id,
          companyId: data.company_id,
          name: data.name,
          cidr: data.cidr,
          subnetAddress: data.subnet_address,
          gateway: data.gateway,
          description: data.description,
          supernetId: data.supernet_id,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        }

        // Update state with the new data
        setIPSubnets(prevSubnets => {
          const existingIndex = prevSubnets.findIndex(
            subnet => subnet._id === updatedSubnet._id
          )

          if (existingIndex >= 0) {
            // Update existing subnet
            const updatedSubnets = [...prevSubnets]
            updatedSubnets[existingIndex] = updatedSubnet
            return updatedSubnets
          } else {
            // Add new subnet
            return [...prevSubnets, updatedSubnet]
          }
        })

        return updatedSubnet
      } catch (error) {
        console.error('Error updating IP subnet:', error)
        return null
      }
    },
    [companyId, isConnected, sendMessage]
  )

  // Delete IP subnet
  const deleteIPSubnet = useCallback(
    async (id: string): Promise<boolean> => {
      if (!companyId) {
        console.error('Company ID is null')
        return false
      }

      try {
        // Try to delete via WebSocket if connected
        if (isConnected) {
          sendMessage({
            type: 'deleteIPSubnet',
            id,
            companyId,
          })

          // Update local state optimistically
          setIPSubnets(prevSubnets =>
            prevSubnets.filter(subnet => subnet._id !== id)
          )

          return true
        }

        // Fallback to REST API if WebSocket is not connected
        const response = await fetch(
          `/api/network-administration/ipam/subnet/${id}`,
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
          setIPSubnets(prevSubnets =>
            prevSubnets.filter(subnet => subnet._id !== id)
          )
        }

        return success
      } catch (error) {
        console.error('Error deleting IP subnet:', error)
        return false
      }
    },
    [companyId, isConnected, sendMessage]
  )

  // Combine errors from WebSocket and fetch
  const error = wsError || fetchError

  return {
    ipSubnets,
    loading,
    error,
    refreshIPSubnets,
    updateIPSubnet,
    deleteIPSubnet,
    isConnected,
    reconnect,
  }
}
