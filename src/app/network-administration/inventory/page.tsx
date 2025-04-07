'use server'

import React from 'react'
import Inventory from './client'

export default async function InventoryPage() {
  // Server component that doesn't fetch data directly
  // The client component will fetch data from the API
  return <Inventory />
}
