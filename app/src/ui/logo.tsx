// The AxisBuilder logo on screen. The files are made by npm run icons (scripts/gen-icons.ts) into src/assets/logo/.

import iconUrl from '../assets/logo/icon.svg'
import wordmarkDark from '../assets/logo/wordmark-dark.svg'
import wordmarkLight from '../assets/logo/wordmark-light.svg'
import { useTheme } from './theme.ts'

/** "AXISBUILDER" with the stitched X, in the light or dark colors of the app's theme (ui/theme.ts). */
export function Wordmark({ className }: { className?: string }) {
  const { theme } = useTheme()
  return <img className={className} src={theme === 'dark' ? wordmarkDark : wordmarkLight} alt="AxisBuilder" />
}

/** The small version for the job screen's top bar: the icon and the name. */
export function BrandMark() {
  return (
    <span className="brand">
      <img src={iconUrl} alt="" width={24} height={24} />
      AxisBuilder
    </span>
  )
}
