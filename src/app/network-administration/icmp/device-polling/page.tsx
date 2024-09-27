'use server'
import React from 'react'
import DeviceOutages from './client'
import { withCompanyData, ReusableRSC } from '@/rsc/reusableRSC'
import { SerializableCompanyData } from '@/mongo'

export default async function DeviceOutagesPage() {
  return withCompanyData(ReusableRSC, {
    requiredAccountType: 'employee',
    children: (companyData: SerializableCompanyData) => {
      try {
        console.log('DeviceOutagesPage: Retrieved company data:', companyData)
        return <DeviceOutages companyData={companyData} />
      } catch (error) {
        console.error(
          'DeviceOutagesPage: Error rendering DeviceOutages:',
          error
        )
        return null
      }
    },
  })
}
