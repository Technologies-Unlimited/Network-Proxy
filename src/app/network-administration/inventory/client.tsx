'use client'
import React, { useState, useCallback, useEffect, useMemo } from 'react'
import FormDataGrid from '@/components/Form/DataGrid'
import { GridColDef, GridRowParams, useGridApiRef } from '@mui/x-data-grid-pro'
import AddNetworkInventory from '@/forms/Network/Inventory/company/AddNetworkDevice/client'
import ManageNetworkInventory from '@/forms/Network/Inventory/company/ManageNetworkDevice/client'
import { useNetworkInventoryAtom } from '@/apolloClient/network-administration/inventory/company/atom'
import { useCompanyInventoryProductAtom } from '@/apolloClient/inventory/items/company/product/atom'
import { useCompanyInventoryStockAtom } from '@/apolloClient/inventory/items/company/stock/atom'
import { ExtendedCompanyNetworkInventoryFields } from '@/schema/network-administration/inventory/company/schema'
import { ExtendedCompanyInventoryStockFields } from '@/schema/inventory/items/company/stock/schema'
import { ObjectId } from 'mongodb'
import { DatagridProps } from '@/components/DataGrid'

interface InventoryProps {
  companyId: ObjectId
}

const Inventory: React.FC<InventoryProps> = ({ companyId }) => {
  const [addOpen, setAddOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [selectedInventory, setSelectedInventory] =
    useState<ExtendedCompanyNetworkInventoryFields | null>(null)
  const apiRef = useGridApiRef()

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

  const columns: GridColDef[] = [
    { field: 'id', headerName: 'ID', width: 60 },
    { field: 'productName', headerName: 'Product Name', width: 180 },
    { field: 'macAddress', headerName: 'MAC Address', width: 180 },
    { field: 'serialNumber', headerName: 'Serial Number', width: 180 },
    { field: 'skuNumber', headerName: 'SKU Number', width: 180 },
  ]

  const handleRowClick = useCallback((params: GridRowParams) => {
    setSelectedInventory(params.row as ExtendedCompanyNetworkInventoryFields)
  }, [])

  useEffect(() => {
    const unsubscribe = apiRef.current.subscribeEvent(
      'rowClick',
      handleRowClick
    )
    return () => {
      unsubscribe()
    }
  }, [apiRef, handleRowClick])

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

  const datagrid: DatagridProps = {
    columns,
    rows,
    buttons,
    apiRef,
    onRefresh: refreshNetworkInventoryAtom,
  }

  return (
    <>
      <FormDataGrid
        title={`IPAM - ${viewTitle}`}
        description={description}
        datagrid={datagrid}
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
