'use client'

import React, { useState, useEffect } from 'react'
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Box,
  Button,
  Dialog,
  CircularProgress,
  Tooltip,
  Stack,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import RefreshIcon from '@mui/icons-material/Refresh'

/**
 * Interface for Network Inventory item
 */
interface NetworkInventory {
  id: string
  companyId: string
  productId: string
  stockId: string
  macAddress: string
  ipAddress?: string
  subnetMask?: string
  gateway?: string
  createdAt: number
  updatedAt: number
}

/**
 * Interface for Inventory Product
 */
interface InventoryProduct {
  id: string
  companyId: string
  name: string
  description?: string
  category?: string
  price?: number
  createdAt: number
}

/**
 * Interface for Inventory Stock
 */
interface InventoryStock {
  id: string
  companyId: string
  productId: string
  serialNumber?: string
  skuNumber?: string
  status: string
  location?: string
  createdAt: number
}

/**
 * Hook to fetch network inventory data from WebSocket API
 */
function useNetworkInventoryData(companyId: string = 'default-company-id') {
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [networkInventories, setNetworkInventories] = useState<
    NetworkInventory[]
  >([])
  const [products, setProducts] = useState<InventoryProduct[]>([])
  const [stockItems, setStockItems] = useState<InventoryStock[]>([])
  const [selectedInventory, setSelectedInventory] =
    useState<NetworkInventory | null>(null)

  // Function to refresh data
  const refreshData = async () => {
    setLoading(true)
    setError(null)

    try {
      // Fetch network inventories
      const inventoryResponse = await fetch(
        `/api/network-administration/inventory?companyId=${companyId}`
      )
      if (!inventoryResponse.ok) {
        throw new Error(
          `Failed to fetch network inventories: ${inventoryResponse.statusText}`
        )
      }
      const inventoryData = await inventoryResponse.json()
      setNetworkInventories(inventoryData)

      // Extract product IDs and stock IDs
      const productIds = inventoryData.map(
        (item: NetworkInventory) => item.productId
      )
      const stockIds = inventoryData.map(
        (item: NetworkInventory) => item.stockId
      )

      // Fetch products
      const productsResponse = await fetch(
        `/api/inventory/products?companyId=${companyId}&ids=${productIds.join(',')}`
      )
      if (!productsResponse.ok) {
        throw new Error(
          `Failed to fetch products: ${productsResponse.statusText}`
        )
      }
      const productsData = await productsResponse.json()
      setProducts(productsData)

      // Fetch stock items
      const stockResponse = await fetch(
        `/api/inventory/stock?companyId=${companyId}&ids=${stockIds.join(',')}`
      )
      if (!stockResponse.ok) {
        throw new Error(
          `Failed to fetch stock items: ${stockResponse.statusText}`
        )
      }
      const stockData = await stockResponse.json()
      setStockItems(stockData)
    } catch (err) {
      console.error('Error fetching network inventory data:', err)
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
    } finally {
      setLoading(false)
    }
  }

  // Fetch data on component mount
  useEffect(() => {
    refreshData()

    // Optional: Setup WebSocket connection for real-time updates
    const ws = new WebSocket(
      `${process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001'}/ws?companyId=${companyId}`
    )

    ws.onopen = () => {
      console.log('WebSocket connection established')
      // Request initial data
      ws.send(JSON.stringify({ type: 'requestInitialInventoryData' }))
    }

    ws.onmessage = event => {
      try {
        const data = JSON.parse(event.data)

        // Handle different message types
        if (
          data.type === 'initialInventoryData' &&
          Array.isArray(data.inventories)
        ) {
          setNetworkInventories(data.inventories)
          if (data.products) setProducts(data.products)
          if (data.stockItems) setStockItems(data.stockItems)
          setLoading(false)
        } else if (data.type === 'inventoryUpdate') {
          // Handle individual inventory update
          setNetworkInventories(prev => {
            const index = prev.findIndex(item => item.id === data.inventory.id)
            if (index >= 0) {
              const newInventories = [...prev]
              newInventories[index] = data.inventory
              return newInventories
            }
            return [...prev, data.inventory]
          })
        } else if (data.type === 'inventoryDelete') {
          // Handle inventory deletion
          setNetworkInventories(prev =>
            prev.filter(item => item.id !== data.id)
          )
        } else if (data.type === 'error') {
          console.error('WebSocket error:', data.message)
          setError(data.message)
        }
      } catch (err) {
        console.error('Error processing WebSocket message:', err)
      }
    }

    ws.onerror = error => {
      console.error('WebSocket error:', error)
      setError('WebSocket connection error')
    }

    ws.onclose = () => {
      console.log('WebSocket connection closed')
    }

    // Clean up WebSocket connection
    return () => {
      ws.close()
    }
  }, [companyId])

  // Handle row selection
  const handleSelectInventory = (inventory: NetworkInventory) => {
    setSelectedInventory(inventory)
  }

  return {
    loading,
    error,
    networkInventories,
    products,
    stockItems,
    selectedInventory,
    handleSelectInventory,
    refreshData,
  }
}

/**
 * Simple Add Network Inventory Dialog Component
 */
function AddNetworkInventoryDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <Box p={3}>
        <Typography variant="h6">Add Network Inventory</Typography>
        <Typography paragraph>
          This would be the form to add new network inventory. For the purposes
          of this example, this is a placeholder.
        </Typography>
        <Button variant="contained" onClick={onClose}>
          Close
        </Button>
      </Box>
    </Dialog>
  )
}

/**
 * Simple Manage Network Inventory Dialog Component
 */
function ManageNetworkInventoryDialog({
  open,
  onClose,
  inventoryId,
}: {
  open: boolean
  onClose: () => void
  inventoryId: string
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <Box p={3}>
        <Typography variant="h6">Manage Network Inventory</Typography>
        <Typography paragraph>
          This would be the form to manage network inventory with ID:{' '}
          {inventoryId}. For the purposes of this example, this is a
          placeholder.
        </Typography>
        <Button variant="contained" onClick={onClose}>
          Close
        </Button>
      </Box>
    </Dialog>
  )
}

/**
 * Main Network Inventory component
 */
const Inventory: React.FC = () => {
  const [addOpen, setAddOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)

  // Use our custom hook to fetch data
  const {
    loading,
    error,
    networkInventories,
    products,
    stockItems,
    selectedInventory,
    handleSelectInventory,
    refreshData,
  } = useNetworkInventoryData()

  // Create lookup maps for efficient access
  const productMap = products.reduce(
    (map, product) => {
      map[product.id] = product
      return map
    },
    {} as Record<string, InventoryProduct>
  )

  const stockMap = stockItems.reduce(
    (map, stock) => {
      map[stock.id] = stock
      return map
    },
    {} as Record<string, InventoryStock>
  )

  // Render loading state
  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          p: 3,
        }}
      >
        <CircularProgress sx={{ mb: 2 }} />
        <Typography>Loading network inventory...</Typography>
      </Box>
    )
  }

  // Render error state
  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="error" variant="h6">
          Error
        </Typography>
        <Typography>{error}</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
        }}
      >
        <Box>
          <Typography variant="h5">IPAM - Network Inventory</Typography>
          <Typography color="text.secondary">
            Manage network inventory with inventory item, SKU, serial number,
            and MAC address
          </Typography>
        </Box>

        <Stack direction="row" spacing={1}>
          <Tooltip title="Add Network Inventory">
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setAddOpen(true)}
            >
              Add
            </Button>
          </Tooltip>

          <Tooltip title="Edit Selected Inventory">
            <span>
              <Button
                variant="outlined"
                startIcon={<EditIcon />}
                disabled={!selectedInventory}
                onClick={() => setManageOpen(true)}
              >
                Manage
              </Button>
            </span>
          </Tooltip>

          <Tooltip title="Refresh Data">
            <Button variant="outlined" onClick={refreshData}>
              <RefreshIcon />
            </Button>
          </Tooltip>
        </Stack>
      </Box>

      <TableContainer component={Paper} sx={{ mt: 2 }}>
        <Table sx={{ minWidth: 650 }} aria-label="network inventory table">
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Product Name</TableCell>
              <TableCell>MAC Address</TableCell>
              <TableCell>Serial Number</TableCell>
              <TableCell>SKU Number</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {networkInventories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  No network inventory data available
                </TableCell>
              </TableRow>
            ) : (
              networkInventories.map(inventory => {
                const product = productMap[inventory.productId]
                const stock = stockMap[inventory.stockId]

                return (
                  <TableRow
                    key={inventory.id}
                    hover
                    onClick={() => handleSelectInventory(inventory)}
                    selected={selectedInventory?.id === inventory.id}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell>{inventory.id.substring(0, 8)}...</TableCell>
                    <TableCell>{product?.name || 'Unknown'}</TableCell>
                    <TableCell>{inventory.macAddress}</TableCell>
                    <TableCell>{stock?.serialNumber || 'N/A'}</TableCell>
                    <TableCell>{stock?.skuNumber || 'N/A'}</TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Dialogs */}
      <AddNetworkInventoryDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
      />

      {selectedInventory && (
        <ManageNetworkInventoryDialog
          open={manageOpen}
          onClose={() => setManageOpen(false)}
          inventoryId={selectedInventory.id}
        />
      )}
    </Box>
  )
}

export default Inventory
