/**
 * MFA verification hook for Network-Proxy authentication
 * Integrates with Unlimited-Application-Skeleton
 */

import { useState } from 'react'
import { createToken, checkUserMfaSetup } from '../services/authService'
import { TOKEN_TYPES, TokenData } from '@/types/auth'

interface UseMfaVerificationProps {
  userId: string
  onSuccess?: (tokenData: TokenData) => void
  onError?: (error: Error) => void
}

interface UseMfaVerificationResult {
  isVerifying: boolean
  isLoading: boolean
  error: string | null
  hasMfaSecret: boolean
  mfaSecret: string | null
  checkMfaSetup: () => Promise<boolean>
  verifyMfaCode: (code: string) => Promise<boolean>
}

const useMfaVerification = ({
  userId,
  onSuccess,
  onError,
}: UseMfaVerificationProps): UseMfaVerificationResult => {
  const [isVerifying, setIsVerifying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMfaSecret, setHasMfaSecret] = useState(false)
  const [mfaSecret, setMfaSecret] = useState<string | null>(null)

  /**
   * Checks if the user has MFA set up
   */
  const checkMfaSetup = async (): Promise<boolean> => {
    setIsLoading(true)
    setError(null)

    try {
      // Check if user has MFA set up
      const result = await checkUserMfaSetup(userId)

      setHasMfaSecret(result.hasMfaSecret)
      setMfaSecret(result.mfaSecret || null)

      return result.hasMfaSecret
    } catch (err) {
      const error =
        err instanceof Error
          ? err
          : new Error('Unknown error checking MFA setup')
      setError(error.message)
      if (onError) onError(error)
      return false
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Verifies the MFA code entered by the user
   */
  const verifyMfaCode = async (code: string): Promise<boolean> => {
    setIsVerifying(true)
    setError(null)

    try {
      // Create the MFA verification token
      const tokenData = await createToken(
        TOKEN_TYPES.LOGGING_IN_MFA,
        userId,
        code
      )
      if (!tokenData) {
        throw new Error('Failed to verify MFA token')
      }

      // Create the logged_in token after successful verification
      const loggedInToken = await createToken(TOKEN_TYPES.LOGGED_IN, userId)
      if (!loggedInToken) {
        throw new Error(
          'Failed to create logged_in token after MFA verification'
        )
      }

      if (onSuccess) {
        onSuccess(loggedInToken)
      }

      return true
    } catch (err) {
      const error =
        err instanceof Error
          ? err
          : new Error('Unknown error during MFA verification')
      setError(error.message)
      if (onError) onError(error)
      return false
    } finally {
      setIsVerifying(false)
    }
  }

  return {
    isVerifying,
    isLoading,
    error,
    hasMfaSecret,
    mfaSecret,
    checkMfaSetup,
    verifyMfaCode,
  }
}

export default useMfaVerification
