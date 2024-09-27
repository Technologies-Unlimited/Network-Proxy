'use client'
import React, { useEffect, useState, useCallback } from 'react'
import RenderContent from '@/components/Content'
import {
  ContentSection,
  ContentSectionProps,
  CustomButtonProps,
  DropdownProps,
} from 'goobs-frontend'
import { ObjectId } from 'mongodb'
import { GridColDef, GridRowModel } from '@mui/x-data-grid-pro'
import { usePoolAtom } from '@/apolloClient/network-administration/ipam/pool/atom'
import { ExtendedPoolFields } from '@/schema/network-administration/ipam/pool/schema'
import { DatagridProps } from '@/components/DataGrid'
import { SelectChangeEvent } from '@mui/material/Select'
import {
  startScan,
  stopScan,
  SnmpScanResult,
} from '@/utils/networking/snmp-scan'
import { useSubnetAtom } from '@/apolloClient/network-administration/ipam/subnet/atom'
import { useIPAddressAtom } from '@/apolloClient/network-administration/ipam/ipaddress/atom'
import { useNetworkInventoryAtom } from '@/apolloClient/network-administration/inventory/company/atom'
import { useSNMPv2Atom } from '@/apolloClient/network-administration/snmp/snmpv2/atom'
import { useSNMPv3Atom } from '@/apolloClient/network-administration/snmp/snmpv3/atom'
import { atom, useAtom } from 'jotai'
import { reverseDnsLookup } from '@/utils/networking/reverse-dns-lookup'
import { getArpTable } from '@/utils/networking/arp-lookup'
import { useOIDAtom } from '@/apolloClient/network-administration/snmp/oid/atom'

type DiscoverDevicesProps = {
  companyId: ObjectId
}

// Define the Jotai atom for storing MIB data
const mibDataAtom = atom<GridRowModel[]>([])

function DiscoverDevices({ companyId }: DiscoverDevicesProps) {
  const {
    getPools,
    loading: poolsLoading,
    error: poolsError,
  } = usePoolAtom(companyId)
  const { getSubnets } = useSubnetAtom(companyId)
  const { getIPAddresses } = useIPAddressAtom(companyId)
  const { getNetworkInventory } = useNetworkInventoryAtom(companyId)
  const { getSNMPv2Settings } = useSNMPv2Atom(companyId)
  const { getSNMPv3Settings } = useSNMPv3Atom(companyId)
  const { updateOID } = useOIDAtom(companyId)

  const [poolsData, setPoolsData] = useState<ExtendedPoolFields[]>([])
  const [discoveredDevices, setDiscoveredDevices] = useState<GridRowModel[]>([])
  const [mibData, setMibData] = useAtom(mibDataAtom)
  const [selectedPool, setSelectedPool] = useState<ExtendedPoolFields | null>(
    null
  )
  const [isScanning, setIsScanning] = useState(false)
  const [arpTable, setArpTable] = useState<{ [ip: string]: string }>({})

  useEffect(() => {
    if (!poolsLoading && !poolsError) {
      setPoolsData(getPools())
    }
  }, [poolsLoading, poolsError, getPools])

  useEffect(() => {
    const fetchArpTable = async () => {
      const table = await getArpTable()
      const arpMap = table.reduce(
        (acc, entry) => {
          acc[entry.ipAddress] = entry.macAddress
          return acc
        },
        {} as { [ip: string]: string }
      )
      setArpTable(arpMap)
    }
    fetchArpTable()
  }, [])

  const handlePoolChange = useCallback(
    (event: SelectChangeEvent<unknown>) => {
      const poolId = event.target.value as string
      const pool = poolsData.find(p => p._id.toString() === poolId)
      setSelectedPool(pool || null)
    },
    [poolsData]
  )

  const handleStartDiscovery = useCallback(async () => {
    if (!selectedPool) return

    setIsScanning(true)
    const subnet = getSubnets().find(
      s => s._id.toString() === selectedPool.subnetId.toString()
    )
    if (!subnet) {
      console.error('Subnet not found')
      setIsScanning(false)
      return
    }

    const ipAddresses = getIPAddresses()
    const networkInventory = getNetworkInventory()
    const snmpv2Settings = getSNMPv2Settings()
    const snmpv3Settings = getSNMPv3Settings()
    const snmpConfigs = [...snmpv2Settings, ...snmpv3Settings]

    try {
      const onProgress = async (result: SnmpScanResult) => {
        const hostname = await reverseDnsLookup(result.ipAddress)
        const macAddress = arpTable[result.ipAddress] || ''

        setDiscoveredDevices(prev => [
          ...prev,
          {
            id: `${result.ipAddress}`,
            hostname: hostname || '',
            ipAddress: result.ipAddress,
            macAddress,
          },
        ])

        setMibData(prev => [
          ...prev,
          ...Object.entries(result.oids).map(([oid, value]) => ({
            id: `${result.ipAddress}-${oid}`,
            oidName: '',
            oid,
            value,
          })),
        ])
      }

      await startScan(
        subnet,
        selectedPool,
        snmpConfigs,
        ipAddresses,
        networkInventory,
        onProgress
      )
    } catch (error) {
      console.error('Error during SNMP scan:', error)
    } finally {
      setIsScanning(false)
    }
  }, [
    selectedPool,
    getSubnets,
    getIPAddresses,
    getNetworkInventory,
    getSNMPv2Settings,
    getSNMPv3Settings,
    setMibData,
    arpTable,
  ])

  const handleStopDiscovery = useCallback(() => {
    stopScan()
    setIsScanning(false)
  }, [])

  const handleImportOIDs = useCallback(async () => {
    for (const oidData of mibData) {
      try {
        await updateOID(new ObjectId(), {
          oidName: oidData.oidName,
          oid: oidData.oid,
          description: oidData.value,
        })
      } catch (error) {
        console.error('Error importing OID:', error)
      }
    }
    console.log('OIDs imported successfully')
  }, [mibData, updateOID])

  const viewTitle = 'Discover Devices'
  const description =
    'Discover network devices and browse MIBs with pool subnet, IP address range start and end, hostname, IP address, and MAC address'

  const buttons: CustomButtonProps[] = [
    {
      text: 'Start Discovery',
      onClick: handleStartDiscovery,
      backgroundcolor: 'black',
      fontcolor: 'white',
      disabled: isScanning,
    },
    {
      text: 'Stop Discovery',
      onClick: handleStopDiscovery,
      backgroundcolor: 'black',
      fontcolor: 'white',
      disabled: !isScanning,
    },
    {
      text: 'Import OIDs',
      onClick: handleImportOIDs,
      backgroundcolor: 'black',
      fontcolor: 'white',
      disabled: mibData.length === 0,
    },
  ]

  const deviceColumns: GridColDef[] = [
    { field: 'hostname', headerName: 'Hostname', width: 180 },
    { field: 'ipAddress', headerName: 'IP Address', width: 180 },
    { field: 'macAddress', headerName: 'MAC Address', width: 180 },
  ]

  const mibColumns: GridColDef[] = [
    { field: 'oidName', headerName: 'OID Name', width: 180 },
    { field: 'oid', headerName: 'OID', width: 180 },
    { field: 'value', headerName: 'Value', width: 180 },
  ]

  const contentSectionGrids: ContentSectionProps['grids'] = [
    {
      grid: {
        gridconfig: {
          gridname: 'discoverDevicesGrid',
          gridwidth: '100%',
          alignment: 'left',
        },
      },
      typography: [
        {
          text: `Tools - ${viewTitle}`,
          fontvariant: 'interh3',
          fontcolor: 'black',
          columnconfig: {
            row: 1,
            column: 1,
            gridname: 'discoverDevicesGrid',
            columnwidth: '100%',
            alignment: 'left',
          },
        },
        {
          text: description,
          fontvariant: 'interparagraph',
          fontcolor: 'black',
          columnconfig: {
            row: 2,
            column: 1,
            margintop: 0.5,
            gridname: 'discoverDevicesGrid',
            columnwidth: '100%',
            alignment: 'left',
          },
        },
        {
          text: selectedPool
            ? `IP Range: ${selectedPool.startIp} - ${selectedPool.endIp}`
            : 'Select a pool to see IP range',
          fontvariant: 'interparagraph',
          fontcolor: 'black',
          columnconfig: {
            row: 4,
            column: 1,
            margintop: 0.5,
            gridname: 'discoverDevicesGrid',
            columnwidth: '100%',
            alignment: 'left',
          },
        },
      ],
      dropdown: [
        {
          name: 'poolSubnets',
          label: 'Available Pool Subnets',
          options: poolsData.map(pool => ({
            value: pool._id.toString(),
            attribute1: pool.name,
            attribute2: `${pool.startIp} - ${pool.endIp}`,
          })),
          outlinecolor: 'black',
          fontcolor: 'black',
          columnconfig: {
            row: 3,
            column: 1,
            margintop: 0.5,
            gridname: 'discoverDevicesGrid',
            columnwidth: '100%',
            alignment: 'left',
          },
          onChange: handlePoolChange,
        } as DropdownProps,
      ],
    },
  ]

  const renderContentGridDevices: {
    gridconfig: {
      gridname: string
      gridwidth: string
      alignment: 'left' | 'right' | 'center'
    }
    datagrid: DatagridProps
  } = {
    gridconfig: {
      gridname: 'discoverDevicesGrid',
      gridwidth: '100%',
      alignment: 'left',
    },
    datagrid: {
      columns: deviceColumns,
      rows: discoveredDevices,
      buttons,
      columnconfig: {
        row: 5,
        column: 1,
        gridname: 'discoverDevicesGrid',
        columnwidth: '100%',
        alignment: 'left',
        margintop: 0.5,
      },
    },
  }

  const renderContentGridMib: {
    gridconfig: {
      gridname: string
      gridwidth: string
      alignment: 'left' | 'right' | 'center'
    }
    datagrid: DatagridProps
  } = {
    gridconfig: {
      gridname: 'mibBrowserGrid',
      gridwidth: '100%',
      alignment: 'left',
    },
    datagrid: {
      columns: mibColumns,
      rows: mibData,
      buttons: [
        {
          text: 'Import OIDs',
          onClick: handleImportOIDs,
          backgroundcolor: 'black',
          fontcolor: 'white',
          disabled: mibData.length === 0,
        },
      ],
      columnconfig: {
        row: 6,
        column: 1,
        gridname: 'discoverDevicesGrid',
        columnwidth: '100%',
        alignment: 'left',
        margintop: 0.5,
      },
    },
  }

  if (poolsLoading) return <div>Loading...</div>
  if (poolsError) return <div>Error loading pools data</div>

  return (
    <>
      <ContentSection grids={contentSectionGrids} />
      <RenderContent grid={renderContentGridDevices} />
      <RenderContent grid={renderContentGridMib} />
    </>
  )
}

export default DiscoverDevices
