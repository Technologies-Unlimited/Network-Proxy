'use client'

import React, { useState } from 'react'
import { Box, Typography, Popover, IconButton } from '@mui/material'
import { CustomButton, Searchbar } from 'goobs-frontend'
import Checkbox from '@/components/DataGrid/Checkbox'
import ShowHideEyeIcon from '@/components/Icons/ShowHideEye'
import { useManageColumn } from '@/hooks/datagrid/useManageColumn'
import { GridApiPro } from '@mui/x-data-grid-pro'
import { useTheme } from '@mui/material/styles'

interface ManageColumnProps {
  open?: boolean
  handleClose?: () => void
  apiRef?: React.MutableRefObject<GridApiPro>
}

function ManageColumns({
  open = false,
  handleClose = () => {},
  apiRef,
}: ManageColumnProps) {
  const [searchValue, setSearchValue] = useState('')
  const [dataGridColumnVisibility] = useState<{ [key: string]: boolean }>({})
  const theme = useTheme()

  const {
    handleAllCols,
    toggleColumnState,
    onSaveColumnView,
    visibleColumns: localVisibleColumns,
    formatColumnName,
  } = useManageColumn(
    apiRef?.current ?? ({} as GridApiPro),
    apiRef?.current?.getAllColumns() ?? [],
    handleClose,
    open
  )

  const handleCloseAndUpdate = () => {
    handleClose?.()
    setSearchValue('')
  }

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.target.value)
  }

  if (!apiRef || !apiRef.current) {
    return <div>Loading...</div>
  }

  return (
    <Popover
      id="manage-columns-popover"
      open={Boolean(open)}
      onClose={handleCloseAndUpdate}
      anchorOrigin={{
        vertical: 'center',
        horizontal: 'center',
      }}
      transformOrigin={{
        vertical: 'center',
        horizontal: 'center',
      }}
      sx={{
        '& .MuiPaper-root': {
          border: `1px solid ${theme.palette.black.main}`,
          borderRadius: 2,
          minWidth: '250px',
          boxShadow: 24,
        },
      }}
    >
      <Box
        sx={{
          p: 2,
          bgcolor: theme.palette.background.paper,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Typography variant="h6" align="center" sx={{ mb: 0 }}>
          Manage Columns
        </Typography>
        <Box sx={{ mt: 1, mb: 0 }}>
          <Searchbar
            value={searchValue}
            onChange={handleSearchChange}
            placeholder="Search Columns"
            iconcolor={theme.palette.black.main}
            outlinecolor={theme.palette.black.main}
          />
        </Box>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            mt: 0,
            mb: 0,
            justifyContent: 'space-between',
          }}
        >
          <Typography sx={{ fontWeight: 'bold' }}>All Columns</Typography>
          <Box sx={{ marginRight: '-4px' }}>
            <Checkbox
              checked={Object.values(dataGridColumnVisibility).every(
                value => value
              )}
              indeterminate={
                Object.values(dataGridColumnVisibility).some(value => value) &&
                !Object.values(dataGridColumnVisibility).every(value => value)
              }
              onChange={handleAllCols}
            />
          </Box>
        </Box>
        <Box
          sx={{ maxHeight: '160px', overflowY: 'auto', marginBottom: '10px' }}
        >
          {Object.entries(localVisibleColumns)
            .filter(
              ([columnName, visible]) => columnName !== '__check__' && visible
            )
            .map(([columnName], index) => (
              <Box
                key={index}
                sx={{ display: 'flex', alignItems: 'center', mb: 1 }}
              >
                <Typography sx={{ flexGrow: 1, mr: 1 }}>
                  {formatColumnName(columnName)}
                </Typography>
                <IconButton
                  onClick={() => toggleColumnState(columnName)}
                  size="small"
                >
                  <ShowHideEyeIcon
                    visible={dataGridColumnVisibility[columnName] ?? false}
                  />
                </IconButton>
              </Box>
            ))}
        </Box>
        <CustomButton
          text="Save"
          backgroundcolor={theme.palette.black.main}
          variant="contained"
          fontcolor={theme.palette.white.main}
          sx={{ mt: 0 }}
          fullWidth
          onClick={() => onSaveColumnView(handleClose)}
        />
      </Box>
    </Popover>
  )
}

export default ManageColumns
