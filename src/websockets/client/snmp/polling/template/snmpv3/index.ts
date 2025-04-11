'use client'

/**
 * WebSocket-based SNMPv3 polling template hook
 * Provides real-time updates for SNMPv3 polling template data
 */

import { useState, useCallback, useEffect } from 'react'
import {
  useWebSocketConnection,
  WebSocketMessage,
} from '@/websockets/client/useWebSocketConnection'
import { ExtendedSNMPv3PollingTemplateFields } from '@/schema/network-administration/snmp/polling/template/snmpv3/schema'
import {
  SNMPPollingTemplateFields,
  TimeInterval,
} from '@/types/network-administration/snmp/polling/template/types'

interface SNMPv3PollingTemplateHookResult {
  snmpv3PollingTemplates: ExtendedSNMPv3PollingTemplateFields[]
  loading: boolean
  error: string | null
  refreshSNMPv3PollingTemplates: () => void
  updateSNMPv3PollingTemplate: (
    id: string,
    input: Partial<ExtendedSNMPv3PollingTemplateFields>
  ) => Promise<ExtendedSNMPv3PollingTemplateFields | null>
  deleteSNMPv3PollingTemplate: (id: string) => Promise<boolean>
  isConnected: boolean
  reconnect: () => void
}

interface SNMPv3PollingTemplateMessage extends WebSocketMessage {
  type: 'snmpv3PollingTemplate'
  _id: string
  companyId: string
  name: string
  description: string
  frequency: number
  timeout: number
  retries: number
  pollingFrequency: TimeInterval
  downtimeTrigger: TimeInterval
  createdAt: number
  // SNMPv3 specific fields could be added here in the future
}

/**
 * Hook for managing SNMPv3 polling template data via WebSockets with REST API fallback
 */
export function useSNMPv3PollingTemplate(
  companyId: string | null,
  wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001'
): SNMPv3PollingTemplateHookResult {
  const [snmpv3PollingTemplates, setSNMPv3PollingTemplates] = useState<
    ExtendedSNMPv3PollingTemplateFields[]
  >([])
  const [loading, setLoading] = useState<boolean>(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Construct the WebSocket URL with companyId as a parameter
  const fullWsUrl = companyId ? `${wsUrl}?companyId=${companyId}` : wsUrl

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((message: WebSocketMessage) => {
    if (message.type === 'snmpv3PollingTemplate') {
      const templateMessage = message as SNMPv3PollingTemplateMessage

      setSNMPv3PollingTemplates(prevTemplates => {
        // Convert the incoming message to the expected format
        const newTemplate: ExtendedSNMPv3PollingTemplateFields = {
          _id: templateMessage._id,
          companyId: templateMessage.companyId,
          name: templateMessage.name,
          description: templateMessage.description,
          frequency: templateMessage.frequency,
          timeout: templateMessage.timeout,
          retries: templateMessage.retries,
          pollingFrequency: templateMessage.pollingFrequency,
          downtimeTrigger: templateMessage.downtimeTrigger,
          createdAt: templateMessage.createdAt,
        }

        // Update or add the template to the array
        const existingIndex = prevTemplates.findIndex(
          template => template._id === newTemplate._id
        )

        if (existingIndex >= 0) {
          // Update existing template
          const updatedTemplates = [...prevTemplates]
          updatedTemplates[existingIndex] = newTemplate
          return updatedTemplates
        } else {
          // Add new template
          return [...prevTemplates, newTemplate]
        }
      })
    } else if (message.type === 'initialSNMPv3PollingTemplateData') {
      // Handle initial data load
      const initialTemplates = message.templates.map(
        (template: Record<string, any>) => ({
          _id: template._id,
          companyId: template.companyId,
          name: template.name,
          description: template.description,
          frequency: template.frequency,
          timeout: template.timeout,
          retries: template.retries,
          pollingFrequency: template.pollingFrequency,
          downtimeTrigger: template.downtimeTrigger,
          createdAt: template.createdAt,
        })
      )

      setSNMPv3PollingTemplates(initialTemplates)
      setLoading(false)
    } else if (message.type === 'deleteSNMPv3PollingTemplate') {
      // Handle deletion message
      setSNMPv3PollingTemplates(prevTemplates =>
        prevTemplates.filter(template => template._id !== message.id)
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
      sendMessage({ type: 'requestInitialSNMPv3PollingTemplateData' })
    },
  })

  // Fetch initial SNMPv3 polling template data via REST API when WebSocket is not connected
  useEffect(() => {
    if (!companyId || isConnected) {
      return
    }

    const fetchInitialData = async () => {
      try {
        setLoading(true)

        const response = await fetch(
          `/api/network-administration/snmp/polling/template/snmpv3?companyId=${companyId}`
        )

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()

        // Transform the data to the expected format
        const formattedData: ExtendedSNMPv3PollingTemplateFields[] = data.map(
          (item: Record<string, any>) => ({
            _id: item._id,
            companyId: item.companyId,
            name: item.name,
            description: item.description,
            frequency: item.frequency,
            timeout: item.timeout,
            retries: item.retries,
            pollingFrequency: item.pollingFrequency,
            downtimeTrigger: item.downtimeTrigger,
            createdAt: item.createdAt,
          })
        )

        setSNMPv3PollingTemplates(formattedData)
        setFetchError(null)
      } catch (error) {
        console.error('Error fetching SNMPv3 polling template data:', error)
        setFetchError(
          `Failed to fetch data: ${error instanceof Error ? error.message : String(error)}`
        )
      } finally {
        setLoading(false)
      }
    }

    fetchInitialData()
  }, [companyId, isConnected])

  // Refresh SNMPv3 polling template data
  const refreshSNMPv3PollingTemplates = useCallback(() => {
    if (isConnected) {
      // If connected via WebSocket, request a refresh
      sendMessage({ type: 'requestSNMPv3PollingTemplateRefresh' })
    } else {
      // Otherwise, set loading to trigger the useEffect to refetch
      setLoading(true)
    }
  }, [isConnected, sendMessage])

  // Update SNMPv3 polling template
  const updateSNMPv3PollingTemplate = useCallback(
    async (
      id: string,
      input: Partial<ExtendedSNMPv3PollingTemplateFields>
    ): Promise<ExtendedSNMPv3PollingTemplateFields | null> => {
      if (!companyId) {
        console.error('Company ID is null')
        return null
      }

      try {
        // Try to update via WebSocket if connected
        if (isConnected) {
          sendMessage({
            type: 'updateSNMPv3PollingTemplate',
            id,
            companyId,
            input,
          })

          // Return optimistic update in the local state
          const updatedTemplate = {
            ...input,
            _id: id,
            companyId,
          } as ExtendedSNMPv3PollingTemplateFields

          setSNMPv3PollingTemplates(prevTemplates => {
            const existingIndex = prevTemplates.findIndex(
              template => template._id === id
            )

            if (existingIndex >= 0) {
              // Update existing template
              const updatedTemplates = [...prevTemplates]
              updatedTemplates[existingIndex] = {
                ...updatedTemplates[existingIndex],
                ...updatedTemplate,
              }
              return updatedTemplates
            }

            return prevTemplates
          })

          return updatedTemplate
        }

        // Fallback to REST API if WebSocket is not connected
        const response = await fetch(
          `/api/network-administration/snmp/polling/template/snmpv3/${id}`,
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
        const updatedTemplate: ExtendedSNMPv3PollingTemplateFields = {
          _id: data._id,
          companyId: data.companyId,
          name: data.name,
          description: data.description,
          frequency: data.frequency,
          timeout: data.timeout,
          retries: data.retries,
          pollingFrequency: data.pollingFrequency,
          downtimeTrigger: data.downtimeTrigger,
          createdAt: data.createdAt,
        }

        // Update state with the new data
        setSNMPv3PollingTemplates(prevTemplates => {
          const existingIndex = prevTemplates.findIndex(
            template => template._id === updatedTemplate._id
          )

          if (existingIndex >= 0) {
            // Update existing template
            const updatedTemplates = [...prevTemplates]
            updatedTemplates[existingIndex] = updatedTemplate
            return updatedTemplates
          } else {
            // Add new template
            return [...prevTemplates, updatedTemplate]
          }
        })

        return updatedTemplate
      } catch (error) {
        console.error('Error updating SNMPv3 polling template:', error)
        return null
      }
    },
    [companyId, isConnected, sendMessage]
  )

  // Delete SNMPv3 polling template
  const deleteSNMPv3PollingTemplate = useCallback(
    async (id: string): Promise<boolean> => {
      if (!companyId) {
        console.error('Company ID is null')
        return false
      }

      try {
        // Try to delete via WebSocket if connected
        if (isConnected) {
          sendMessage({
            type: 'deleteSNMPv3PollingTemplate',
            id,
            companyId,
          })

          // Update local state optimistically
          setSNMPv3PollingTemplates(prevTemplates =>
            prevTemplates.filter(template => template._id !== id)
          )

          return true
        }

        // Fallback to REST API if WebSocket is not connected
        const response = await fetch(
          `/api/network-administration/snmp/polling/template/snmpv3/${id}`,
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
          setSNMPv3PollingTemplates(prevTemplates =>
            prevTemplates.filter(template => template._id !== id)
          )
        }

        return success
      } catch (error) {
        console.error('Error deleting SNMPv3 polling template:', error)
        return false
      }
    },
    [companyId, isConnected, sendMessage]
  )

  // Combine errors from WebSocket and fetch
  const error = wsError || fetchError

  return {
    snmpv3PollingTemplates,
    loading,
    error,
    refreshSNMPv3PollingTemplates,
    updateSNMPv3PollingTemplate,
    deleteSNMPv3PollingTemplate,
    isConnected,
    reconnect,
  }
}
