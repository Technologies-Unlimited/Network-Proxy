import { TypographyOptions } from '@mui/material/styles/createTypography'
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

type CustomTypographyVariants = {
  arapeyh1: typeof arapeyh1
  arapeyh2: typeof arapeyh2
  arapeyh3: typeof arapeyh3
  arapeyh4: typeof arapeyh4
  arapeyh5: typeof arapeyh5
  arapeyh6: typeof arapeyh6
  arapeyparagraph: typeof arapeyparagraph
  interh1: typeof interh1
  interh2: typeof interh2
  interh3: typeof interh3
  interh4: typeof interh4
  interh5: typeof interh5
  interh6: typeof interh6
  interparagraph: typeof interparagraph
  interhelperheader: typeof interhelperheader
  interhelperfooter: typeof interhelperfooter
  merrih1: typeof merrih1
  merrih2: typeof merrih2
  merrih3: typeof merrih3
  merrih4: typeof merrih4
  merrih5: typeof merrih5
  merrih6: typeof merrih6
  merriparagraph: typeof merriparagraph
  merrihelperfooter: typeof merrihelperfooter
}

type CustomTypographyOptions = Omit<TypographyOptions, 'fontFamily'> &
  CustomTypographyVariants & {
    fontFamily: string
  }

const typography: CustomTypographyOptions = {
  fontFamily: [
    arapeyh1.fontFamily,
    interh1.fontFamily,
    merrih1.fontFamily,
  ].join(','),
  arapeyh1: arapeyh1,
  arapeyh2: arapeyh2,
  arapeyh3: arapeyh3,
  arapeyh4: arapeyh4,
  arapeyh5: arapeyh5,
  arapeyh6: arapeyh6,
  arapeyparagraph: arapeyparagraph,
  interh1: interh1,
  interh2: interh2,
  interh3: interh3,
  interh4: interh4,
  interh5: interh5,
  interh6: interh6,
  interparagraph: interparagraph,
  interhelperheader: interhelperheader,
  interhelperfooter: interhelperfooter,
  merrih1: merrih1,
  merrih2: merrih2,
  merrih3: merrih3,
  merrih4: merrih4,
  merrih5: merrih5,
  merrih6: merrih6,
  merriparagraph: merriparagraph,
  merrihelperfooter: merrihelperfooter,
}

export default typography
