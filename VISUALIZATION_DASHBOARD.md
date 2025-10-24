# Visualization Dashboard - Implementation Guide

## Overview
A comprehensive Grafana-style visualization dashboard built for the Network Proxy monitoring system. This dashboard provides real-time charts, metrics, and insights into network device performance.

## Files Created

### 1. Frontend Template
**File:** `C:\Users\Matt-PC\Documents\app-dev\Network-Proxy\web\templates\visualize.html`

#### Features:
- **Real-time Charts** using Chart.js 4.4.0
  - Line Chart: Device ping latency over time (multi-device comparison)
  - Bar Chart: Devices by status (up/down/unknown)
  - Pie Chart: Devices by type distribution
  - Area Chart: Network throughput (inbound/outbound)

- **Time Range Selector**
  - Predefined ranges: 1h, 6h, 24h, 7d, 30d
  - Custom date/time range picker
  - Active range highlighting

- **Dashboard Panels** (Metrics Overview)
  - Total Devices - Total number of monitored devices
  - Average Uptime - Percentage uptime over last 24 hours
  - Average Response Time - Mean ping latency in milliseconds
  - Active Alerts - Count with severity breakdown (Critical/Warning)

- **Dark Theme Styling**
  - Chart.js configured with dark backgrounds
  - Color-coded status indicators (green=up, red=down, grey=unknown)
  - Responsive grid layout
  - Mobile-friendly design

- **Auto-refresh**
  - Updates every 30 seconds
  - Visual refresh indicator
  - Seamless data updates without page reload

### 2. Backend API
**File:** `C:\Users\Matt-PC\Documents\app-dev\Network-Proxy\internal\api\visualize.go`

#### API Endpoints:

1. **GET /api/v1/metrics/device-status**
   - Returns device counts by status (up/down/unknown)
   - Returns device counts by type
   ```json
   {
     "up": 15,
     "down": 2,
     "unknown": 3,
     "total": 20,
     "by_type": {
       "router": 5,
       "switch": 8,
       "server": 7
     }
   }
   ```

2. **GET /api/v1/metrics/ping-history?range=1h&device_id=X**
   - Returns ping latency history for devices
   - Supports time range filtering (1h, 6h, 24h, 7d, 30d)
   - Optional device_id filter for specific device
   ```json
   {
     "timestamps": ["14:00", "14:05", "14:10", ...],
     "devices": [
       {
         "device_id": "dev-123",
         "name": "Router-1",
         "data": [12.5, 13.2, 11.8, ...]
       }
     ],
     "avg_latency": 12.3
   }
   ```

3. **GET /api/v1/metrics/alert-stats**
   - Returns alert counts by severity and status
   ```json
   {
     "total": 5,
     "critical": 1,
     "warning": 3,
     "info": 1,
     "active": 4,
     "by_severity": {
       "critical": 1,
       "warning": 3,
       "info": 1
     }
   }
   ```

4. **GET /api/v1/metrics/uptime?device_id=X**
   - Returns uptime statistics for a specific device
   ```json
   {
     "device_id": "dev-123",
     "hostname": "Router-1",
     "uptime_percentage": 98.5,
     "total_checks": 288,
     "successful_checks": 283,
     "failed_checks": 5,
     "last_seen": "2025-10-20T14:30:00Z",
     "current_status": "up"
   }
   ```

5. **GET /api/v1/metrics/throughput?device_id=X&range=1h**
   - Returns network throughput metrics
   ```json
   {
     "timestamps": ["14:00", "14:05", "14:10", ...],
     "inbound": [52.3, 54.1, 48.9, ...],
     "outbound": [32.1, 35.4, 30.2, ...]
   }
   ```

#### Helper Functions:
- `parseDuration(timeRange string)` - Converts time range strings to Go durations
- `generateTimestamps(start, end, duration)` - Generates timestamp labels for charts
- `parseCustomRange(start, end)` - Parses custom date/time ranges

### 3. Routing Updates
**File:** `C:\Users\Matt-PC\Documents\app-dev\Network-Proxy\internal\api\routes.go`

Added routes:
```go
// Web UI route
router.GET("/visualize", visualizePage)

// API routes under /api/v1/metrics/
metrics := v1.Group("/metrics")
{
    metrics.GET("/device-status", getDeviceStatus(srv))
    metrics.GET("/ping-history", getPingHistory(srv))
    metrics.GET("/alert-stats", getAlertStats(srv))
    metrics.GET("/uptime", getDeviceUptime(srv))
    metrics.GET("/throughput", getNetworkThroughput(srv))
}
```

### 4. Navigation Updates
Updated all template files to include the "Visualize" navigation link:
- `web/templates/dashboard.html`
- `web/templates/devices.html`
- `web/templates/alerts.html`
- `web/templates/agents.html`

## Architecture

### Data Flow
1. **Page Load** → `visualize.html` loads → Initialize Chart.js instances
2. **User selects time range** → JavaScript updates `currentTimeRange` variable
3. **Data fetch** → Fetch API calls to backend endpoints
4. **Backend processing** → Query database, calculate metrics
5. **Response** → JSON data returned to frontend
6. **Chart update** → Chart.js updates visualizations
7. **Auto-refresh** → Repeat every 30 seconds

### Chart Configuration
All charts are configured with dark theme defaults:
```javascript
Chart.defaults.color = '#e0e0e0';
Chart.defaults.borderColor = '#404040';
Chart.defaults.backgroundColor = 'rgba(74, 158, 255, 0.5)';
```

### Color Scheme
- **Primary Blue:** #4a9eff (links, active states)
- **Success Green:** #4caf50 (devices up, inbound traffic)
- **Danger Red:** #f44336 (devices down, alerts)
- **Warning Orange:** #ff9800 (warnings, device types)
- **Background Dark:** #1e1e1e (panels)
- **Background Darker:** #2d2d2d (inputs, buttons)
- **Border:** #404040 (dividers, grid lines)
- **Text:** #e0e0e0 (primary text)

## Usage

### Access the Dashboard
1. Start the Network Proxy server
2. Navigate to: `http://localhost:PORT/visualize`
3. Select desired time range
4. Charts will automatically refresh every 30 seconds

### Time Range Options
- **Last Hour** - Shows most recent data with 5-minute intervals
- **6 Hours** - 10-minute intervals
- **24 Hours** - 30-minute intervals
- **7 Days** - 1-hour intervals
- **30 Days** - 2-hour intervals
- **Custom** - Use date/time pickers for specific ranges

### Interacting with Charts
- **Hover** over data points to see exact values
- **Click** legend items to show/hide specific datasets
- Charts are **responsive** and adapt to screen size
- **Auto-refresh** indicator appears during data updates

## Implementation Notes

### Current Implementation
The current implementation includes:
- ✅ Complete HTML/CSS/JavaScript frontend
- ✅ Full API endpoint structure
- ✅ Dark theme styling
- ✅ Responsive design
- ✅ Auto-refresh functionality
- ✅ Time range selection
- ✅ Multiple chart types

### Mock Data vs Real Data
Currently, the following use **simulated data**:
- Ping history (based on device status)
- Network throughput (generated patterns)
- Uptime calculations (estimates based on status)

### Integration Points for Real Data

To integrate with real monitoring data:

1. **Ping History** - Modify `getPingHistory()` to query actual ping results:
   ```go
   // Query ping_results table or time-series database
   var pingResults []PingResult
   srv.DB.Where("device_id = ? AND timestamp > ?", deviceID, startTime).
       Find(&pingResults)
   ```

2. **Network Throughput** - Integrate with SNMP collector:
   ```go
   // Query SNMP interface statistics
   inOctets := querySNMP(deviceID, "1.3.6.1.2.1.2.2.1.10") // ifInOctets
   outOctets := querySNMP(deviceID, "1.3.6.1.2.1.2.2.1.16") // ifOutOctets
   ```

3. **Uptime Calculation** - Query actual check results:
   ```go
   // Count successful vs failed checks from database
   var checks []HealthCheck
   srv.DB.Where("device_id = ? AND timestamp > ?", deviceID, startTime).
       Find(&checks)
   ```

## Chart Types

### 1. Device Status Bar Chart
- **Type:** Vertical bar chart
- **Data:** Count of devices by status
- **Colors:** Green (up), Red (down), Grey (unknown)
- **Update Frequency:** Every 30 seconds

### 2. Device Type Pie Chart
- **Type:** Pie/Doughnut chart
- **Data:** Distribution of devices by type
- **Colors:** Multi-color palette
- **Legend:** Right-side positioning

### 3. Ping Latency Line Chart
- **Type:** Multi-line time series
- **Data:** Ping response times for multiple devices
- **Y-axis:** Latency in milliseconds
- **X-axis:** Time labels
- **Features:** Hover tooltips, legend toggle

### 4. Network Throughput Area Chart
- **Type:** Filled line (area) chart
- **Data:** Inbound and outbound traffic
- **Y-axis:** Throughput in Mbps
- **Colors:** Green (inbound), Red (outbound)
- **Features:** Smooth curves, semi-transparent fill

## Performance Considerations

1. **Data Point Limits:**
   - 1h range: ~12 points (5-min intervals)
   - 24h range: ~48 points (30-min intervals)
   - 30d range: ~360 points (2-hour intervals)

2. **Auto-refresh:**
   - Default: 30 seconds
   - Adjustable via `refreshInterval` variable

3. **Chart Updates:**
   - Uses Chart.js `.update()` method
   - Smooth transitions enabled
   - No full page reloads

4. **API Optimization:**
   - Device queries use GORM batch loading
   - Time range filtering reduces data volume
   - JSON responses are lightweight

## Future Enhancements

### Recommended Additions:
1. **Export Features:**
   - PDF export of current view
   - CSV data export
   - Screenshot capture

2. **Dashboard Customization:**
   - Drag-and-drop panel arrangement
   - Save custom dashboard layouts
   - User preferences storage

3. **Advanced Filtering:**
   - Filter by device type
   - Filter by location
   - Filter by agent

4. **Alerting Integration:**
   - Visual alert indicators on charts
   - Alert timeline visualization
   - Click-through to alert details

5. **Comparison Views:**
   - Compare multiple devices side-by-side
   - Week-over-week comparisons
   - Baseline vs current metrics

6. **Real-time Updates:**
   - WebSocket integration for live updates
   - No polling delay
   - Push notifications

## Troubleshooting

### Charts Not Displaying
- Verify Chart.js CDN is accessible
- Check browser console for JavaScript errors
- Ensure API endpoints are returning valid JSON

### No Data in Charts
- Verify devices exist in database
- Check API responses in Network tab
- Ensure time range has data available

### Auto-refresh Not Working
- Check `refreshInterval` is set correctly
- Verify no JavaScript errors preventing execution
- Check browser doesn't block repeated requests

## Testing

### Manual Testing Steps:
1. Add test devices with different statuses
2. Navigate to /visualize
3. Verify all 4 metric panels show data
4. Verify all 4 charts render
5. Change time range and verify charts update
6. Wait 30 seconds and verify auto-refresh
7. Test on mobile device for responsiveness

### API Testing:
```bash
# Test device status endpoint
curl http://localhost:8080/api/v1/metrics/device-status

# Test ping history
curl "http://localhost:8080/api/v1/metrics/ping-history?range=1h"

# Test alert stats
curl http://localhost:8080/api/v1/metrics/alert-stats

# Test device uptime
curl "http://localhost:8080/api/v1/metrics/uptime?device_id=dev-123"

# Test throughput
curl "http://localhost:8080/api/v1/metrics/throughput?range=6h"
```

## Dependencies

### Frontend:
- **htmx.org v1.9.10** - AJAX/DOM manipulation
- **Chart.js v4.4.0** - Charting library
- **CSS Grid** - Layout system
- **Fetch API** - HTTP requests

### Backend:
- **Gin** - HTTP router
- **GORM** - Database ORM
- **Go Time** - Time manipulation
- **Database models** - Device, Alert, Agent

## License
Part of the Network Proxy monitoring system.

## Author
Created for Network Monitor - Grafana Alternative Dashboard
