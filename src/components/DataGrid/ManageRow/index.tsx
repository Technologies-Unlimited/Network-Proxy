'use client'
import React, { useState } from 'react'
import { Popover, Stack, Typography, Paper } from '@mui/material'
import { CustomButton } from 'goobs-frontend'
import ArchiveIcon from '@mui/icons-material/Archive'
import DuplicateIcon from '@mui/icons-material/FileCopy'
import DeleteIcon from '@mui/icons-material/Delete'
import ExportIcon from '@mui/icons-material/Download'
import Draggable from '@/components/Draggable'
import { GridApiPro } from '@mui/x-data-grid-pro'

type ModalType = 'archive' | 'duplicate' | 'delete' | 'export'

interface ManageRowProps {
  open?: boolean
  handleClose?: () => void
  numberOfItems: number
  apiRef?: React.MutableRefObject<GridApiPro>
}

function ManageRow({
  open = false,
  handleClose = () => {},
  numberOfItems,
}: ManageRowProps) {
  const [actionType, setActionType] = useState<ModalType | null>(null)

  const iconMap: { [key in ModalType]: React.ComponentType } = {
    archive: ArchiveIcon,
    duplicate: DuplicateIcon,
    delete: DeleteIcon,
    export: ExportIcon,
  }

  const handleActionSelection = (type: ModalType) => {
    setActionType(type)
  }

  const actionButtons = (
    <Stack component="div" spacing={0} direction="row" justifyContent="center">
      {(['archive', 'duplicate', 'delete', 'export'] as ModalType[]).map(
        type => {
          const IconComponent = iconMap[type]
          return (
            <CustomButton
              key={type}
              size="small"
              backgroundcolor="black"
              text={type.charAt(0).toUpperCase() + type.slice(1)}
              variant="text"
              iconlocation="above"
              icon={<IconComponent />}
              onClick={() => handleActionSelection(type)}
            />
          )
        }
      )}
    </Stack>
  )

  return (
    <Draggable>
      <Popover
        open={open}
        onClose={handleClose}
        transformOrigin={{
          vertical: 'center',
          horizontal: 'center',
        }}
        PaperProps={{
          component: Paper,
          style: {
            zIndex: 1300,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: '60px',
            minWidth: '560px',
            padding: '0 10px',
          },
        }}
      >
        <Typography
          variant="merriparagraph"
          sx={{
            ml: 2,
            mr: 0,
            flexGrow: 1,
          }}
        >
          {`${numberOfItems} items selected`}
        </Typography>
        {!actionType && actionButtons}
      </Popover>
    </Draggable>
  )
}

export default ManageRow
