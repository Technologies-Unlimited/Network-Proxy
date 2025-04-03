'use client'
import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { FormDataGrid } from 'goobs-frontend'
import type { ColumnDef, RowData } from 'goobs-frontend'
import AddNetworkInventory from '@/forms/Network/Inventory/company/AddNetworkDevice/client'
import ManageNetworkInventory from '@/forms/Network/Inventory/company/ManageNetworkDevice/client'
import { useNetworkInventoryAtom } from '@/apolloClient/network-administration/inventory/company/atom'
import { useCompanyInventoryProductAtom } from '@/apolloClient/inventory/items/company/product/atom'
import { useCompanyInventoryStockAtom } from '@/apolloClient/inventory/items/company/stock/atom'
import { ExtendedCompanyNetworkInventoryFields } from '@/schema/network-administration/inventory/company/schema'
import { ExtendedCompanyInventoryStockFields } from '@/schema/inventory/items/company/stock/schema'
import { ObjectId } from 'mongodb'

/**
 * Interface for Inventory props
 */
interface InventoryProps {
  companyId: ObjectId
}

const Inventory: React.FC<InventoryProps> = ({ companyId }) => {
  const [addOpen, setAddOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [selectedInventory, setSelectedInventory] =
    useState<ExtendedCompanyNetworkInventoryFields | null>(null)
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null)

  const { getNetworkInventory, refreshNetworkInventoryAtom } =
    useNetworkInventoryAtom(companyId)

  const { getCompanyInventoryProductNamesByIds } =
    useCompanyInventoryProductAtom(companyId)

  const { getCompanyInventoryStockItems } =
    useCompanyInventoryStockAtom(companyId)

  const viewTitle = 'Network Inventory'
  const description =
    'Manage network inventory with inventory item, SKU, serial number, and MAC address'

  const handleAddInventory = useCallback(() => {
    setAddOpen(true)
  }, [])

  const handleManageInventory = useCallback(() => {
    if (selectedInventory) {
      setManageOpen(true)
    }
  }, [selectedInventory])

  const buttons = [
    {
      text: 'Add Network Inventory',
      onClick: handleAddInventory,
      backgroundcolor: 'black',
      fontcolor: 'white',
    },
    {
      text: 'Manage Network Inventory',
      onClick: handleManageInventory,
      disabled: !selectedInventory,
      backgroundcolor: 'black',
      fontcolor: 'white',
    },
  ]

  // Define columns for the data grid
  const columns: ColumnDef[] = [
    { field: 'id', headerName: 'ID' },
    { field: 'productName', headerName: 'Product Name' },
    { field: 'macAddress', headerName: 'MAC Address' },
    { field: 'serialNumber', headerName: 'Serial Number' },
    { field: 'skuNumber', headerName: 'SKU Number' },
  ]

  // Handle row selection
  function handleSelectionChange(selectedIds: string[]): void {
    if (selectedIds.length > 0) {
      setSelectedRowId(selectedIds[0])

      const inventories = getNetworkInventory()
      const selectedRow = inventories.find(
        inventory => inventory._id.toString() === selectedIds[0]
      )

      if (selectedRow) {
        setSelectedInventory(selectedRow)
      }
    } else {
      setSelectedRowId(null)
      setSelectedInventory(null)
    }
  }

  // Generate rows for the data grid
  const rows = useMemo(() => {
    const inventories = getNetworkInventory()
    const productIds = inventories.map(inventory => inventory.productId)
    const productNames = getCompanyInventoryProductNamesByIds(
      companyId,
      productIds
    )
    const stockItems = getCompanyInventoryStockItems()

    return inventories.map((inventory, index) => {
      const stockItem = Array.isArray(stockItems)
        ? stockItems.find((item: ExtendedCompanyInventoryStockFields) =>
            item._id.equals(inventory.stockId)
          )
        : undefined
      return {
        id: inventory._id.toString(),
        _id: inventory._id.toString(), // Add _id as string for RowData compatibility
        productName: productNames[index],
        macAddress: inventory.macAddress,
        serialNumber: stockItem?.serialNumber || 'N/A',
        skuNumber: stockItem?.skuNumber || 'N/A',
      }
    })
  }, [
    getNetworkInventory,
    getCompanyInventoryProductNamesByIds,
    getCompanyInventoryStockItems,
    companyId,
  ])

  // Assemble DataGrid props
  const datagridProps = {
    columns,
    rows,
    buttons,
    onSelectionChange: handleSelectionChange,
    onRefresh: refreshNetworkInventoryAtom,
  }

  return (
    <>
      <FormDataGrid
        title={`IPAM - ${viewTitle}`}
        description={description}
        datagrid={datagridProps}
      />
      <AddNetworkInventory
        companyId={companyId}
        open={addOpen}
        onClose={() => setAddOpen(false)}
      />
      {selectedInventory && (
        <ManageNetworkInventory
          companyId={companyId}
          inventoryId={selectedInventory._id}
          open={manageOpen}
          onClose={() => setManageOpen(false)}
        />
      )}
    </>
  )
}

export default Inventory
