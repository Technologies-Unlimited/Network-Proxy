'use client'

/**
 * WebSocket-based ICMP polling status hook
 * Provides real-time updates for ICMP monitoring data
 */

import { useState, useCallback, useEffect } from 'react'
import {
  useWebSocketConnection,
  WebSocketMessage,
} from '@/websockets/client/useWebSocketConnection'
import { ExtendedICMPPollingStatusFields } from '@/schema/network-administration/icmp/polling/status/schema'
import { DeviceStatus } from '@/types/network-administration/icmp/polling/status/types'

interface ICMPPollingStatusHookResult {
  icmpPollingStatuses: ExtendedICMPPollingStatusFields[]
  loading: boolean
  error: string | null
  refreshICMPPollingStatus: () => void
  updateICMPPollingStatus: (
    id: string,
    input: Partial<ExtendedICMPPollingStatusFields>
  ) => Promise<ExtendedICMPPollingStatusFields | null>
  deleteICMPPollingStatus: (id: string) => Promise<boolean>
  isConnected: boolean
  reconnect: () => void
}

interface ICMPStatusMessage extends WebSocketMessage {
  type: 'icmp'
  _id: string
  companyId: string
  icmpPollingTemplateId: string
  manufacturerId?: string
  modelNameId?: string
  productId?: string
  stockIds?: string[]
  networkInventoryIds?: string[]
  uptime: number
  downtime: number
  deviceStatus: DeviceStatus
  createdAt: number
  updatedAt: number
}

export function useICMPPollingStatus(
  companyId: string | null,
  wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001'
): ICMPPollingStatusHookResult {
  const [icmpPollingStatuses, setICMPPollingStatuses] = useState<
    ExtendedICMPPollingStatusFields[]
  >([])
  const [loading, setLoading] = useState<boolean>(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Construct the WebSocket URL with companyId as a parameter
  const fullWsUrl = companyId ? `${wsUrl}?companyId=${companyId}` : wsUrl

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((message: WebSocketMessage) => {
    if (message.type === 'icmp') {
      const icmpMessage = message as ICMPStatusMessage

      setICMPPollingStatuses(prevStatuses => {
        // Convert the incoming message to the expected format
        const newStatus: ExtendedICMPPollingStatusFields = {
          _id: icmpMessage._id,
          companyId: icmpMessage.companyId,
          icmpPollingTemplateId: icmpMessage.icmpPollingTemplateId,
          manufacturerId: icmpMessage.manufacturerId,
          modelNameId: icmpMessage.modelNameId,
          productId: icmpMessage.productId,
          stockIds: icmpMessage.stockIds,
          networkInventoryIds: icmpMessage.networkInventoryIds,
          uptime: icmpMessage.uptime,
          downtime: icmpMessage.downtime,
          deviceStatus: icmpMessage.deviceStatus,
          createdAt: icmpMessage.createdAt,
          updatedAt: icmpMessage.updatedAt,
        }

        // Update or add the status to the array
        const existingIndex = prevStatuses.findIndex(
          status => status._id === newStatus._id
        )

        if (existingIndex >= 0) {
          // Update existing status
          const updatedStatuses = [...prevStatuses]
          updatedStatuses[existingIndex] = newStatus
          return updatedStatuses
        } else {
          // Add new status
          return [...prevStatuses, newStatus]
        }
      })
    } else if (message.type === 'initialICMPData') {
      // Handle initial data load
      const initialStatuses = message.statuses.map((status: any) => ({
        _id: status._id,
        companyId: status.companyId,
        icmpPollingTemplateId: status.icmpPollingTemplateId,
        manufacturerId: status.manufacturerId,
        modelNameId: status.modelNameId,
        productId: status.productId,
        stockIds: status.stockIds,
        networkInventoryIds: status.networkInventoryIds,
        uptime: status.uptime || 0,
        downtime: status.downtime || 0,
        deviceStatus: status.deviceStatus as DeviceStatus,
        createdAt: status.createdAt,
        updatedAt: status.updatedAt,
      }))

      setICMPPollingStatuses(initialStatuses)
      setLoading(false)
    } else if (message.type === 'deleteICMP') {
      // Handle deletion message
      setICMPPollingStatuses(prevStatuses =>
        prevStatuses.filter(status => status._id !== message.id)
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
      sendMessage({ type: 'requestInitialICMPData' })
    },
  })

  // Fetch initial ICMP polling status data via REST API when WebSocket is not connected
  useEffect(() => {
    if (!companyId || isConnected) {
      return
    }

    const fetchInitialData = async () => {
      try {
        setLoading(true)

        const response = await fetch(
          `/api/network-administration/icmp/polling/status?companyId=${companyId}`
        )

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()

        // Transform the data to the expected format
        const formattedData: ExtendedICMPPollingStatusFields[] = data.map(
          (item: any) => ({
            _id: item._id,
            companyId: item.companyId,
            icmpPollingTemplateId: item.icmpPollingTemplateId,
            manufacturerId: item.manufacturerId,
            modelNameId: item.modelNameId,
            productId: item.productId,
            stockIds: item.stockIds,
            networkInventoryIds: item.networkInventoryIds,
            uptime: item.uptime || 0,
            downtime: item.downtime || 0,
            deviceStatus: item.deviceStatus as DeviceStatus,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          })
        )

        setICMPPollingStatuses(formattedData)
        setFetchError(null)
      } catch (error) {
        console.error('Error fetching ICMP polling status data:', error)
        setFetchError(
          `Failed to fetch data: ${error instanceof Error ? error.message : String(error)}`
        )
      } finally {
        setLoading(false)
      }
    }

    fetchInitialData()
  }, [companyId, isConnected])

  // Refresh ICMP polling status data
  const refreshICMPPollingStatus = useCallback(() => {
    if (isConnected) {
      // If connected via WebSocket, request a refresh
      sendMessage({ type: 'requestICMPRefresh' })
    } else {
      // Otherwise, set loading to trigger the useEffect to refetch
      setLoading(true)
    }
  }, [isConnected, sendMessage])

  // Update ICMP polling status
  const updateICMPPollingStatus = useCallback(
    async (
      id: string,
      input: Partial<ExtendedICMPPollingStatusFields>
    ): Promise<ExtendedICMPPollingStatusFields | null> => {
      if (!companyId) {
        console.error('Company ID is null')
        return null
      }

      try {
        // Try to update via WebSocket if connected
        if (isConnected) {
          sendMessage({
            type: 'updateICMP',
            id,
            companyId,
            input,
          })

          // Return optimistic update in the local state
          const updatedStatus = {
            ...input,
            _id: id,
            companyId,
          } as ExtendedICMPPollingStatusFields

          setICMPPollingStatuses(prevStatuses => {
            const existingIndex = prevStatuses.findIndex(
              status => status._id === id
            )

            if (existingIndex >= 0) {
              // Update existing status
              const updatedStatuses = [...prevStatuses]
              updatedStatuses[existingIndex] = {
                ...updatedStatuses[existingIndex],
                ...updatedStatus,
              }
              return updatedStatuses
            }

            return prevStatuses
          })

          return updatedStatus
        }

        // Fallback to REST API if WebSocket is not connected
        const response = await fetch(
          `/api/network-administration/icmp/polling/status/${id}`,
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
        const updatedStatus: ExtendedICMPPollingStatusFields = {
          _id: data._id,
          companyId: data.companyId,
          icmpPollingTemplateId: data.icmpPollingTemplateId,
          manufacturerId: data.manufacturerId,
          modelNameId: data.modelNameId,
          productId: data.productId,
          stockIds: data.stockIds,
          networkInventoryIds: data.networkInventoryIds,
          uptime: data.uptime || 0,
          downtime: data.downtime || 0,
          deviceStatus: data.deviceStatus as DeviceStatus,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        }

        // Update state with the new data
        setICMPPollingStatuses(prevStatuses => {
          const existingIndex = prevStatuses.findIndex(
            status => status._id === updatedStatus._id
          )

          if (existingIndex >= 0) {
            // Update existing status
            const updatedStatuses = [...prevStatuses]
            updatedStatuses[existingIndex] = updatedStatus
            return updatedStatuses
          } else {
            // Add new status
            return [...prevStatuses, updatedStatus]
          }
        })

        return updatedStatus
      } catch (error) {
        console.error('Error updating ICMP polling status:', error)
        return null
      }
    },
    [companyId, isConnected, sendMessage]
  )

  // Delete ICMP polling status
  const deleteICMPPollingStatus = useCallback(
    async (id: string): Promise<boolean> => {
      if (!companyId) {
        console.error('Company ID is null')
        return false
      }

      try {
        // Try to delete via WebSocket if connected
        if (isConnected) {
          sendMessage({
            type: 'deleteICMP',
            id,
            companyId,
          })

          // Update local state optimistically
          setICMPPollingStatuses(prevStatuses =>
            prevStatuses.filter(status => status._id !== id)
          )

          return true
        }

        // Fallback to REST API if WebSocket is not connected
        const response = await fetch(
          `/api/network-administration/icmp/polling/status/${id}`,
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
          setICMPPollingStatuses(prevStatuses =>
            prevStatuses.filter(status => status._id !== id)
          )
        }

        return success
      } catch (error) {
        console.error('Error deleting ICMP polling status:', error)
        return false
      }
    },
    [companyId, isConnected, sendMessage]
  )

  // Combine errors from WebSocket and fetch
  const error = wsError || fetchError

  return {
    icmpPollingStatuses,
    loading,
    error,
    refreshICMPPollingStatus,
    updateICMPPollingStatus,
    deleteICMPPollingStatus,
    isConnected,
    reconnect,
  }
}
