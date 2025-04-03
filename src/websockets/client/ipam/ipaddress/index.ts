'use client'

/**
 * WebSocket-based IP Address hook
 * Provides real-time updates for IP address data
 */

import { useState, useCallback, useEffect } from 'react'
import {
  useWebSocketConnection,
  WebSocketMessage,
} from '@/websockets/client/useWebSocketConnection'
import { ExtendedIPAddressFields } from '@/schema/network-administration/ipam/ipaddress/schema'

interface IPAddressHookResult {
  ipAddresses: ExtendedIPAddressFields[]
  loading: boolean
  error: string | null
  refreshIPAddresses: () => void
  updateIPAddress: (
    id: string,
    input: Partial<ExtendedIPAddressFields>
  ) => Promise<ExtendedIPAddressFields | null>
  deleteIPAddress: (id: string) => Promise<boolean>
  isConnected: boolean
  reconnect: () => void
}

interface IPAddressMessage extends WebSocketMessage {
  type: 'ipAddress'
  _id: string
  company_id: string
  address: string
  description: string
  is_used: number
  network_inventory_id?: string
  pool_id: string
  subnet_id: string
  supernet_id: string
  created_at: number
  updated_at: number
}

export function useIPAddresses(
  companyId: string | null,
  wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001'
): IPAddressHookResult {
  const [ipAddresses, setIPAddresses] = useState<ExtendedIPAddressFields[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Construct the WebSocket URL with companyId as a parameter
  const fullWsUrl = companyId ? `${wsUrl}?companyId=${companyId}` : wsUrl

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((message: WebSocketMessage) => {
    if (message.type === 'ipAddress') {
      const ipAddressMessage = message as IPAddressMessage

      setIPAddresses(prevAddresses => {
        // Convert the incoming message to the expected format
        const newAddress: ExtendedIPAddressFields = {
          _id: ipAddressMessage._id,
          companyId: ipAddressMessage.company_id,
          address: ipAddressMessage.address,
          description: ipAddressMessage.description,
          isUsed: Boolean(ipAddressMessage.is_used),
          networkInventoryId: ipAddressMessage.network_inventory_id,
          poolId: ipAddressMessage.pool_id,
          subnetId: ipAddressMessage.subnet_id,
          supernetId: ipAddressMessage.supernet_id,
          createdAt: ipAddressMessage.created_at,
          updatedAt: ipAddressMessage.updated_at,
        }

        // Update or add the address to the array
        const existingIndex = prevAddresses.findIndex(
          address => address._id === newAddress._id
        )

        if (existingIndex >= 0) {
          // Update existing address
          const updatedAddresses = [...prevAddresses]
          updatedAddresses[existingIndex] = newAddress
          return updatedAddresses
        } else {
          // Add new address
          return [...prevAddresses, newAddress]
        }
      })
    } else if (message.type === 'initialIPAddressData') {
      // Handle initial data load
      const initialAddresses = message.addresses.map((address: any) => ({
        _id: address._id,
        companyId: address.company_id,
        address: address.address,
        description: address.description,
        isUsed: Boolean(address.is_used),
        networkInventoryId: address.network_inventory_id,
        poolId: address.pool_id,
        subnetId: address.subnet_id,
        supernetId: address.supernet_id,
        createdAt: address.created_at,
        updatedAt: address.updated_at,
      }))

      setIPAddresses(initialAddresses)
      setLoading(false)
    } else if (message.type === 'deleteIPAddress') {
      // Handle deletion message
      setIPAddresses(prevAddresses =>
        prevAddresses.filter(address => address._id !== message.id)
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
      sendMessage({ type: 'requestInitialIPAddressData' })
    },
  })

  // Fetch initial IP address data via REST API when WebSocket is not connected
  useEffect(() => {
    if (!companyId || isConnected) {
      return
    }

    const fetchInitialData = async () => {
      try {
        setLoading(true)

        const response = await fetch(
          `/api/network-administration/ipam/ipaddress?companyId=${companyId}`
        )

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()

        // Transform the data to the expected format
        const formattedData: ExtendedIPAddressFields[] = data.map(
          (item: any) => ({
            _id: item._id,
            companyId: item.company_id,
            address: item.address,
            description: item.description,
            isUsed: Boolean(item.is_used),
            networkInventoryId: item.network_inventory_id,
            poolId: item.pool_id,
            subnetId: item.subnet_id,
            supernetId: item.supernet_id,
            createdAt: item.created_at,
            updatedAt: item.updated_at,
          })
        )

        setIPAddresses(formattedData)
        setFetchError(null)
      } catch (error) {
        console.error('Error fetching IP address data:', error)
        setFetchError(
          `Failed to fetch data: ${error instanceof Error ? error.message : String(error)}`
        )
      } finally {
        setLoading(false)
      }
    }

    fetchInitialData()
  }, [companyId, isConnected])

  // Refresh IP address data
  const refreshIPAddresses = useCallback(() => {
    if (isConnected) {
      // If connected via WebSocket, request a refresh
      sendMessage({ type: 'requestIPAddressRefresh' })
    } else {
      // Otherwise, set loading to trigger the useEffect to refetch
      setLoading(true)
    }
  }, [isConnected, sendMessage])

  // Update IP address
  const updateIPAddress = useCallback(
    async (
      id: string,
      input: Partial<ExtendedIPAddressFields>
    ): Promise<ExtendedIPAddressFields | null> => {
      if (!companyId) {
        console.error('Company ID is null')
        return null
      }

      try {
        // Try to update via WebSocket if connected
        if (isConnected) {
          sendMessage({
            type: 'updateIPAddress',
            id,
            companyId,
            input,
          })

          // Return optimistic update in the local state
          const updatedAddress = {
            ...input,
            _id: id,
            companyId,
          } as ExtendedIPAddressFields

          setIPAddresses(prevAddresses => {
            const existingIndex = prevAddresses.findIndex(
              address => address._id === id
            )

            if (existingIndex >= 0) {
              // Update existing address
              const updatedAddresses = [...prevAddresses]
              updatedAddresses[existingIndex] = {
                ...updatedAddresses[existingIndex],
                ...updatedAddress,
              }
              return updatedAddresses
            }

            return prevAddresses
          })

          return updatedAddress
        }

        // Fallback to REST API if WebSocket is not connected
        const response = await fetch(
          `/api/network-administration/ipam/ipaddress/${id}`,
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
        const updatedAddress: ExtendedIPAddressFields = {
          _id: data._id,
          companyId: data.company_id,
          address: data.address,
          description: data.description,
          isUsed: Boolean(data.is_used),
          networkInventoryId: data.network_inventory_id,
          poolId: data.pool_id,
          subnetId: data.subnet_id,
          supernetId: data.supernet_id,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        }

        // Update state with the new data
        setIPAddresses(prevAddresses => {
          const existingIndex = prevAddresses.findIndex(
            address => address._id === updatedAddress._id
          )

          if (existingIndex >= 0) {
            // Update existing address
            const updatedAddresses = [...prevAddresses]
            updatedAddresses[existingIndex] = updatedAddress
            return updatedAddresses
          } else {
            // Add new address
            return [...prevAddresses, updatedAddress]
          }
        })

        return updatedAddress
      } catch (error) {
        console.error('Error updating IP address:', error)
        return null
      }
    },
    [companyId, isConnected, sendMessage]
  )

  // Delete IP address
  const deleteIPAddress = useCallback(
    async (id: string): Promise<boolean> => {
      if (!companyId) {
        console.error('Company ID is null')
        return false
      }

      try {
        // Try to delete via WebSocket if connected
        if (isConnected) {
          sendMessage({
            type: 'deleteIPAddress',
            id,
            companyId,
          })

          // Update local state optimistically
          setIPAddresses(prevAddresses =>
            prevAddresses.filter(address => address._id !== id)
          )

          return true
        }

        // Fallback to REST API if WebSocket is not connected
        const response = await fetch(
          `/api/network-administration/ipam/ipaddress/${id}`,
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
          setIPAddresses(prevAddresses =>
            prevAddresses.filter(address => address._id !== id)
          )
        }

        return success
      } catch (error) {
        console.error('Error deleting IP address:', error)
        return false
      }
    },
    [companyId, isConnected, sendMessage]
  )

  // Combine errors from WebSocket and fetch
  const error = wsError || fetchError

  return {
    ipAddresses,
    loading,
    error,
    refreshIPAddresses,
    updateIPAddress,
    deleteIPAddress,
    isConnected,
    reconnect,
  }
}
