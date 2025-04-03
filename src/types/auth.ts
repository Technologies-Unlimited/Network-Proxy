/**
 * Authentication type definitions for Network-Proxy
 * Based on Unlimited-Application-Skeleton auth system
 */

// Token configuration - must be consistent across the application
export const TOKEN_TYPES = {
  // Main authentication states
  LOGGED_IN: 'logged_in',

  // Login flow tokens
  LOGGING_IN_MAIN: 'logging_in_main',
  LOGGING_IN_MFA: 'logging_in_mfa',

  // Signup flow tokens (used in login flow for Network-Proxy)
  SIGNING_UP_MAIN: 'signing_up_main',
  SIGNED_UP_MFA: 'signed_up_mfa',
} as const

// Create a type from the token types for typesafety
export type TokenType = (typeof TOKEN_TYPES)[keyof typeof TOKEN_TYPES]

// Define specific token type categories
export type LoginTokenType =
  | typeof TOKEN_TYPES.LOGGING_IN_MAIN
  | typeof TOKEN_TYPES.LOGGING_IN_MFA

export type SignupTokenType =
  | typeof TOKEN_TYPES.SIGNING_UP_MAIN
  | typeof TOKEN_TYPES.SIGNED_UP_MFA

// Token data interface
export interface TokenData {
  tokenName: TokenType
  tokenString: string
  tokenExpiration: Date
  userId?: string
  authId?: string
}

// User authentication data
export interface UserAuthData {
  _id: string
  authId: string
  email: string
  phoneNumber?: string
}

// Verification status interface
export interface VerificationStatus {
  _id: string
  mfaVerified: boolean
  userId: string
}
