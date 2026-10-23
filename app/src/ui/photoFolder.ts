// The photo folder as the Images step reads it.

/** The photo folder: its file names and a way to read one. */
export interface PhotoFolder {
  name: string
  names: string[]
  getFile: (name: string) => Promise<File | null>
}

/** A folder picked with a file input (browsers without a folder picker); top-level files only, like v5.0. */
export function folderFromInput(files: FileList): PhotoFolder {
  const top = [...files].filter((f) => (f as File & { webkitRelativePath: string }).webkitRelativePath.split('/').length === 2)
  const byName = new Map(top.map((f) => [f.name, f]))
  const first = (files[0] as (File & { webkitRelativePath: string }) | undefined)?.webkitRelativePath.split('/')[0] ?? ''
  return { name: first, names: [...byName.keys()].sort(), getFile: async (n) => byName.get(n) ?? null }
}
