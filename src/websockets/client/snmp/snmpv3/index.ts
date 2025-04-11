'use client'

/**
 * WebSocket-based SNMPv3 settings hook
 * Provides real-time updates for SNMPv3 settings data
 */

import { useState, useCallback, useEffect } from 'react'
import {
  useWebSocketConnection,
  WebSocketMessage,
} from '@/websockets/client/useWebSocketConnection'
import { ExtendedSNMPv3Fields } from '@/schema/network-administration/snmp/snmpv3/schema'
import { SNMPv3Fields } from '@/types/network-administration/snmp/snmpv3/types'

interface SNMPv3HookResult {
  snmpv3Settings: ExtendedSNMPv3Fields[]
  loading: boolean
  error: string | null
  refreshSNMPv3Settings: () => void
  updateSNMPv3Setting: (
    id: string,
    input: Partial<ExtendedSNMPv3Fields>
  ) => Promise<ExtendedSNMPv3Fields | null>
  deleteSNMPv3Setting: (id: string) => Promise<boolean>
  isConnected: boolean
  reconnect: () => void
}

interface SNMPv3Message extends WebSocketMessage {
  type: 'snmpv3Setting'
  _id: string
  companyId: string
  manufacturerId?: string
  modelId?: string
  productId?: string
  communityName: string
  userName: string
  authMethod: string
  authPassword: string
  encryptionMethod: string
  encryptionPassword: string
  description: string
  createdAt: number
  updatedAt: number
}

/**
 * Hook for managing SNMPv3 settings data via WebSockets with REST API fallback
 */
export function useSNMPv3Settings(
  companyId: string | null,
  wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001'
): SNMPv3HookResult {
  const [snmpv3Settings, setSNMPv3Settings] = useState<ExtendedSNMPv3Fields[]>(
    []
  )
  const [loading, setLoading] = useState<boolean>(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Construct the WebSocket URL with companyId as a parameter
  const fullWsUrl = companyId ? `${wsUrl}?companyId=${companyId}` : wsUrl

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((message: WebSocketMessage) => {
    if (message.type === 'snmpv3Setting') {
      const settingMessage = message as SNMPv3Message

      setSNMPv3Settings(prevSettings => {
        // Convert the incoming message to the expected format
        const newSetting: ExtendedSNMPv3Fields = {
          _id: settingMessage._id,
          companyId: settingMessage.companyId,
          manufacturerId: settingMessage.manufacturerId,
          modelId: settingMessage.modelId,
          productId: settingMessage.productId,
          communityName: settingMessage.communityName,
          userName: settingMessage.userName,
          authMethod: settingMessage.authMethod,
          authPassword: settingMessage.authPassword,
          encryptionMethod: settingMessage.encryptionMethod,
          encryptionPassword: settingMessage.encryptionPassword,
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
    } else if (message.type === 'initialSNMPv3Data') {
      // Handle initial data load
      const initialSettings = message.settings.map(
        (setting: Record<string, any>) => ({
          _id: setting._id,
          companyId: setting.companyId,
          manufacturerId: setting.manufacturerId,
          modelId: setting.modelId,
          productId: setting.productId,
          communityName: setting.communityName,
          userName: setting.userName,
          authMethod: setting.authMethod,
          authPassword: setting.authPassword,
          encryptionMethod: setting.encryptionMethod,
          encryptionPassword: setting.encryptionPassword,
          description: setting.description,
          createdAt: setting.createdAt,
          updatedAt: setting.updatedAt,
        })
      )

      setSNMPv3Settings(initialSettings)
      setLoading(false)
    } else if (message.type === 'deleteSNMPv3Setting') {
      // Handle deletion message
      setSNMPv3Settings(prevSettings =>
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
      sendMessage({ type: 'requestInitialSNMPv3Data' })
    },
  })

  // Fetch initial SNMPv3 settings data via REST API when WebSocket is not connected
  useEffect(() => {
    if (!companyId || isConnected) {
      return
    }

    const fetchInitialData = async () => {
      try {
        setLoading(true)

        const response = await fetch(
          `/api/network-administration/snmp/snmpv3?companyId=${companyId}`
        )

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()

        // Transform the data to the expected format
        const formattedData: ExtendedSNMPv3Fields[] = data.map(
          (item: Record<string, any>) => ({
            _id: item._id,
            companyId: item.companyId,
            manufacturerId: item.manufacturerId,
            modelId: item.modelId,
            productId: item.productId,
            communityName: item.communityName,
            userName: item.userName,
            authMethod: item.authMethod,
            authPassword: item.authPassword,
            encryptionMethod: item.encryptionMethod,
            encryptionPassword: item.encryptionPassword,
            description: item.description,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          })
        )

        setSNMPv3Settings(formattedData)
        setFetchError(null)
      } catch (error) {
        console.error('Error fetching SNMPv3 settings data:', error)
        setFetchError(
          `Failed to fetch data: ${error instanceof Error ? error.message : String(error)}`
        )
      } finally {
        setLoading(false)
      }
    }

    fetchInitialData()
  }, [companyId, isConnected])

  // Refresh SNMPv3 settings data
  const refreshSNMPv3Settings = useCallback(() => {
    if (isConnected) {
      // If connected via WebSocket, request a refresh
      sendMessage({ type: 'requestSNMPv3Refresh' })
    } else {
      // Otherwise, set loading to trigger the useEffect to refetch
      setLoading(true)
    }
  }, [isConnected, sendMessage])

  // Update SNMPv3 setting
  const updateSNMPv3Setting = useCallback(
    async (
      id: string,
      input: Partial<ExtendedSNMPv3Fields>
    ): Promise<ExtendedSNMPv3Fields | null> => {
      if (!companyId) {
        console.error('Company ID is null')
        return null
      }

      try {
        // Try to update via WebSocket if connected
        if (isConnected) {
          sendMessage({
            type: 'updateSNMPv3Setting',
            id,
            companyId,
            input,
          })

          // Return optimistic update in the local state
          const updatedSetting = {
            ...input,
            _id: id,
            companyId,
          } as ExtendedSNMPv3Fields

          setSNMPv3Settings(prevSettings => {
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
          `/api/network-administration/snmp/snmpv3/${id}`,
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
        const updatedSetting: ExtendedSNMPv3Fields = {
          _id: data._id,
          companyId: data.companyId,
          manufacturerId: data.manufacturerId,
          modelId: data.modelId,
          productId: data.productId,
          communityName: data.communityName,
          userName: data.userName,
          authMethod: data.authMethod,
          authPassword: data.authPassword,
          encryptionMethod: data.encryptionMethod,
          encryptionPassword: data.encryptionPassword,
          description: data.description,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        }

        // Update state with the new data
        setSNMPv3Settings(prevSettings => {
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
        console.error('Error updating SNMPv3 setting:', error)
        return null
      }
    },
    [companyId, isConnected, sendMessage]
  )

  // Delete SNMPv3 setting
  const deleteSNMPv3Setting = useCallback(
    async (id: string): Promise<boolean> => {
      if (!companyId) {
        console.error('Company ID is null')
        return false
      }

      try {
        // Try to delete via WebSocket if connected
        if (isConnected) {
          sendMessage({
            type: 'deleteSNMPv3Setting',
            id,
            companyId,
          })

          // Update local state optimistically
          setSNMPv3Settings(prevSettings =>
            prevSettings.filter(setting => setting._id !== id)
          )

          return true
        }

        // Fallback to REST API if WebSocket is not connected
        const response = await fetch(
          `/api/network-administration/snmp/snmpv3/${id}`,
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
          setSNMPv3Settings(prevSettings =>
            prevSettings.filter(setting => setting._id !== id)
          )
        }

        return success
      } catch (error) {
        console.error('Error deleting SNMPv3 setting:', error)
        return false
      }
    },
    [companyId, isConnected, sendMessage]
  )

  // Combine errors from WebSocket and fetch
  const error = wsError || fetchError

  return {
    snmpv3Settings,
    loading,
    error,
    refreshSNMPv3Settings,
    updateSNMPv3Setting,
    deleteSNMPv3Setting,
    isConnected,
    reconnect,
  }
}
