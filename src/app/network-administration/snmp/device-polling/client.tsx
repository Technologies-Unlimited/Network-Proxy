'use client'
import React, { useState, useCallback, useEffect, useMemo } from 'react'
import FormDataGrid from '@/components/Form/DataGrid'
import {
  GridColDef,
  GridRowParams,
  useGridApiRef,
  GridValueGetter,
} from '@mui/x-data-grid-pro'
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
import { DatagridProps } from '@/components/DataGrid'

interface DevicePollingProps {
  companyId: ObjectId
}

const DevicePolling: React.FC<DevicePollingProps> = ({ companyId }) => {
  const [, setSelectedStatus] =
    useState<ExtendedSNMPPollingStatusFields | null>(null)
  const apiRef = useGridApiRef()

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

  const pollingTemplates = useMemo(() => {
    const v2Templates = getSNMPv2PollingTemplates()
    const v3Templates = getSNMPv3PollingTemplates()
    return [
      ...(Array.isArray(v2Templates) ? v2Templates : []),
      ...(Array.isArray(v3Templates) ? v3Templates : []),
    ]
  }, [getSNMPv2PollingTemplates, getSNMPv3PollingTemplates])

  const snmpTemplates = useMemo(() => {
    const v2Templates = getSNMPv2Templates()
    const v3Templates = getSNMPv3Templates()
    return [
      ...(Array.isArray(v2Templates) ? v2Templates : []),
      ...(Array.isArray(v3Templates) ? v3Templates : []),
    ]
  }, [getSNMPv2Templates, getSNMPv3Templates])

  const networkInventory = useMemo(() => {
    return getNetworkInventory()
  }, [getNetworkInventory])

  const ipAddresses = useMemo(() => {
    return getIPAddresses()
  }, [getIPAddresses])

  const columns: GridColDef[] = [
    { field: '_id', headerName: 'ID', width: 220 },
    {
      field: 'snmpPollingTemplateName',
      headerName: 'SNMP Polling Template Name',
      width: 220,
      valueGetter: (({ row }) => {
        const template = pollingTemplates.find(
          (
            t:
              | ExtendedSNMPv2PollingTemplateFields
              | ExtendedSNMPv3PollingTemplateFields
          ) =>
            t._id.equals(
              (row as ExtendedSNMPPollingStatusFields).snmpPollingTemplateId
            )
        )
        return template ? template.name : 'Unknown'
      }) as GridValueGetter<ExtendedSNMPPollingStatusFields, string>,
    },
    {
      field: 'snmpTemplateName',
      headerName: 'SNMP Template Name',
      width: 220,
      valueGetter: (({ row }) => {
        const template = snmpTemplates.find(
          (t: SNMPv2TemplateFields | SNMPv3TemplateFields) =>
            t._id.equals(
              (row as ExtendedSNMPPollingStatusFields).snmpPollingTemplateId
            )
        )
        return template ? template.templateName : 'Unknown'
      }) as GridValueGetter<ExtendedSNMPPollingStatusFields, string>,
    },
    {
      field: 'networkDevices',
      headerName: 'Network Devices',
      width: 300,
      valueGetter: (({ row }) => {
        const devices = networkInventory.filter(
          (device: ExtendedCompanyNetworkInventoryFields) =>
            (
              row as ExtendedSNMPPollingStatusFields
            ).networkInventoryIds?.includes(device._id) ?? false
        )
        return devices.map(device => device.macAddress).join(', ')
      }) as GridValueGetter<ExtendedSNMPPollingStatusFields, string>,
    },
    {
      field: 'ipAddress',
      headerName: 'IP Address',
      width: 200,
      valueGetter: (({ row }) => {
        const device = networkInventory.find(
          (device: ExtendedCompanyNetworkInventoryFields) =>
            (
              row as ExtendedSNMPPollingStatusFields
            ).networkInventoryIds?.includes(device._id) ?? false
        )
        if (device) {
          const ipAddress = ipAddresses.find(
            (ip: ExtendedIPAddressFields) =>
              ip.networkInventoryId && ip.networkInventoryId.equals(device._id)
          )
          return ipAddress ? ipAddress.address : 'No IP Assigned'
        }
        return 'Unknown Device'
      }) as GridValueGetter<ExtendedSNMPPollingStatusFields, string>,
    },
    {
      field: 'uptime',
      headerName: 'Uptime',
      width: 130,
      valueGetter: (({ row }) => {
        return `${(row as ExtendedSNMPPollingStatusFields).uptime} seconds`
      }) as GridValueGetter<ExtendedSNMPPollingStatusFields, string>,
    },
    {
      field: 'downtime',
      headerName: 'Downtime',
      width: 130,
      valueGetter: (({ row }) => {
        return `${(row as ExtendedSNMPPollingStatusFields).downtime} seconds`
      }) as GridValueGetter<ExtendedSNMPPollingStatusFields, string>,
    },
    { field: 'deviceStatus', headerName: 'Status', width: 130 },
  ]

  const handleRowClick = useCallback((params: GridRowParams) => {
    setSelectedStatus(params.row as ExtendedSNMPPollingStatusFields)
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

  const pollingStatuses = getSNMPPollingStatuses()

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
      title={`SNMP - ${viewTitle}`}
      description={description}
      datagrid={datagrid}
    />
  )
}

export default DevicePolling
