import React from 'react'
import ICMPTemplatesClient from './client'

export default function ICMPTemplatesPage() {
  // Server component that doesn't fetch data directly
  // The client component will fetch data from the API
  return <ICMPTemplatesClient />
}
