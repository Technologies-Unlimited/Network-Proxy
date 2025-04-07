'use server'

import React from 'react'
import DevicePolling from './client'

export default async function DevicePollingPage() {
  // Server component that doesn't fetch data directly
  // The client component will fetch data from the API
  return <DevicePolling />
}
