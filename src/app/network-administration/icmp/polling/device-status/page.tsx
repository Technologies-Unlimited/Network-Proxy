import React from 'react'
import ICMPDeviceStatusClient from './client'

export default function ICMPDeviceStatusPage() {
  // Server component that doesn't fetch data directly
  // The client component will fetch data from the API
  return <ICMPDeviceStatusClient />
}
