import { Theme } from '@mui/material/styles'

export const getDataGridStyles = (theme: Theme) => ({
  height: '100%',
  width: '100%',
  overflow: 'hidden',
  '& .MuiDataGrid-root': {
    backgroundColor: theme.palette.woad.main,
    borderColor: `${theme.palette.woad.main} !important`,
  },
  '& .MuiDataGrid-main': {
    backgroundColor: theme.palette.woad.main,
    overflow: 'hidden',
    borderColor: `${theme.palette.woad.main} !important`,
  },
  '& .MuiDataGrid-columnHeaders': {
    border: 'none',
    color: theme.palette.common.black,
    backgroundColor: theme.palette.woad.main,
    borderColor: `${theme.palette.woad.main} !important`,
  },
  '& .MuiDataGrid-columnHeader': {
    display: 'flex',
    border: 'none',
    alignItems: 'center',
    borderColor: `${theme.palette.woad.main} !important`,
    backgroundColor: theme.palette.woad.main,
  },
  '& .MuiDataGrid-columnHeaderTitle': {
    fontFamily: 'Merriweather',
    border: 'none',
    fontSize: '1rem',
    fontWeight: 400,
    height: '50px !important',
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'transparent',
    color: 'white',
    whiteSpace: 'normal',
    wordWrap: 'break-word',
    borderColor: `${theme.palette.woad.main} !important`,
    lineHeight: 'normal',
  },
  '& .super-app-theme--header': {
    backgroundColor: theme.palette.woad.main,
    borderColor: `${theme.palette.woad.main} !important`,
  },
  '& .MuiDataGrid-withBorderColor': {
    border: 'none',
    borderColor: `${theme.palette.woad.main} !important`,
  },
  '& .MuiDataGrid-cell--editing ': {
    backgroundColor: 'transparent !important',
    boxShadow: 'none !important',
  },
  '& .MuiDataGrid-columnSeparator': {
    pr: '1px',
    color: '#000',
  },
  '& .MuiTablePagination-selectLabel': {
    fontFamily: 'Merriweather',
  },
  '& .MuiTablePagination-select': {
    fontFamily: 'Merriweather',
  },
  '& .MuiTablePagination-displayedRows': {
    fontFamily: 'Merriweather',
  },
  '& .MuiDataGrid-virtualScroller': {
    backgroundColor: theme.palette.woad.main,
  },
  '& .MuiCheckbox-root': {
    color: 'white',
  },
  '& .MuiDataGrid-columnHeaderCheckbox': {
    backgroundColor: theme.palette.woad.main,
  },
  '& .MuiDataGrid-filler': {
    backgroundColor: theme.palette.woad.main,
  },
  '& .MuiDataGrid-virtualScrollerRenderZone': {
    '& > div': {
      backgroundColor: `${theme.palette.woad.main} !important`,
    },
  },
  '& .MuiDataGrid-virtualScrollerContent': {
    width: '100% !important',
  },
  '& .MuiDataGrid-row': {
    borderColor: `${theme.palette.woad.main} !important`,
  },
  '& .MuiDataGrid-columnHeaderRow': {
    borderColor: `${theme.palette.woad.main} !important`,
  },
})
