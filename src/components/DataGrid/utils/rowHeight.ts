import { useEffect, useState } from 'react'
import { GridRowModel, GridPaginationModel } from '@mui/x-data-grid-pro'

export const calculateDataGridHeight = (
  rows: GridRowModel[],
  paginationModel: GridPaginationModel,
  headerHeight: number,
  rowHeight: number
) => {
  const totalRows = Math.min(rows.length, paginationModel.pageSize)
  const contentHeight = headerHeight + totalRows * rowHeight
  const footerHeight = 80 // Updated height of the footer
  const toolbarHeight = 64 // Approximate height of the toolbar
  return contentHeight + footerHeight + toolbarHeight
}

export const useDataGridHeight = (
  rows: GridRowModel[],
  paginationModel: GridPaginationModel,
  headerHeight: number,
  rowHeight: number
) => {
  const [dataGridHeight, setDataGridHeight] = useState(400) // Default height

  useEffect(() => {
    setDataGridHeight(
      calculateDataGridHeight(rows, paginationModel, headerHeight, rowHeight)
    )
  }, [rows, paginationModel, headerHeight, rowHeight])

  return dataGridHeight
}
