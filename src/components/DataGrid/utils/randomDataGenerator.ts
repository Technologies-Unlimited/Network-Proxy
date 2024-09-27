import { GridColDef } from '@mui/x-data-grid-pro'

type ColumnValue = number | string | boolean | Date

type RandomRowData = Record<string, ColumnValue>

export const generateRandomData = (
  columns: GridColDef[],
  rowCount: number = 10
): RandomRowData[] => {
  const randomRowData: RandomRowData[] = []
  for (let i = 0; i < rowCount; i++) {
    const rowData: RandomRowData = { id: i }
    columns.forEach(column => {
      switch (column.type) {
        case 'number':
          rowData[column.field] = Math.floor(Math.random() * 100)
          break
        case 'date':
          rowData[column.field] = new Date(
            +new Date() - Math.floor(Math.random() * 10000000000)
          ).toISOString()
          break
        case 'boolean':
          rowData[column.field] = Math.random() < 0.5
          break
        default:
          rowData[column.field] = `Random Value ${i + 1}`
      }
    })
    randomRowData.push(rowData)
  }
  return randomRowData
}
