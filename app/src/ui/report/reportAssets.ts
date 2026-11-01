// The template's pictures bundled with the app (src/assets/report/, the fixed pages' pictures): their built URLs. Vite
// hashes and emits each one, and the service worker precaches it like the logo, so the fixed pages work offline. A
// file added to the folder needs no code here.

const URLS = import.meta.glob('../../assets/report/*.{png,jpg}', { query: '?url', import: 'default', eager: true }) as Record<string, string>

/** The URL of a bundled report picture by its file name; null when there is none. */
export const reportAssetUrl = (file: string): string | null => URLS[`../../assets/report/${file}`] ?? null
