'use client'

/**
 * WebSocket-based SNMP polling status hook
 * Provides real-time updates for SNMP monitoring data
 */

import { useState, useCallback, useEffect } from 'react'
import {
  useWebSocketConnection,
  WebSocketMessage,
} from '@/websockets/client/useWebSocketConnection'
import { ExtendedSNMPPollingStatusFields } from '@/schema/network-administration/snmp/polling/status/schema'
import { DeviceStatus } from '@/types/network-administration/snmp/polling/status/types'

interface SNMPPollingStatusHookResult {
  snmpPollingStatuses: ExtendedSNMPPollingStatusFields[]
  loading: boolean
  error: string | null
  refreshSNMPPollingStatus: () => void
  updateSNMPPollingStatus: (
    id: string,
    input: Partial<ExtendedSNMPPollingStatusFields>
  ) => Promise<ExtendedSNMPPollingStatusFields | null>
  deleteSNMPPollingStatus: (id: string) => Promise<boolean>
  isConnected: boolean
  reconnect: () => void
}

interface SNMPStatusMessage extends WebSocketMessage {
  type: 'snmp'
  _id: string
  companyId: string
  snmpPollingTemplateId: string
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

export function useSNMPPollingStatus(
  companyId: string | null,
  wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001'
): SNMPPollingStatusHookResult {
  const [snmpPollingStatuses, setSNMPPollingStatuses] = useState<
    ExtendedSNMPPollingStatusFields[]
  >([])
  const [loading, setLoading] = useState<boolean>(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Construct the WebSocket URL with companyId as a parameter
  const fullWsUrl = companyId ? `${wsUrl}?companyId=${companyId}` : wsUrl

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((message: WebSocketMessage) => {
    if (message.type === 'snmp') {
      const snmpMessage = message as SNMPStatusMessage

      setSNMPPollingStatuses(prevStatuses => {
        // Convert the incoming message to the expected format
        const newStatus: ExtendedSNMPPollingStatusFields = {
          _id: snmpMessage._id,
          companyId: snmpMessage.companyId,
          snmpPollingTemplateId: snmpMessage.snmpPollingTemplateId,
          manufacturerId: snmpMessage.manufacturerId,
          modelNameId: snmpMessage.modelNameId,
          productId: snmpMessage.productId,
          stockIds: snmpMessage.stockIds,
          networkInventoryIds: snmpMessage.networkInventoryIds,
          uptime: snmpMessage.uptime,
          downtime: snmpMessage.downtime,
          deviceStatus: snmpMessage.deviceStatus,
          createdAt: snmpMessage.createdAt,
          updatedAt: snmpMessage.updatedAt,
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
    } else if (message.type === 'initialSNMPData') {
      // Handle initial data load
      const initialStatuses = message.statuses.map(
        (status: Record<string, any>) => ({
          _id: status._id,
          companyId: status.companyId,
          snmpPollingTemplateId: status.snmpPollingTemplateId,
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
        })
      )

      setSNMPPollingStatuses(initialStatuses)
      setLoading(false)
    } else if (message.type === 'deleteSNMP') {
      // Handle deletion message
      setSNMPPollingStatuses(prevStatuses =>
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
      sendMessage({ type: 'requestInitialSNMPData' })
    },
  })

  // Fetch initial SNMP polling status data via REST API when WebSocket is not connected
  useEffect(() => {
    if (!companyId || isConnected) {
      return
    }

    const fetchInitialData = async () => {
      try {
        setLoading(true)

        const response = await fetch(
          `/api/network-administration/snmp/polling/status?companyId=${companyId}`
        )

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()

        // Transform the data to the expected format
        const formattedData: ExtendedSNMPPollingStatusFields[] = data.map(
          (item: Record<string, any>) => ({
            _id: item._id,
            companyId: item.companyId,
            snmpPollingTemplateId: item.snmpPollingTemplateId,
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

        setSNMPPollingStatuses(formattedData)
        setFetchError(null)
      } catch (error) {
        console.error('Error fetching SNMP polling status data:', error)
        setFetchError(
          `Failed to fetch data: ${error instanceof Error ? error.message : String(error)}`
        )
      } finally {
        setLoading(false)
      }
    }

    fetchInitialData()
  }, [companyId, isConnected])

  // Refresh SNMP polling status data
  const refreshSNMPPollingStatus = useCallback(() => {
    if (isConnected) {
      // If connected via WebSocket, request a refresh
      sendMessage({ type: 'requestSNMPRefresh' })
    } else {
      // Otherwise, set loading to trigger the useEffect to refetch
      setLoading(true)
    }
  }, [isConnected, sendMessage])

  // Update SNMP polling status
  const updateSNMPPollingStatus = useCallback(
    async (
      id: string,
      input: Partial<ExtendedSNMPPollingStatusFields>
    ): Promise<ExtendedSNMPPollingStatusFields | null> => {
      if (!companyId) {
        console.error('Company ID is null')
        return null
      }

      try {
        // Try to update via WebSocket if connected
        if (isConnected) {
          sendMessage({
            type: 'updateSNMP',
            id,
            companyId,
            input,
          })

          // Return optimistic update in the local state
          const updatedStatus = {
            ...input,
            _id: id,
            companyId,
          } as ExtendedSNMPPollingStatusFields

          setSNMPPollingStatuses(prevStatuses => {
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
          `/api/network-administration/snmp/polling/status/${id}`,
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
        const updatedStatus: ExtendedSNMPPollingStatusFields = {
          _id: data._id,
          companyId: data.companyId,
          snmpPollingTemplateId: data.snmpPollingTemplateId,
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
        setSNMPPollingStatuses(prevStatuses => {
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
        console.error('Error updating SNMP polling status:', error)
        return null
      }
    },
    [companyId, isConnected, sendMessage]
  )

  // Delete SNMP polling status
  const deleteSNMPPollingStatus = useCallback(
    async (id: string): Promise<boolean> => {
      if (!companyId) {
        console.error('Company ID is null')
        return false
      }

      try {
        // Try to delete via WebSocket if connected
        if (isConnected) {
          sendMessage({
            type: 'deleteSNMP',
            id,
            companyId,
          })

          // Update local state optimistically
          setSNMPPollingStatuses(prevStatuses =>
            prevStatuses.filter(status => status._id !== id)
          )

          return true
        }

        // Fallback to REST API if WebSocket is not connected
        const response = await fetch(
          `/api/network-administration/snmp/polling/status/${id}`,
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
          setSNMPPollingStatuses(prevStatuses =>
            prevStatuses.filter(status => status._id !== id)
          )
        }

        return success
      } catch (error) {
        console.error('Error deleting SNMP polling status:', error)
        return false
      }
    },
    [companyId, isConnected, sendMessage]
  )

  // Combine errors from WebSocket and fetch
  const error = wsError || fetchError

  return {
    snmpPollingStatuses,
    loading,
    error,
    refreshSNMPPollingStatus,
    updateSNMPPollingStatus,
    deleteSNMPPollingStatus,
    isConnected,
    reconnect,
  }
}
