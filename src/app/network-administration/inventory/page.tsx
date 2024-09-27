'use server'
import React from 'react'
import Inventory from './client'
import { withCompanyData, ReusableRSC } from '@/rsc/reusableRSC'
import { SerializableCompanyData } from '@/mongo'

export default async function InventoryPage() {
  return withCompanyData(ReusableRSC, {
    requiredAccountType: 'employee',
    children: (companyData: SerializableCompanyData) => {
      try {
        console.log('InventoryPage: Retrieved company data:', companyData)
        return <Inventory companyData={companyData} />
      } catch (error) {
        console.error('InventoryPage: Error rendering Inventory:', error)
        return null
      }
    },
  })
}
