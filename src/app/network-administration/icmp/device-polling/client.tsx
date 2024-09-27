'use client'
import React, { useState, useCallback, useEffect, useMemo } from 'react'
import FormDataGrid from '@/components/Form/DataGrid'
import {
  GridColDef,
  GridRowParams,
  useGridApiRef,
  GridValueGetter,
} from '@mui/x-data-grid-pro'
import { useICMPPollingStatusAtom } from '@/apolloClient/network-administration/icmp/polling/status/atom'
import { useICMPPollingTemplateAtom } from '@/apolloClient/network-administration/icmp/polling/template/atom'
import { ExtendedICMPPollingStatusFields } from '@/schema/network-administration/icmp/polling/status/schema'
import { ExtendedICMPPollingTemplateFields } from '@/schema/network-administration/icmp/polling/template/schema'
import { ObjectId } from 'mongodb'
import { DatagridProps } from '@/components/DataGrid'

interface DevicePollingProps {
  companyId: ObjectId
}

const DevicePolling: React.FC<DevicePollingProps> = ({ companyId }) => {
  const [, setSelectedStatus] =
    useState<ExtendedICMPPollingStatusFields | null>(null)
  const apiRef = useGridApiRef()

  const { getICMPPollingStatuses, refreshICMPPollingStatusAtom } =
    useICMPPollingStatusAtom(companyId)
  const { getICMPPollingTemplates } = useICMPPollingTemplateAtom(companyId)

  const viewTitle = 'Device Polling Status'
  const description =
    'View ICMP device polling status with uptime, downtime, and device status'

  const pollingTemplates = useMemo(() => {
    const templates = getICMPPollingTemplates()
    return Array.isArray(templates) ? templates : []
  }, [getICMPPollingTemplates])

  const columns: GridColDef[] = [
    { field: '_id', headerName: 'ID', width: 220 },
    {
      field: 'icmpPollingTemplateId',
      headerName: 'Template Name',
      width: 220,
      valueGetter: ((value, row) => {
        const template = pollingTemplates.find(
          (t: ExtendedICMPPollingTemplateFields) =>
            t._id.equals(row.icmpPollingTemplateId)
        )
        return template ? template.name : 'Unknown'
      }) as GridValueGetter<ExtendedICMPPollingStatusFields, string>,
    },
    {
      field: 'uptime',
      headerName: 'Uptime',
      width: 130,
      valueGetter: ((value, row) => {
        return `${row.uptime} seconds`
      }) as GridValueGetter<ExtendedICMPPollingStatusFields, string>,
    },
    {
      field: 'downtime',
      headerName: 'Downtime',
      width: 130,
      valueGetter: ((value, row) => {
        return `${row.downtime} seconds`
      }) as GridValueGetter<ExtendedICMPPollingStatusFields, string>,
    },
    { field: 'deviceStatus', headerName: 'Status', width: 130 },
  ]

  const handleRowClick = useCallback((params: GridRowParams) => {
    setSelectedStatus(params.row as ExtendedICMPPollingStatusFields)
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

  useEffect(() => {
    refreshICMPPollingStatusAtom()
  }, [refreshICMPPollingStatusAtom])

  const pollingStatuses = getICMPPollingStatuses()

  const rows = useMemo(() => {
    return Array.isArray(pollingStatuses)
      ? pollingStatuses.map(status => ({
          ...status,
          id: status._id.toString(),
        }))
      : []
  }, [pollingStatuses])

  const datagrid: DatagridProps = {
    columns: columns,
    rows: rows,
    apiRef: apiRef,
  }

  return (
    <FormDataGrid
      title={`ICMP - ${viewTitle}`}
      description={description}
      datagrid={datagrid}
    />
  )
}

export default DevicePolling
