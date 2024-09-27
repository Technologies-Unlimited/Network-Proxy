'use server'
import React from 'react'
import DiscoverDevices from './client'
import { withCompanyData, ReusableRSC } from '@/rsc/reusableRSC'
import { SerializableCompanyData } from '@/mongo'

export default async function DiscoverDevicesPage() {
  return withCompanyData(ReusableRSC, {
    requiredAccountType: 'employee',
    children: (companyData: SerializableCompanyData) => {
      try {
        console.log('Retrieved company data:', companyData)
        return <DiscoverDevices companyData={companyData} />
      } catch (error) {
        console.error('Error rendering DiscoverDevices:', error)
        return null
      }
    },
  })
}
