'use client'
import React, { useEffect, useState, useMemo, useCallback } from 'react'
import {
  DataGridPro,
  GridCellModesModel,
  useGridApiRef,
  GridColDef,
  GridApiPro,
  GridRowModel,
  GridRowParams,
  GridPaginationModel,
  GridRowSelectionModel,
  GridFooterContainerProps,
  GridToolbarProps,
} from '@mui/x-data-grid-pro'
import CustomFooter from './Footer'
import { CustomToolbar, CustomButtonProps, columnconfig } from 'goobs-frontend'
import { generateRandomData } from '@/components/DataGrid/utils/randomDataGenerator'
import { useTheme } from '@mui/material/styles'
import { getDataGridStyles } from './styles/dataGrid'
import { useDataGridHeight } from './utils/rowHeight'
import { handleRowClick, handleSelectionModelChange } from './utils/rowClick'
import { DropdownProps, SearchbarProps } from 'goobs-frontend'

export interface DatagridProps {
  columns: GridColDef[]
  rows: GridRowModel[]
  columnconfig?: columnconfig
  buttons?: CustomButtonProps[]
  dropdowns?: Omit<DropdownProps, 'onChange'>[]
  searchbarProps?: Omit<SearchbarProps, 'onChange' | 'value'>
  apiRef?: React.MutableRefObject<GridApiPro>
  onRowClickCallback?: (params: GridRowParams) => void
  onRefresh?: () => void
  loading?: boolean
}

const DataGrid = React.memo(
  ({
    columns,
    rows: providedRows,
    buttons,
    dropdowns,
    searchbarProps,
    apiRef: externalApiRef,
    onRowClickCallback,
    onRefresh,
    loading = false,
  }: DatagridProps) => {
    const [rows, setRows] = useState(providedRows || [])
    const [cellModesModel, setCellModesModel] = useState<GridCellModesModel>({})
    const [paginationModel, setPaginationModel] = useState<GridPaginationModel>(
      {
        pageSize: 10,
        page: 0,
      }
    )
    const [selectionModel, setSelectionModel] = useState<GridRowSelectionModel>(
      []
    )
    const internalApiRef = useGridApiRef()
    const apiRef = externalApiRef || internalApiRef
    const theme = useTheme()

    const rowHeight = 40
    const headerHeight = 50

    const dataGridHeight = useDataGridHeight(
      rows,
      paginationModel,
      headerHeight,
      rowHeight
    )

    useEffect(() => {
      if (
        apiRef.current &&
        (!providedRows || providedRows.length === 0) &&
        !loading
      ) {
        setRows(generateRandomData(columns, 100)) // Generate rows if not provided and not loading
      }
    }, [apiRef, columns, providedRows, loading])

    useEffect(() => {
      if (!loading) {
        setRows(providedRows || [])
      }
    }, [providedRows, loading])

    const handleCellModesModelChange = useCallback(
      (newModel: GridCellModesModel) => {
        setCellModesModel(newModel)
      },
      []
    )

    const updatedColumns = useMemo(
      () =>
        columns.map(column => ({
          ...column,
          flex: 1,
          minWidth: 150,
          headerName: column.headerName || '',
        })),
      [columns]
    )

    const CustomFooterComponent = useCallback(
      (props: GridFooterContainerProps) => (
        <CustomFooter {...props} onRefresh={onRefresh} />
      ),
      [onRefresh]
    )

    const CustomToolbarComponent = useCallback(
      (props: GridToolbarProps) => (
        <CustomToolbar
          {...props}
          buttons={buttons}
          dropdowns={dropdowns}
          searchbarProps={searchbarProps}
        />
      ),
      [buttons, dropdowns, searchbarProps]
    )

    const memoizedDataGridProps = useMemo(
      () => ({
        apiRef,
        checkboxSelection: true,
        className: 'datagrid',
        disableRowSelectionOnClick: false,
        disableColumnMenu: true,
        rowHeight,
        checkboxSelectionVisibleOnly: true,
        pagination: true,
        paginationModel,
        onPaginationModelChange: setPaginationModel,
        pageSizeOptions: [10, 25, 50, 100],
        columns: updatedColumns,
        rows,
        cellModesModel,
        onCellModesModelChange: handleCellModesModelChange,
        editMode: 'cell' as const,
        slots: {
          toolbar: CustomToolbarComponent,
          footer: CustomFooterComponent,
        },
        slotProps: {
          baseCheckbox: { color: 'marine' as const },
        },
        onRowClick: (params: GridRowParams) =>
          handleRowClick(params, apiRef, onRowClickCallback),
        rowSelectionModel: selectionModel,
        onRowSelectionModelChange: (newSelectionModel: GridRowSelectionModel) =>
          handleSelectionModelChange(
            newSelectionModel,
            rows,
            setSelectionModel
          ),
        loading,
      }),
      [
        apiRef,
        rowHeight,
        paginationModel,
        updatedColumns,
        rows,
        cellModesModel,
        handleCellModesModelChange,
        onRowClickCallback,
        selectionModel,
        CustomToolbarComponent,
        CustomFooterComponent,
        loading,
      ]
    )

    const dataGridStyles = getDataGridStyles(theme)

    return (
      <div
        style={{
          height: `${dataGridHeight}px`,
          width: '100%',
          overflow: 'hidden',
        }}
      >
        <DataGridPro {...memoizedDataGridProps} sx={dataGridStyles} />
      </div>
    )
  }
)

DataGrid.displayName = 'DataGrid'

export default DataGrid
