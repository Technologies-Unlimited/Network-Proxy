/**
 * Network Administration page for the Network-Proxy application
 */

import React from "react";
import { createRoot } from "react-dom/client";
import { Provider as JotaiProvider } from "jotai";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { theme } from "../src/themes/default";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Paper from "@mui/material/Paper";
import Button from "@mui/material/Button";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

/**
 * Tab panel component for the network administration page
 */
const TabPanel: React.FC<TabPanelProps> = (props) => {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`network-tabpanel-${index}`}
      aria-labelledby={`network-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
};

/**
 * Main Network Administration component
 */
const NetworkAdministration: React.FC = () => {
  const [tabValue, setTabValue] = React.useState(0);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ maxWidth: 1200, margin: "0 auto", padding: 2 }}>
        <Button 
          startIcon={<ArrowBackIcon />} 
          href="/"
          sx={{ marginBottom: 2 }}
        >
          Back to Home
        </Button>
        
        <Typography variant="h4" component="h1" gutterBottom>
          Network Administration
        </Typography>
        
        <Paper sx={{ marginTop: 2 }}>
          <Tabs 
            value={tabValue} 
            onChange={handleTabChange}
            aria-label="network administration tabs"
          >
            <Tab label="ICMP" id="network-tab-0" />
            <Tab label="SNMP" id="network-tab-1" />
            <Tab label="Inventory" id="network-tab-2" />
            <Tab label="Tools" id="network-tab-3" />
          </Tabs>
          
          <TabPanel value={tabValue} index={0}>
            <Typography variant="h6">ICMP Monitoring</Typography>
            <Typography paragraph>
              ICMP (Internet Control Message Protocol) monitoring tools and configuration.
            </Typography>
          </TabPanel>
          
          <TabPanel value={tabValue} index={1}>
            <Typography variant="h6">SNMP Management</Typography>
            <Typography paragraph>
              SNMP (Simple Network Management Protocol) device management and monitoring.
            </Typography>
          </TabPanel>
          
          <TabPanel value={tabValue} index={2}>
            <Typography variant="h6">Network Inventory</Typography>
            <Typography paragraph>
              Manage and view your network device inventory.
            </Typography>
          </TabPanel>
          
          <TabPanel value={tabValue} index={3}>
            <Typography variant="h6">Network Tools</Typography>
            <Typography paragraph>
              Various network troubleshooting and management tools.
            </Typography>
          </TabPanel>
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
        <NetworkAdministration />
      </JotaiProvider>
    </React.StrictMode>
  );
} else {
  console.error("Root element not found!");
} 