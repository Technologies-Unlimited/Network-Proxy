import { NextResponse } from 'next/server'
import { z } from 'zod'

// Validation schema for login requests
const loginSchema = z.object({
  username: z.string().min(3).max(100),
  password: z.string().min(6).max(100),
})

export async function POST(request: Request) {
  try {
    // Parse request body
    const body = await request.json()

    // Validate request body
    const validation = loginSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid username or password format',
        },
        { status: 400 }
      )
    }

    const { username, password } = validation.data

    // Get API URL from env or default to production
    const apiUrl =
      process.env.NEXT_PUBLIC_AUTH_API_URL ||
      'https://technologiesunlimited.net'

    console.log(`Authenticating user ${username} against ${apiUrl}`)

    // Forward authentication request to the main authentication API
    const response = await fetch(`${apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    })

    // If the response is not OK, handle error
    if (!response.ok) {
      const errorText = await response.text()
      console.error('Authentication failed:', {
        status: response.status,
        error: errorText,
      })

      return NextResponse.json(
        {
          success: false,
          error: 'Authentication failed. Please check your credentials.',
        },
        { status: 401 }
      )
    }

    // Parse the authentication response
    const authResult = await response.json()

    // Check if the authentication was successful
    if (!authResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: authResult.error || 'Authentication failed',
        },
        { status: 401 }
      )
    }

    // Return the authentication result to the client
    // This will include userId, authId, and mfaRequired status
    return NextResponse.json(authResult)
  } catch (error) {
    console.error('Login error:', error)

    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected error occurred',
      },
      { status: 500 }
    )
  }
}
