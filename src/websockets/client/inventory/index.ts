'use client'

/**
 * WebSocket-based company network inventory hook
 * Provides real-time updates for company network inventory data
 */

import { useState, useCallback, useEffect } from 'react'
import {
  useWebSocketConnection,
  WebSocketMessage,
} from '@/websockets/client/useWebSocketConnection'
import { ExtendedCompanyNetworkInventoryFields } from '@/schema/network-administration/inventory/company/schema'

interface CompanyNetworkInventoryHookResult {
  networkInventory: ExtendedCompanyNetworkInventoryFields[]
  loading: boolean
  error: string | null
  refreshNetworkInventory: () => void
  updateNetworkInventoryItem: (
    id: string,
    input: Partial<ExtendedCompanyNetworkInventoryFields>
  ) => Promise<ExtendedCompanyNetworkInventoryFields | null>
  deleteNetworkInventoryItem: (id: string) => Promise<boolean>
  isConnected: boolean
  reconnect: () => void
}

interface NetworkInventoryMessage extends WebSocketMessage {
  type: 'networkInventory'
  _id: string
  company_id: string
  product_id: string
  mac_address: string
  stock_id: string
  manufacturer_id: string
  model_id: string
  created_at: number
  updated_at: number
}

export function useCompanyNetworkInventory(
  companyId: string | null,
  wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001'
): CompanyNetworkInventoryHookResult {
  const [networkInventory, setNetworkInventory] = useState<
    ExtendedCompanyNetworkInventoryFields[]
  >([])
  const [loading, setLoading] = useState<boolean>(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Construct the WebSocket URL with companyId as a parameter
  const fullWsUrl = companyId ? `${wsUrl}?companyId=${companyId}` : wsUrl

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((message: WebSocketMessage) => {
    if (message.type === 'networkInventory') {
      const inventoryMessage = message as NetworkInventoryMessage

      setNetworkInventory(prevInventory => {
        // Convert the incoming message to the expected format
        const newItem: ExtendedCompanyNetworkInventoryFields = {
          _id: inventoryMessage._id,
          companyId: inventoryMessage.company_id,
          productId: inventoryMessage.product_id,
          macAddress: inventoryMessage.mac_address,
          stockId: inventoryMessage.stock_id,
          manufacturerId: inventoryMessage.manufacturer_id,
          modelId: inventoryMessage.model_id,
          createdAt: inventoryMessage.created_at,
          updatedAt: inventoryMessage.updated_at,
        }

        // Update or add the item to the array
        const existingIndex = prevInventory.findIndex(
          item => item._id === newItem._id
        )

        if (existingIndex >= 0) {
          // Update existing item
          const updatedInventory = [...prevInventory]
          updatedInventory[existingIndex] = newItem
          return updatedInventory
        } else {
          // Add new item
          return [...prevInventory, newItem]
        }
      })
    } else if (message.type === 'initialNetworkInventoryData') {
      // Handle initial data load
      const initialInventory = message.inventory.map((item: any) => ({
        _id: item._id,
        companyId: item.company_id,
        productId: item.product_id,
        macAddress: item.mac_address,
        stockId: item.stock_id,
        manufacturerId: item.manufacturer_id,
        modelId: item.model_id,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      }))

      setNetworkInventory(initialInventory)
      setLoading(false)
    } else if (message.type === 'deleteNetworkInventory') {
      // Handle deletion message
      setNetworkInventory(prevInventory =>
        prevInventory.filter(item => item._id !== message.id)
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
      sendMessage({ type: 'requestInitialNetworkInventoryData' })
    },
  })

  // Fetch initial company network inventory data via REST API when WebSocket is not connected
  useEffect(() => {
    if (!companyId || isConnected) {
      return
    }

    const fetchInitialData = async () => {
      try {
        setLoading(true)

        const response = await fetch(
          `/api/network-administration/inventory?companyId=${companyId}`
        )

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()

        // Transform the data to the expected format
        const formattedData: ExtendedCompanyNetworkInventoryFields[] = data.map(
          (item: any) => ({
            _id: item._id,
            companyId: item.company_id,
            productId: item.product_id,
            macAddress: item.mac_address,
            stockId: item.stock_id,
            manufacturerId: item.manufacturer_id,
            modelId: item.model_id,
            createdAt: item.created_at,
            updatedAt: item.updated_at,
          })
        )

        setNetworkInventory(formattedData)
        setFetchError(null)
      } catch (error) {
        console.error('Error fetching company network inventory data:', error)
        setFetchError(
          `Failed to fetch data: ${error instanceof Error ? error.message : String(error)}`
        )
      } finally {
        setLoading(false)
      }
    }

    fetchInitialData()
  }, [companyId, isConnected])

  // Refresh company network inventory data
  const refreshNetworkInventory = useCallback(() => {
    if (isConnected) {
      // If connected via WebSocket, request a refresh
      sendMessage({ type: 'requestNetworkInventoryRefresh' })
    } else {
      // Otherwise, set loading to trigger the useEffect to refetch
      setLoading(true)
    }
  }, [isConnected, sendMessage])

  // Update company network inventory item
  const updateNetworkInventoryItem = useCallback(
    async (
      id: string,
      input: Partial<ExtendedCompanyNetworkInventoryFields>
    ): Promise<ExtendedCompanyNetworkInventoryFields | null> => {
      if (!companyId) {
        console.error('Company ID is null')
        return null
      }

      try {
        // Try to update via WebSocket if connected
        if (isConnected) {
          sendMessage({
            type: 'updateNetworkInventory',
            id,
            companyId,
            input,
          })

          // Return optimistic update in the local state
          const updatedItem = {
            ...input,
            _id: id,
            companyId,
          } as ExtendedCompanyNetworkInventoryFields

          setNetworkInventory(prevInventory => {
            const existingIndex = prevInventory.findIndex(
              item => item._id === id
            )

            if (existingIndex >= 0) {
              // Update existing item
              const updatedInventory = [...prevInventory]
              updatedInventory[existingIndex] = {
                ...updatedInventory[existingIndex],
                ...updatedItem,
              }
              return updatedInventory
            }

            return prevInventory
          })

          return updatedItem
        }

        // Fallback to REST API if WebSocket is not connected
        const response = await fetch(
          `/api/network-administration/inventory/${id}`,
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
        const updatedItem: ExtendedCompanyNetworkInventoryFields = {
          _id: data._id,
          companyId: data.company_id,
          productId: data.product_id,
          macAddress: data.mac_address,
          stockId: data.stock_id,
          manufacturerId: data.manufacturer_id,
          modelId: data.model_id,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        }

        // Update state with the new data
        setNetworkInventory(prevInventory => {
          const existingIndex = prevInventory.findIndex(
            item => item._id === updatedItem._id
          )

          if (existingIndex >= 0) {
            // Update existing item
            const updatedInventory = [...prevInventory]
            updatedInventory[existingIndex] = updatedItem
            return updatedInventory
          } else {
            // Add new item
            return [...prevInventory, updatedItem]
          }
        })

        return updatedItem
      } catch (error) {
        console.error('Error updating company network inventory item:', error)
        return null
      }
    },
    [companyId, isConnected, sendMessage]
  )

  // Delete company network inventory item
  const deleteNetworkInventoryItem = useCallback(
    async (id: string): Promise<boolean> => {
      if (!companyId) {
        console.error('Company ID is null')
        return false
      }

      try {
        // Try to delete via WebSocket if connected
        if (isConnected) {
          sendMessage({
            type: 'deleteNetworkInventory',
            id,
            companyId,
          })

          // Update local state optimistically
          setNetworkInventory(prevInventory =>
            prevInventory.filter(item => item._id !== id)
          )

          return true
        }

        // Fallback to REST API if WebSocket is not connected
        const response = await fetch(
          `/api/network-administration/inventory/${id}`,
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
          setNetworkInventory(prevInventory =>
            prevInventory.filter(item => item._id !== id)
          )
        }

        return success
      } catch (error) {
        console.error('Error deleting company network inventory item:', error)
        return false
      }
    },
    [companyId, isConnected, sendMessage]
  )

  // Combine errors from WebSocket and fetch
  const error = wsError || fetchError

  return {
    networkInventory,
    loading,
    error,
    refreshNetworkInventory,
    updateNetworkInventoryItem,
    deleteNetworkInventoryItem,
    isConnected,
    reconnect,
  }
}
