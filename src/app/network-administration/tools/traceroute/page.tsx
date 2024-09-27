'use server'
import React from 'react'
import Traceroute from './client'
import { withCompanyData, ReusableRSC } from '@/rsc/reusableRSC'
import { SerializableCompanyData } from '@/mongo'

export default async function TraceroutePage() {
  return withCompanyData(ReusableRSC, {
    requiredAccountType: 'employee',
    children: (companyData: SerializableCompanyData) => {
      try {
        console.log('Retrieved company data:', companyData)
        return <Traceroute companyData={companyData} />
      } catch (error) {
        console.error('Error rendering Traceroute:', error)
        return null
      }
    },
  })
}
