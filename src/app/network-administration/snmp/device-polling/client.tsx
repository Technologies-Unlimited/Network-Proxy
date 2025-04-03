'use client'
import React, { useState, useEffect, useMemo } from 'react'
import { FormDataGrid } from 'goobs-frontend'
import type { ColumnDef, RowData } from 'goobs-frontend'
import { useSNMPPollingStatusAtom } from '@/apolloClient/network-administration/snmp/polling/status/atom'
import { useSNMPv2PollingTemplateAtom } from '@/apolloClient/network-administration/snmp/polling/template/snmpv2/atom'
import { useSNMPv3PollingTemplateAtom } from '@/apolloClient/network-administration/snmp/polling/template/snmpv3/atom'
import { useSNMPv2TemplateAtom } from '@/apolloClient/network-administration/snmp/templates/snmpv2/atom'
import { useSNMPv3TemplateAtom } from '@/apolloClient/network-administration/snmp/templates/snmpv3/atom'
import { useNetworkInventoryAtom } from '@/apolloClient/network-administration/inventory/company/atom'
import { useIPAddressAtom } from '@/apolloClient/network-administration/ipam/ipaddress/atom'
import { ExtendedSNMPPollingStatusFields } from '@/schema/network-administration/snmp/polling/status/schema'
import { ExtendedSNMPv2PollingTemplateFields } from '@/schema/network-administration/snmp/polling/template/snmpv2/schema'
import { ExtendedSNMPv3PollingTemplateFields } from '@/schema/network-administration/snmp/polling/template/snmpv3/schema'
import { SNMPv2TemplateFields } from '@/schema/network-administration/snmp/templates/snmpv2/schema'
import { SNMPv3TemplateFields } from '@/schema/network-administration/snmp/templates/snmpv3/schema'
import { ExtendedCompanyNetworkInventoryFields } from '@/schema/network-administration/inventory/company/schema'
import { ExtendedIPAddressFields } from '@/schema/network-administration/ipam/ipaddress/schema'
import { ObjectId } from 'mongodb'

/**
 * Interface for Device Polling props
 */
interface DevicePollingProps {
  companyId: ObjectId
}

/**
 * Interface for cell rendering params
 */
interface CellParams {
  row: RowData
  value: unknown
  field: string
  rowIndex: number
  columnIndex: number
}

const DevicePolling: React.FC<DevicePollingProps> = ({ companyId }) => {
  const [selectedStatus, setSelectedStatus] =
    useState<ExtendedSNMPPollingStatusFields | null>(null)
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null)

  const { getSNMPPollingStatuses, refreshSNMPPollingStatusAtom } =
    useSNMPPollingStatusAtom(companyId)
  const { getSNMPv2PollingTemplates, refreshSNMPv2PollingTemplateAtom } =
    useSNMPv2PollingTemplateAtom(companyId)
  const { getSNMPv3PollingTemplates, refreshSNMPv3PollingTemplateAtom } =
    useSNMPv3PollingTemplateAtom(companyId)
  const { getSNMPv2Templates, refreshSNMPv2TemplateAtom } =
    useSNMPv2TemplateAtom(companyId)
  const { getSNMPv3Templates, refreshSNMPv3TemplateAtom } =
    useSNMPv3TemplateAtom(companyId)
  const { getNetworkInventory, refreshNetworkInventoryAtom } =
    useNetworkInventoryAtom(companyId)
  const { getIPAddresses, refreshIPAddressAtom } = useIPAddressAtom(companyId)

  const viewTitle = 'Device Polling Status'
  const description =
    'View SNMP device polling status with uptime, downtime, and device status'

  // Get all polling templates
  const pollingTemplates = useMemo(() => {
    const v2Templates = getSNMPv2PollingTemplates()
    const v3Templates = getSNMPv3PollingTemplates()
    return [
      ...(Array.isArray(v2Templates) ? v2Templates : []),
      ...(Array.isArray(v3Templates) ? v3Templates : []),
    ]
  }, [getSNMPv2PollingTemplates, getSNMPv3PollingTemplates])

  // Get all SNMP templates
  const snmpTemplates = useMemo(() => {
    const v2Templates = getSNMPv2Templates()
    const v3Templates = getSNMPv3Templates()
    return [
      ...(Array.isArray(v2Templates) ? v2Templates : []),
      ...(Array.isArray(v3Templates) ? v3Templates : []),
    ]
  }, [getSNMPv2Templates, getSNMPv3Templates])

  // Get network inventory
  const networkInventory = useMemo(() => {
    return getNetworkInventory()
  }, [getNetworkInventory])

  // Get IP addresses
  const ipAddresses = useMemo(() => {
    return getIPAddresses()
  }, [getIPAddresses])

  // Define columns for the data grid
  const columns: ColumnDef[] = [
    { field: '_id', headerName: 'ID' },
    {
      field: 'snmpPollingTemplateName',
      headerName: 'SNMP Polling Template Name',
      renderCell: (params: CellParams) => {
        const pollingStatusRow =
          params.row as unknown as ExtendedSNMPPollingStatusFields
        const template = pollingTemplates.find(
          (
            t:
              | ExtendedSNMPv2PollingTemplateFields
              | ExtendedSNMPv3PollingTemplateFields
          ) => t._id.equals(pollingStatusRow.snmpPollingTemplateId)
        )
        return template ? template.name : 'Unknown'
      },
    },
    {
      field: 'snmpTemplateName',
      headerName: 'SNMP Template Name',
      renderCell: (params: CellParams) => {
        const pollingStatusRow =
          params.row as unknown as ExtendedSNMPPollingStatusFields
        const template = snmpTemplates.find(
          (t: SNMPv2TemplateFields | SNMPv3TemplateFields) =>
            t._id.equals(pollingStatusRow.snmpPollingTemplateId)
        )
        return template ? template.templateName : 'Unknown'
      },
    },
    {
      field: 'networkDevices',
      headerName: 'Network Devices',
      renderCell: (params: CellParams) => {
        const pollingStatusRow =
          params.row as unknown as ExtendedSNMPPollingStatusFields
        const devices = networkInventory.filter(
          (device: ExtendedCompanyNetworkInventoryFields) =>
            pollingStatusRow.networkInventoryIds?.includes(device._id) ?? false
        )
        return devices.map(device => device.macAddress).join(', ')
      },
    },
    {
      field: 'ipAddress',
      headerName: 'IP Address',
      renderCell: (params: CellParams) => {
        const pollingStatusRow =
          params.row as unknown as ExtendedSNMPPollingStatusFields
        const device = networkInventory.find(
          (device: ExtendedCompanyNetworkInventoryFields) =>
            pollingStatusRow.networkInventoryIds?.includes(device._id) ?? false
        )
        if (device) {
          const ipAddress = ipAddresses.find(
            (ip: ExtendedIPAddressFields) =>
              ip.networkInventoryId && ip.networkInventoryId.equals(device._id)
          )
          return ipAddress ? ipAddress.address : 'No IP Assigned'
        }
        return 'Unknown Device'
      },
    },
    {
      field: 'uptime',
      headerName: 'Uptime',
      renderCell: (params: CellParams) => {
        const pollingStatusRow =
          params.row as unknown as ExtendedSNMPPollingStatusFields
        return `${pollingStatusRow.uptime} seconds`
      },
    },
    {
      field: 'downtime',
      headerName: 'Downtime',
      renderCell: (params: CellParams) => {
        const pollingStatusRow =
          params.row as unknown as ExtendedSNMPPollingStatusFields
        return `${pollingStatusRow.downtime} seconds`
      },
    },
    { field: 'deviceStatus', headerName: 'Status' },
  ]

  // Handle row selection
  function handleSelectionChange(selectedIds: string[]): void {
    if (selectedIds.length > 0) {
      setSelectedRowId(selectedIds[0])
      const selectedRow = pollingStatuses.find(
        status => status._id.toString() === selectedIds[0]
      )
      if (selectedRow) {
        setSelectedStatus(selectedRow)
      }
    } else {
      setSelectedRowId(null)
      setSelectedStatus(null)
    }
  }

  // Refresh data on component mount
  useEffect(() => {
    refreshSNMPPollingStatusAtom()
    refreshSNMPv2PollingTemplateAtom()
    refreshSNMPv3PollingTemplateAtom()
    refreshSNMPv2TemplateAtom()
    refreshSNMPv3TemplateAtom()
    refreshNetworkInventoryAtom()
    refreshIPAddressAtom()
  }, [
    refreshSNMPPollingStatusAtom,
    refreshSNMPv2PollingTemplateAtom,
    refreshSNMPv3PollingTemplateAtom,
    refreshSNMPv2TemplateAtom,
    refreshSNMPv3TemplateAtom,
    refreshNetworkInventoryAtom,
    refreshIPAddressAtom,
  ])

  // Get polling statuses
  const pollingStatuses = getSNMPPollingStatuses()

  // Convert polling statuses to rows for the data grid
  const rows = useMemo(() => {
    return Array.isArray(pollingStatuses)
      ? pollingStatuses.map(status => ({
          ...status,
          _id: status._id.toString(), // Convert ObjectId to string for RowData compatibility
          id: status._id.toString(),
          snmpPollingTemplateId: status.snmpPollingTemplateId, // Keep as ObjectId for comparison
          networkInventoryIds: status.networkInventoryIds, // Keep array of ObjectIds for comparison
          uptime: status.uptime || 0,
          downtime: status.downtime || 0,
          deviceStatus: status.deviceStatus,
        }))
      : []
  }, [pollingStatuses])

  // Assemble DataGrid props
  const datagridProps = {
    columns,
    rows,
    onSelectionChange: handleSelectionChange,
  }

  return (
    <FormDataGrid
      title={`SNMP - ${viewTitle}`}
      description={description}
      datagrid={datagridProps}
    />
  )
}

export default DevicePolling
