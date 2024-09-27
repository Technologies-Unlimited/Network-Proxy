import { createTheme } from '@mui/material/styles'
import {
  moss,
  greyborder,
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
    [key: string]: Palette['primary']
  }
  interface PaletteOptions {
    [key: string]: PaletteOptions['primary']
  }
}

export const theme = createTheme({
  palette: {
    moss: moss,
    aqua: aqua,
    madder: madder,
    woad: woad,
    marine: marine,
    pansy: pansy,
    stainlessSteel: stainlessSteel,
    coal: coal,
    ocean: ocean,
    sky: sky,
    salmon: salmon,
    lightning: lightning,
    sage: sage,
    lilac: lilac,
    gunpowder: gunpowder,
    lightMadder: lightMadder,
    black: black,
    white: white,
    none: none,
    semiTransparentWhite: semiTransparentWhite,
    semiTransparentBlack: semiTransparentBlack,
    red: red,
    green: green,
    greyborder: greyborder,
  },
})

type ColorPaletteType = (typeof colorPalette)[number]
type ColorVariant = 'main' | 'light' | 'dark' | 'contrast'
export type ColorPaletteKeys =
  | `${ColorPaletteType}`
  | `${ColorPaletteType}.${ColorVariant}`

declare module '@mui/material/AppBar' {
  interface AppBarPropsColorOverrides {
    [key: string]: true
  }
}

declare module '@mui/material/SvgIcon' {
  interface SvgIconPropsColorOverrides {
    [key: string]: true
  }
}

declare module '@mui/material/IconButton' {
  interface IconButtonPropsColorOverrides {
    [key: string]: true
  }
}

declare module '@mui/material/Checkbox' {
  interface CheckboxPropsColorOverrides {
    [key: string]: true
  }
}

declare module '@mui/material/Pagination' {
  interface PaginationPropsColorOverrides {
    [key: string]: true
  }
}

declare module '@mui/material/PaginationItem' {
  interface PaginationItemPropsColorOverrides {
    [key: string]: true
  }
}

declare module '@mui/material/Chip' {
  interface ChipPropsColorOverrides {
    [key: string]: true
  }
}

declare module '@mui/material/ButtonGroup' {
  interface ButtonGroupPropsColorOverrides {
    [key: string]: true
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsColorOverrides {
    [key: string]: true
  }
}

export const colorPalette = [
  'moss',
  'greyborder',
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
