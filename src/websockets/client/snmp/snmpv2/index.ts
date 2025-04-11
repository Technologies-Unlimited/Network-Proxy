'use client'

/**
 * WebSocket-based SNMPv2 settings hook
 * Provides real-time updates for SNMPv2 settings data
 */

import { useState, useCallback, useEffect } from 'react'
import {
  useWebSocketConnection,
  WebSocketMessage,
} from '@/websockets/client/useWebSocketConnection'
import { ExtendedSNMPv2Fields } from '@/schema/network-administration/snmp/snmpv2/schema'
import { SNMPv2Fields } from '@/types/network-administration/snmp/snmpv2/types'

interface SNMPv2HookResult {
  snmpv2Settings: ExtendedSNMPv2Fields[]
  loading: boolean
  error: string | null
  refreshSNMPv2Settings: () => void
  updateSNMPv2Setting: (
    id: string,
    input: Partial<ExtendedSNMPv2Fields>
  ) => Promise<ExtendedSNMPv2Fields | null>
  deleteSNMPv2Setting: (id: string) => Promise<boolean>
  isConnected: boolean
  reconnect: () => void
}

interface SNMPv2Message extends WebSocketMessage {
  type: 'snmpv2Setting'
  _id: string
  companyId: string
  manufacturerId?: string
  modelId?: string
  productId?: string
  communityName: string
  readCommunity: string
  writeCommunity: string
  description: string
  createdAt: number
  updatedAt: number
}

/**
 * Hook for managing SNMPv2 settings data via WebSockets with REST API fallback
 */
export function useSNMPv2Settings(
  companyId: string | null,
  wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001'
): SNMPv2HookResult {
  const [snmpv2Settings, setSNMPv2Settings] = useState<ExtendedSNMPv2Fields[]>(
    []
  )
  const [loading, setLoading] = useState<boolean>(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Construct the WebSocket URL with companyId as a parameter
  const fullWsUrl = companyId ? `${wsUrl}?companyId=${companyId}` : wsUrl

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((message: WebSocketMessage) => {
    if (message.type === 'snmpv2Setting') {
      const settingMessage = message as SNMPv2Message

      setSNMPv2Settings(prevSettings => {
        // Convert the incoming message to the expected format
        const newSetting: ExtendedSNMPv2Fields = {
          _id: settingMessage._id,
          companyId: settingMessage.companyId,
          manufacturerId: settingMessage.manufacturerId,
          modelId: settingMessage.modelId,
          productId: settingMessage.productId,
          communityName: settingMessage.communityName,
          readCommunity: settingMessage.readCommunity,
          writeCommunity: settingMessage.writeCommunity,
          description: settingMessage.description,
          createdAt: settingMessage.createdAt,
          updatedAt: settingMessage.updatedAt,
        }

        // Update or add the setting to the array
        const existingIndex = prevSettings.findIndex(
          setting => setting._id === newSetting._id
        )

        if (existingIndex >= 0) {
          // Update existing setting
          const updatedSettings = [...prevSettings]
          updatedSettings[existingIndex] = newSetting
          return updatedSettings
        } else {
          // Add new setting
          return [...prevSettings, newSetting]
        }
      })
    } else if (message.type === 'initialSNMPv2Data') {
      // Handle initial data load
      const initialSettings = message.settings.map(
        (setting: Record<string, any>) => ({
          _id: setting._id,
          companyId: setting.companyId,
          manufacturerId: setting.manufacturerId,
          modelId: setting.modelId,
          productId: setting.productId,
          communityName: setting.communityName,
          readCommunity: setting.readCommunity,
          writeCommunity: setting.writeCommunity,
          description: setting.description,
          createdAt: setting.createdAt,
          updatedAt: setting.updatedAt,
        })
      )

      setSNMPv2Settings(initialSettings)
      setLoading(false)
    } else if (message.type === 'deleteSNMPv2Setting') {
      // Handle deletion message
      setSNMPv2Settings(prevSettings =>
        prevSettings.filter(setting => setting._id !== message.id)
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
      sendMessage({ type: 'requestInitialSNMPv2Data' })
    },
  })

  // Fetch initial SNMPv2 settings data via REST API when WebSocket is not connected
  useEffect(() => {
    if (!companyId || isConnected) {
      return
    }

    const fetchInitialData = async () => {
      try {
        setLoading(true)

        const response = await fetch(
          `/api/network-administration/snmp/snmpv2?companyId=${companyId}`
        )

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()

        // Transform the data to the expected format
        const formattedData: ExtendedSNMPv2Fields[] = data.map(
          (item: Record<string, any>) => ({
            _id: item._id,
            companyId: item.companyId,
            manufacturerId: item.manufacturerId,
            modelId: item.modelId,
            productId: item.productId,
            communityName: item.communityName,
            readCommunity: item.readCommunity,
            writeCommunity: item.writeCommunity,
            description: item.description,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          })
        )

        setSNMPv2Settings(formattedData)
        setFetchError(null)
      } catch (error) {
        console.error('Error fetching SNMPv2 settings data:', error)
        setFetchError(
          `Failed to fetch data: ${error instanceof Error ? error.message : String(error)}`
        )
      } finally {
        setLoading(false)
      }
    }

    fetchInitialData()
  }, [companyId, isConnected])

  // Refresh SNMPv2 settings data
  const refreshSNMPv2Settings = useCallback(() => {
    if (isConnected) {
      // If connected via WebSocket, request a refresh
      sendMessage({ type: 'requestSNMPv2Refresh' })
    } else {
      // Otherwise, set loading to trigger the useEffect to refetch
      setLoading(true)
    }
  }, [isConnected, sendMessage])

  // Update SNMPv2 setting
  const updateSNMPv2Setting = useCallback(
    async (
      id: string,
      input: Partial<ExtendedSNMPv2Fields>
    ): Promise<ExtendedSNMPv2Fields | null> => {
      if (!companyId) {
        console.error('Company ID is null')
        return null
      }

      try {
        // Try to update via WebSocket if connected
        if (isConnected) {
          sendMessage({
            type: 'updateSNMPv2Setting',
            id,
            companyId,
            input,
          })

          // Return optimistic update in the local state
          const updatedSetting = {
            ...input,
            _id: id,
            companyId,
          } as ExtendedSNMPv2Fields

          setSNMPv2Settings(prevSettings => {
            const existingIndex = prevSettings.findIndex(
              setting => setting._id === id
            )

            if (existingIndex >= 0) {
              // Update existing setting
              const updatedSettings = [...prevSettings]
              updatedSettings[existingIndex] = {
                ...updatedSettings[existingIndex],
                ...updatedSetting,
              }
              return updatedSettings
            }

            return prevSettings
          })

          return updatedSetting
        }

        // Fallback to REST API if WebSocket is not connected
        const response = await fetch(
          `/api/network-administration/snmp/snmpv2/${id}`,
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
        const updatedSetting: ExtendedSNMPv2Fields = {
          _id: data._id,
          companyId: data.companyId,
          manufacturerId: data.manufacturerId,
          modelId: data.modelId,
          productId: data.productId,
          communityName: data.communityName,
          readCommunity: data.readCommunity,
          writeCommunity: data.writeCommunity,
          description: data.description,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        }

        // Update state with the new data
        setSNMPv2Settings(prevSettings => {
          const existingIndex = prevSettings.findIndex(
            setting => setting._id === updatedSetting._id
          )

          if (existingIndex >= 0) {
            // Update existing setting
            const updatedSettings = [...prevSettings]
            updatedSettings[existingIndex] = updatedSetting
            return updatedSettings
          } else {
            // Add new setting
            return [...prevSettings, updatedSetting]
          }
        })

        return updatedSetting
      } catch (error) {
        console.error('Error updating SNMPv2 setting:', error)
        return null
      }
    },
    [companyId, isConnected, sendMessage]
  )

  // Delete SNMPv2 setting
  const deleteSNMPv2Setting = useCallback(
    async (id: string): Promise<boolean> => {
      if (!companyId) {
        console.error('Company ID is null')
        return false
      }

      try {
        // Try to delete via WebSocket if connected
        if (isConnected) {
          sendMessage({
            type: 'deleteSNMPv2Setting',
            id,
            companyId,
          })

          // Update local state optimistically
          setSNMPv2Settings(prevSettings =>
            prevSettings.filter(setting => setting._id !== id)
          )

          return true
        }

        // Fallback to REST API if WebSocket is not connected
        const response = await fetch(
          `/api/network-administration/snmp/snmpv2/${id}`,
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
          setSNMPv2Settings(prevSettings =>
            prevSettings.filter(setting => setting._id !== id)
          )
        }

        return success
      } catch (error) {
        console.error('Error deleting SNMPv2 setting:', error)
        return false
      }
    },
    [companyId, isConnected, sendMessage]
  )

  // Combine errors from WebSocket and fetch
  const error = wsError || fetchError

  return {
    snmpv2Settings,
    loading,
    error,
    refreshSNMPv2Settings,
    updateSNMPv2Setting,
    deleteSNMPv2Setting,
    isConnected,
    reconnect,
  }
}
