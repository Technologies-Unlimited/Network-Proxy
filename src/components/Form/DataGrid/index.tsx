'use client'
import React from 'react'
import { Box } from '@mui/material'
import ComplexContentSection from '@/components/Content'
import { ContentSection } from 'goobs-frontend'
import { DatagridProps } from '@/components/DataGrid'
import { useGridApiRef } from '@mui/x-data-grid-pro'

interface FormDataGridProps {
  title: string
  description: string
  datagrid: DatagridProps
}

function FormDataGrid({ title, description, datagrid }: FormDataGridProps) {
  const dataGridApiRef = useGridApiRef()

  const headerGrid = {
    grid: {
      gridconfig: {
        gridname: 'formHeader',
        marginbottom: 1,
        gridwidth: '100%',
      },
    },
    typography: [
      {
        text: title,
        fontvariant: 'merrih5' as const,
        fontcolor: 'black',
        columnconfig: {
          row: 1,
          column: 1,
          gridname: 'formHeader',
          columnwidth: '100%',
          alignment: 'left' as const,
          marginbottom: 0.5,
        },
      },
      {
        text: description,
        fontvariant: 'merriparagraph' as const,
        fontcolor: 'black',
        columnconfig: {
          row: 2,
          column: 1,
          gridname: 'formHeader',
          columnwidth: '100%',
          marginbottom: 0,
        },
      },
    ],
  }

  const dataGridGrid = {
    gridconfig: {
      gridname: 'dataGridForm',
      gridwidth: '100%',
    },
    datagrid: {
      ...datagrid,
      apiRef: dataGridApiRef,
      columnconfig: {
        row: 1,
        column: 1,
        gridname: 'dataGridForm',
        alignment: 'left' as const,
        columnwidth: '100%',
      },
    },
  }

  const headerGrids = [headerGrid]

  return (
    <Box>
      <ContentSection grids={headerGrids} />
      <ComplexContentSection grid={dataGridGrid} />
    </Box>
  )
}

export default FormDataGrid
