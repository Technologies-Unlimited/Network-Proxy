import { createTheme, PaletteOptions } from '@mui/material/styles'
import {
  moss,
  grey,
  aqua,
  madder,
  woad,
  marine,
  pansy,
  stainlessSteel,
  coal,
  ocean,
  sky,
  salmon,
  lightning,
  sage,
  lilac,
  gunpowder,
  lightMadder,
  black,
  white,
  none,
  red,
  green,
  semiTransparentWhite,
  semiTransparentBlack,
} from 'goobs-frontend'

declare module '@mui/material/styles' {
  interface Palette {
    ocean: Palette['primary']
    moss: Palette['primary']
    aqua: Palette['primary']
    madder: Palette['primary']
    woad: Palette['primary']
    marine: Palette['primary']
    pansy: Palette['primary']
    stainlessSteel: Palette['primary']
    coal: Palette['primary']
    sky: Palette['primary']
    salmon: Palette['primary']
    lightning: Palette['primary']
    sage: Palette['primary']
    lilac: Palette['primary']
    gunpowder: Palette['primary']
    lightMadder: Palette['primary']
    none: Palette['primary']
    semiTransparentWhite: Palette['primary']
    semiTransparentBlack: Palette['primary']
    [key: string]: Palette['primary']
  }
  interface PaletteOptions {
    ocean?: PaletteOptions['primary']
    moss?: PaletteOptions['primary']
    aqua?: PaletteOptions['primary']
    madder?: PaletteOptions['primary']
    woad?: PaletteOptions['primary']
    marine?: PaletteOptions['primary']
    pansy?: PaletteOptions['primary']
    stainlessSteel?: PaletteOptions['primary']
    coal?: PaletteOptions['primary']
    sky?: PaletteOptions['primary']
    salmon?: PaletteOptions['primary']
    lightning?: PaletteOptions['primary']
    sage?: PaletteOptions['primary']
    lilac?: PaletteOptions['primary']
    gunpowder?: PaletteOptions['primary']
    lightMadder?: PaletteOptions['primary']
    none?: PaletteOptions['primary']
    semiTransparentWhite?: PaletteOptions['primary']
    semiTransparentBlack?: PaletteOptions['primary']
    [key: string]: PaletteOptions['primary']
  }
}

declare module '@mui/material/styles/createPalette' {
  interface PaletteOptions {
    ocean?: PaletteOptions['primary']
  }
}

declare module '@mui/material' {
  interface Color {
    ocean?: string
  }
}

export const theme = createTheme({
  palette: {
    moss,
    aqua,
    madder,
    woad,
    marine,
    pansy,
    stainlessSteel,
    coal,
    ocean,
    sky,
    salmon,
    lightning,
    sage,
    lilac,
    gunpowder,
    lightMadder,
    black,
    white,
    none,
    semiTransparentWhite,
    semiTransparentBlack,
    red,
    green,
    grey,
  } as PaletteOptions,
})

type ColorPaletteType = (typeof colorPalette)[number]
type ColorVariant = 'main' | 'light' | 'dark' | 'contrast'
export type ColorPaletteKeys =
  | `${ColorPaletteType}`
  | `${ColorPaletteType}.${ColorVariant}`

declare module '@mui/material' {
  interface AppBarPropsColorOverrides {
    ocean: true
  }

  interface SvgIconPropsColorOverrides {
    [key: string]: true
  }

  interface IconButtonPropsColorOverrides {
    [key: string]: true
  }

  interface CheckboxPropsColorOverrides {
    [key: string]: true
  }

  interface ChipPropsColorOverrides {
    [key: string]: true
  }

  interface TypographyPropsColorOverrides {
    [key: string]: true
  }
}

export const colorPalette = [
  'moss',
  'grey',
  'aqua',
  'madder',
  'woad',
  'marine',
  'pansy',
  'stainlessSteel',
  'coal',
  'ocean',
  'sky',
  'salmon',
  'lightning',
  'sage',
  'lilac',
  'gunpowder',
  'lightMadder',
  'black',
  'white',
  'none',
  'red',
  'green',
  'semiTransparentWhite',
  'semiTransparentBlack',
] as const
