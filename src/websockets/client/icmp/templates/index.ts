'use client'

/**
 * WebSocket-based ICMP monitoring templates hook
 * Provides real-time updates for ICMP monitoring template data
 */

import { useState, useCallback, useEffect } from 'react'
import {
  useWebSocketConnection,
  WebSocketMessage,
} from '@/websockets/client/useWebSocketConnection'
import { ExtendedICMPMonitoringTemplateFields } from '@/schema/network-administration/icmp/templates/schema'

interface ICMPMonitoringTemplatesHookResult {
  icmpMonitoringTemplates: ExtendedICMPMonitoringTemplateFields[]
  loading: boolean
  error: string | null
  refreshICMPMonitoringTemplates: () => void
  updateICMPMonitoringTemplate: (
    id: string,
    input: Partial<ExtendedICMPMonitoringTemplateFields>
  ) => Promise<ExtendedICMPMonitoringTemplateFields | null>
  deleteICMPMonitoringTemplate: (id: string) => Promise<boolean>
  isConnected: boolean
  reconnect: () => void
}

interface ICMPMonitoringTemplateMessage extends WebSocketMessage {
  type: 'icmpMonitoringTemplate'
  _id: string
  companyId: string
  template_name: string
  template_description: string
  icmp_loss_threshold: number
  icmp_latency_threshold: number
  manufacturer_id?: string
  model_name_id?: string
  product_id?: string
  stockIds?: string[]
  networkInventoryIds?: string[]
  created_at: number
  updated_at: number
}

export function useICMPMonitoringTemplates(
  companyId: string | null,
  wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001'
): ICMPMonitoringTemplatesHookResult {
  const [icmpMonitoringTemplates, setICMPMonitoringTemplates] = useState<
    ExtendedICMPMonitoringTemplateFields[]
  >([])
  const [loading, setLoading] = useState<boolean>(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Construct the WebSocket URL with companyId as a parameter
  const fullWsUrl = companyId ? `${wsUrl}?companyId=${companyId}` : wsUrl

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((message: WebSocketMessage) => {
    if (message.type === 'icmpMonitoringTemplate') {
      const templateMessage = message as ICMPMonitoringTemplateMessage

      setICMPMonitoringTemplates(prevTemplates => {
        // Convert the incoming message to the expected format
        const newTemplate: ExtendedICMPMonitoringTemplateFields = {
          _id: templateMessage._id,
          companyId: templateMessage.companyId,
          templateName: templateMessage.template_name,
          templateDescription: templateMessage.template_description,
          icmpLossThreshold: templateMessage.icmp_loss_threshold,
          icmpLatencyThreshold: templateMessage.icmp_latency_threshold,
          manufacturerId: templateMessage.manufacturer_id,
          modelNameId: templateMessage.model_name_id,
          productId: templateMessage.product_id,
          stockIds: templateMessage.stockIds,
          networkInventoryIds: templateMessage.networkInventoryIds,
          createdAt: templateMessage.created_at,
          updatedAt: templateMessage.updated_at,
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
    } else if (message.type === 'initialICMPMonitoringTemplateData') {
      // Handle initial data load
      const initialTemplates = message.templates.map((template: any) => ({
        _id: template._id,
        companyId: template.companyId,
        templateName: template.template_name,
        templateDescription: template.template_description,
        icmpLossThreshold: template.icmp_loss_threshold,
        icmpLatencyThreshold: template.icmp_latency_threshold,
        manufacturerId: template.manufacturer_id,
        modelNameId: template.model_name_id,
        productId: template.product_id,
        stockIds: template.stockIds,
        networkInventoryIds: template.networkInventoryIds,
        createdAt: template.created_at,
        updatedAt: template.updated_at,
      }))

      setICMPMonitoringTemplates(initialTemplates)
      setLoading(false)
    } else if (message.type === 'deleteICMPMonitoringTemplate') {
      // Handle deletion message
      setICMPMonitoringTemplates(prevTemplates =>
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
      sendMessage({ type: 'requestInitialICMPMonitoringTemplateData' })
    },
  })

  // Fetch initial ICMP monitoring template data via REST API when WebSocket is not connected
  useEffect(() => {
    if (!companyId || isConnected) {
      return
    }

    const fetchInitialData = async () => {
      try {
        setLoading(true)

        const response = await fetch(
          `/api/network-administration/icmp/templates?companyId=${companyId}`
        )

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()

        // Transform the data to the expected format
        const formattedData: ExtendedICMPMonitoringTemplateFields[] = data.map(
          (item: any) => ({
            _id: item._id,
            companyId: item.companyId,
            templateName: item.template_name,
            templateDescription: item.template_description,
            icmpLossThreshold: item.icmp_loss_threshold,
            icmpLatencyThreshold: item.icmp_latency_threshold,
            manufacturerId: item.manufacturer_id,
            modelNameId: item.model_name_id,
            productId: item.product_id,
            stockIds: item.stockIds,
            networkInventoryIds: item.networkInventoryIds,
            createdAt: item.created_at,
            updatedAt: item.updated_at,
          })
        )

        setICMPMonitoringTemplates(formattedData)
        setFetchError(null)
      } catch (error) {
        console.error('Error fetching ICMP monitoring template data:', error)
        setFetchError(
          `Failed to fetch data: ${error instanceof Error ? error.message : String(error)}`
        )
      } finally {
        setLoading(false)
      }
    }

    fetchInitialData()
  }, [companyId, isConnected])

  // Refresh ICMP monitoring template data
  const refreshICMPMonitoringTemplates = useCallback(() => {
    if (isConnected) {
      // If connected via WebSocket, request a refresh
      sendMessage({ type: 'requestICMPMonitoringTemplateRefresh' })
    } else {
      // Otherwise, set loading to trigger the useEffect to refetch
      setLoading(true)
    }
  }, [isConnected, sendMessage])

  // Update ICMP monitoring template
  const updateICMPMonitoringTemplate = useCallback(
    async (
      id: string,
      input: Partial<ExtendedICMPMonitoringTemplateFields>
    ): Promise<ExtendedICMPMonitoringTemplateFields | null> => {
      if (!companyId) {
        console.error('Company ID is null')
        return null
      }

      try {
        // Try to update via WebSocket if connected
        if (isConnected) {
          sendMessage({
            type: 'updateICMPMonitoringTemplate',
            id,
            companyId,
            input,
          })

          // Return optimistic update in the local state
          const updatedTemplate = {
            ...input,
            _id: id,
            companyId,
          } as ExtendedICMPMonitoringTemplateFields

          setICMPMonitoringTemplates(prevTemplates => {
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
          `/api/network-administration/icmp/templates/${id}`,
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
        const updatedTemplate: ExtendedICMPMonitoringTemplateFields = {
          _id: data._id,
          companyId: data.companyId,
          templateName: data.template_name,
          templateDescription: data.template_description,
          icmpLossThreshold: data.icmp_loss_threshold,
          icmpLatencyThreshold: data.icmp_latency_threshold,
          manufacturerId: data.manufacturer_id,
          modelNameId: data.model_name_id,
          productId: data.product_id,
          stockIds: data.stockIds,
          networkInventoryIds: data.networkInventoryIds,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        }

        // Update state with the new data
        setICMPMonitoringTemplates(prevTemplates => {
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
        console.error('Error updating ICMP monitoring template:', error)
        return null
      }
    },
    [companyId, isConnected, sendMessage]
  )

  // Delete ICMP monitoring template
  const deleteICMPMonitoringTemplate = useCallback(
    async (id: string): Promise<boolean> => {
      if (!companyId) {
        console.error('Company ID is null')
        return false
      }

      try {
        // Try to delete via WebSocket if connected
        if (isConnected) {
          sendMessage({
            type: 'deleteICMPMonitoringTemplate',
            id,
            companyId,
          })

          // Update local state optimistically
          setICMPMonitoringTemplates(prevTemplates =>
            prevTemplates.filter(template => template._id !== id)
          )

          return true
        }

        // Fallback to REST API if WebSocket is not connected
        const response = await fetch(
          `/api/network-administration/icmp/templates/${id}`,
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
          setICMPMonitoringTemplates(prevTemplates =>
            prevTemplates.filter(template => template._id !== id)
          )
        }

        return success
      } catch (error) {
        console.error('Error deleting ICMP monitoring template:', error)
        return false
      }
    },
    [companyId, isConnected, sendMessage]
  )

  // Combine errors from WebSocket and fetch
  const error = wsError || fetchError

  return {
    icmpMonitoringTemplates,
    loading,
    error,
    refreshICMPMonitoringTemplates,
    updateICMPMonitoringTemplate,
    deleteICMPMonitoringTemplate,
    isConnected,
    reconnect,
  }
}
