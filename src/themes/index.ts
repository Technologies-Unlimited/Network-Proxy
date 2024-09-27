import { createTheme, Theme } from '@mui/material/styles'
import typography from '@/themes/typography'
import { theme as customPalette } from '@/themes/palette'

const theme: Theme = createTheme({
  typography: typography,
  palette: customPalette.palette,
  components: {},
})

export default theme
