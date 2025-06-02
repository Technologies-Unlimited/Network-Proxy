/**
 * Monitoring Service Startup
 * Initializes background monitoring services
 */

import { monitoringService } from './icmp-monitor'
import { ICMPMonitorRepository } from '../database/icmp/monitor'

export async function startMonitoringServices() {
  console.log('[Startup] Initializing monitoring services...')

  try {
    // Initialize database tables
    const repository = new ICMPMonitorRepository()
    repository.initTables()

    // Start ICMP monitoring service
    await monitoringService.start()

    console.log('[Startup] Monitoring services started successfully')

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('[Startup] Shutting down monitoring services...')
      monitoringService.stop()
      process.exit(0)
    })

    process.on('SIGTERM', () => {
      console.log('[Startup] Shutting down monitoring services...')
      monitoringService.stop()
      process.exit(0)
    })
  } catch (error) {
    console.error('[Startup] Failed to start monitoring services:', error)
    throw error
  }
}

// Auto-start if this is the main module
if (require.main === module) {
  startMonitoringServices().catch(error => {
    console.error('[Startup] Fatal error:', error)
    process.exit(1)
  })
}
