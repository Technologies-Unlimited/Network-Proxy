import React from 'react'
import DataGrid, { DatagridProps } from '@/components/DataGrid'
import { columnconfig } from 'goobs-frontend'

const useDataGrid = (grid: {
  datagrid?: DatagridProps & { columnconfig?: Partial<columnconfig> }
}): columnconfig | null => {
  if (!grid.datagrid) return null

  const {
    columns,
    rows,
    buttons,
    dropdowns,
    searchbarProps,
    columnconfig: providedColumnConfig,
    apiRef,
    onRowClickCallback,
    ...restProps
  } = grid.datagrid

  const dataGridColumnConfig: columnconfig = {
    row: providedColumnConfig?.row ?? 1,
    column: providedColumnConfig?.column ?? 1,
    gridname: providedColumnConfig?.gridname,
    alignment: providedColumnConfig?.alignment ?? 'left',
    margintop: providedColumnConfig?.margintop,
    marginbottom: providedColumnConfig?.marginbottom,
    marginright: providedColumnConfig?.marginright,
    marginleft: providedColumnConfig?.marginleft,
    columnwidth: providedColumnConfig?.columnwidth ?? '100%',
    mobilewidth: providedColumnConfig?.mobilewidth,
    tabletwidth: providedColumnConfig?.tabletwidth,
    computerwidth: providedColumnConfig?.computerwidth,
    component: (
      <DataGrid
        columns={columns}
        rows={rows}
        buttons={buttons}
        dropdowns={dropdowns}
        searchbarProps={searchbarProps}
        apiRef={apiRef}
        onRowClickCallback={onRowClickCallback}
        {...restProps}
      />
    ),
    cellconfig: providedColumnConfig?.cellconfig ?? {
      border: 'none',
      mobilewidth: '100%',
      tabletwidth: '100%',
      computerwidth: '100%',
    },
  }

  return dataGridColumnConfig
}

export default useDataGrid
