// Report step 2, Calibration (design 4.2): calibration block and reference reflector, AUT system, up to 4 transducer
// channels (only filled ones print), scanner and its wheels / arm settings, the job's scan increments, the dynamic
// calibration screenshot and temperature correction. Equipment can be picked from and saved to this computer's lists.

import type { Project } from '../../data/schema.ts'
import { addListItem, removeListItem, setReportValue, type ReportPath } from '../../report/edits.ts'
import { transducerSchema, type Report } from '../../report/schema.ts'
import { useApp } from '../appContext.ts'
import { Flag, ReportBox, ReportCheckbox, ReportSelect, type BoxKind } from './boxes.tsx'
import { PhotoPick } from './PhotoPick.tsx'
import { ReportStepIssues, type ReportStepProps } from './ReportWorkspace.tsx'
import { RecordPicker, SavedListsButton } from './SavedListsUi.tsx'
import type { StringListId } from '../../report/savedLists.ts'

const STEP = 'calibration' as const
const MAX_CHANNELS = 4

type Cal = Report['calibration']

/** A box for a calibration value by its path under `calibration`. */
function CalBox(props: { path: ReportPath; label: string; kind?: BoxKind; units?: string; help?: string; list?: StringListId; compact?: boolean; where?: string }) {
  const app = useApp()
  const cal = app.state.job!.history.present.report!.calibration
  let value: unknown = cal
  for (const k of props.path) value = (value as Record<string | number, unknown>)[k]
  return (
    <ReportBox label={props.label} where={props.where} kind={props.kind} units={props.units} help={props.help} list={props.list} compact={props.compact}
      value={value as string | number | null} set={(q: Project, v: unknown) => setReportValue(q, ['calibration', ...props.path], v)}
      boxKey={`report.calibration.${props.path.join('.')}`} step={STEP} />
  )
}

function CalSelect(props: { path: ReportPath; label: string; options: readonly string[]; compact?: boolean; where?: string }) {
  const app = useApp()
  const cal = app.state.job!.history.present.report!.calibration
  let value: unknown = cal
  for (const k of props.path) value = (value as Record<string | number, unknown>)[k]
  return (
    <ReportSelect label={props.label} where={props.where} compact={props.compact} value={String(value ?? '')} options={props.options.map((o) => ({ value: o, label: o || '(blank)' }))}
      set={(q: Project, v: string) => setReportValue(q, ['calibration', ...props.path], v)} boxKey={`report.calibration.${props.path.join('.')}`} step={STEP} />
  )
}

function Group(props: { title: string; intro?: string; picker?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="settings-group">
      <div className="group-head">
        <div>
          <h2>{props.title}</h2>
          {props.intro && <p className="muted">{props.intro}</p>}
        </div>
        {props.picker}
      </div>
      {props.children}
    </section>
  )
}

export function CalibrationStep({ status }: ReportStepProps) {
  const app = useApp()
  const report = app.state.job!.history.present.report!
  const cal = report.calibration
  const pick = (label: string, path: ReportPath, merge: (c: Cal) => object) => (rec: object) =>
    app.edit(`Pick a saved ${label}`, (q) => setReportValue(q, ['calibration', ...path], { ...merge(q.report!.calibration), ...rec }))
  const temp = report.options.tempCorrection
  return (
    <>
      <ReportStepIssues status={status} />
      <div className="button-row">
        <SavedListsButton />
      </div>

      <Group title="Calibration block" picker={<RecordPicker list="blocks" current={cal.block} onPick={pick('calibration block', ['block'], (c) => c.block)} />}>
        <div className="field-grid">
          <CalBox path={['block', 'name']} label="Block" list="calibrationBlock" />
          <CalBox path={['block', 'thicknessRange']} label="Thickness range" help='As printed, e.g. 0.250" - 1.000".' />
          <CalBox path={['block', 'material']} label="Block material" list="blockMaterial" />
          <CalBox path={['referenceReflector']} label="Reference reflector" list="referenceReflector" />
        </div>
      </Group>

      <Group title="AUT system" picker={<RecordPicker list="systems" current={cal.system} onPick={pick('AUT system', ['system'], (c) => c.system)} />}>
        <div className="field-grid">
          <CalBox path={['system', 'maker']} label="Maker" list="systemMaker" />
          <CalBox path={['system', 'model']} label="Model" list="systemModel" />
          <CalBox path={['system', 'serial']} label="Serial number" />
        </div>
      </Group>

      <Group title="Transducers" intro={`Up to ${MAX_CHANNELS} channels; only the channels filled in are printed.`}>
        {cal.transducers.length === 0 ? (
          <p className="muted">No transducer yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>Maker</th>
                  <th>Mode</th>
                  <th>Element</th>
                  <th>Size</th>
                  <th>Frequency</th>
                  <th>Angle</th>
                  <th>Serial number</th>
                  <th>Saved list</th>
                  <th><span className="visually-hidden">Delete</span></th>
                </tr>
              </thead>
              <tbody>
                {cal.transducers.map((t, i) => {
                  const w = (f: string) => `Transducer ${i + 1}, ${f}`
                  return (
                    <tr key={i}>
                      <td className="num row-no">{i + 1}</td>
                      <td><CalBox compact path={['transducers', i, 'maker']} label="Maker" where={w('maker')} list="probeMaker" /></td>
                      <td><CalBox compact path={['transducers', i, 'mode']} label="Mode" where={w('mode')} list="transducerMode" /></td>
                      <td><CalSelect compact path={['transducers', i, 'element']} label="Element" where={w('element')} options={['', 'Single', 'Dual']} /></td>
                      <td><CalBox compact path={['transducers', i, 'size']} label="Size" where={w('size')} help='As printed, e.g. 0.375".' /></td>
                      <td><CalBox compact path={['transducers', i, 'frequency']} label="Frequency" where={w('frequency')} help='As printed, e.g. 5 MHz.' /></td>
                      <td><CalBox compact path={['transducers', i, 'angle']} label="Angle" where={w('angle')} help="e.g. 0°." /></td>
                      <td><CalBox compact path={['transducers', i, 'serial']} label="Serial number" where={w('serial number')} /></td>
                      <td><RecordPicker list="transducers" current={t} label={`channel ${i + 1}`} onPick={pick('transducer', ['transducers', i], (c) => c.transducers[i])} /></td>
                      <td className="row-actions">
                        <button type="button" className="icon-btn icon-danger" aria-label={`Delete transducer ${i + 1}`} title="Delete (Ctrl+Z brings it back)"
                          onClick={() => {
                            app.edit('Delete a transducer', (q) => removeListItem(q, ['calibration', 'transducers'], i))
                            app.dispatch({ type: 'clearDrafts', prefix: 'report.calibration.transducers.' })
                          }}>
                          ×
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="button-row">
          <button type="button" className="btn" disabled={cal.transducers.length >= MAX_CHANNELS}
            onClick={() => app.edit('Add a transducer', (q) => addListItem(q, ['calibration', 'transducers'], transducerSchema.parse({})))}>
            Add transducer
          </button>
          {cal.transducers.length < MAX_CHANNELS && (
            <RecordPicker list="transducers" current={{}} label="a new channel" pickOnly
              onPick={(rec) => app.edit('Add a saved transducer', (q) => addListItem(q, ['calibration', 'transducers'], transducerSchema.parse(rec)))} />
          )}
        </div>
      </Group>

      <Group title="Scanner" picker={<RecordPicker list="scanners" current={cal.scanner} onPick={pick('scanner', ['scanner'], (c) => c.scanner)} />}>
        <div className="field-grid">
          <CalBox path={['scanner', 'maker']} label="Maker" />
          <CalBox path={['scanner', 'model']} label="Model" list="scannerModel" />
          <CalBox path={['scanner', 'serial']} label="Serial number" />
          <CalSelect path={['scanner', 'drive']} label="Drive" options={['', 'Automated', 'Manual']} />
          <ReportSelect label="Track" value={cal.scanner.track === null ? '' : cal.scanner.track ? 'yes' : 'no'}
            options={[{ value: '', label: '(blank)' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
            set={(q, v: string) => setReportValue(q, ['calibration', 'scanner', 'track'], v === '' ? null : v === 'yes')} boxKey="report.calibration.scanner.track" step={STEP} />
          <CalBox path={['scanner', 'armLength']} label="Arm length" help='As printed, e.g. 36".' />
        </div>
        <h3>Wheels</h3>
        <div className="field-grid">
          <CalBox path={['scanner', 'wheelsOrientation']} label="Orientation" where="Wheels, orientation" />
          <CalBox path={['scanner', 'wheelsScanSpeed']} label="Scan speed" where="Wheels, scan speed" />
          <CalSelect path={['scanner', 'wheelsDirection']} label="Direction" where="Wheels, direction" options={['', 'Horizontal', 'Vertical']} />
        </div>
        <h3>Arm</h3>
        <div className="field-grid">
          <CalBox path={['scanner', 'armOrientation']} label="Orientation" where="Arm, orientation" />
          <CalBox path={['scanner', 'armScanSpeed']} label="Scan speed" where="Arm, scan speed" />
          <CalSelect path={['scanner', 'armDirection']} label="Direction" where="Arm, direction" options={['', 'Horizontal', 'Vertical']} />
        </div>
      </Group>

      <Group title="Scan increments" intro="The job's X and Y index steps. Used for scans whose increments were not imported (shown as calculated), and in the scope.">
        <div className="field-grid">
          <CalBox path={['increments', 'x']} label="X increment" kind="thickness" units="in" />
          <CalBox path={['increments', 'y']} label="Y increment" kind="thickness" units="in" />
        </div>
      </Group>

      <Group title="Dynamic calibration screenshot" intro="Pick the screenshot itself, whatever it is called.">
        <PhotoPick label="Dynamic calibration screenshot" slot="dynamicImage" value={cal.dynamicImage} set={(q, f) => setReportValue(q, ['calibration', 'dynamicImage'], f)} />
      </Group>

      <Group title="Temperature correction" intro="UT x (1.007 - 0.0001 x T°F), applied to Min 'T' and Avg 'T' before wall loss, everywhere in the report.">
        <div className="field-grid">
          <ReportCheckbox label="Correct for temperature" value={temp.on} set={(q, on: boolean) => setReportValue(q, ['options', 'tempCorrection', 'on'], on)}
            boxKey="report.options.tempCorrection.on" step={STEP} tag={temp.on ? <Flag kind="changed">on</Flag> : undefined} />
          {temp.on && (
            <ReportBox label="Temperature" kind="number" units="°F" value={temp.tempF} set={(q, v: number | null) => setReportValue(q, ['options', 'tempCorrection', 'tempF'], v)}
              boxKey="report.options.tempCorrection.tempF" step={STEP} help="The component's surface temperature during the scans."
              messages={temp.tempF === null ? [{ text: 'No temperature yet: nothing is corrected.', severity: 'warning' }] : []} />
          )}
        </div>
      </Group>
    </>
  )
}
