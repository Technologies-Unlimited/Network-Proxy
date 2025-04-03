/**
 * Main authentication hook for Network-Proxy
 * Orchestrates the authentication flow using Unlimited-Application-Skeleton
 */

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  findUserByEmail,
  getVerificationStatus,
  createToken,
} from '../services/authService'
import {
  TokenType,
  TOKEN_TYPES,
  UserAuthData,
  VerificationStatus,
} from '@/types/auth'

interface UseAuthResult {
  isLoading: boolean
  isAuthenticated: boolean
  user: UserAuthData | null
  verificationStatus: VerificationStatus | null
  error: string | null
  login: (email: string) => Promise<{
    success: boolean
    userId?: string
    mfaRequired?: boolean
    mfaSecret?: string
  }>
  logout: () => Promise<void>
}

const useAuth = (): UseAuthResult => {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<UserAuthData | null>(null)
  const [verificationStatus, setVerificationStatus] =
    useState<VerificationStatus | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check for existing authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      setIsLoading(true)

      try {
        // Check for the logged_in cookie
        const cookies = document.cookie.split(';').map(cookie => cookie.trim())
        const loggedInCookie = cookies.find(cookie =>
          cookie.startsWith(`${TOKEN_TYPES.LOGGED_IN}=`)
        )

        if (loggedInCookie) {
          try {
            const tokenDataStr = loggedInCookie.substring(
              `${TOKEN_TYPES.LOGGED_IN}=`.length
            )
            const tokenData = JSON.parse(decodeURIComponent(tokenDataStr))

            if (tokenData && tokenData.userId) {
              // User is authenticated
              setIsAuthenticated(true)

              // In a real implementation, we would fetch the user data here
              // For simplicity, we'll just use the userId
              const dummyUser: UserAuthData = {
                _id: tokenData.userId,
                authId: tokenData.authId || tokenData.userId,
                email: 'user@example.com', // Placeholder, would be fetched from API
              }

              setUser(dummyUser)

              // Fetch verification status
              const status = await getVerificationStatus(tokenData.userId)
              setVerificationStatus(status)
            }
          } catch (err) {
            console.error('Error parsing auth cookie:', err)
          }
        }
      } catch (err) {
        console.error('Error checking authentication:', err)
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [])

  /**
   * Login with email
   */
  const login = useCallback(
    async (
      email: string
    ): Promise<{
      success: boolean
      userId?: string
      mfaRequired?: boolean
      mfaSecret?: string
    }> => {
      setIsLoading(true)
      setError(null)

      try {
        // Find user by email across all user types
        const user = await findUserByEmail(email)

        if (!user) {
          setError('User not found')
          return { success: false }
        }

        // Create the main login token
        const tokenData = await createToken(
          TOKEN_TYPES.LOGGING_IN_MAIN,
          user._id
        )

        if (!tokenData) {
          throw new Error('Failed to create login token')
        }

        // Get verification status to determine if MFA is required
        const status = await getVerificationStatus(user._id)

        if (!status) {
          throw new Error('Failed to get verification status')
        }

        // In Network-Proxy, we only use MFA for authentication
        if (!status.mfaVerified) {
          // MFA is not set up, but we require it for all users
          setError(
            'MFA is not set up for this account. Please contact your administrator.'
          )
          return { success: false }
        }

        // Fetch MFA secret if needed (in a real app this would be a separate API call)
        // For this implementation, we'll use a placeholder or dummy value
        const mfaSecret = 'DUMMY_MFA_SECRET' // In production, this would be fetched securely

        // Return MFA requirement
        return {
          success: true,
          userId: user._id,
          mfaRequired: true,
          mfaSecret,
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error during login'
        setError(errorMessage)
        return { success: false }
      } finally {
        setIsLoading(false)
      }
    },
    []
  )

  /**
   * Logout user
   */
  const logout = useCallback(async (): Promise<void> => {
    setIsLoading(true)

    try {
      // Delete the logged_in token
      await fetch(`${process.env.NEXT_PUBLIC_AUTH_API_URL}/api/token`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenName: TOKEN_TYPES.LOGGED_IN,
        }),
        credentials: 'include',
      })

      // Reset state
      setIsAuthenticated(false)
      setUser(null)
      setVerificationStatus(null)

      // Redirect to login page
      router.push('/auth/login')
    } catch (err) {
      console.error('Error during logout:', err)
    } finally {
      setIsLoading(false)
    }
  }, [router])

  return {
    isLoading,
    isAuthenticated,
    user,
    verificationStatus,
    error,
    login,
    logout,
  }
}

export default useAuth
