import { NextResponse } from 'next/server'
import { z } from 'zod'
import { randomBytes } from 'crypto'
import {
  TokenType as AuthTokenType,
  TokenData,
  TOKEN_TYPES,
  LoginTokenType,
  SignupTokenType,
} from '@/types/auth'

// Helper function to mask secrets in logs
const maskSecret = (secret: string): string => {
  if (!secret) return '[NO_SECRET]'
  if (secret.length <= 8) return '********'
  return `${secret.substring(0, 4)}...${secret.substring(secret.length - 4)}`
}

// Helper function to check if a string is Base32 encoded (for TOTP secrets)
const isBase32Format = (str: string): boolean => {
  return /^[A-Z2-7]+=*$/.test(str)
}

// Token generation utility
function generateSecureToken(length: number = 48): string {
  return randomBytes(length).toString('hex')
}

// Default token expiration durations (in milliseconds)
const TOKEN_EXPIRATION = {
  // All tokens expire in 7 days
  LOGIN: 7 * 24 * 60 * 60 * 1000,
  LOGGED_IN: 7 * 24 * 60 * 60 * 1000,
  SIGNUP: 7 * 24 * 60 * 60 * 1000,
}

// Group tokens by category for easier conflict management
const LOGIN_TOKENS: LoginTokenType[] = [
  TOKEN_TYPES.LOGGING_IN_MAIN,
  TOKEN_TYPES.LOGGING_IN_MFA,
]

const SIGNUP_TOKENS: SignupTokenType[] = [
  TOKEN_TYPES.SIGNING_UP_MAIN,
  TOKEN_TYPES.SIGNED_UP_MFA,
]

// Map of which tokens to clear when setting a particular token
const TOKEN_CONFLICTS: Record<AuthTokenType, AuthTokenType[]> = {
  // Each token only purges itself before setting to ensure a fresh token
  [TOKEN_TYPES.LOGGED_IN]: [TOKEN_TYPES.LOGGED_IN],
  [TOKEN_TYPES.LOGGING_IN_MAIN]: [TOKEN_TYPES.LOGGING_IN_MAIN],
  [TOKEN_TYPES.LOGGING_IN_MFA]: [TOKEN_TYPES.LOGGING_IN_MFA],
  [TOKEN_TYPES.SIGNING_UP_MAIN]: [TOKEN_TYPES.SIGNING_UP_MAIN],
  [TOKEN_TYPES.SIGNED_UP_MFA]: [TOKEN_TYPES.SIGNED_UP_MFA],
}

// Cookie implementation for environments without Bun
class SimpleCookieMap {
  private cookies: Map<string, string> = new Map()

  constructor(cookieHeader?: string) {
    if (cookieHeader) {
      this.parseCookieHeader(cookieHeader)
    }
  }

  private parseCookieHeader(cookieHeader: string): void {
    cookieHeader.split(';').forEach(cookie => {
      const parts = cookie.split('=')
      if (parts.length >= 2) {
        const name = parts[0].trim()
        const value = parts.slice(1).join('=').trim()
        this.cookies.set(name, value)
      }
    })
  }

  public has(name: string): boolean {
    return this.cookies.has(name)
  }

  public get(name: string): string | null {
    return this.cookies.get(name) || null
  }
}

class SimpleCookie {
  constructor(
    public readonly name: string,
    public value: string,
    public options: {
      domain?: string
      path?: string
      expires?: Date
      maxAge?: number
      secure?: boolean
      httpOnly?: boolean
      sameSite?: 'strict' | 'lax' | 'none'
    } = {}
  ) {}

  toString(): string {
    const parts: string[] = [`${this.name}=${this.value}`]

    if (this.options.domain) {
      parts.push(`Domain=${this.options.domain}`)
    }

    if (this.options.path) {
      parts.push(`Path=${this.options.path}`)
    }

    if (this.options.expires) {
      parts.push(`Expires=${this.options.expires.toUTCString()}`)
    }

    if (this.options.maxAge !== undefined) {
      parts.push(`Max-Age=${this.options.maxAge}`)
    }

    if (this.options.secure) {
      parts.push('Secure')
    }

    if (this.options.httpOnly) {
      parts.push('HttpOnly')
    }

    if (this.options.sameSite) {
      parts.push(`SameSite=${this.options.sameSite}`)
    }

    return parts.join('; ')
  }
}

// Helper function to determine token expiration based on token type
function getTokenExpiration(tokenType: AuthTokenType): Date {
  const now = new Date()

  if (tokenType === TOKEN_TYPES.LOGGED_IN) {
    return new Date(now.getTime() + TOKEN_EXPIRATION.LOGGED_IN)
  } else if (LOGIN_TOKENS.includes(tokenType as LoginTokenType)) {
    return new Date(now.getTime() + TOKEN_EXPIRATION.LOGIN)
  } else if (SIGNUP_TOKENS.includes(tokenType as SignupTokenType)) {
    return new Date(now.getTime() + TOKEN_EXPIRATION.SIGNUP)
  }

  // Default to 1 hour if not specified
  return new Date(now.getTime() + 60 * 60 * 1000)
}

// Define output types for the Zod schemas
interface ValidatedBaseTokenData {
  tokenName?: string
  userId?: string
}

// Base validation schema for incoming token data
const baseTokenDataSchema = z
  .object({
    tokenName: z
      .string()
      .optional()
      .refine(
        val =>
          val === undefined ||
          Object.values(TOKEN_TYPES).includes(val as AuthTokenType),
        {
          message: 'Invalid token name',
        }
      ),
    userId: z.string().optional(),
    mfaSecret: z.string().optional(),
  })
  .refine(
    data => {
      // tokenName must be provided
      return typeof data.tokenName === 'string' && data.tokenName.trim() !== ''
    },
    {
      message: 'tokenName must be provided',
      path: ['tokenName'],
    }
  )

// Helper to validate token data based on token type
const validateTokenData = (
  body: unknown,
  tokenType: AuthTokenType
): z.SafeParseReturnType<unknown, ValidatedBaseTokenData> => {
  return baseTokenDataSchema
    .refine(data => !data.tokenName || data.tokenName === tokenType, {
      message: `Token name must be "${tokenType}"`,
      path: ['tokenName'],
    })
    .refine(
      data => {
        // LOGGED_IN token type requires a userId
        if (tokenType === TOKEN_TYPES.LOGGED_IN) {
          return typeof data.userId === 'string' && data.userId.trim() !== ''
        }
        return true
      },
      {
        message: 'UserId is required for LOGGED_IN tokens',
        path: ['userId'],
      }
    )
    .safeParse(body)
}

// Helper function to purge conflicting tokens
const purgeConflictingTokens = async (
  tokenType: AuthTokenType,
  req: Request
): Promise<string[]> => {
  // Get tokens to remove based on conflicts
  const tokensToRemove = TOKEN_CONFLICTS[tokenType] || []
  const cookieHeaders: string[] = []

  console.log(`Purging tokens before setting ${tokenType} token:`, {
    tokensToRemove,
    timestamp: new Date().toISOString(),
  })

  // Extract current cookies from request
  const cookieHeader = req.headers.get('cookie') || ''

  // Use either Bun's CookieMap if available or our simple implementation
  let cookieMap: { has: (name: string) => boolean }

  try {
    // @ts-ignore - Bun types not available
    cookieMap = new Bun.CookieMap(cookieHeader)
  } catch (e) {
    // Fallback to simple implementation if Bun is not available
    cookieMap = new SimpleCookieMap(cookieHeader)
  }

  // Process each token to be removed
  for (const tokenToRemove of tokensToRemove) {
    // If token exists, create an expired cookie to remove it
    if (cookieMap.has(tokenToRemove)) {
      // Create cookie with either Bun or simple implementation
      let cookieStr: string

      try {
        // @ts-ignore - Bun types not available
        const expiredCookie = new Bun.Cookie(tokenToRemove, '', {
          expires: new Date(0),
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          path: '/',
        })
        cookieStr = expiredCookie.toString()
      } catch (e) {
        // Fallback implementation
        const expiredCookie = new SimpleCookie(tokenToRemove, '', {
          expires: new Date(0),
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          path: '/',
        })
        cookieStr = expiredCookie.toString()
      }

      cookieHeaders.push(cookieStr)
      console.log(`Purged cookie token: ${tokenToRemove}`)
    }
  }

  return cookieHeaders
}

// Remote authentication function that calls Unlimited-Application-Skeleton API
async function callRemoteAuthApi(
  userId: string,
  tokenType: AuthTokenType,
  tokenString: string,
  mfaSecret?: string
): Promise<{ success: boolean; authId?: string }> {
  try {
    // Use environment variable for API URL or default to production URL
    const authApiUrl =
      process.env.NEXT_PUBLIC_AUTH_API_URL ||
      'https://technologiesunlimited.net'

    console.log(`Calling remote auth API at ${authApiUrl}/api/token`, {
      tokenType,
      hasUserId: !!userId,
      hasMfaSecret: !!mfaSecret,
      timestamp: new Date().toISOString(),
    })

    // Call the remote API to validate the token
    const response = await fetch(`${authApiUrl}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokenName: tokenType,
        userId,
        mfaSecret, // Only for MFA tokens
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Remote auth API error:', {
        status: response.status,
        error: errorText,
        tokenType,
        timestamp: new Date().toISOString(),
      })
      return { success: false }
    }

    const result = await response.json()

    // Extract authId if present
    const authId = result.data?.authId

    console.log('Remote auth API call successful', {
      success: result.success,
      hasAuthId: !!authId,
      timestamp: new Date().toISOString(),
    })

    return {
      success: result.success,
      authId,
    }
  } catch (error) {
    console.error('Error calling remote auth API:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      tokenType,
      timestamp: new Date().toISOString(),
    })
    return { success: false }
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    // Parse the request body
    const body: unknown = await request.json()

    console.log('Received token request body:', {
      hasBody: !!body,
      body,
      timestamp: new Date().toISOString(),
    })

    // Extract from request body
    const requestBody = body as {
      tokenName?: string
      userId?: string
      mfaSecret?: string
    }

    // For regular token requests, we need a valid tokenType
    const tokenType = requestBody.tokenName as AuthTokenType

    // Validate that the tokenType is one of our known types for regular requests
    if (!tokenType || !Object.values(TOKEN_TYPES).includes(tokenType)) {
      console.log('Invalid token type detected:', {
        tokenType,
        validTokens: Object.values(TOKEN_TYPES),
      })
      return Response.json(
        {
          success: false,
          error: `Invalid token type: ${tokenType || 'undefined'}`,
          data: null,
        },
        { status: 400 }
      )
    }

    console.log(`=== POST ${tokenType} Token Request ===`, {
      timestamp: new Date().toISOString(),
      endpoint: `/api/token`,
      method: 'POST',
    })

    // Validate the token data
    const validationResult = validateTokenData(body, tokenType)

    if (!validationResult.success) {
      console.error('Token data validation failed:', {
        errors: validationResult.error.errors,
        tokenType,
        timestamp: new Date().toISOString(),
      })
      return Response.json(
        {
          success: false,
          error: 'Invalid token data provided',
          data: null,
          details: validationResult.error.errors,
        },
        { status: 400 }
      )
    }

    // Safely extract data from validation result
    const validatedData = validationResult.data
    const userId = validatedData.userId || ''

    // Generate token string and expiration date
    let tokenString: string

    // For MFA tokens, use the provided secret as the token string if available
    if (
      (tokenType === TOKEN_TYPES.SIGNED_UP_MFA ||
        tokenType === TOKEN_TYPES.LOGGING_IN_MFA) &&
      requestBody.mfaSecret
    ) {
      tokenString = requestBody.mfaSecret

      // Log MFA secret analysis
      const isMfaSecretBase32 = isBase32Format(tokenString)
      console.log(
        `Using provided MFA secret as token string for ${tokenType}:`,
        {
          format: isMfaSecretBase32 ? 'Base32 (valid)' : 'Non-Base32',
          length: tokenString.length,
          masked: maskSecret(tokenString),
        }
      )
    } else if (tokenType === TOKEN_TYPES.LOGGED_IN && requestBody.mfaSecret) {
      tokenString = requestBody.mfaSecret
      console.log(`Using provided MFA secret as token string for ${tokenType}`)
    } else {
      tokenString = generateSecureToken()
    }

    const tokenExpiration = getTokenExpiration(tokenType)

    // Call remote API for authentication
    let authId: string | undefined
    if (userId) {
      const remoteResult = await callRemoteAuthApi(
        userId,
        tokenType,
        tokenString,
        requestBody.mfaSecret
      )

      if (!remoteResult.success) {
        return Response.json(
          {
            success: false,
            error: 'Failed to authenticate with remote API',
            data: null,
          },
          { status: 401 }
        )
      }

      authId = remoteResult.authId
    }

    // Prepare token data for cookie
    const tokenData: TokenData = {
      tokenName: tokenType,
      tokenString: tokenString,
      tokenExpiration: tokenExpiration,
      userId: userId,
      authId: authId,
    }

    console.log('Generated token data:', {
      tokenName: tokenData.tokenName,
      hasTokenString: !!tokenData.tokenString,
      hasUserId: !!tokenData.userId,
      hasAuthId: !!tokenData.authId,
      expiration: tokenData.tokenExpiration.toISOString(),
    })

    // Purge other tokens before setting the new one
    const cookieHeaders = await purgeConflictingTokens(tokenType, request)

    // Create the new token cookie
    let newCookieStr: string

    try {
      // @ts-ignore - Bun types not available
      const newCookie = new Bun.Cookie(tokenType, JSON.stringify(tokenData), {
        expires: tokenData.tokenExpiration,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
      })
      newCookieStr = newCookie.toString()
    } catch (e) {
      // Fallback implementation
      const newCookie = new SimpleCookie(tokenType, JSON.stringify(tokenData), {
        expires: tokenData.tokenExpiration,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
      })
      newCookieStr = newCookie.toString()
    }

    // Add the new cookie to the headers
    cookieHeaders.push(newCookieStr)

    console.log(`${tokenType} token created and cookie set successfully`)

    // Create response with Set-Cookie headers
    const responseHeaders = new Headers()

    // Add each cookie as a separate Set-Cookie header
    for (const cookie of cookieHeaders) {
      responseHeaders.append('Set-Cookie', cookie)
    }

    // Create response
    const response = Response.json(
      { success: true, data: tokenData },
      {
        status: 200,
        headers: responseHeaders,
      }
    )

    return response
  } catch (error) {
    console.error(`POST token error:`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    })
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to create token',
        data: null,
      },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    // Parse the request body to get token type
    const body: unknown = await request.json().catch(() => ({}))

    console.log('Received token delete request:', {
      hasBody: !!body,
      body,
      timestamp: new Date().toISOString(),
    })

    // Extract token type from request body
    const requestBody = body as { tokenName?: string; purgeAll?: boolean }
    const tokenType = requestBody.tokenName as AuthTokenType
    const purgeAll = requestBody.purgeAll === true

    // Array to collect Set-Cookie headers
    const cookieHeaders: string[] = []

    // If purgeAll is true, delete all tokens
    if (purgeAll) {
      console.log(`=== PURGE ALL Tokens Request ===`, {
        timestamp: new Date().toISOString(),
        endpoint: `/api/token`,
        method: 'DELETE',
      })

      // Delete all known token types
      for (const tokenToDelete of Object.values(TOKEN_TYPES)) {
        // Create expired cookie to delete existing one
        let cookieStr: string

        try {
          // @ts-ignore - Bun types not available
          const expiredCookie = new Bun.Cookie(tokenToDelete, '', {
            expires: new Date(0),
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/',
          })
          cookieStr = expiredCookie.toString()
        } catch (e) {
          // Fallback implementation
          const expiredCookie = new SimpleCookie(tokenToDelete, '', {
            expires: new Date(0),
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/',
          })
          cookieStr = expiredCookie.toString()
        }

        cookieHeaders.push(cookieStr)
        console.log(`${tokenToDelete} token deleted from cookies during purge`)
      }

      console.log(`All tokens purged successfully`)

      // Create response with Set-Cookie headers
      const responseHeaders = new Headers()

      // Add each cookie as a separate Set-Cookie header
      for (const cookie of cookieHeaders) {
        responseHeaders.append('Set-Cookie', cookie)
      }

      return Response.json(
        { success: true, data: null },
        {
          status: 200,
          headers: responseHeaders,
        }
      )
    }

    // Validate that the tokenType is one of our known types
    if (!tokenType || !Object.values(TOKEN_TYPES).includes(tokenType)) {
      console.log('Invalid token type detected for DELETE:', {
        tokenType,
        validTokens: Object.values(TOKEN_TYPES),
      })
      return Response.json(
        {
          success: false,
          error: `Invalid token type: ${tokenType || 'undefined'}`,
          data: null,
        },
        { status: 400 }
      )
    }

    console.log(`=== DELETE ${tokenType} Token Request ===`, {
      timestamp: new Date().toISOString(),
      endpoint: `/api/token`,
      method: 'DELETE',
    })

    // Create expired cookie to delete the token
    let cookieStr: string

    try {
      // @ts-ignore - Bun types not available
      const expiredCookie = new Bun.Cookie(tokenType, '', {
        expires: new Date(0),
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
      })
      cookieStr = expiredCookie.toString()
    } catch (e) {
      // Fallback implementation
      const expiredCookie = new SimpleCookie(tokenType, '', {
        expires: new Date(0),
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
      })
      cookieStr = expiredCookie.toString()
    }

    cookieHeaders.push(cookieStr)
    console.log(`${tokenType} token deleted successfully`)

    // Create response with Set-Cookie headers
    const responseHeaders = new Headers()

    // Add each cookie as a separate Set-Cookie header
    for (const cookie of cookieHeaders) {
      responseHeaders.append('Set-Cookie', cookie)
    }

    return Response.json(
      { success: true, data: null },
      {
        status: 200,
        headers: responseHeaders,
      }
    )
  } catch (error) {
    console.error(`DELETE token error:`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    })
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to remove token',
        data: null,
      },
      { status: 500 }
    )
  }
}
