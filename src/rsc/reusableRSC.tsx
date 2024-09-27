'use server'
import React from 'react'
import tokenSpoof from '@/actions/server/user/spoof/token'
import getUserContextFromToken from '@/actions/server/user/getUserAssociated'
import { ExtendedCompanyFields } from '@/schema/team/company/schema'

interface ReusableRSCProps {
  children: (companyData: ExtendedCompanyFields) => React.ReactNode
  requiredAccountType?: 'employee' | 'customer'
}

async function getCompanyData(
  requiredAccountType?: 'employee' | 'customer'
): Promise<ExtendedCompanyFields | null> {
  try {
    const { isValid, validTokens } = await tokenSpoof()
    if (!isValid || !validTokens.cookie?.tokenString) {
      console.log('User not authenticated')
      return null
    }
    const loggedInToken = validTokens.cookie.tokenString
    console.log('Retrieving user context using loggedInToken')
    const userContext = await getUserContextFromToken({ loggedInToken })
    if (!userContext) {
      console.log('User context not found')
      return null
    }
    const { companies, accountType } = userContext
    let companyData: ExtendedCompanyFields | null = null
    if (requiredAccountType && accountType !== requiredAccountType) {
      console.log(`User is not a ${requiredAccountType}`)
      return null
    }
    if (accountType === 'employee' && companies.employee) {
      companyData = companies.employee
    } else if (accountType === 'customer' && companies.customer) {
      companyData = companies.customer
    } else {
      console.log('Company data not found')
      return null
    }
    if (!companyData) {
      console.log('Company data is null')
      return null
    }
    console.log('Retrieved company data:', {
      companyId: companyData._id,
      accountType,
    })
    return companyData
  } catch (error) {
    console.error('Error in getCompanyData:', error)
    return null
  }
}

async function ReusableRSC(
  props: ReusableRSCProps
): Promise<(companyData: ExtendedCompanyFields) => React.ReactNode> {
  return (companyData: ExtendedCompanyFields) => props.children(companyData)
}

async function withCompanyData(
  Component: typeof ReusableRSC,
  props: ReusableRSCProps
): Promise<React.ReactNode | null> {
  const companyData = await getCompanyData(props.requiredAccountType)
  if (!companyData) {
    return null
  }
  const renderFunction = await Component(props)
  return renderFunction(companyData)
}

export { withCompanyData, ReusableRSC }
