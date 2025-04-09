'use client'

/**
 * Reusable WebSocket connection hook
 * Handles connection, reconnection, and message handling
 */

import { useState, useEffect, useCallback, useRef } from 'react'

export interface WebSocketMessage {
  type: string
  [key: string]: any
}

export interface UseWebSocketOptions {
  url: string
  onMessage?: (data: WebSocketMessage) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (error: Event) => void
  reconnectInterval?: number
  maxReconnectAttempts?: number
}

export function useWebSocketConnection(options: UseWebSocketOptions) {
  const {
    url,
    onMessage,
    onOpen,
    onClose,
    onError,
    reconnectInterval = 3000,
    maxReconnectAttempts = 10,
  } = options

  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const socket = useRef<WebSocket | null>(null)
  const reconnectAttempts = useRef(0)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Connect to WebSocket server
  const connect = useCallback(() => {
    try {
      if (socket.current?.readyState === WebSocket.OPEN) {
        return
      }

      // Close existing connection if it exists
      if (socket.current) {
        socket.current.close()
      }

      // Create new WebSocket connection
      socket.current = new WebSocket(url)

      // Connection opened
      socket.current.addEventListener('open', () => {
        console.log('WebSocket connection established')
        setIsConnected(true)
        setError(null)
        reconnectAttempts.current = 0
        if (onOpen) onOpen()
      })

      // Connection closed
      socket.current.addEventListener('close', event => {
        console.log(
          `WebSocket connection closed: ${event.code} ${event.reason}`
        )
        setIsConnected(false)
        if (onClose) onClose()

        // Attempt to reconnect unless it was a normal closure
        if (event.code !== 1000) {
          if (reconnectAttempts.current < maxReconnectAttempts) {
            reconnectAttempts.current += 1
            console.log(
              `Reconnecting (attempt ${reconnectAttempts.current} of ${maxReconnectAttempts})...`
            )

            if (reconnectTimeoutRef.current) {
              clearTimeout(reconnectTimeoutRef.current)
            }

            reconnectTimeoutRef.current = setTimeout(() => {
              connect()
            }, reconnectInterval)
          } else {
            setError('Maximum reconnection attempts reached')
          }
        }
      })

      // Listen for messages
      socket.current.addEventListener('message', event => {
        try {
          const data = JSON.parse(event.data)
          if (onMessage) onMessage(data)
        } catch (error) {
          console.error('Error parsing message:', error)
        }
      })

      // Handle errors
      socket.current.addEventListener('error', event => {
        // WebSocket error events don't contain useful properties when logged directly
        // Log a more descriptive message instead
        console.error('WebSocket connection error occurred')
        
        // Store more detailed error information
        const errorMessage = 'WebSocket connection error - check network connection and server status'
        setError(errorMessage)
        
        if (onError) onError(event)
      })
    } catch (error) {
      console.error('Error creating WebSocket connection:', error)
      setError(
        `Failed to connect: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }, [
    url,
    onMessage,
    onOpen,
    onClose,
    onError,
    reconnectInterval,
    maxReconnectAttempts,
  ])

  // Reconnect function for manual reconnection
  const reconnect = useCallback(() => {
    reconnectAttempts.current = 0
    connect()
  }, [connect])

  // Send message to the server
  const sendMessage = useCallback((message: Record<string, any>) => {
    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify(message))
      return true
    }
    return false
  }, [])

  // Subscribe to a specific device ID
  const subscribeToDevice = useCallback(
    (deviceId: string) => {
      return sendMessage({
        type: 'subscribe',
        deviceId,
      })
    },
    [sendMessage]
  )

  // Ping the server to keep the connection alive
  const ping = useCallback(() => {
    return sendMessage({
      type: 'ping',
      timestamp: Date.now(),
    })
  }, [sendMessage])

  // Close the connection
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    if (socket.current) {
      socket.current.close(1000, 'Client disconnected')
      socket.current = null
    }

    setIsConnected(false)
  }, [])

  // Connect on mount and clean up on unmount
  useEffect(() => {
    connect()

    // Setup ping interval to keep the connection alive
    const pingInterval = setInterval(() => {
      if (isConnected) {
        ping()
      }
    }, 30000) // Ping every 30 seconds

    return () => {
      clearInterval(pingInterval)
      disconnect()
    }
  }, [connect, disconnect, ping, isConnected])

  return {
    isConnected,
    error,
    sendMessage,
    subscribeToDevice,
    reconnect,
    disconnect,
  }
}
