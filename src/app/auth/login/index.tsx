'use client'

import React, { useState } from 'react'
import { useFormik } from 'formik'
import { z } from 'zod'
import { toFormikValidationSchema } from 'zod-formik-adapter'
import { CustomDialog, CustomButtonProps, TextFieldProps } from 'goobs-frontend'
import { useRouter } from 'next/navigation'
import { Box, Snackbar, Alert } from '@mui/material'
import { TOKEN_TYPES } from '@/types/auth'
import { ColorPaletteKeys } from '@/themes/palette'

// Validation schema using Zod
const validationSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type FormValues = {
  username: string
  password: string
}

const LoginForm: React.FC = () => {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Form submission handler
  async function handleSubmit(values: FormValues) {
    try {
      setIsLoading(true)
      setError(null)

      console.log('[LOGIN] Starting login process for user:', {
        username: values.username,
        timestamp: new Date().toISOString(),
      })

      // Call the authentication API - connects to technologiesunlimited.net
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
        credentials: 'include',
        cache: 'no-store',
      })

      const result = await response.json()

      if (!result.success) {
        console.error('[LOGIN] Authentication failed:', {
          error: result.error,
          timestamp: new Date().toISOString(),
        })
        setError(result.error || 'Authentication failed')
        return
      }

      console.log(
        '[LOGIN] Authentication successful, checking MFA requirements:',
        {
          userId: result.data?.userId,
          mfaRequired: result.data?.mfaRequired,
          timestamp: new Date().toISOString(),
        }
      )

      // Check if MFA is required
      if (result.data?.mfaRequired) {
        // Call the token API to create a login MFA token
        const tokenResponse = await fetch('/api/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tokenName: TOKEN_TYPES.LOGGING_IN_MFA,
            userId: result.data.userId,
            mfaSecret: result.data.mfaSecret,
          }),
          credentials: 'include',
          cache: 'no-store',
        })

        const tokenResult = await tokenResponse.json()

        if (!tokenResult.success) {
          console.error('[LOGIN] Failed to initialize MFA verification:', {
            error: tokenResult.error,
            timestamp: new Date().toISOString(),
          })
          setError('Failed to initialize MFA verification')
          return
        }

        console.log('[LOGIN] MFA token created, redirecting to verification:', {
          userId: result.data.userId,
          timestamp: new Date().toISOString(),
        })

        // Set success message and redirect after a brief delay
        setSuccessMessage('Redirecting to MFA verification...')
        setTimeout(() => {
          router.push('/auth/login/mfa-verification')
        }, 1000)
      } else {
        // No MFA required, user is logged in
        console.log('[LOGIN] No MFA required, user logged in successfully', {
          userId: result.data?.userId,
          timestamp: new Date().toISOString(),
        })

        // Set success message and redirect after a brief delay
        setSuccessMessage('Login successful! Redirecting...')
        setTimeout(() => {
          router.push('/network-administration')
        }, 1000)
      }
    } catch (error) {
      console.error('[LOGIN] Unexpected error during login:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      })
      setError('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  // Formik setup
  const formik = useFormik<FormValues>({
    initialValues: {
      username: '',
      password: '',
    },
    validationSchema: toFormikValidationSchema(validationSchema),
    onSubmit: handleSubmit,
  })

  // Text field props for the username and password fields
  const textFieldProps = React.useMemo<TextFieldProps[]>(
    () => [
      {
        name: 'username',
        label: 'Username',
        placeholder: 'Enter your username',
        error: formik.touched.username && Boolean(formik.errors.username),
        helperText:
          formik.touched.username && formik.errors.username
            ? formik.errors.username
            : undefined,
        required: true,
        value: formik.values.username,
        onChange: formik.handleChange,
        onBlur: formik.handleBlur,
        style: {
          marginBottom: '5px',
        },
      },
      {
        name: 'password',
        label: 'Password',
        placeholder: 'Enter your password',
        type: 'password',
        error: formik.touched.password && Boolean(formik.errors.password),
        helperText:
          formik.touched.password && formik.errors.password
            ? formik.errors.password
            : undefined,
        required: true,
        value: formik.values.password,
        onChange: formik.handleChange,
        onBlur: formik.handleBlur,
      },
    ],
    [formik]
  )

  // Button props for the login button
  const buttonProps = React.useMemo<CustomButtonProps[]>(
    () => [
      {
        text: 'Login',
        backgroundcolor: 'primary' as ColorPaletteKeys,
        fontcolor: 'white' as ColorPaletteKeys,
        onClick: () => formik.handleSubmit(),
        disableButton:
          isLoading || !formik.isValid || formik.isSubmitting
            ? 'true'
            : 'false',
      },
    ],
    [formik, isLoading]
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
        title="Network Proxy Login"
        description="Please enter your credentials to log in"
        grids={[
          {
            textfield: textFieldProps,
          },
        ]}
        buttons={buttonProps}
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
        autoHideDuration={2000}
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

LoginForm.displayName = 'LoginForm'
export default LoginForm
