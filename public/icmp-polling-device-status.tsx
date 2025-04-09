/**
 * ICMP Polling Device Status page for the Network-Proxy application
 */

import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Provider as JotaiProvider } from "jotai";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { theme } from "../src/themes/default";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Button from "@mui/material/Button";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CircularProgress from "@mui/material/CircularProgress";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Chip from "@mui/material/Chip";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Link from "@mui/material/Link";

/**
 * Interface for ICMP device status data
 */
interface ICMPDeviceStatus {
  id: string;
  deviceName: string;
  ipAddress: string;
  status: "online" | "offline" | "unknown";
  responseTime: number;
  lastUpdated: string;
}

/**
 * Main ICMP Polling Device Status component
 */
const ICMPPollingDeviceStatus: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [deviceStatuses, setDeviceStatuses] = useState<ICMPDeviceStatus[]>([]);
  
  // Simulate fetching data
  useEffect(() => {
    // In a real app, you'd fetch from an API endpoint
    const fetchData = async () => {
      try {
        setLoading(true);
        // Simulated API delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Mock data
        const mockData: ICMPDeviceStatus[] = [
          {
            id: "1",
            deviceName: "Router-Main",
            ipAddress: "192.168.1.1",
            status: "online",
            responseTime: 5,
            lastUpdated: new Date().toISOString()
          },
          {
            id: "2",
            deviceName: "Switch-Floor1",
            ipAddress: "192.168.1.2",
            status: "online",
            responseTime: 8,
            lastUpdated: new Date().toISOString()
          },
          {
            id: "3",
            deviceName: "Switch-Floor2",
            ipAddress: "192.168.1.3",
            status: "offline",
            responseTime: 0,
            lastUpdated: new Date().toISOString()
          }
        ];
        
        setDeviceStatuses(mockData);
      } catch (error) {
        console.error("Error fetching device statuses:", error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);
  
  /**
   * Get status chip color based on device status
   */
  const getStatusColor = (status: string) => {
    switch (status) {
      case "online":
        return "success";
      case "offline":
        return "error";
      default:
        return "default";
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ maxWidth: 1200, margin: "0 auto", padding: 2 }}>
        <Button 
          startIcon={<ArrowBackIcon />} 
          href="/network-administration"
          sx={{ marginBottom: 2 }}
        >
          Back to Network Administration
        </Button>
        
        <Breadcrumbs aria-label="breadcrumb" sx={{ marginBottom: 2 }}>
          <Link color="inherit" href="/">Home</Link>
          <Link color="inherit" href="/network-administration">Network Administration</Link>
          <Link color="inherit" href="/network-administration/icmp">ICMP</Link>
          <Link color="inherit" href="/network-administration/icmp/polling">Polling</Link>
          <Typography color="text.primary">Device Status</Typography>
        </Breadcrumbs>
        
        <Typography variant="h4" component="h1" gutterBottom>
          ICMP Polling Device Status
        </Typography>
        
        <Paper sx={{ marginTop: 2, padding: 2 }}>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", p: 3 }}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Device Name</TableCell>
                    <TableCell>IP Address</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Response Time (ms)</TableCell>
                    <TableCell>Last Updated</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {deviceStatuses.map((device) => (
                    <TableRow key={device.id}>
                      <TableCell>{device.deviceName}</TableCell>
                      <TableCell>{device.ipAddress}</TableCell>
                      <TableCell>
                        <Chip 
                          label={device.status} 
                          color={getStatusColor(device.status) as any}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{device.status === "online" ? `${device.responseTime} ms` : "N/A"}</TableCell>
                      <TableCell>{new Date(device.lastUpdated).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      </Box>
    </ThemeProvider>
  );
};

/**
 * Initialize the React application
 */
const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <JotaiProvider>
        <ICMPPollingDeviceStatus />
      </JotaiProvider>
    </React.StrictMode>
  );
} else {
  console.error("Root element not found!");
} 