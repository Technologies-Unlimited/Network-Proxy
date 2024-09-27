'use client'
import React from 'react'
import { CustomGrid, gridconfig } from 'goobs-frontend'
import { columnconfig } from 'goobs-frontend'
import useDataGrid from '@/components/Content/Structure/datagrid/useDataGrid'
import { DatagridProps } from '@/components/DataGrid'

interface Grid {
  datagrid?: DatagridProps & { columnconfig?: Partial<columnconfig> }
  gridconfig?: gridconfig
}

interface RenderContentProps {
  grid: Grid
}

const RenderContent: React.FC<RenderContentProps> = ({ grid }) => {
  const columnConfigs: columnconfig[] = []

  const dataGrid = useDataGrid({ datagrid: grid.datagrid })
  if (dataGrid) {
    columnConfigs.push(dataGrid)
  }

  return (
    <CustomGrid gridconfig={grid.gridconfig} columnconfig={columnConfigs} />
  )
}

export default RenderContent
