// The AxisBuilder logo on screen. The files are made by npm run icons (scripts/gen-icons.ts) into src/assets/logo/.

import iconUrl from '../assets/logo/icon.svg'
import wordmarkDark from '../assets/logo/wordmark-dark.svg'
import wordmarkLight from '../assets/logo/wordmark-light.svg'

/** "AXISBUILDER" with the stitched X, in the light or dark colors to suit the theme. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <picture className={className}>
      <source srcSet={wordmarkDark} media="(prefers-color-scheme: dark)" />
      <img src={wordmarkLight} alt="AxisBuilder" />
    </picture>
  )
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
