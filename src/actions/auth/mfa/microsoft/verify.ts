'use server'

import { authenticator } from 'otplib'

interface VerifyMFAOptions {
  token: string
  secret: string
}

/**
 * Verifies a Microsoft Authenticator TOTP code against the provided secret
 *
 * @param options Object containing token (user-provided code) and secret (shared secret)
 * @returns Boolean indicating if the verification was successful
 */
export const verifyMFAToken = async (
  options: VerifyMFAOptions
): Promise<boolean> => {
  const { token, secret } = options

  console.log('[VERIFY-MFA] Starting verification:', {
    tokenReceived: !!token,
    tokenLength: token?.length || 0,
    tokenFormat: token?.match(/^\d+$/) ? 'Numeric' : 'Non-numeric',
    secretReceived: !!secret,
    secretLength: secret?.length || 0,
    timestamp: new Date().toISOString(),
  })

  if (!token || !secret) {
    console.error('[VERIFY-MFA] Missing token or secret')
    return false
  }

  // Configure authenticator options
  authenticator.options = {
    window: 1, // Allow one period before/after for clock drift
  }

  try {
    console.log('[VERIFY-MFA] Attempting to verify token')

    // Verify the token against the secret
    const result = authenticator.verify({
      token,
      secret,
    })

    console.log(
      `[VERIFY-MFA] Verification result: ${result ? 'Success' : 'Failed'}`
    )

    return result
  } catch (error) {
    console.error('[VERIFY-MFA] Verification error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })

    return false
  }
}

export default verifyMFAToken
