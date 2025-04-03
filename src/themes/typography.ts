import { TypographyStyleOptions } from '@mui/material/styles/createTypography'
import {
  arapeyh1,
  arapeyh2,
  arapeyh3,
  arapeyh4,
  arapeyh5,
  arapeyh6,
  arapeyparagraph,
  interh1,
  interh2,
  interh3,
  interh4,
  interh5,
  interh6,
  interparagraph,
  interhelperheader,
  interhelperfooter,
  merrih1,
  merrih2,
  merrih3,
  merrih4,
  merrih5,
  merrih6,
  merriparagraph,
  merrihelperfooter,
} from 'goobs-frontend'

// Create a simpler typographyVariants object with all our custom variants
const typographyVariants = {
  arapeyh1,
  arapeyh2,
  arapeyh3,
  arapeyh4,
  arapeyh5,
  arapeyh6,
  arapeyparagraph,
  interh1,
  interh2,
  interh3,
  interh4,
  interh5,
  interh6,
  interparagraph,
  interhelperheader,
  interhelperfooter,
  merrih1,
  merrih2,
  merrih3,
  merrih4,
  merrih5,
  merrih6,
  merriparagraph,
  merrihelperfooter,
}

export type CustomTypographyVariants = typeof typographyVariants

export type CustomTypographyOptions = Omit<
  TypographyStyleOptions,
  'fontFamily'
> &
  CustomTypographyVariants & {
    fontFamily: string
  }

// Construct our typography object with all our variants
const typography: CustomTypographyOptions = {
  fontFamily: [
    'Arapey, serif',
    'Inter, sans-serif',
    'Merriweather, serif',
  ].join(','),
  ...typographyVariants,
}

export default typography
