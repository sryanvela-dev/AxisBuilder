import { describe, expect, it } from 'vitest'
import { openProject, saveProject } from '../../src/data/projectFile.ts'
import { CURRENT_SCHEMA_VERSION, projectFileSchema, type Project } from '../../src/data/schema.ts'
import { imageItems } from '../../src/report/imageItems.ts'
import { createReport } from '../../src/report/report.ts'
import { markSchema, reportSchema, type Mark } from '../../src/report/schema.ts'
import { syncReport } from '../../src/report/sync.ts'
import { olderSample } from '../fixtures/olderSample.ts'

const mark = (m: Record<string, unknown>): Mark => markSchema.parse({ id: 'm1', ...m })

function start(): Project {
  const p = olderSample()
  const report = createReport(p)
  const link = (list: string, id: string) => ({ list, id, occurrence: 0 })
  return projectFileSchema.parse({
    ...p,
    report: {
      ...report,
      photos: [
        { file: 'a.jpg', caption: 'North side', markup: [mark({ kind: 'label', at: [0.5, 0.5], text: 'S1', link: link('scans', p.scans[0].id) })] },
        { file: 'b.jpg', rotate: 90, crop: { x0: 0.1, y0: 0.1, x1: 0.9, y1: 0.8 } },
      ],
      coverPhotoEdits: { markup: [mark({ kind: 'badge', at: [0.2, 0.2], n: 1, text: 'MUT', link: link('shellMut', p.shellMut[0].id) })] },
      scanResults: [{ scanId: p.scans[0].id, dataImage: 'Scan 1.png', dataImageEdits: { markup: [mark({ kind: 'rect', box: { x0: 0, y0: 0, x1: 0.5, y1: 0.5 }, link: link('scans', p.scans[0].id) })] } }],
    },
  })
}

describe('project file format 8', () => {
  it('opens a format 7 file with a report: pictures get no crop, no turn, no markup; an upload keeps its rotate', () => {
    const p = olderSample()
    const data = JSON.parse(saveProject({ ...p, report: createReport(p) }))
    data.schemaVersion = 7
    for (const k of ['coverPhotoEdits']) delete data.report[k]
    delete data.report.calibration.dynamicImageEdits
    delete data.report.options.photosPerPage
    data.report.photos = [{ file: 'p.jpg', caption: 'x', alone: true }]
    data.report.uploads = [{ file: 'ga.pdf', page: 2, title: 'GA', after: 'cscan', frame: 'full', rotate: 270 }]
    data.report.customSheets = [{ id: 's1', title: 'T', after: 'cscan', layout: '1 large', blocks: [{ kind: 'image', file: 'i.png', caption: '' }] }]
    const r = openProject(JSON.stringify(data))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.migratedFrom).toBe(7)
    expect(r.project.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    const rep = r.project.report!
    expect(rep.photos[0]).toEqual({ file: 'p.jpg', caption: 'x', alone: true, crop: null, rotate: 0, adjust: { autoLevels: false }, markup: [] })
    expect(rep.uploads[0].rotate).toBe(270)
    expect(rep.uploads[0].markup).toEqual([])
    expect(rep.coverPhotoEdits).toEqual({ crop: null, rotate: 0, adjust: { autoLevels: false }, markup: [] })
    expect(rep.calibration.dynamicImageEdits.rotate).toBe(0)
    expect(rep.options.photosPerPage).toEqual({})
    expect(imageItems(rep).map((i) => i.place.kind)).toEqual(['cover', 'calibration', 'photo', 'upload'].flatMap((k) => (k === 'upload' ? ['sheetImage', 'upload'] : [k])))
  })

  it('saves and reopens every kind of mark, crop, turn and Photos per page unchanged', () => {
    const p = start()
    const kinds: Record<string, unknown>[] = [
      { kind: 'rect', box: { x0: 0.1, y0: 0.1, x1: 0.3, y1: 0.4 }, style: { fill: '#ffd60a', fillOpacity: 0.3 } },
      { kind: 'ellipse', box: { x0: 0.1, y0: 0.1, x1: 0.3, y1: 0.4 } },
      { kind: 'highlight', points: [[0.1, 0.1], [0.9, 0.2]], straight: true, style: { width: 12, opacity: 0.4, ends: 'flat' } },
      { kind: 'pen', points: [[0.1, 0.1], [0.2, 0.3], [0.4, 0.2]] },
      { kind: 'line', from: [0, 0], to: [1, 1] },
      { kind: 'arrow', from: [0, 1], to: [1, 0] },
      { kind: 'label', at: [0.5, 0.5], text: 'Pitting', callout: 'pill', leader: [0.6, 0.7], leaderEnd: 'dot' },
      { kind: 'badge', at: [0.3, 0.3], n: 2, text: 'Pitting at 6 o’clock' },
      { kind: 'redaction', box: { x0: 0.5, y0: 0.5, x1: 0.6, y1: 0.6 }, mode: 'blur' },
    ]
    p.report!.photos[1].markup = kinds.map((k, i) => mark({ ...k, id: `k${i}`, z: i, locked: i === 3 }))
    p.report!.options.photosPerPage = { photos: 4 }
    const back = openProject(saveProject(p))
    expect(back.ok && back.project).toEqual(p)
  })

  it('refuses a crop box the wrong way round, a turn that is not a quarter and positions outside the picture', () => {
    const base = { templateId: 'generic-aut', templateVersion: 1 }
    expect(() => reportSchema.parse({ ...base, photos: [{ file: 'a', crop: { x0: 0.5, y0: 0, x1: 0.2, y1: 1 } }] })).toThrow()
    expect(() => reportSchema.parse({ ...base, photos: [{ file: 'a', rotate: 45 }] })).toThrow()
    expect(() => reportSchema.parse({ ...base, photos: [{ file: 'a', markup: [{ id: 'x', kind: 'line', from: [0, 0], to: [1.5, 0] }] }] })).toThrow()
    expect(() => reportSchema.parse({ ...base, options: { photosPerPage: { photos: 3 } } })).toThrow()
  })
})

describe('mark links follow their row', () => {
  it('follows a renamed scan and MUT row everywhere a picture is', () => {
    const p = start()
    const scans = p.scans.map((s, i) => (i === 0 ? { ...s, id: 'SCAN 77' } : s))
    const a = syncReport(p, { ...p, scans })
    expect(a.report!.photos[0].markup[0].link).toEqual({ list: 'scans', id: 'SCAN 77', occurrence: 0 })
    expect(a.report!.scanResults[0].dataImageEdits.markup[0].link!.id).toBe('SCAN 77')
    expect(a.report!.photos[1]).toBe(p.report!.photos[1])
    const shellMut = p.shellMut.map((m, i) => (i === 0 ? { ...m, id: 'M77' } : m))
    const b = syncReport(p, { ...p, shellMut })
    expect(b.report!.coverPhotoEdits.markup[0].link!.id).toBe('M77')
  })

  it('a deleted row leaves the mark and its link as they were', () => {
    const p = start()
    const deletedMut = { ...p, shellMut: p.shellMut.slice(1) }
    const c = syncReport(p, deletedMut)
    expect(c.report!.coverPhotoEdits.markup[0].link!.id).toBe(p.shellMut[0].id)
    expect(c.report!.coverPhotoEdits.markup).toHaveLength(1)
  })

  it('an edit that touches no linked list returns the same report', () => {
    const p = start()
    const next = { ...p, objects: [...p.objects] }
    expect(syncReport(p, next).report).toBe(p.report)
  })
})
