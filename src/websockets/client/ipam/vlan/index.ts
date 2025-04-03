'use client'

/**
 * WebSocket-based VLAN hook
 * Provides real-time updates for VLAN data
 */

import { useState, useCallback, useEffect } from 'react'
import {
  useWebSocketConnection,
  WebSocketMessage,
} from '@/websockets/client/useWebSocketConnection'
import { ExtendedVLANFields } from '@/schema/network-administration/ipam/vlan/schema'

interface VLANHookResult {
  vlans: ExtendedVLANFields[]
  loading: boolean
  error: string | null
  refreshVLANs: () => void
  updateVLAN: (
    id: string,
    input: Partial<ExtendedVLANFields>
  ) => Promise<ExtendedVLANFields | null>
  deleteVLAN: (id: string) => Promise<boolean>
  isConnected: boolean
  reconnect: () => void
}

interface VLANMessage extends WebSocketMessage {
  type: 'vlan'
  _id: string
  company_id: string
  name: string
  tagged: number
  untagged: number
  vlan_number: number
  description: string
  subnet_id?: string
  supernet_id?: string
  created_at: number
  updated_at: number
}

export function useVLANs(
  companyId: string | null,
  wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001'
): VLANHookResult {
  const [vlans, setVLANs] = useState<ExtendedVLANFields[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Construct the WebSocket URL with companyId as a parameter
  const fullWsUrl = companyId ? `${wsUrl}?companyId=${companyId}` : wsUrl

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((message: WebSocketMessage) => {
    if (message.type === 'vlan') {
      const vlanMessage = message as VLANMessage

      setVLANs(prevVlans => {
        // Convert the incoming message to the expected format
        const newVlan: ExtendedVLANFields = {
          _id: vlanMessage._id,
          companyId: vlanMessage.company_id,
          name: vlanMessage.name,
          tagged: Boolean(vlanMessage.tagged),
          untagged: Boolean(vlanMessage.untagged),
          vlanNumber: vlanMessage.vlan_number,
          description: vlanMessage.description,
          subnetId: vlanMessage.subnet_id,
          supernetId: vlanMessage.supernet_id,
          createdAt: vlanMessage.created_at,
          updatedAt: vlanMessage.updated_at,
        }

        // Update or add the VLAN to the array
        const existingIndex = prevVlans.findIndex(
          vlan => vlan._id === newVlan._id
        )

        if (existingIndex >= 0) {
          // Update existing VLAN
          const updatedVlans = [...prevVlans]
          updatedVlans[existingIndex] = newVlan
          return updatedVlans
        } else {
          // Add new VLAN
          return [...prevVlans, newVlan]
        }
      })
    } else if (message.type === 'initialVLANData') {
      // Handle initial data load
      const initialVlans = message.vlans.map((vlan: any) => ({
        _id: vlan._id,
        companyId: vlan.company_id,
        name: vlan.name,
        tagged: Boolean(vlan.tagged),
        untagged: Boolean(vlan.untagged),
        vlanNumber: vlan.vlan_number,
        description: vlan.description,
        subnetId: vlan.subnet_id,
        supernetId: vlan.supernet_id,
        createdAt: vlan.created_at,
        updatedAt: vlan.updated_at,
      }))

      setVLANs(initialVlans)
      setLoading(false)
    } else if (message.type === 'deleteVLAN') {
      // Handle deletion message
      setVLANs(prevVlans => prevVlans.filter(vlan => vlan._id !== message.id))
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
      sendMessage({ type: 'requestInitialVLANData' })
    },
  })

  // Fetch initial VLAN data via REST API when WebSocket is not connected
  useEffect(() => {
    if (!companyId || isConnected) {
      return
    }

    const fetchInitialData = async () => {
      try {
        setLoading(true)

        const response = await fetch(
          `/api/network-administration/ipam/vlan?companyId=${companyId}`
        )

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()

        // Transform the data to the expected format
        const formattedData: ExtendedVLANFields[] = data.map((item: any) => ({
          _id: item._id,
          companyId: item.company_id,
          name: item.name,
          tagged: Boolean(item.tagged),
          untagged: Boolean(item.untagged),
          vlanNumber: item.vlan_number,
          description: item.description,
          subnetId: item.subnet_id,
          supernetId: item.supernet_id,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
        }))

        setVLANs(formattedData)
        setFetchError(null)
      } catch (error) {
        console.error('Error fetching VLAN data:', error)
        setFetchError(
          `Failed to fetch data: ${error instanceof Error ? error.message : String(error)}`
        )
      } finally {
        setLoading(false)
      }
    }

    fetchInitialData()
  }, [companyId, isConnected])

  // Refresh VLAN data
  const refreshVLANs = useCallback(() => {
    if (isConnected) {
      // If connected via WebSocket, request a refresh
      sendMessage({ type: 'requestVLANRefresh' })
    } else {
      // Otherwise, set loading to trigger the useEffect to refetch
      setLoading(true)
    }
  }, [isConnected, sendMessage])

  // Update VLAN
  const updateVLAN = useCallback(
    async (
      id: string,
      input: Partial<ExtendedVLANFields>
    ): Promise<ExtendedVLANFields | null> => {
      if (!companyId) {
        console.error('Company ID is null')
        return null
      }

      try {
        // Try to update via WebSocket if connected
        if (isConnected) {
          sendMessage({
            type: 'updateVLAN',
            id,
            companyId,
            input,
          })

          // Return optimistic update in the local state
          const updatedVLAN = {
            ...input,
            _id: id,
            companyId,
          } as ExtendedVLANFields

          setVLANs(prevVlans => {
            const existingIndex = prevVlans.findIndex(vlan => vlan._id === id)

            if (existingIndex >= 0) {
              // Update existing VLAN
              const updatedVlans = [...prevVlans]
              updatedVlans[existingIndex] = {
                ...updatedVlans[existingIndex],
                ...updatedVLAN,
              }
              return updatedVlans
            }

            return prevVlans
          })

          return updatedVLAN
        }

        // Fallback to REST API if WebSocket is not connected
        const response = await fetch(
          `/api/network-administration/ipam/vlan/${id}`,
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
        const updatedVLAN: ExtendedVLANFields = {
          _id: data._id,
          companyId: data.company_id,
          name: data.name,
          tagged: Boolean(data.tagged),
          untagged: Boolean(data.untagged),
          vlanNumber: data.vlan_number,
          description: data.description,
          subnetId: data.subnet_id,
          supernetId: data.supernet_id,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        }

        // Update state with the new data
        setVLANs(prevVlans => {
          const existingIndex = prevVlans.findIndex(
            vlan => vlan._id === updatedVLAN._id
          )

          if (existingIndex >= 0) {
            // Update existing VLAN
            const updatedVlans = [...prevVlans]
            updatedVlans[existingIndex] = updatedVLAN
            return updatedVlans
          } else {
            // Add new VLAN
            return [...prevVlans, updatedVLAN]
          }
        })

        return updatedVLAN
      } catch (error) {
        console.error('Error updating VLAN:', error)
        return null
      }
    },
    [companyId, isConnected, sendMessage]
  )

  // Delete VLAN
  const deleteVLAN = useCallback(
    async (id: string): Promise<boolean> => {
      if (!companyId) {
        console.error('Company ID is null')
        return false
      }

      try {
        // Try to delete via WebSocket if connected
        if (isConnected) {
          sendMessage({
            type: 'deleteVLAN',
            id,
            companyId,
          })

          // Update local state optimistically
          setVLANs(prevVlans => prevVlans.filter(vlan => vlan._id !== id))

          return true
        }

        // Fallback to REST API if WebSocket is not connected
        const response = await fetch(
          `/api/network-administration/ipam/vlan/${id}`,
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
          setVLANs(prevVlans => prevVlans.filter(vlan => vlan._id !== id))
        }

        return success
      } catch (error) {
        console.error('Error deleting VLAN:', error)
        return false
      }
    },
    [companyId, isConnected, sendMessage]
  )

  // Combine errors from WebSocket and fetch
  const error = wsError || fetchError

  return {
    vlans,
    loading,
    error,
    refreshVLANs,
    updateVLAN,
    deleteVLAN,
    isConnected,
    reconnect,
  }
}
