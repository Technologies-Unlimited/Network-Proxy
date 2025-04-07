'use server'

import React from 'react'
import DiscoverDevices from './client'

export default async function DiscoverDevicesPage() {
  // Server component that doesn't fetch data directly
  // The client component will fetch data from the API
  return <DiscoverDevices />
}
