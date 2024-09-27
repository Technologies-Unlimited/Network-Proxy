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

type TracerouteProps = {
  companyId: ObjectId
}

function Traceroute({ companyId }: TracerouteProps) {
  const { getPools, loading, error } = usePoolAtom(companyId)
  const [poolsData, setPoolsData] = useState<ExtendedPoolFields[]>([])
  const [tracerouteResults, setTracerouteResults] = useState<string[]>([])

  useEffect(() => {
    if (!loading && !error) {
      setPoolsData(getPools())
    }
  }, [loading, error, getPools])

  const viewTitle = 'Traceroute'
  const description =
    'Perform traceroute tests with pool subnet, max hops, IP address, and hostname'
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
          gridname: 'tracerouteGrid',
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
            gridname: 'tracerouteGrid',
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
            gridname: 'tracerouteGrid',
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
            gridname: 'tracerouteGrid',
            alignment: 'left',
            columnwidth: '50%',
          },
        },
      ],
      textfield: [
        {
          name: 'maxHops',
          label: 'Traceroute Max Hops',
          placeholder: '20',
          columnconfig: {
            row: 3,
            column: 2,
            margintop: 0.5,
            gridname: 'tracerouteGrid',
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
            gridname: 'tracerouteGrid',
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
            gridname: 'tracerouteGrid',
            alignment: 'left',
            columnwidth: '50%',
          },
        },
      ],
    },
  ]

  const renderContentGrid = {
    gridconfig: {
      gridname: 'tracerouteResultsGrid',
      gridwidth: '100%',
      alignment: 'left' as const,
    },
    typography: [
      {
        text: 'Tracing route to host.ip.local [192.168.0.3]',
        columnconfig: {
          row: 5,
          column: 1,
          margintop: 0.5,
          gridname: 'tracerouteResultsGrid',
          alignment: 'left',
          columnwidth: '100%',
        },
        fontcolor: 'black',
      },
      ...tracerouteResults.map((result, index) => ({
        text: result,
        columnconfig: {
          row: 6 + index,
          column: 1,
          margintop: 0.5,
          gridname: 'tracerouteResultsGrid',
          alignment: 'left',
          columnwidth: '100%',
        },
        fontcolor: 'black',
      })),
    ],
    button: [
      {
        type: 'submit',
        text: 'Start Traceroute',
        backgroundcolor: 'black',
        variant: 'contained',
        fontcolor: 'white',
        columnconfig: {
          row: 10,
          column: 1,
          margintop: 0.5,
          gridname: 'tracerouteResultsGrid',
          alignment: 'left',
          columnwidth: '50%',
        },
        onClick: () => {
          // Start Traceroute action
        },
      } as CustomButtonProps,
      {
        type: 'submit',
        text: 'Stop Traceroute',
        backgroundcolor: 'black',
        variant: 'contained',
        fontcolor: 'white',
        columnconfig: {
          row: 10,
          column: 2,
          margintop: 0.5,
          gridname: 'tracerouteResultsGrid',
          alignment: 'left',
          columnwidth: '50%',
        },
        onClick: () => {
          // Stop Traceroute action
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

export default Traceroute
