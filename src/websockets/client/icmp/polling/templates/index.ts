'use client'

/**
 * WebSocket-based ICMP polling templates hook
 * Provides real-time updates for ICMP polling template data
 */

import { useState, useCallback, useEffect } from 'react'
import {
  useWebSocketConnection,
  WebSocketMessage,
} from '@/websockets/client/useWebSocketConnection'
import {
  ExtendedICMPPollingTemplateFields,
  columnsToTimeInterval,
} from '@/schema/network-administration/icmp/polling/template/schema'
import { TimeInterval } from '@/types/network-administration/icmp/polling/template/types'

interface ICMPPollingTemplatesHookResult {
  icmpPollingTemplates: ExtendedICMPPollingTemplateFields[]
  loading: boolean
  error: string | null
  refreshICMPPollingTemplates: () => void
  updateICMPPollingTemplate: (
    id: string,
    input: Partial<ExtendedICMPPollingTemplateFields>
  ) => Promise<ExtendedICMPPollingTemplateFields | null>
  deleteICMPPollingTemplate: (id: string) => Promise<boolean>
  isConnected: boolean
  reconnect: () => void
}

interface ICMPPollingTemplateMessage extends WebSocketMessage {
  type: 'icmpPollingTemplate'
  _id: string
  companyId: string
  name: string
  description: string
  frequency: number
  timeout: number
  retries: number
  polling_frequency_days: number
  polling_frequency_hours: number
  polling_frequency_minutes: number
  polling_frequency_seconds: number
  downtime_trigger_days: number
  downtime_trigger_hours: number
  downtime_trigger_minutes: number
  downtime_trigger_seconds: number
  createdAt: number
}

export function useICMPPollingTemplates(
  companyId: string | null,
  wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001'
): ICMPPollingTemplatesHookResult {
  const [icmpPollingTemplates, setICMPPollingTemplates] = useState<
    ExtendedICMPPollingTemplateFields[]
  >([])
  const [loading, setLoading] = useState<boolean>(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Construct the WebSocket URL with companyId as a parameter
  const fullWsUrl = companyId ? `${wsUrl}?companyId=${companyId}` : wsUrl

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((message: WebSocketMessage) => {
    if (message.type === 'icmpPollingTemplate') {
      const templateMessage = message as ICMPPollingTemplateMessage

      setICMPPollingTemplates(prevTemplates => {
        // Convert the incoming message to the expected format
        const pollingFrequency: TimeInterval = columnsToTimeInterval(
          templateMessage.polling_frequency_days,
          templateMessage.polling_frequency_hours,
          templateMessage.polling_frequency_minutes,
          templateMessage.polling_frequency_seconds
        )

        const downtimeTrigger: TimeInterval = columnsToTimeInterval(
          templateMessage.downtime_trigger_days,
          templateMessage.downtime_trigger_hours,
          templateMessage.downtime_trigger_minutes,
          templateMessage.downtime_trigger_seconds
        )

        const newTemplate: ExtendedICMPPollingTemplateFields = {
          _id: templateMessage._id,
          companyId: templateMessage.companyId,
          name: templateMessage.name,
          description: templateMessage.description,
          frequency: templateMessage.frequency,
          timeout: templateMessage.timeout,
          retries: templateMessage.retries,
          pollingFrequency,
          downtimeTrigger,
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
    } else if (message.type === 'initialICMPPollingTemplateData') {
      // Handle initial data load
      const initialTemplates = message.templates.map((template: any) => {
        const pollingFrequency: TimeInterval = columnsToTimeInterval(
          template.polling_frequency_days,
          template.polling_frequency_hours,
          template.polling_frequency_minutes,
          template.polling_frequency_seconds
        )

        const downtimeTrigger: TimeInterval = columnsToTimeInterval(
          template.downtime_trigger_days,
          template.downtime_trigger_hours,
          template.downtime_trigger_minutes,
          template.downtime_trigger_seconds
        )

        return {
          _id: template._id,
          companyId: template.companyId,
          name: template.name,
          description: template.description,
          frequency: template.frequency,
          timeout: template.timeout,
          retries: template.retries,
          pollingFrequency,
          downtimeTrigger,
          createdAt: template.createdAt,
        }
      })

      setICMPPollingTemplates(initialTemplates)
      setLoading(false)
    } else if (message.type === 'deleteICMPPollingTemplate') {
      // Handle deletion message
      setICMPPollingTemplates(prevTemplates =>
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
      sendMessage({ type: 'requestInitialICMPPollingTemplateData' })
    },
  })

  // Fetch initial ICMP polling template data via REST API when WebSocket is not connected
  useEffect(() => {
    if (!companyId || isConnected) {
      return
    }

    const fetchInitialData = async () => {
      try {
        setLoading(true)

        const response = await fetch(
          `/api/network-administration/icmp/polling/templates?companyId=${companyId}`
        )

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()

        // Transform the data to the expected format
        const formattedData: ExtendedICMPPollingTemplateFields[] = data.map(
          (item: any) => {
            const pollingFrequency: TimeInterval = columnsToTimeInterval(
              item.polling_frequency_days,
              item.polling_frequency_hours,
              item.polling_frequency_minutes,
              item.polling_frequency_seconds
            )

            const downtimeTrigger: TimeInterval = columnsToTimeInterval(
              item.downtime_trigger_days,
              item.downtime_trigger_hours,
              item.downtime_trigger_minutes,
              item.downtime_trigger_seconds
            )

            return {
              _id: item._id,
              companyId: item.companyId,
              name: item.name,
              description: item.description,
              frequency: item.frequency,
              timeout: item.timeout,
              retries: item.retries,
              pollingFrequency,
              downtimeTrigger,
              createdAt: item.createdAt,
            }
          }
        )

        setICMPPollingTemplates(formattedData)
        setFetchError(null)
      } catch (error) {
        console.error('Error fetching ICMP polling template data:', error)
        setFetchError(
          `Failed to fetch data: ${error instanceof Error ? error.message : String(error)}`
        )
      } finally {
        setLoading(false)
      }
    }

    fetchInitialData()
  }, [companyId, isConnected])

  // Refresh ICMP polling template data
  const refreshICMPPollingTemplates = useCallback(() => {
    if (isConnected) {
      // If connected via WebSocket, request a refresh
      sendMessage({ type: 'requestICMPPollingTemplateRefresh' })
    } else {
      // Otherwise, set loading to trigger the useEffect to refetch
      setLoading(true)
    }
  }, [isConnected, sendMessage])

  // Update ICMP polling template
  const updateICMPPollingTemplate = useCallback(
    async (
      id: string,
      input: Partial<ExtendedICMPPollingTemplateFields>
    ): Promise<ExtendedICMPPollingTemplateFields | null> => {
      if (!companyId) {
        console.error('Company ID is null')
        return null
      }

      try {
        // Try to update via WebSocket if connected
        if (isConnected) {
          sendMessage({
            type: 'updateICMPPollingTemplate',
            id,
            companyId,
            input,
          })

          // Return optimistic update in the local state
          const updatedTemplate = {
            ...input,
            _id: id,
            companyId,
          } as ExtendedICMPPollingTemplateFields

          setICMPPollingTemplates(prevTemplates => {
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
          `/api/network-administration/icmp/polling/templates/${id}`,
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
        const pollingFrequency: TimeInterval = columnsToTimeInterval(
          data.polling_frequency_days,
          data.polling_frequency_hours,
          data.polling_frequency_minutes,
          data.polling_frequency_seconds
        )

        const downtimeTrigger: TimeInterval = columnsToTimeInterval(
          data.downtime_trigger_days,
          data.downtime_trigger_hours,
          data.downtime_trigger_minutes,
          data.downtime_trigger_seconds
        )

        const updatedTemplate: ExtendedICMPPollingTemplateFields = {
          _id: data._id,
          companyId: data.companyId,
          name: data.name,
          description: data.description,
          frequency: data.frequency,
          timeout: data.timeout,
          retries: data.retries,
          pollingFrequency,
          downtimeTrigger,
          createdAt: data.createdAt,
        }

        // Update state with the new data
        setICMPPollingTemplates(prevTemplates => {
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
        console.error('Error updating ICMP polling template:', error)
        return null
      }
    },
    [companyId, isConnected, sendMessage]
  )

  // Delete ICMP polling template
  const deleteICMPPollingTemplate = useCallback(
    async (id: string): Promise<boolean> => {
      if (!companyId) {
        console.error('Company ID is null')
        return false
      }

      try {
        // Try to delete via WebSocket if connected
        if (isConnected) {
          sendMessage({
            type: 'deleteICMPPollingTemplate',
            id,
            companyId,
          })

          // Update local state optimistically
          setICMPPollingTemplates(prevTemplates =>
            prevTemplates.filter(template => template._id !== id)
          )

          return true
        }

        // Fallback to REST API if WebSocket is not connected
        const response = await fetch(
          `/api/network-administration/icmp/polling/templates/${id}`,
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
          setICMPPollingTemplates(prevTemplates =>
            prevTemplates.filter(template => template._id !== id)
          )
        }

        return success
      } catch (error) {
        console.error('Error deleting ICMP polling template:', error)
        return false
      }
    },
    [companyId, isConnected, sendMessage]
  )

  // Combine errors from WebSocket and fetch
  const error = wsError || fetchError

  return {
    icmpPollingTemplates,
    loading,
    error,
    refreshICMPPollingTemplates,
    updateICMPPollingTemplate,
    deleteICMPPollingTemplate,
    isConnected,
    reconnect,
  }
}
