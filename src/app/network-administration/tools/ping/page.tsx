'use server'
import React from 'react'
import Ping from './client'
import { withCompanyData, ReusableRSC } from '@/rsc/reusableRSC'
import { SerializableCompanyData } from '@/mongo'

export default async function PingPage() {
  return withCompanyData(ReusableRSC, {
    requiredAccountType: 'employee',
    children: (companyData: SerializableCompanyData) => {
      try {
        console.log('Retrieved company data:', companyData)
        return <Ping companyData={companyData} />
      } catch (error) {
        console.error('Error rendering Ping:', error)
        return null
      }
    },
  })
}
