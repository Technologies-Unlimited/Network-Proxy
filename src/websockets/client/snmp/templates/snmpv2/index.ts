'use client'

/**
 * WebSocket-based SNMPv2 templates hook
 * Provides real-time updates for SNMPv2 template data
 */

import { useState, useCallback, useEffect } from 'react'
import {
  useWebSocketConnection,
  WebSocketMessage,
} from '@/websockets/client/useWebSocketConnection'
import { SNMPv2TemplateFields } from '@/schema/network-administration/snmp/templates/snmpv2/schema'
import { SNMPMonitoringFields } from '@/types/network-administration/snmp/templates/types'

interface SNMPv2TemplateHookResult {
  snmpv2Templates: SNMPv2TemplateFields[]
  loading: boolean
  error: string | null
  refreshSNMPv2Templates: () => void
  updateSNMPv2Template: (
    id: string,
    input: Partial<SNMPv2TemplateFields>
  ) => Promise<SNMPv2TemplateFields | null>
  deleteSNMPv2Template: (id: string) => Promise<boolean>
  isConnected: boolean
  reconnect: () => void
}

interface SNMPv2TemplateMessage extends WebSocketMessage {
  type: 'snmpv2Template'
  _id: string
  companyId: string
  manufacturerId?: string
  modelNameId?: string
  productId?: string
  snmpv2SettingId: string
  templateName: string
  description: string
  oidIds?: string[]
  stockIds?: string[]
  networkInventoryIds?: string[]
  createdAt: number
  updatedAt: number
}

/**
 * Hook for managing SNMPv2 template data via WebSockets with REST API fallback
 */
export function useSNMPv2Templates(
  companyId: string | null,
  wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001'
): SNMPv2TemplateHookResult {
  const [snmpv2Templates, setSNMPv2Templates] = useState<
    SNMPv2TemplateFields[]
  >([])
  const [loading, setLoading] = useState<boolean>(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Construct the WebSocket URL with companyId as a parameter
  const fullWsUrl = companyId ? `${wsUrl}?companyId=${companyId}` : wsUrl

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((message: WebSocketMessage) => {
    if (message.type === 'snmpv2Template') {
      const templateMessage = message as SNMPv2TemplateMessage

      setSNMPv2Templates(prevTemplates => {
        // Convert the incoming message to the expected format
        const newTemplate: SNMPv2TemplateFields = {
          _id: templateMessage._id,
          companyId: templateMessage.companyId,
          manufacturerId: templateMessage.manufacturerId,
          modelNameId: templateMessage.modelNameId,
          productId: templateMessage.productId,
          snmpv2SettingId: templateMessage.snmpv2SettingId,
          templateName: templateMessage.templateName,
          description: templateMessage.description,
          oidIds: templateMessage.oidIds,
          stockIds: templateMessage.stockIds,
          networkInventoryIds: templateMessage.networkInventoryIds,
          createdAt: templateMessage.createdAt,
          updatedAt: templateMessage.updatedAt,
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
    } else if (message.type === 'initialSNMPv2TemplateData') {
      // Handle initial data load
      const initialTemplates = message.templates.map(
        (template: Record<string, any>) => ({
          _id: template._id,
          companyId: template.companyId,
          manufacturerId: template.manufacturerId,
          modelNameId: template.modelNameId,
          productId: template.productId,
          snmpv2SettingId: template.snmpv2SettingId,
          templateName: template.templateName,
          description: template.description,
          oidIds: template.oidIds,
          stockIds: template.stockIds,
          networkInventoryIds: template.networkInventoryIds,
          createdAt: template.createdAt,
          updatedAt: template.updatedAt,
        })
      )

      setSNMPv2Templates(initialTemplates)
      setLoading(false)
    } else if (message.type === 'deleteSNMPv2Template') {
      // Handle deletion message
      setSNMPv2Templates(prevTemplates =>
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
      sendMessage({ type: 'requestInitialSNMPv2TemplateData' })
    },
  })

  // Fetch initial SNMPv2 template data via REST API when WebSocket is not connected
  useEffect(() => {
    if (!companyId || isConnected) {
      return
    }

    const fetchInitialData = async () => {
      try {
        setLoading(true)

        const response = await fetch(
          `/api/network-administration/snmp/templates/snmpv2?companyId=${companyId}`
        )

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()

        // Transform the data to the expected format
        const formattedData: SNMPv2TemplateFields[] = data.map(
          (item: Record<string, any>) => ({
            _id: item._id,
            companyId: item.companyId,
            manufacturerId: item.manufacturerId,
            modelNameId: item.modelNameId,
            productId: item.productId,
            snmpv2SettingId: item.snmpv2SettingId,
            templateName: item.templateName,
            description: item.description,
            oidIds: item.oidIds,
            stockIds: item.stockIds,
            networkInventoryIds: item.networkInventoryIds,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          })
        )

        setSNMPv2Templates(formattedData)
        setFetchError(null)
      } catch (error) {
        console.error('Error fetching SNMPv2 template data:', error)
        setFetchError(
          `Failed to fetch data: ${error instanceof Error ? error.message : String(error)}`
        )
      } finally {
        setLoading(false)
      }
    }

    fetchInitialData()
  }, [companyId, isConnected])

  // Refresh SNMPv2 template data
  const refreshSNMPv2Templates = useCallback(() => {
    if (isConnected) {
      // If connected via WebSocket, request a refresh
      sendMessage({ type: 'requestSNMPv2TemplateRefresh' })
    } else {
      // Otherwise, set loading to trigger the useEffect to refetch
      setLoading(true)
    }
  }, [isConnected, sendMessage])

  // Update SNMPv2 template
  const updateSNMPv2Template = useCallback(
    async (
      id: string,
      input: Partial<SNMPv2TemplateFields>
    ): Promise<SNMPv2TemplateFields | null> => {
      if (!companyId) {
        console.error('Company ID is null')
        return null
      }

      try {
        // Try to update via WebSocket if connected
        if (isConnected) {
          sendMessage({
            type: 'updateSNMPv2Template',
            id,
            companyId,
            input,
          })

          // Return optimistic update in the local state
          const updatedTemplate = {
            ...input,
            _id: id,
            companyId,
          } as SNMPv2TemplateFields

          setSNMPv2Templates(prevTemplates => {
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
          `/api/network-administration/snmp/templates/snmpv2/${id}`,
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
        const updatedTemplate: SNMPv2TemplateFields = {
          _id: data._id,
          companyId: data.companyId,
          manufacturerId: data.manufacturerId,
          modelNameId: data.modelNameId,
          productId: data.productId,
          snmpv2SettingId: data.snmpv2SettingId,
          templateName: data.templateName,
          description: data.description,
          oidIds: data.oidIds,
          stockIds: data.stockIds,
          networkInventoryIds: data.networkInventoryIds,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        }

        // Update state with the new data
        setSNMPv2Templates(prevTemplates => {
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
        console.error('Error updating SNMPv2 template:', error)
        return null
      }
    },
    [companyId, isConnected, sendMessage]
  )

  // Delete SNMPv2 template
  const deleteSNMPv2Template = useCallback(
    async (id: string): Promise<boolean> => {
      if (!companyId) {
        console.error('Company ID is null')
        return false
      }

      try {
        // Try to delete via WebSocket if connected
        if (isConnected) {
          sendMessage({
            type: 'deleteSNMPv2Template',
            id,
            companyId,
          })

          // Update local state optimistically
          setSNMPv2Templates(prevTemplates =>
            prevTemplates.filter(template => template._id !== id)
          )

          return true
        }

        // Fallback to REST API if WebSocket is not connected
        const response = await fetch(
          `/api/network-administration/snmp/templates/snmpv2/${id}`,
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
          setSNMPv2Templates(prevTemplates =>
            prevTemplates.filter(template => template._id !== id)
          )
        }

        return success
      } catch (error) {
        console.error('Error deleting SNMPv2 template:', error)
        return false
      }
    },
    [companyId, isConnected, sendMessage]
  )

  // Combine errors from WebSocket and fetch
  const error = wsError || fetchError

  return {
    snmpv2Templates,
    loading,
    error,
    refreshSNMPv2Templates,
    updateSNMPv2Template,
    deleteSNMPv2Template,
    isConnected,
    reconnect,
  }
}
