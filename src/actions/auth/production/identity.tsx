'use server'

import { TOKEN_TYPES, TokenType } from '@/types/auth'

export type SessionStatus = 'loggedIn' | 'loggingIn' | 'loggedOut' | 'invalid'
// Network-Proxy only uses employee type
export type UserType = 'employee'

export type SessionValidationActionResult = {
  success: boolean
  data?: {
    status: SessionStatus
    authId?: string
    userId?: string
    userType?: UserType
    tokenString?: string
    email?: string
    mfaVerified?: boolean
    redirectUrl?: string
  }
  error?: string
}

export type MFAVerifyStatus = {
  userId: string
  authId: string
  email: string
  mfaVerified: boolean
  userType: UserType
}

// GraphQL queries
const VALIDATE_TOKEN_QUERY = `
  query validateToken($input: ValidateTokenInput!) {
    validateToken(input: $input) {
      valid
      userId
      tokenType
      message
    }
  }
`

const GET_USER_AUTH_BY_TOKEN_QUERY = `
  query getUserAuthByToken($tokenString: String!, $tokenType: TokenType!) {
    getUserAuthByToken(tokenString: $tokenString, tokenType: $tokenType) {
      _id
      userId
      tokens {
        tokenType
        tokenString
        expirationDate
        status
      }
    }
  }
`

const GET_USER_MFA_SECRET_QUERY = `
  query getUserMfaSecret($userId: String!, $tokenType: TokenType!) {
    getUserMfaSecret(userId: $userId, tokenType: $tokenType) {
      secret
    }
  }
`

// GraphQL mutations
const PROMOTE_TOKEN_MUTATION = `
  mutation promoteToken($input: PromoteTokenInput!) {
    promoteToken(input: $input) {
      tokenType
      tokenString
      expirationDate
      status
    }
  }
`

/**
 * Call the GraphQL API with proper error handling
 */
async function callGraphQLApi(
  query: string,
  variables: Record<string, any>
): Promise<any> {
  try {
    // Get API URL from env or use default
    const apiUrl =
      process.env.NEXT_PUBLIC_AUTH_API_URL ||
      'https://technologiesunlimited.net'
    const endpoint = `${apiUrl}/api/graphql/user/auth`

    console.log('Calling GraphQL API:', {
      endpoint,
      operationType: query.includes('mutation') ? 'Mutation' : 'Query',
      timestamp: new Date().toISOString(),
    })

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('GraphQL API request failed:', {
        status: response.status,
        error: errorText,
        timestamp: new Date().toISOString(),
      })
      return { errors: [{ message: `API request failed: ${response.status}` }] }
    }

    const result = await response.json()

    if (result.errors) {
      console.error('GraphQL API returned errors:', {
        errors: result.errors,
        timestamp: new Date().toISOString(),
      })
    }

    return result
  } catch (error) {
    console.error('Error calling GraphQL API:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    })
    return { errors: [{ message: 'Failed to call GraphQL API' }] }
  }
}

/**
 * Validates user session by checking for presence of authentication cookies
 * and validating them against the database via GraphQL API
 */
export async function validateUserSession(
  request?: Request
): Promise<SessionValidationActionResult> {
  console.log('Validating user session', {
    hasRequest: !!request,
    timestamp: new Date().toISOString(),
  })

  try {
    // Skip cookie extraction for client-side requests as this is server-side only
    const cookieHeader = request?.headers.get('cookie') || ''

    // Cookie helper for Bun compatibility
    let cookieMap: { get?: (name: string) => string | null } = {}

    try {
      // @ts-ignore - Bun types not available
      cookieMap = new Bun.CookieMap(cookieHeader)
    } catch (e) {
      // Fallback to parsing cookies manually
      cookieMap = {
        get: (name: string) => {
          const cookieValue = cookieHeader
            .split(';')
            .find(c => c.trim().startsWith(`${name}=`))
            ?.split('=')[1]

          return cookieValue ? decodeURIComponent(cookieValue.trim()) : null
        },
      }
    }

    // Get authentication cookies
    const loggedInCookie = cookieMap.get?.(TOKEN_TYPES.LOGGED_IN)
    const loggingInMainCookie = cookieMap.get?.(TOKEN_TYPES.LOGGING_IN_MAIN)
    const loggingInMfaCookie = cookieMap.get?.(TOKEN_TYPES.LOGGING_IN_MFA)
    const signingUpMainCookie = cookieMap.get?.(TOKEN_TYPES.SIGNING_UP_MAIN)
    const signedUpMfaCookie = cookieMap.get?.(TOKEN_TYPES.SIGNED_UP_MFA)

    console.log('Cookie validation check:', {
      hasLoggedInCookie: !!loggedInCookie,
      hasLoggingInMainCookie: !!loggingInMainCookie,
      hasLoggingInMfaCookie: !!loggingInMfaCookie,
      timestamp: new Date().toISOString(),
    })

    // Try to parse fully logged in users first (they have completed the authentication flow)
    if (loggedInCookie) {
      try {
        const tokenData = JSON.parse(loggedInCookie)

        if (
          tokenData &&
          tokenData.tokenName === TOKEN_TYPES.LOGGED_IN &&
          tokenData.tokenString &&
          tokenData.userId
        ) {
          // Validate token expiration locally first
          const tokenExpiry = new Date(tokenData.tokenExpiration)
          const now = new Date()

          if (tokenExpiry > now) {
            // Validate the token against the database via GraphQL API
            const result = await callGraphQLApi(VALIDATE_TOKEN_QUERY, {
              input: {
                tokenString: tokenData.tokenString,
                tokenType: TOKEN_TYPES.LOGGED_IN,
              },
            })

            if (result.data?.validateToken?.valid) {
              console.log(
                `Token validated successfully against database for ${tokenData.userId}`
              )

              // Get user auth details to verify userId matches
              const userAuthResult = await callGraphQLApi(
                GET_USER_AUTH_BY_TOKEN_QUERY,
                {
                  tokenString: tokenData.tokenString,
                  tokenType: TOKEN_TYPES.LOGGED_IN,
                }
              )

              const userAuth = userAuthResult.data?.getUserAuthByToken

              // Verify the userId from the cookie matches the one in the database
              if (userAuth && userAuth.userId === tokenData.userId) {
                console.log(
                  `Found valid LOGGED_IN token for ${tokenData.userId} and verified in database`
                )

                // All Network-Proxy users are 'employee' type
                const userType: UserType = 'employee'

                return {
                  success: true,
                  data: {
                    status: 'loggedIn',
                    userId: tokenData.userId,
                    authId: tokenData.authId || userAuth._id,
                    userType,
                    tokenString: tokenData.tokenString,
                    mfaVerified: true, // Logged in users are MFA verified
                  },
                }
              } else {
                console.error('User ID mismatch between cookie and database', {
                  cookieUserId: tokenData.userId,
                  dbUserId: userAuth?.userId,
                })
              }
            } else {
              console.log('LOGGED_IN token failed database validation', {
                userId: tokenData.userId,
                message:
                  result.data?.validateToken?.message ||
                  'Unknown validation error',
              })
            }
          } else {
            console.log('LOGGED_IN token has expired', {
              userId: tokenData.userId,
              tokenExpiry: tokenExpiry.toISOString(),
              currentTime: now.toISOString(),
            })
          }
        }
      } catch (error) {
        console.error('Error parsing LOGGED_IN token:', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // Check for MFA verification flow
    if (loggingInMfaCookie) {
      try {
        const tokenData = JSON.parse(loggingInMfaCookie)

        if (
          tokenData &&
          tokenData.tokenName === TOKEN_TYPES.LOGGING_IN_MFA &&
          tokenData.tokenString
        ) {
          // Validate token expiration
          const tokenExpiry = new Date(tokenData.tokenExpiration)
          const now = new Date()

          if (tokenExpiry > now) {
            // Validate the token against the database
            const result = await callGraphQLApi(VALIDATE_TOKEN_QUERY, {
              input: {
                tokenString: tokenData.tokenString,
                tokenType: TOKEN_TYPES.LOGGING_IN_MFA,
              },
            })

            if (result.data?.validateToken?.valid) {
              console.log(
                'Found valid LOGGING_IN_MFA token and verified in database'
              )

              // Return MFA verification in progress
              return {
                success: true,
                data: {
                  status: 'loggingIn',
                  userId: tokenData.userId,
                  authId: tokenData.authId,
                  userType: 'employee',
                  tokenString: tokenData.tokenString,
                  email: tokenData.email || '',
                  redirectUrl: '/auth/login/mfa-verification',
                },
              }
            }
          }
        }
      } catch (error) {
        console.error('Error parsing LOGGING_IN_MFA token:', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // Check for main login flow
    if (loggingInMainCookie) {
      try {
        const tokenData = JSON.parse(loggingInMainCookie)

        if (
          tokenData &&
          tokenData.tokenName === TOKEN_TYPES.LOGGING_IN_MAIN &&
          tokenData.tokenString
        ) {
          // Validate token expiration
          const tokenExpiry = new Date(tokenData.tokenExpiration)
          const now = new Date()

          if (tokenExpiry > now) {
            // Validate the token against the database
            const result = await callGraphQLApi(VALIDATE_TOKEN_QUERY, {
              input: {
                tokenString: tokenData.tokenString,
                tokenType: TOKEN_TYPES.LOGGING_IN_MAIN,
              },
            })

            if (result.data?.validateToken?.valid) {
              console.log(
                'Found valid LOGGING_IN_MAIN token and verified in database'
              )

              // Return login in progress
              return {
                success: true,
                data: {
                  status: 'loggingIn',
                  userId: tokenData.userId,
                  authId: tokenData.authId,
                  userType: 'employee',
                  tokenString: tokenData.tokenString,
                },
              }
            }
          }
        }
      } catch (error) {
        console.error('Error parsing LOGGING_IN_MAIN token:', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // If all checks fail, user is logged out
    return {
      success: true,
      data: {
        status: 'loggedOut',
      },
    }
  } catch (error) {
    console.error('Session validation error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })

    return {
      success: false,
      error: 'Failed to validate session',
      data: {
        status: 'invalid',
      },
    }
  }
}

/**
 * Verifies MFA status for a user via GraphQL API
 */
export async function verifyMFAStatus(
  userId: string
): Promise<MFAVerifyStatus | null> {
  try {
    // Get MFA secret via GraphQL API
    const result = await callGraphQLApi(GET_USER_MFA_SECRET_QUERY, {
      userId,
      tokenType: TOKEN_TYPES.LOGGING_IN_MFA,
    })

    if (result.errors || !result.data?.getUserMfaSecret) {
      console.error('Failed to get MFA secret:', {
        userId,
        errors: result.errors,
      })
      return null
    }

    const mfaSecret = result.data.getUserMfaSecret.secret

    // Get user auth details
    const userAuthResult = await callGraphQLApi(GET_USER_AUTH_BY_TOKEN_QUERY, {
      tokenString: mfaSecret,
      tokenType: TOKEN_TYPES.LOGGING_IN_MFA,
    })

    if (userAuthResult.errors || !userAuthResult.data?.getUserAuthByToken) {
      console.error('Failed to get user auth details:', {
        userId,
        errors: userAuthResult.errors,
      })
      return null
    }

    const userAuth = userAuthResult.data.getUserAuthByToken

    return {
      userId,
      authId: userAuth._id,
      email: '', // Email might need to be fetched from a different API
      mfaVerified: !!mfaSecret,
      userType: 'employee',
    }
  } catch (error) {
    console.error('Error verifying MFA status:', {
      error: error instanceof Error ? error.message : String(error),
      userId,
    })
    return null
  }
}

/**
 * Get token data from cookie and validate against database
 */
export async function getTokenData(
  tokenType: TokenType,
  request?: Request
): Promise<any> {
  try {
    // Get cookie from request if provided
    const cookieHeader = request?.headers.get('cookie') || ''

    // Cookie helper for Bun compatibility
    let cookieMap: { get?: (name: string) => string | null } = {}

    try {
      // @ts-ignore - Bun types not available
      cookieMap = new Bun.CookieMap(cookieHeader)
    } catch (e) {
      // Fallback to parsing cookies manually
      cookieMap = {
        get: (name: string) => {
          const cookieValue = cookieHeader
            .split(';')
            .find(c => c.trim().startsWith(`${name}=`))
            ?.split('=')[1]

          return cookieValue ? decodeURIComponent(cookieValue.trim()) : null
        },
      }
    }

    // Get token cookie
    const tokenCookie = cookieMap.get?.(tokenType)

    if (!tokenCookie) {
      return null
    }

    try {
      const tokenData = JSON.parse(tokenCookie)

      // Validate token against database
      if (tokenData && tokenData.tokenString) {
        const result = await callGraphQLApi(VALIDATE_TOKEN_QUERY, {
          input: {
            tokenString: tokenData.tokenString,
            tokenType,
          },
        })

        if (result.data?.validateToken?.valid) {
          return tokenData
        } else {
          console.error(`Token validation failed for ${tokenType}:`, {
            message:
              result.data?.validateToken?.message || 'Unknown validation error',
          })
          return null
        }
      }

      return null
    } catch (error) {
      console.error(`Error parsing ${tokenType} token:`, {
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  } catch (error) {
    console.error(`Error getting ${tokenType} token data:`, {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/**
 * Promotes a token from one type to another via GraphQL API
 */
export async function promoteToken(
  userId: string,
  fromTokenType: TokenType,
  toTokenType: TokenType,
  newTokenString?: string
): Promise<boolean> {
  try {
    const result = await callGraphQLApi(PROMOTE_TOKEN_MUTATION, {
      input: {
        userId,
        fromTokenType,
        toTokenType,
        newTokenString,
        expirationMinutes: 10080, // 7 days
      },
    })

    if (result.errors || !result.data?.promoteToken) {
      console.error('Failed to promote token:', {
        userId,
        fromTokenType,
        toTokenType,
        errors: result.errors,
      })
      return false
    }

    return true
  } catch (error) {
    console.error('Error promoting token:', {
      error: error instanceof Error ? error.message : String(error),
      userId,
      fromTokenType,
      toTokenType,
    })
    return false
  }
}
