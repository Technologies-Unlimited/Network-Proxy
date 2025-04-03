'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { Box, Snackbar, Alert } from '@mui/material'
import {
  CustomDialog,
  CustomButtonProps,
  TypographyProps,
  ConfirmationCodeInputsProps,
} from 'goobs-frontend'
import { useRouter } from 'next/navigation'
import { ColorPaletteKeys } from '@/themes/palette'
import { TOKEN_TYPES } from '@/types/auth'
import { verifyMFAToken } from '@/actions/auth/mfa/microsoft/verify'
import { getTokenData, promoteToken } from '@/actions/auth/production/identity'

// Add type for verifyMFAToken parameters
interface VerifyMFATokenParams {
  token: string
  secret: string
}

// Helper function to mask sensitive data for logging
const maskSecret = (secret: string): string => {
  if (!secret) return '[NO_SECRET]'
  if (secret.length <= 8) return '********'
  return `${secret.substring(0, 4)}...${secret.substring(secret.length - 4)}`
}

const MFAVerificationForm: React.FC = () => {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isValid, setIsValid] = useState(false)
  const [mfaToken, setMfaToken] = useState('')
  const [mfaSecret, setMfaSecret] = useState<string>('')
  const [userId, setUserId] = useState<string>('')
  const [email, setEmail] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Fetch MFA token data from the cookie on component mount
  useEffect(() => {
    const fetchTokenData = async (): Promise<void> => {
      try {
        setIsLoading(true)

        console.log('[MFA-VERIFY] Fetching MFA token data from cookie')
        const tokenData = await getTokenData(TOKEN_TYPES.LOGGING_IN_MFA)

        if (!tokenData || !tokenData.userId || !tokenData.tokenString) {
          console.error('[MFA-VERIFY] Invalid or missing MFA token data')
          setError(
            'Your MFA verification session has expired. Please log in again.'
          )
          return
        }

        console.log('[MFA-VERIFY] MFA token data retrieved successfully', {
          userId: tokenData.userId,
          hasTokenString: !!tokenData.tokenString,
          tokenLength: tokenData.tokenString?.length || 0,
          timestamp: new Date().toISOString(),
        })

        setUserId(tokenData.userId)
        setMfaSecret(tokenData.tokenString)
        setEmail(tokenData.email || 'user@example.com') // Fallback if email not in token
      } catch (error) {
        console.error('[MFA-VERIFY] Error fetching token data:', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          timestamp: new Date().toISOString(),
        })
        setError('Failed to initialize MFA verification')
      } finally {
        setIsLoading(false)
      }
    }

    void fetchTokenData()
  }, [])

  // Create logged_in token after successful MFA verification
  const createLoggedInToken = useCallback(
    async (mfaSecret: string): Promise<void> => {
      try {
        console.log('[MFA-VERIFY] Creating logged_in token with secret', {
          secretLength: mfaSecret?.length || 0,
          secretMasked: maskSecret(mfaSecret),
          timestamp: new Date().toISOString(),
        })

        const tokenData = {
          tokenName: TOKEN_TYPES.LOGGED_IN,
          userId,
          mfaSecret, // Pass the MFA secret to preserve it in the logged_in token
        }

        const response = await fetch('/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tokenData),
          credentials: 'include',
          cache: 'no-store',
        })

        if (!response.ok) {
          console.error(
            '[MFA-VERIFY] HTTP error creating token:',
            response.status
          )
          let errorMsg = `HTTP error! status: ${response.status}`
          try {
            const errorData = (await response.json()) as { error?: string }
            if (errorData.error) {
              errorMsg = errorData.error
            }
          } catch (error) {
            console.error('[MFA-VERIFY] Failed to parse error response:', error)
          }
          throw new Error(errorMsg)
        }

        const result = await response.json()
        console.log('[MFA-VERIFY] Token API response:', {
          success: result.success,
          hasError: !!result.error,
          hasData: !!result.data,
          timestamp: new Date().toISOString(),
        })

        if (!result.success) {
          throw new Error(result.error || 'Failed to create logged in token')
        }

        console.log('[MFA-VERIFY] Logged_in token created successfully')
      } catch (unknownError) {
        const errorMessage =
          unknownError instanceof Error
            ? unknownError.message
            : 'Unknown error in createLoggedInToken'
        console.error('[MFA-VERIFY] Logged in token creation error:', {
          error: errorMessage,
          stack:
            unknownError instanceof Error
              ? unknownError.stack
              : 'No stack trace',
          userId,
          timestamp: new Date().toISOString(),
        })
        throw new Error(errorMessage)
      }
    },
    [userId]
  )

  // Handle MFA verification
  const handleVerify = useCallback(async (): Promise<void> => {
    if (!mfaToken) {
      setError('Please enter your verification code')
      return
    }

    if (!mfaSecret) {
      setError('MFA not properly initialized')
      return
    }

    setIsLoading(true)

    try {
      // Log what we're trying to verify
      console.log('[MFA-VERIFY] Attempting to verify MFA token:', {
        tokenLength: mfaToken.length,
        tokenFormat: /^\d+$/.test(mfaToken) ? 'Numeric' : 'Non-numeric',
        hasSecret: !!mfaSecret,
        secretLength: mfaSecret.length,
        secretFormat: mfaSecret?.match(/^[A-Z2-7]+=*$/)
          ? 'Base32 (valid)'
          : 'Unknown format',
        secretMasked: maskSecret(mfaSecret),
        timestamp: new Date().toISOString(),
      })

      // Verify the token using the server action
      const verifyStartTime = performance.now()
      const isValid = await verifyMFAToken({
        token: mfaToken,
        secret: mfaSecret,
      } as VerifyMFATokenParams)
      const verifyEndTime = performance.now()

      console.log('[MFA-VERIFY] MFA verification result:', {
        isValid,
        verificationTimeMs: verifyEndTime - verifyStartTime,
        timestamp: new Date().toISOString(),
      })

      if (!isValid) {
        setError('Invalid verification code. Please try again.')
        setIsValid(false)
        setIsLoading(false)
        return
      }

      console.log('[MFA-VERIFY] MFA token verification successful', {
        userId,
        timestamp: new Date().toISOString(),
      })

      // Promote the token from LOGGING_IN_MFA to LOGGED_IN
      const promotionResult = await promoteToken(
        userId,
        TOKEN_TYPES.LOGGING_IN_MFA,
        TOKEN_TYPES.LOGGED_IN
      )

      if (!promotionResult) {
        console.error('[MFA-VERIFY] Failed to promote token:', {
          userId,
          fromTokenType: TOKEN_TYPES.LOGGING_IN_MFA,
          toTokenType: TOKEN_TYPES.LOGGED_IN,
          timestamp: new Date().toISOString(),
        })
        throw new Error('Failed to promote token')
      }

      // Create logged_in token after successful verification
      await createLoggedInToken(mfaSecret)

      // Set success state
      setSuccessMessage('MFA verification successful! Redirecting...')
      setError(null)
      setIsValid(true)

      // Redirect after a brief delay
      setTimeout(() => {
        router.push('/network-administration')
      }, 1500)
    } catch (unknownError) {
      const errorMessage =
        unknownError instanceof Error
          ? unknownError.message
          : 'An error occurred during verification'
      console.error('[MFA-VERIFY] MFA Verification error:', {
        error: errorMessage,
        stack:
          unknownError instanceof Error ? unknownError.stack : 'No stack trace',
        userId,
        timestamp: new Date().toISOString(),
      })
      setError(errorMessage)
      setIsValid(false)
    } finally {
      setIsLoading(false)
    }
  }, [mfaToken, userId, mfaSecret, createLoggedInToken, router])

  // Handle token input change
  const handleTokenChange = useCallback(
    (value: string): void => {
      console.log('[MFA-VERIFY] Token input changed:', {
        newLength: value.length,
        completed: value.length === 6,
        timestamp: new Date().toISOString(),
      })

      setMfaToken(value)

      // Auto-verify when 6 digits are entered
      if (value.length === 6 && /^\d{6}$/.test(value)) {
        console.log('[MFA-VERIFY] Auto-verifying complete token input')
        void handleVerify()
      }
    },
    [handleVerify]
  )

  // Handle "Back" to login
  const handleBack = useCallback((): void => {
    router.push('/auth/login')
  }, [router])

  // Create the confirmation code input with built-in buttons
  const confirmationCodeInput = React.useMemo<ConfirmationCodeInputsProps>(
    () => ({
      identifier: 'mfaVerificationCode',
      isValid,
      codeLength: 6,
      'aria-required': true,
      onChange: handleTokenChange,
      value: mfaToken,
      onVerify: handleVerify,
      onDisableVerification: () => {
        try {
          setIsLoading(true)
          // Reset MFA verification state
          setMfaToken('')
          setIsValid(false)

          // Return to login screen
          router.push('/auth/login')

          setError('MFA verification cancelled. Please try logging in again.')
        } catch (error) {
          console.error(
            '[MFA-VERIFY] Failed to disable MFA verification:',
            error
          )
          setError('Failed to cancel MFA verification')
        } finally {
          setIsLoading(false)
        }
      },
      verifyButtonProps: {
        text: 'Verify MFA Code',
        fontcolor: 'white',
        backgroundcolor: 'primary',
        disableButton: isLoading ? 'true' : 'false',
      },
      showActionButtons: true,
      showSendResendButton: false, // No need to send/resend for MFA
      showSuccessState: isValid,
      successMessage: 'MFA Verified Successfully',
    }),
    [isValid, mfaToken, handleTokenChange, handleVerify, isLoading, router]
  )

  const infoTypographyProps = React.useMemo<TypographyProps[]>(
    () => [
      {
        text: isLoading
          ? 'Loading your MFA settings...'
          : 'Enter the 6-digit code from your authenticator app',
        fontcolor: 'black' as ColorPaletteKeys,
        fontvariant: 'merrih6',
      },
      {
        text: `Account: ${email}`,
        fontcolor: 'black' as ColorPaletteKeys,
        fontvariant: 'merriparagraph',
      },
    ],
    [isLoading, email]
  )

  const navigationButtonProps = React.useMemo<CustomButtonProps[]>(
    () => [
      {
        text: 'Back',
        fontcolor: 'white' as ColorPaletteKeys,
        backgroundcolor: 'secondary' as ColorPaletteKeys,
        onClick: () => void handleBack(),
        disableButton: isLoading ? 'true' : 'false',
      },
      {
        text: 'Continue',
        fontcolor: 'white' as ColorPaletteKeys,
        backgroundcolor: 'primary' as ColorPaletteKeys,
        onClick: () => {
          if (isValid) {
            router.push('/network-administration')
          } else {
            void handleVerify()
          }
        },
        disableButton: !mfaToken || isLoading ? 'true' : 'false',
      },
    ],
    [handleBack, handleVerify, mfaToken, isValid, isLoading, router]
  )

  // Build dialog grids with proper structure
  const dialogGrids = React.useMemo(
    () => [
      // Verification code grid
      {
        confirmationcodeinput: confirmationCodeInput,
        typography: infoTypographyProps,
        style: {
          marginBottom: '20px',
        },
      },

      // Navigation buttons grid
      {
        button: navigationButtonProps,
        style: {
          marginTop: '20px',
          display: 'flex',
          flexDirection: 'row' as const,
          justifyContent: 'space-between',
          gap: '10px',
          width: '100%',
        } satisfies React.CSSProperties,
      },
    ],
    [confirmationCodeInput, infoTypographyProps, navigationButtonProps]
  )

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
      }}
    >
      <CustomDialog
        title="Multi-Factor Authentication"
        description="Verify your identity"
        grids={dialogGrids}
        width={450}
      />
      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setError(null)}
          severity="error"
          sx={{ width: '100%' }}
        >
          {error}
        </Alert>
      </Snackbar>
      <Snackbar
        open={!!successMessage}
        autoHideDuration={3000}
        onClose={() => setSuccessMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSuccessMessage(null)}
          severity="success"
          sx={{ width: '100%' }}
        >
          {successMessage}
        </Alert>
      </Snackbar>
    </Box>
  )
}

export default MFAVerificationForm
