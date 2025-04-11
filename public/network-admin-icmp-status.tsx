/**
 * Wrapper for the ICMP Polling Device Status client component
 * This file bridges the Bun server to the existing Next.js client component
 */

import React from 'react'
import { createRoot } from 'react-dom/client'
import { Provider as JotaiProvider } from 'jotai'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { theme } from '../src/themes/default'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'

// Import the original client component
import ICMPDeviceStatusClient from '../src/app/network-administration/icmp/polling/device-status/client'

/**
 * Main wrapper component for the ICMP Device Status page
 */
const ICMPDeviceStatusPage: React.FC = () => {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ maxWidth: 1200, margin: '0 auto', padding: 2 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          href="/network-administration"
          sx={{ marginBottom: 2 }}
        >
          Back to Network Administration
        </Button>

        <Breadcrumbs aria-label="breadcrumb" sx={{ marginBottom: 2 }}>
          <Link color="inherit" href="/">
            Home
          </Link>
          <Link color="inherit" href="/network-administration">
            Network Administration
          </Link>
          <Link color="inherit" href="/network-administration/icmp">
            ICMP
          </Link>
          <Link color="inherit" href="/network-administration/icmp/polling">
            Polling
          </Link>
          <Typography color="text.primary">Device Status</Typography>
        </Breadcrumbs>

        <Typography variant="h4" component="h1" gutterBottom>
          ICMP Polling Device Status
        </Typography>

        {/* Render the original client component */}
        <ICMPDeviceStatusClient />
      </Box>
    </ThemeProvider>
  )
}

/**
 * Initialize the React application
 */
const container = document.getElementById('root')
if (container) {
  const root = createRoot(container)
  root.render(
    <React.StrictMode>
      <JotaiProvider>
        <ICMPDeviceStatusPage />
      </JotaiProvider>
    </React.StrictMode>
  )
} else {
  console.error('Root element not found!')
}
