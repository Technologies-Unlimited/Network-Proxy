import {
  GridApiPro,
  GridRowParams,
  GridRowSelectionModel,
  GridRowId,
  GridRowModel,
} from '@mui/x-data-grid-pro'
import React from 'react'

export const handleRowClick = (
  params: GridRowParams,
  apiRef: React.MutableRefObject<GridApiPro>,
  onRowClickCallback?: (params: GridRowParams) => void
) => {
  console.log('Row clicked. Detailed information:')
  console.log('Row ID:', params.id)
  console.log('Row data:', params.row)

  const rowIndex = apiRef.current.getRowIndexRelativeToVisibleRows(params.id)
  const isSelected = apiRef.current.isRowSelected(params.id)

  console.log('Row index:', rowIndex)
  console.log('Is row selected:', isSelected)
  console.log('All columns:', params.columns)
  console.log('All rows:', apiRef.current.getRowModels())
  console.log('Selected rows:', apiRef.current.getSelectedRows())

  // Call the callback function if provided
  if (onRowClickCallback) {
    onRowClickCallback(params)
  }
}

export const handleSelectionModelChange = (
  newSelectionModel: GridRowSelectionModel,
  rows: GridRowModel[],
  setSelectionModel: (model: GridRowSelectionModel) => void
) => {
  setSelectionModel(newSelectionModel)
  console.log('Selection changed. Selected IDs:', newSelectionModel)
  newSelectionModel.forEach((id: GridRowId) => {
    const selectedRow = rows.find(row => row._id === id)
    if (selectedRow) {
      console.log('Selected row data:', selectedRow)
    }
  })
}
