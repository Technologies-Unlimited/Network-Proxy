'use client'

import { Box, styled, keyframes } from '@mui/material'
import React, { useEffect } from 'react'

export const slideIn = keyframes`
  0% { opacity: 0; transform: translateX(-20px); }
  100% { opacity: 1; transform: translateX(0); }
`

export const slideInUp = keyframes`
  0% { opacity: 0; transform: translateY(20px); }
  100% { opacity: 1; transform: translateY(0); }
`

export const slideInDown = keyframes`
  0% { opacity: 0; transform: translateY(-20px); }
  100% { opacity: 1; transform: translateY(0); }
`

export const slideInLeft = keyframes`
  0% { opacity: 0; transform: translateX(-20px); }
  100% { opacity: 1; transform: translateX(0); }
`

export const slideInRight = keyframes`
  0% { opacity: 0; transform: translateX(20px); }
  100% { opacity: 1; transform: translateX(0); }
`

export const fadeOut = keyframes`
  0% { opacity: 1; }
  100% { opacity: 0; }
`

export const fadeIn = keyframes`
  0% { opacity: 0; }
  100% { opacity: 1; }
`

interface AnimationProps {
  animationtype?: keyof typeof animationStyles
}

const animationStyles = {
  none: 'none',
  slideIn: `${slideIn} 1s ease-in-out forwards`,
  slideInUp: `${slideInUp} 1s ease-in-out forwards`,
  slideInDown: `${slideInDown} 1s ease-in-out forwards`,
  slideInLeft: `${slideInLeft} 1s ease-in-out forwards`,
  slideInRight: `${slideInRight} 1s ease-in-out forwards`,
  fadeOut: `${fadeOut} 0.5s ease-out forwards`,
  fadeIn: `${fadeIn} 0.5s ease-in forwards`,
  stuckOnScroll: 'none', // Assuming no animation for 'stuckOnScroll' as it's likely a CSS position behavior.
}

export const AnimatedElement = styled(Box)<AnimationProps>(
  ({ animationtype }) => ({
    opacity: animationtype === 'none' ? 1 : 0,
    animation: animationtype ? animationStyles[animationtype] : 'none',
  })
)

export const StuckElement = styled(Box)`
  position: sticky;
  top: 0;
  z-index: 1;
`

export function useAnimation(ref: React.RefObject<HTMLDivElement>) {
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('animate')
          } else {
            entry.target.classList.remove('animate')
          }
        })
      },
      { threshold: 0.2 }
    )

    const currentRef = ref.current
    if (currentRef) {
      observer.observe(currentRef)
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef)
      }
    }
  }, [ref])
}
