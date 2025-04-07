'use server'

import React from 'react'
import PingClient from './client'

export default async function PingPage() {
  // Server component that doesn't fetch data directly
  // The client component will fetch data from the API
  return <PingClient />
}
