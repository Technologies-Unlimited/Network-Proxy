'use server'
import React from 'react'
import ClientDeviceOutages from './client'
import { withCompanyData, ReusableRSC } from '@/rsc/reusableRSC'
import { SerializableCompanyData } from '@/mongo'

export default async function DeviceOutagesPage() {
  return withCompanyData(ReusableRSC, {
    requiredAccountType: 'employee',
    children: (companyData: SerializableCompanyData) => {
      try {
        console.log('Retrieved company data:', companyData)
        return <ClientDeviceOutages companyData={companyData} />
      } catch (error) {
        console.error('Error rendering ClientDeviceOutages:', error)
        return null
      }
    },
  })
}
