/**
 * Authentication service for Network-Proxy
 * Interacts with Unlimited-Application-Skeleton authentication API
 */

import {
  TokenType,
  TOKEN_TYPES,
  TokenData,
  UserAuthData,
  VerificationStatus,
} from '@/types/auth'

// Base URL for Unlimited-Application-Skeleton
const AUTH_API_URL =
  process.env.NEXT_PUBLIC_AUTH_API_URL || 'https://technologiesunlimited.net'

/**
 * Fetch wrapper with error handling
 */
const apiFetch = async <T>(
  url: string,
  options: RequestInit = {}
): Promise<T> => {
  try {
    const response = await fetch(url, {
      ...options,
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`)
    }

    return (await response.json()) as T
  } catch (error) {
    console.error('API Fetch Error:', error)
    throw error
  }
}

/**
 * Gets user details by email from administrator endpoint
 */
export const getAdministratorByEmail = async (
  email: string
): Promise<UserAuthData | null> => {
  try {
    const response = await fetch(
      `${AUTH_API_URL}/api/graphql/user/administrator`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
          query getAdministratorByEmail($email: String!) {
            getAdministratorByEmail(email: $email) {
              _id
              authId
              email
              phoneNumber
            }
          }
        `,
          variables: { email },
        }),
        credentials: 'include',
      }
    )

    const result = await response.json()

    if (result.errors) {
      console.error('GraphQL errors:', result.errors)
      return null
    }

    return result.data?.getAdministratorByEmail || null
  } catch (error) {
    console.error('Error fetching administrator by email:', error)
    return null
  }
}

/**
 * Gets user details by email from employee endpoint
 */
export const getEmployeeByEmail = async (
  email: string
): Promise<UserAuthData | null> => {
  try {
    const response = await fetch(`${AUTH_API_URL}/api/graphql/user/employee`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query getEmployeeByEmail($email: String!) {
            getEmployeeByEmail(email: $email) {
              _id
              authId
              email
              phoneNumber
            }
          }
        `,
        variables: { email },
      }),
      credentials: 'include',
    })

    const result = await response.json()

    if (result.errors) {
      console.error('GraphQL errors:', result.errors)
      return null
    }

    return result.data?.getEmployeeByEmail || null
  } catch (error) {
    console.error('Error fetching employee by email:', error)
    return null
  }
}

/**
 * Gets user details by email from customer endpoint
 */
export const getCustomerByEmail = async (
  email: string
): Promise<UserAuthData | null> => {
  try {
    const response = await fetch(`${AUTH_API_URL}/api/graphql/user/customer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query getCustomerByEmail($email: String!) {
            getCustomerByEmail(email: $email) {
              _id
              authId
              email
              phoneNumber
            }
          }
        `,
        variables: { email },
      }),
      credentials: 'include',
    })

    const result = await response.json()

    if (result.errors) {
      console.error('GraphQL errors:', result.errors)
      return null
    }

    return result.data?.getCustomerByEmail || null
  } catch (error) {
    console.error('Error fetching customer by email:', error)
    return null
  }
}

/**
 * Gets verification status for a user
 */
export const getVerificationStatus = async (
  userId: string
): Promise<VerificationStatus | null> => {
  try {
    const response = await fetch(`${AUTH_API_URL}/api/graphql/verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query getVerificationByUserId($userId: String!) {
            getVerificationByUserId(userId: $userId) {
              _id
              emailVerified
              phoneVerified
              mfaVerified
              userId
            }
          }
        `,
        variables: { userId },
      }),
      credentials: 'include',
    })

    const result = await response.json()

    if (result.errors) {
      console.error('GraphQL errors:', result.errors)
      return null
    }

    return result.data?.getVerificationByUserId || null
  } catch (error) {
    console.error('Error fetching verification status:', error)
    return null
  }
}

/**
 * Checks if MFA is set up for a user
 */
export const checkUserMfaSetup = async (
  userId: string
): Promise<{ hasMfaSecret: boolean; mfaSecret?: string }> => {
  try {
    const response = await fetch(`${AUTH_API_URL}/api/graphql/user/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query getUserMfaSecret($userId: String!, $tokenType: String!) {
            getUserMfaSecret(userId: $userId, tokenType: $tokenType) {
              secret
            }
          }
        `,
        variables: {
          userId,
          tokenType: TOKEN_TYPES.LOGGING_IN_MFA,
        },
      }),
      credentials: 'include',
    })

    const result = await response.json()

    if (result.errors) {
      console.error('GraphQL errors:', result.errors)
      return { hasMfaSecret: false }
    }

    const mfaSecret = result.data?.getUserMfaSecret?.secret

    return {
      hasMfaSecret: !!mfaSecret,
      mfaSecret,
    }
  } catch (error) {
    console.error('Error checking MFA setup:', error)
    return { hasMfaSecret: false }
  }
}

/**
 * Creates a token in Unlimited-Application-Skeleton
 */
export const createToken = async (
  tokenType: TokenType,
  userId: string,
  mfaSecret?: string
): Promise<TokenData | null> => {
  try {
    const response = await fetch(`${AUTH_API_URL}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokenName: tokenType,
        userId,
        mfaSecret, // Optional, only for MFA tokens
      }),
      credentials: 'include',
    })

    const result = await response.json()

    if (!result.success) {
      console.error('Token creation failed:', result.error)
      return null
    }

    return result.data as TokenData
  } catch (error) {
    console.error('Error creating token:', error)
    return null
  }
}

/**
 * Validates a token with Unlimited-Application-Skeleton
 */
export const validateToken = async (
  tokenType: TokenType,
  tokenString: string
): Promise<{ valid: boolean; userId?: string; message?: string }> => {
  try {
    const response = await fetch(`${AUTH_API_URL}/api/auth/network-proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokenType,
        tokenString,
      }),
      credentials: 'include',
    })

    return await response.json()
  } catch (error) {
    console.error('Error validating token:', error)
    return { valid: false, message: 'Token validation failed' }
  }
}

/**
 * Finds a user by email across all user types
 */
export const findUserByEmail = async (
  email: string
): Promise<UserAuthData | null> => {
  // Try administrator first
  let user = await getAdministratorByEmail(email)
  if (user) return user

  // Try employee next
  user = await getEmployeeByEmail(email)
  if (user) return user

  // Try customer last
  user = await getCustomerByEmail(email)
  if (user) return user

  // User not found in any endpoint
  return null
}
