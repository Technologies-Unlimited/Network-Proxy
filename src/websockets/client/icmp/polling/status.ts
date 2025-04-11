/**
 * ICMP Polling Status Hook
 * Pure Bun implementation without Next.js dependencies
 */

import { useState, useEffect } from 'react'

// Device status type
export type DeviceStatus = 'online' | 'offline' | 'unknown'

// Interface for the ICMP polling status data
export interface ICMPPollingStatus {
  _id: string
  icmpPollingTemplateId: string
  deviceStatus: DeviceStatus
  productId?: string
  uptime: number
  downtime: number
  updatedAt: number
}

/**
 * Hook for accessing ICMP polling status data
 */
export function useICMPPollingStatus(companyId: string) {
  const [icmpPollingStatuses, setIcmpPollingStatuses] = useState<
    ICMPPollingStatus[]
  >([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState<boolean>(false)

  // Initialize mock data on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 800))

        // Mock data
        const mockData: ICMPPollingStatus[] = [
          {
            _id: '1',
            icmpPollingTemplateId: 'router-main',
            deviceStatus: 'online',
            productId: 'CISCO-RTR-001',
            uptime: 86400000, // 1 day in ms
            downtime: 0,
            updatedAt: Date.now(),
          },
          {
            _id: '2',
            icmpPollingTemplateId: 'switch-floor1',
            deviceStatus: 'online',
            productId: 'CISCO-SW-101',
            uptime: 259200000, // 3 days in ms
            downtime: 3600000, // 1 hour in ms
            updatedAt: Date.now() - 300000, // 5 min ago
          },
          {
            _id: '3',
            icmpPollingTemplateId: 'switch-floor2',
            deviceStatus: 'offline',
            productId: 'CISCO-SW-102',
            uptime: 172800000, // 2 days in ms
            downtime: 7200000, // 2 hours in ms
            updatedAt: Date.now() - 120000, // 2 min ago
          },
        ]

        setIcmpPollingStatuses(mockData)
        setIsConnected(true)
      } catch (err) {
        console.error('Error fetching ICMP status:', err)
        setError('Failed to fetch ICMP polling status data')
        setIsConnected(false)
      } finally {
        setLoading(false)
      }
    }

    fetchData()

    // Mock WebSocket connection
    const intervalId = setInterval(() => {
      // Randomly update one device status to simulate real-time updates
      if (icmpPollingStatuses.length > 0 && isConnected) {
        const randomIndex = Math.floor(
          Math.random() * icmpPollingStatuses.length
        )
        const updatedStatuses = [...icmpPollingStatuses]
        const device = { ...updatedStatuses[randomIndex] }

        // Flip status occasionally
        if (Math.random() > 0.8) {
          device.deviceStatus =
            device.deviceStatus === 'online' ? 'offline' : 'online'
        }

        // Update timestamps
        device.updatedAt = Date.now()
        if (device.deviceStatus === 'online') {
          device.uptime += 30000 // Add 30 seconds
        } else {
          device.downtime += 30000 // Add 30 seconds
        }

        updatedStatuses[randomIndex] = device
        setIcmpPollingStatuses(updatedStatuses)
      }
    }, 5000)

    return () => {
      clearInterval(intervalId)
    }
  }, [companyId])

  // Function to manually refresh the data
  const refreshICMPPollingStatus = () => {
    setLoading(true)
    setTimeout(() => {
      // Update timestamps on refresh
      const updatedStatuses = icmpPollingStatuses.map(device => ({
        ...device,
        updatedAt: Date.now(),
      }))
      setIcmpPollingStatuses(updatedStatuses)
      setLoading(false)
    }, 500)
  }

  // Function to reconnect to WebSocket
  const reconnect = () => {
    setIsConnected(false)
    setLoading(true)

    // Simulate reconnection delay
    setTimeout(() => {
      setIsConnected(true)
      setLoading(false)
    }, 1500)
  }

  return {
    icmpPollingStatuses,
    loading,
    error,
    refreshICMPPollingStatus,
    isConnected,
    reconnect,
  }
}
