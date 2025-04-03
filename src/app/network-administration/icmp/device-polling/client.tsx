'use client'
import React, { useState, useEffect, useMemo } from 'react'
import { FormDataGrid } from 'goobs-frontend'
import type { ColumnDef, RowData } from 'goobs-frontend'
import { useICMPPollingStatusAtom } from '@/apolloClient/network-administration/icmp/polling/status/atom'
import { useICMPPollingTemplateAtom } from '@/apolloClient/network-administration/icmp/polling/template/atom'
import { ExtendedICMPPollingStatusFields } from '@/schema/network-administration/icmp/polling/status/schema'
import { ExtendedICMPPollingTemplateFields } from '@/schema/network-administration/icmp/polling/template/schema'
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
    useState<ExtendedICMPPollingStatusFields | null>(null)
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null)

  const { getICMPPollingStatuses, refreshICMPPollingStatusAtom } =
    useICMPPollingStatusAtom(companyId)
  const { getICMPPollingTemplates } = useICMPPollingTemplateAtom(companyId)

  const viewTitle = 'Device Polling Status'
  const description =
    'View ICMP device polling status with uptime, downtime, and device status'

  // Get all polling templates
  const pollingTemplates = useMemo(() => {
    const templates = getICMPPollingTemplates()
    return Array.isArray(templates) ? templates : []
  }, [getICMPPollingTemplates])

  // Define columns for the data grid
  const columns: ColumnDef[] = [
    { field: '_id', headerName: 'ID' },
    {
      field: 'icmpPollingTemplateId',
      headerName: 'Template Name',
      renderCell: (params: CellParams) => {
        const templateId = params.row.icmpPollingTemplateId as ObjectId
        const template = pollingTemplates.find(
          (t: ExtendedICMPPollingTemplateFields) => t._id.equals(templateId)
        )
        return template ? template.name : 'Unknown'
      },
    },
    {
      field: 'uptime',
      headerName: 'Uptime',
      renderCell: (params: CellParams) =>
        `${params.row.uptime as number} seconds`,
    },
    {
      field: 'downtime',
      headerName: 'Downtime',
      renderCell: (params: CellParams) =>
        `${params.row.downtime as number} seconds`,
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

  // Refresh polling status on component mount
  useEffect(() => {
    refreshICMPPollingStatusAtom()
  }, [refreshICMPPollingStatusAtom])

  // Get polling statuses
  const pollingStatuses = getICMPPollingStatuses()

  // Convert polling statuses to rows for the data grid
  const rows = useMemo(() => {
    return Array.isArray(pollingStatuses)
      ? pollingStatuses.map(status => ({
          ...status,
          _id: status._id.toString(), // Convert ObjectId to string for RowData compatibility
          id: status._id.toString(),
          icmpPollingTemplateId: status.icmpPollingTemplateId, // Keep as ObjectId for comparison
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
      title={`ICMP - ${viewTitle}`}
      description={description}
      datagrid={datagridProps}
    />
  )
}

export default DevicePolling
