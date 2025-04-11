'use client'

/**
 * WebSocket-based SNMPv2 polling template hook
 * Provides real-time updates for SNMPv2 polling template data
 */

import { useState, useCallback, useEffect } from 'react'
import {
  useWebSocketConnection,
  WebSocketMessage,
} from '@/websockets/client/useWebSocketConnection'
import { ExtendedSNMPv2PollingTemplateFields } from '@/schema/network-administration/snmp/polling/template/snmpv2/schema'
import {
  SNMPPollingTemplateFields,
  TimeInterval,
} from '@/types/network-administration/snmp/polling/template/types'

interface SNMPv2PollingTemplateHookResult {
  snmpv2PollingTemplates: ExtendedSNMPv2PollingTemplateFields[]
  loading: boolean
  error: string | null
  refreshSNMPv2PollingTemplates: () => void
  updateSNMPv2PollingTemplate: (
    id: string,
    input: Partial<ExtendedSNMPv2PollingTemplateFields>
  ) => Promise<ExtendedSNMPv2PollingTemplateFields | null>
  deleteSNMPv2PollingTemplate: (id: string) => Promise<boolean>
  isConnected: boolean
  reconnect: () => void
}

interface SNMPv2PollingTemplateMessage extends WebSocketMessage {
  type: 'snmpv2PollingTemplate'
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
}

/**
 * Hook for managing SNMPv2 polling template data via WebSockets with REST API fallback
 */
export function useSNMPv2PollingTemplate(
  companyId: string | null,
  wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001'
): SNMPv2PollingTemplateHookResult {
  const [snmpv2PollingTemplates, setSNMPv2PollingTemplates] = useState<
    ExtendedSNMPv2PollingTemplateFields[]
  >([])
  const [loading, setLoading] = useState<boolean>(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Construct the WebSocket URL with companyId as a parameter
  const fullWsUrl = companyId ? `${wsUrl}?companyId=${companyId}` : wsUrl

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((message: WebSocketMessage) => {
    if (message.type === 'snmpv2PollingTemplate') {
      const templateMessage = message as SNMPv2PollingTemplateMessage

      setSNMPv2PollingTemplates(prevTemplates => {
        // Convert the incoming message to the expected format
        const newTemplate: ExtendedSNMPv2PollingTemplateFields = {
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
    } else if (message.type === 'initialSNMPv2PollingTemplateData') {
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

      setSNMPv2PollingTemplates(initialTemplates)
      setLoading(false)
    } else if (message.type === 'deleteSNMPv2PollingTemplate') {
      // Handle deletion message
      setSNMPv2PollingTemplates(prevTemplates =>
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
      sendMessage({ type: 'requestInitialSNMPv2PollingTemplateData' })
    },
  })

  // Fetch initial SNMPv2 polling template data via REST API when WebSocket is not connected
  useEffect(() => {
    if (!companyId || isConnected) {
      return
    }

    const fetchInitialData = async () => {
      try {
        setLoading(true)

        const response = await fetch(
          `/api/network-administration/snmp/polling/template/snmpv2?companyId=${companyId}`
        )

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()

        // Transform the data to the expected format
        const formattedData: ExtendedSNMPv2PollingTemplateFields[] = data.map(
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

        setSNMPv2PollingTemplates(formattedData)
        setFetchError(null)
      } catch (error) {
        console.error('Error fetching SNMPv2 polling template data:', error)
        setFetchError(
          `Failed to fetch data: ${error instanceof Error ? error.message : String(error)}`
        )
      } finally {
        setLoading(false)
      }
    }

    fetchInitialData()
  }, [companyId, isConnected])

  // Refresh SNMPv2 polling template data
  const refreshSNMPv2PollingTemplates = useCallback(() => {
    if (isConnected) {
      // If connected via WebSocket, request a refresh
      sendMessage({ type: 'requestSNMPv2PollingTemplateRefresh' })
    } else {
      // Otherwise, set loading to trigger the useEffect to refetch
      setLoading(true)
    }
  }, [isConnected, sendMessage])

  // Update SNMPv2 polling template
  const updateSNMPv2PollingTemplate = useCallback(
    async (
      id: string,
      input: Partial<ExtendedSNMPv2PollingTemplateFields>
    ): Promise<ExtendedSNMPv2PollingTemplateFields | null> => {
      if (!companyId) {
        console.error('Company ID is null')
        return null
      }

      try {
        // Try to update via WebSocket if connected
        if (isConnected) {
          sendMessage({
            type: 'updateSNMPv2PollingTemplate',
            id,
            companyId,
            input,
          })

          // Return optimistic update in the local state
          const updatedTemplate = {
            ...input,
            _id: id,
            companyId,
          } as ExtendedSNMPv2PollingTemplateFields

          setSNMPv2PollingTemplates(prevTemplates => {
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
          `/api/network-administration/snmp/polling/template/snmpv2/${id}`,
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
        const updatedTemplate: ExtendedSNMPv2PollingTemplateFields = {
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
        setSNMPv2PollingTemplates(prevTemplates => {
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
        console.error('Error updating SNMPv2 polling template:', error)
        return null
      }
    },
    [companyId, isConnected, sendMessage]
  )

  // Delete SNMPv2 polling template
  const deleteSNMPv2PollingTemplate = useCallback(
    async (id: string): Promise<boolean> => {
      if (!companyId) {
        console.error('Company ID is null')
        return false
      }

      try {
        // Try to delete via WebSocket if connected
        if (isConnected) {
          sendMessage({
            type: 'deleteSNMPv2PollingTemplate',
            id,
            companyId,
          })

          // Update local state optimistically
          setSNMPv2PollingTemplates(prevTemplates =>
            prevTemplates.filter(template => template._id !== id)
          )

          return true
        }

        // Fallback to REST API if WebSocket is not connected
        const response = await fetch(
          `/api/network-administration/snmp/polling/template/snmpv2/${id}`,
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
          setSNMPv2PollingTemplates(prevTemplates =>
            prevTemplates.filter(template => template._id !== id)
          )
        }

        return success
      } catch (error) {
        console.error('Error deleting SNMPv2 polling template:', error)
        return false
      }
    },
    [companyId, isConnected, sendMessage]
  )

  // Combine errors from WebSocket and fetch
  const error = wsError || fetchError

  return {
    snmpv2PollingTemplates,
    loading,
    error,
    refreshSNMPv2PollingTemplates,
    updateSNMPv2PollingTemplate,
    deleteSNMPv2PollingTemplate,
    isConnected,
    reconnect,
  }
}
