'use client'

/**
 * WebSocket-based SNMP OID hook
 * Provides real-time updates for SNMP OID data
 */

import { useState, useCallback, useEffect } from 'react'
import {
  useWebSocketConnection,
  WebSocketMessage,
} from '@/websockets/client/useWebSocketConnection'
import { ExtendedOIDFields } from '@/schema/network-administration/snmp/oid/schema'
import { OIDFields } from '@/types/network-administration/snmp/oid/types'

interface SNMPOIDHookResult {
  snmpOIDs: ExtendedOIDFields[]
  loading: boolean
  error: string | null
  refreshSNMPOIDs: () => void
  updateSNMPOID: (
    id: string,
    input: Partial<ExtendedOIDFields>
  ) => Promise<ExtendedOIDFields | null>
  deleteSNMPOID: (id: string) => Promise<boolean>
  isConnected: boolean
  reconnect: () => void
}

interface SNMPOIDMessage extends WebSocketMessage {
  type: 'snmpOID'
  _id: string
  companyId: string
  manufacturerId?: string
  modelId?: string
  productId?: string
  oidName: string
  oid: string
  description: string
  createdAt: number
  updatedAt: number
}

/**
 * Hook for managing SNMP OID data via WebSockets with REST API fallback
 */
export function useSNMPOID(
  companyId: string | null,
  wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001'
): SNMPOIDHookResult {
  const [snmpOIDs, setSNMPOIDs] = useState<ExtendedOIDFields[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Construct the WebSocket URL with companyId as a parameter
  const fullWsUrl = companyId ? `${wsUrl}?companyId=${companyId}` : wsUrl

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((message: WebSocketMessage) => {
    if (message.type === 'snmpOID') {
      const oidMessage = message as SNMPOIDMessage

      setSNMPOIDs(prevOIDs => {
        // Convert the incoming message to the expected format
        const newOID: ExtendedOIDFields = {
          _id: oidMessage._id,
          companyId: oidMessage.companyId,
          manufacturerId: oidMessage.manufacturerId,
          modelId: oidMessage.modelId,
          productId: oidMessage.productId,
          oidName: oidMessage.oidName,
          oid: oidMessage.oid,
          description: oidMessage.description,
          createdAt: oidMessage.createdAt,
          updatedAt: oidMessage.updatedAt,
        }

        // Update or add the OID to the array
        const existingIndex = prevOIDs.findIndex(
          oid => oid._id === newOID._id
        )

        if (existingIndex >= 0) {
          // Update existing OID
          const updatedOIDs = [...prevOIDs]
          updatedOIDs[existingIndex] = newOID
          return updatedOIDs
        } else {
          // Add new OID
          return [...prevOIDs, newOID]
        }
      })
    } else if (message.type === 'initialSNMPOIDData') {
      // Handle initial data load
      const initialOIDs = message.oids.map((oid: Record<string, any>) => ({
        _id: oid._id,
        companyId: oid.companyId,
        manufacturerId: oid.manufacturerId,
        modelId: oid.modelId,
        productId: oid.productId,
        oidName: oid.oidName,
        oid: oid.oid,
        description: oid.description,
        createdAt: oid.createdAt,
        updatedAt: oid.updatedAt,
      }))

      setSNMPOIDs(initialOIDs)
      setLoading(false)
    } else if (message.type === 'deleteSNMPOID') {
      // Handle deletion message
      setSNMPOIDs(prevOIDs =>
        prevOIDs.filter(oid => oid._id !== message.id)
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
      sendMessage({ type: 'requestInitialSNMPOIDData' })
    },
  })

  // Fetch initial SNMP OID data via REST API when WebSocket is not connected
  useEffect(() => {
    if (!companyId || isConnected) {
      return
    }

    const fetchInitialData = async () => {
      try {
        setLoading(true)

        const response = await fetch(
          `/api/network-administration/snmp/oid?companyId=${companyId}`
        )

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()

        // Transform the data to the expected format
        const formattedData: ExtendedOIDFields[] = data.map(
          (item: Record<string, any>) => ({
            _id: item._id,
            companyId: item.companyId,
            manufacturerId: item.manufacturerId,
            modelId: item.modelId,
            productId: item.productId,
            oidName: item.oidName,
            oid: item.oid,
            description: item.description,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          })
        )

        setSNMPOIDs(formattedData)
        setFetchError(null)
      } catch (error) {
        console.error('Error fetching SNMP OID data:', error)
        setFetchError(
          `Failed to fetch data: ${error instanceof Error ? error.message : String(error)}`
        )
      } finally {
        setLoading(false)
      }
    }

    fetchInitialData()
  }, [companyId, isConnected])

  // Refresh SNMP OID data
  const refreshSNMPOIDs = useCallback(() => {
    if (isConnected) {
      // If connected via WebSocket, request a refresh
      sendMessage({ type: 'requestSNMPOIDRefresh' })
    } else {
      // Otherwise, set loading to trigger the useEffect to refetch
      setLoading(true)
    }
  }, [isConnected, sendMessage])

  // Update SNMP OID
  const updateSNMPOID = useCallback(
    async (
      id: string,
      input: Partial<ExtendedOIDFields>
    ): Promise<ExtendedOIDFields | null> => {
      if (!companyId) {
        console.error('Company ID is null')
        return null
      }

      try {
        // Try to update via WebSocket if connected
        if (isConnected) {
          sendMessage({
            type: 'updateSNMPOID',
            id,
            companyId,
            input,
          })

          // Return optimistic update in the local state
          const updatedOID = {
            ...input,
            _id: id,
            companyId,
          } as ExtendedOIDFields

          setSNMPOIDs(prevOIDs => {
            const existingIndex = prevOIDs.findIndex(
              oid => oid._id === id
            )

            if (existingIndex >= 0) {
              // Update existing OID
              const updatedOIDs = [...prevOIDs]
              updatedOIDs[existingIndex] = {
                ...updatedOIDs[existingIndex],
                ...updatedOID,
              }
              return updatedOIDs
            }

            return prevOIDs
          })

          return updatedOID
        }

        // Fallback to REST API if WebSocket is not connected
        const response = await fetch(
          `/api/network-administration/snmp/oid/${id}`,
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
        const updatedOID: ExtendedOIDFields = {
          _id: data._id,
          companyId: data.companyId,
          manufacturerId: data.manufacturerId,
          modelId: data.modelId,
          productId: data.productId,
          oidName: data.oidName,
          oid: data.oid,
          description: data.description,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        }

        // Update state with the new data
        setSNMPOIDs(prevOIDs => {
          const existingIndex = prevOIDs.findIndex(
            oid => oid._id === updatedOID._id
          )

          if (existingIndex >= 0) {
            // Update existing OID
            const updatedOIDs = [...prevOIDs]
            updatedOIDs[existingIndex] = updatedOID
            return updatedOIDs
          } else {
            // Add new OID
            return [...prevOIDs, updatedOID]
          }
        })

        return updatedOID
      } catch (error) {
        console.error('Error updating SNMP OID:', error)
        return null
      }
    },
    [companyId, isConnected, sendMessage]
  )

  // Delete SNMP OID
  const deleteSNMPOID = useCallback(
    async (id: string): Promise<boolean> => {
      if (!companyId) {
        console.error('Company ID is null')
        return false
      }

      try {
        // Try to delete via WebSocket if connected
        if (isConnected) {
          sendMessage({
            type: 'deleteSNMPOID',
            id,
            companyId,
          })

          // Update local state optimistically
          setSNMPOIDs(prevOIDs =>
            prevOIDs.filter(oid => oid._id !== id)
          )

          return true
        }

        // Fallback to REST API if WebSocket is not connected
        const response = await fetch(
          `/api/network-administration/snmp/oid/${id}`,
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
          setSNMPOIDs(prevOIDs =>
            prevOIDs.filter(oid => oid._id !== id)
          )
        }

        return success
      } catch (error) {
        console.error('Error deleting SNMP OID:', error)
        return false
      }
    },
    [companyId, isConnected, sendMessage]
  )

  // Combine errors from WebSocket and fetch
  const error = wsError || fetchError

  return {
    snmpOIDs,
    loading,
    error,
    refreshSNMPOIDs,
    updateSNMPOID,
    deleteSNMPOID,
    isConnected,
    reconnect,
  }
}
