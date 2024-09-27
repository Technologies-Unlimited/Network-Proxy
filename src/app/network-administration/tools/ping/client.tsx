'use client'
import React, { useEffect, useState } from 'react'
import RenderContent from '@/components/Content'
import {
  ContentSection,
  ContentSectionProps,
  CustomButtonProps,
  DropdownProps,
} from 'goobs-frontend'
import { ObjectId } from 'mongodb'
import { usePoolAtom } from '@/apolloClient/network-administration/ipam/pool/atom'
import { ExtendedPoolFields } from '@/schema/network-administration/ipam/pool/schema'

type PingProps = {
  companyId: ObjectId
}

function Ping({ companyId }: PingProps) {
  const { getPools, loading, error } = usePoolAtom(companyId)
  const [poolsData, setPoolsData] = useState<ExtendedPoolFields[]>([])
  const [pingResults, setPingResults] = useState<string[]>([])

  useEffect(() => {
    if (!loading && !error) {
      setPoolsData(getPools())
    }
  }, [loading, error, getPools])

  const viewTitle = 'Ping'
  const description =
    'Perform ping tests with pool subnet, ping duration, IP address, and hostname'
  const subnavTitle = 'Tools'

  const poolSubnets = poolsData.map(pool => ({
    poolName: pool.name,
    poolStart: pool.startIp,
    poolEnd: pool.endIp,
  }))

  const contentSectionGrids: ContentSectionProps['grids'] = [
    {
      grid: {
        gridconfig: {
          gridname: 'pingGrid',
          alignment: 'left',
          gridwidth: '100%',
        },
      },
      typography: [
        {
          text: `${subnavTitle} - ${viewTitle}`,
          fontvariant: 'interh3',
          fontcolor: 'black',
          columnconfig: {
            row: 1,
            column: 1,
            gridname: 'pingGrid',
            alignment: 'left',
            columnwidth: '100%',
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
            gridname: 'pingGrid',
            alignment: 'left',
            columnwidth: '100%',
          },
        },
      ],
      dropdown: [
        {
          name: 'poolSubnets',
          label: 'Available Pool Subnets',
          options: poolSubnets.map(subnet => ({ value: subnet.poolName })),
          outlinecolor: 'black',
          fontcolor: 'black',
          columnconfig: {
            row: 3,
            column: 1,
            margintop: 0.5,
            gridname: 'pingGrid',
            alignment: 'left',
            columnwidth: '50%',
          },
        },
      ],
      textfield: [
        {
          name: 'pingDuration',
          label: 'Ping Duration (seconds)',
          placeholder: '5',
          columnconfig: {
            row: 3,
            column: 2,
            margintop: 0.5,
            gridname: 'pingGrid',
            alignment: 'left',
            columnwidth: '50%',
          },
        },
        {
          name: 'ipAddress',
          label: 'IP Address',
          placeholder: '192.168.0.3',
          columnconfig: {
            row: 4,
            column: 1,
            margintop: 0.5,
            gridname: 'pingGrid',
            alignment: 'left',
            columnwidth: '50%',
          },
        },
        {
          name: 'hostname',
          label: 'Hostname',
          placeholder: 'host.ip.local',
          columnconfig: {
            row: 4,
            column: 2,
            margintop: 0.5,
            gridname: 'pingGrid',
            alignment: 'left',
            columnwidth: '50%',
          },
        },
      ],
    },
  ]

  const renderContentGrid = {
    gridconfig: {
      gridname: 'pingResultsGrid',
      gridwidth: '100%',
      alignment: 'left' as const,
    },
    typography: [
      {
        text: 'Pinging xxx.xxx.xxx.xxx with 32 bytes of data',
        columnconfig: {
          row: 5,
          column: 1,
          margintop: 0.5,
          gridname: 'pingResultsGrid',
          alignment: 'left',
          columnwidth: '100%',
        },
        fontcolor: 'black',
      },
      ...pingResults.map((result, index) => ({
        text: result,
        columnconfig: {
          row: 6 + index,
          column: 1,
          margintop: 0.5,
          gridname: 'pingResultsGrid',
          alignment: 'left',
          columnwidth: '100%',
        },
        fontcolor: 'black',
      })),
    ],
    button: [
      {
        type: 'submit',
        text: 'Ping IP Address',
        backgroundcolor: 'black',
        variant: 'contained',
        fontcolor: 'white',
        columnconfig: {
          row: 10,
          column: 1,
          margintop: 0.5,
          gridname: 'pingResultsGrid',
          alignment: 'left',
          columnwidth: '50%',
        },
        onClick: () => {
          // Ping IP Address action
        },
      } as CustomButtonProps,
      {
        type: 'submit',
        text: 'Stop Ping on IP Address',
        backgroundcolor: 'black',
        variant: 'contained',
        fontcolor: 'white',
        columnconfig: {
          row: 10,
          column: 2,
          margintop: 0.5,
          gridname: 'pingResultsGrid',
          alignment: 'left',
          columnwidth: '50%',
        },
        onClick: () => {
          // Stop Ping on IP Address action
        },
      } as CustomButtonProps,
    ],
  }

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error loading pools data</div>

  return (
    <>
      <ContentSection grids={contentSectionGrids} />
      <RenderContent grid={renderContentGrid} />
    </>
  )
}

export default Ping
