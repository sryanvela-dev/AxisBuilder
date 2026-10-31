// Saved lists (report/savedLists.ts, design 4.10): per computer, never in the .axb.
import { describe, expect, it } from 'vitest'
import {
  addRecord,
  addString,
  emptySavedLists,
  listsFromFile,
  listsToFile,
  loadSavedLists,
  mergeLists,
  removeRecord,
  removeString,
  renameString,
  storeSavedLists,
  suggestions,
  toRecord,
  updateRecord,
} from '../../src/report/savedLists.ts'
import { memoryStore } from '../../src/state/storage.ts'

describe('string lists', () => {
  it('a value typed once joins its list; doubles (ignoring case and spaces) and blanks do not', () => {
    let l = addString(emptySavedLists(), 'surfaceCondition', '  Primed ')
    expect(l.strings.surfaceCondition).toEqual(['Primed'])
    expect(addString(l, 'surfaceCondition', 'primed')).toBe(l)
    expect(addString(l, 'surfaceCondition', '   ')).toBe(l)
    l = addString(l, 'surfaceCondition', 'Bare')
    expect(l.strings.surfaceCondition).toEqual(['Primed', 'Bare'])
  })

  it('suggestions are the saved values, then the built-in ones; a built-in value is not stored again', () => {
    const l = addString(emptySavedLists(), 'naReason', 'Insulated')
    expect(suggestions(l, 'naReason')).toEqual(['Insulated', 'U-Bolt Obstruction', 'Repad'])
    expect(addString(l, 'naReason', 'repad')).toBe(l)
    expect(suggestions(l, 'examinationType')[0]).toBe('Corrosion Mapping Examination')
  })

  it('lists read before a list was added to the app still work (that list starts empty)', () => {
    const old = emptySavedLists()
    delete (old.strings as Partial<typeof old.strings>).procedure
    expect(suggestions(old, 'procedure')).toEqual(['IEPC-AUT-01'])
    expect(addString(old, 'procedure', 'AUT-CM-01').strings.procedure).toEqual(['AUT-CM-01'])
    expect(removeString(old, 'procedure', 'x')).toBe(old)
  })

  it('renames and removes', () => {
    let l = addString(addString(emptySavedLists(), 'technique', 'A'), 'technique', 'B')
    l = renameString(l, 'technique', 'a', 'A2')
    expect(l.strings.technique).toEqual(['A2', 'B'])
    expect(renameString(l, 'technique', 'A2', 'b')).toBe(l)
    expect(renameString(l, 'technique', 'A2', ' ')).toBe(l)
    l = removeString(l, 'technique', 'b')
    expect(l.strings.technique).toEqual(['A2'])
    expect(removeString(l, 'technique', 'zzz')).toBe(l)
  })
})

describe('record lists', () => {
  it('saves records with only their own fields; doubles and blank records are not added', () => {
    let l = addRecord(emptySavedLists(), 'examiners', { name: 'Pat Doe', title: 'AUT Level II', extra: 1 })
    expect(l.records.examiners).toEqual([{ name: 'Pat Doe', title: 'AUT Level II' }])
    expect(addRecord(l, 'examiners', { name: 'pat doe', title: 'aut level ii' })).toBe(l)
    expect(addRecord(l, 'examiners', { name: '', title: '' })).toBe(l)
    l = addRecord(l, 'transducers', { maker: 'Olympus', frequency: '5 MHz' })
    expect(l.records.transducers[0]).toMatchObject({ maker: 'Olympus', frequency: '5 MHz', element: '', serial: '' })
    expect(toRecord('systems', { maker: 'M', model: 'X', serial: '1', other: 'no' })).toEqual({ maker: 'M', model: 'X', serial: '1' })
  })

  it('edits and deletes a record', () => {
    let l = addRecord(emptySavedLists(), 'blocks', { name: 'Step block', thicknessRange: '0.25-1.0', material: 'CS' })
    l = updateRecord(l, 'blocks', 0, { material: 'Carbon steel' })
    expect(l.records.blocks[0].material).toBe('Carbon steel')
    expect(updateRecord(l, 'blocks', 4, { material: 'x' })).toBe(l)
    l = removeRecord(l, 'blocks', 0)
    expect(l.records.blocks).toEqual([])
  })
})

describe('merging, files and storage', () => {
  const sample = () => {
    let l = addString(emptySavedLists(), 'acceptanceCriteria', 'Information only')
    l = addRecord(l, 'examiners', { name: 'Pat Doe', title: 'Level II' })
    l = addRecord(l, 'scanners', { maker: 'AUT Solutions', model: 'MAG', drive: 'Automated', track: true })
    return l
  }

  it('merging adds what is new and never deletes', () => {
    const a = sample()
    const b = addRecord(addString(emptySavedLists(), 'acceptanceCriteria', 'information ONLY'), 'examiners', { name: 'Lee Roe', title: 'Level III' })
    const m = mergeLists(a, b)
    expect(m.strings.acceptanceCriteria).toEqual(['Information only'])
    expect(m.records.examiners.map((e) => e.name)).toEqual(['Pat Doe', 'Lee Roe'])
    expect(m.records.scanners).toHaveLength(1)
  })

  it('a file round trip gives the same lists', () => {
    const l = sample()
    const back = listsFromFile(listsToFile(l))
    expect(back).toEqual({ ok: true, lists: l })
  })

  it('a bad file says so plainly', () => {
    expect(listsFromFile('not json')).toEqual({ ok: false, problem: expect.stringMatching(/not JSON/) })
    expect(listsFromFile('{"kind":"something"}')).toEqual({ ok: false, problem: expect.stringMatching(/not an AxisBuilder saved-lists file/) })
    expect(listsFromFile('{"kind":"axisbuilder-saved-lists","version":2,"lists":{}}')).toEqual({ ok: false, problem: expect.stringMatching(/newer/) })
    expect(listsFromFile('{"kind":"axisbuilder-saved-lists","version":1,"lists":{"strings":{"technique":[3]}}}').ok).toBe(false)
  })

  it('kept in the browser store; nothing stored reads as empty', async () => {
    const store = memoryStore()
    expect(await loadSavedLists(store)).toEqual(emptySavedLists())
    await storeSavedLists(store, sample())
    expect(await loadSavedLists(store)).toEqual(sample())
    await store.set('savedLists', { strings: 'broken' })
    expect(await loadSavedLists(store)).toEqual(emptySavedLists())
  })

  it("one value or list it can't read never empties the others, and lists of another build are kept when storing", async () => {
    const store = memoryStore()
    await store.set('savedLists', {
      strings: { surfaceCondition: ['Painted', 7], blockMaterial: ['Carbon Steel'], listOfAnotherBuild: ['kept'] },
      records: { examiners: [{ name: 'A. Tech', title: 'AUT Specialist', badge: 'x' }, 'junk'], recordsOfAnotherBuild: [{ a: 1 }] },
      extra: true,
    })
    const read = await loadSavedLists(store)
    expect(read.strings.surfaceCondition).toEqual(['Painted'])
    expect(read.strings.blockMaterial).toEqual(['Carbon Steel'])
    expect(read.records.examiners).toEqual([{ name: 'A. Tech', title: 'AUT Specialist' }])
    await storeSavedLists(store, addString(read, 'referenceReflector', 'Notch X'))
    const raw = (await store.get('savedLists')) as { strings: Record<string, string[]>; records: Record<string, unknown[]>; extra: boolean }
    expect(raw.strings.listOfAnotherBuild).toEqual(['kept'])
    expect(raw.records.recordsOfAnotherBuild).toEqual([{ a: 1 }])
    expect(raw.extra).toBe(true)
    expect(raw.strings.surfaceCondition).toEqual(['Painted'])
    expect(raw.strings.referenceReflector).toEqual(['Notch X'])
  })

  it('Painted, Carbon Steel and the I.D. / O.D. notches are built in, first in their lists', () => {
    const none = emptySavedLists()
    expect(suggestions(none, 'surfaceCondition')[0]).toBe('Painted')
    expect(suggestions(none, 'blockMaterial')[0]).toBe('Carbon Steel')
    expect(suggestions(none, 'referenceReflector').slice(0, 2)).toEqual(['I.D. Notches', 'O.D. Notches'])
  })

  it('AUT system and scanner makers and models, block thickness ranges and the 0-degree technique are built in', () => {
    const none = emptySavedLists()
    expect(suggestions(none, 'systemMaker').slice(0, 2)).toEqual(['Olympus', 'AUT Solutions'])
    for (const id of ['systemModel', 'scannerModel'] as const) expect(suggestions(none, id).slice(0, 4)).toEqual(['Proscan', 'Accuscan', 'AccuTrak', 'Bandit'])
    expect(suggestions(none, 'blockThicknessRange')).toEqual(['0.100" - 0.500"', '0.100" - 1.500"'])
    expect(suggestions(none, 'technique')[0]).toBe('0-degree')
  })
})
