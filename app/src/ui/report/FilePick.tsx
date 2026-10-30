// One image file from a remembered report folder (the cover photo, the dynamic calibration screenshot, a scan's data
// page): the folder bar, a list of the folder's images and a thumbnail. Files are linked by name, never copied into the
// job file.

import { useId } from 'react'
import { IMAGE_EXTENSIONS } from '../../data/imageMatch.ts'
import type { Project } from '../../data/schema.ts'
import { useApp } from '../appContext.ts'
import { Thumb } from '../ImageFolderPanel.tsx'
import { FolderBar } from '../PhotoPanel.tsx'
import type { RememberedFolder } from '../useRememberedFolder.ts'

const isImageFile = (name: string) => (IMAGE_EXTENSIONS as readonly string[]).includes(name.split('.').pop()?.toLowerCase() ?? '')

/** The folder bar for a report folder. */
export function ReportFolderBar({ folder, label }: { folder: RememberedFolder; label: string }) {
  return <FolderBar folder={folder} label={label} chooseLabel={`Choose ${label.toLowerCase()}`} what="reading" inputFallback />
}

export function FilePick(props: {
  label: string
  folder: RememberedFolder
  value: string | null
  set: (p: Project, file: string | null) => Project
  /** Shown in a table cell: no label above. */
  compact?: boolean
}) {
  const app = useApp()
  const id = useId()
  const { folder, value } = props
  const files = (folder.files ?? []).filter(isImageFile)
  const match = value === null ? undefined : files.find((f) => f.toLowerCase() === value.toLowerCase())
  const inFolder = match !== undefined
  const select = (
    <select id={id} value={match ?? value ?? ''} onChange={(e) => app.edit(`Change ${props.label}`, (p) => props.set(p, e.target.value === '' ? null : e.target.value))}
      aria-label={props.compact ? props.label : undefined}>
      <option value="">(none)</option>
      {value !== null && !inFolder && <option value={value}>{value}</option>}
      {files.map((f) => (
        <option key={f} value={f}>
          {f}
        </option>
      ))}
    </select>
  )
  const status =
    value === null ? null : folder.status !== 'ready' ? (
      <span className="muted">Choose the folder to see it.</span>
    ) : !inFolder ? (
      <span className="msg msg-warning">Not in {folder.name}.</span>
    ) : null
  return (
    <div className={props.compact ? 'file-pick file-pick-compact' : 'field file-pick'}>
      {!props.compact && (
        <label htmlFor={id} className="field-label">
          {props.label}
        </label>
      )}
      <span className="file-pick-row">
        {folder.photoFolder && inFolder ? <Thumb folder={folder.photoFolder} name={match!} /> : <span className="thumb thumb-empty" />}
        {select}
      </span>
      {status}
    </div>
  )
}
