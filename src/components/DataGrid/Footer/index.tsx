'use client'

import React, { useEffect, useState } from 'react'
import { RefreshRounded, RemoveRedEyeRounded } from '@mui/icons-material'
import { Box } from '@mui/material'
import {
  gridPageCountSelector,
  useGridApiContext,
  useGridSelector,
  GridFooterContainer,
  GridPagination,
  GridFooterContainerProps,
} from '@mui/x-data-grid-pro'
import { CustomButton } from 'goobs-frontend'
import ManageColumn from '@/components/DataGrid/ManageColumn'
import { VerticalDivider } from '../VerticalDivider'
import { usePopup } from '@/hooks/usePopup'
import MuiPagination from '@mui/material/Pagination'

interface PaginationProps {
  page: number
  onPageChange: (
    event: React.MouseEvent<HTMLButtonElement, MouseEvent>,
    page: number
  ) => void
  className?: string
}

function Pagination({ page, onPageChange, className }: PaginationProps) {
  const apiRef = useGridApiContext()
  const pageCount = useGridSelector(apiRef, gridPageCountSelector)
  return (
    <MuiPagination
      color="primary"
      className={className}
      count={pageCount}
      page={page + 1}
      onChange={(event, newPage) => {
        onPageChange(event as React.MouseEvent<HTMLButtonElement>, newPage - 1)
      }}
    />
  )
}

export interface CustomFooterProps extends GridFooterContainerProps {
  onRefresh?: () => void
}

function CustomFooter({ onRefresh, ...props }: CustomFooterProps) {
  const { isOpen, handleOpen, handleClose } = usePopup()
  const [footerWidth, setFooterWidth] = useState('100%')
  const gridApiRef = useGridApiContext()
  const [checkboxWidth] = useState(45) // Local state for checkbox width
  const [isCollapsed, setIsCollapsed] = useState(false)

  useEffect(() => {
    const updateFooterWidth = () => {
      if (gridApiRef && gridApiRef.current) {
        const allColumns = gridApiRef.current.getAllColumns()
        const totalWidth = allColumns.reduce(
          (width, column) => width + column.computedWidth,
          0
        )
        const viewWidth = totalWidth - checkboxWidth
        setFooterWidth(`${viewWidth}px`)
      }
    }

    const handleResize = () => {
      const footerContainer = document.querySelector(
        '.MuiDataGrid-footerContainer'
      )
      if (footerContainer) {
        const footerRect = footerContainer.getBoundingClientRect()
        const leftBox = document.querySelector('.left-box')
        const rightBox = document.querySelector('.right-box')
        if (leftBox && rightBox) {
          const leftBoxRect = leftBox.getBoundingClientRect()
          const rightBoxRect = rightBox.getBoundingClientRect()
          const availableSpace =
            footerRect.width - leftBoxRect.width - rightBoxRect.width
          setIsCollapsed(availableSpace < 0)
        }
      }
    }

    updateFooterWidth()
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [gridApiRef, checkboxWidth])

  return (
    <GridFooterContainer
      {...props}
      style={{
        width: footerWidth,
        minWidth: footerWidth,
        marginLeft: `${checkboxWidth}px`,
        height: `80px`,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'nowrap',
          minWidth: '100%',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
            marginRight: isCollapsed ? 0 : undefined,
          }}
          className="left-box"
        >
          <Box sx={{ display: 'flex', alignItems: 'center', mr: '10px' }}>
            <VerticalDivider />
          </Box>
          {onRefresh && (
            <CustomButton
              text="Refresh"
              iconlocation="left"
              variant="text"
              fontcolor="black"
              fontvariant="merriparagraph"
              iconcolor="black"
              icon={<RefreshRounded />}
              onClick={() => {
                onRefresh()
                if (gridApiRef.current) {
                  gridApiRef.current.forceUpdate()
                }
              }}
            />
          )}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              ml: '10px',
              mr: '10px',
            }}
          >
            <VerticalDivider />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <CustomButton
              text="Manage Columns"
              fontvariant="merriparagraph"
              variant="text"
              iconlocation="left"
              fontcolor="black"
              iconcolor="black"
              icon={<RemoveRedEyeRounded />}
              onClick={handleOpen}
            />
          </Box>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              ml: '10px',
              mr: '10px',
            }}
          >
            <VerticalDivider />
          </Box>
        </Box>
        <Box
          sx={{ flexShrink: 0, marginLeft: isCollapsed ? 'auto' : undefined }}
          className="right-box"
        >
          <GridPagination ActionsComponent={Pagination} />
        </Box>
      </Box>
      <ManageColumn
        open={isOpen}
        handleClose={handleClose}
        apiRef={gridApiRef}
      />
    </GridFooterContainer>
  )
}

export default CustomFooter
