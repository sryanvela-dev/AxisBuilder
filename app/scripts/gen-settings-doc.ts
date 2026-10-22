// Writes docs/settings-review.md from src/data/settings.ts. Run: npm run docs:settings
import { writeFileSync } from 'node:fs'
import { renderSettingsReview } from '../src/data/settingsDoc.ts'

const target = new URL('../docs/settings-review.md', import.meta.url)
writeFileSync(target, renderSettingsReview())
console.log('Wrote docs/settings-review.md')
