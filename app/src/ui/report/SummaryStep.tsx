// Report step 6, Summary (design 5, 4.7): the six number tiles as the summary page prints them, the scope builder (the
// template's sentences on / off and the purpose / area covered / limitations fields with saved suggestions) and the
// scope and summary text. Text edited by hand is kept and flagged; Regenerate shows the new text beside it first
// (keep mine / use new). Sentences left out for a blank value are listed with Go to (they are Review warnings too).

import { useMemo } from 'react'
import type { Project } from '../../data/schema.ts'
import type { StringListId } from '../../report/savedLists.ts'
import {
  blockOn,
  editText,
  generatedText,
  isEdited,
  regenerateText,
  setScopeField,
  setTextBlock,
  shownText,
  summaryTiles,
  type ScopeField,
  type TextPart,
} from '../../report/summary.ts'
import { templateOf } from '../../report/templates/registry.ts'
import type { TextBlockDef } from '../../report/templates/types.ts'
import { useApp } from '../appContext.ts'
import { Flag, ReportBox, ReportCheckbox } from './boxes.tsx'
import { jumpToReport } from './places.ts'
import { ReportStepIssues, type ReportStepProps } from './ReportWorkspace.tsx'
import { SavedListsButton } from './SavedListsUi.tsx'

const STEP = 'summary' as const

const FIELDS: { key: ScopeField; label: string; list: StringListId; help: string }[] = [
  { key: 'purpose', label: 'Purpose', list: 'scopePurpose', help: 'Finishes "The purpose of this examination was to ...".' },
  { key: 'areaCovered', label: 'Area covered', list: 'scopeArea', help: 'Finishes "... in ...", e.g. "the bottom 6 feet of the vessel".' },
  { key: 'limitations', label: 'Limitations', list: 'scopeLimitations', help: 'A sentence of its own; printed when the Limitations sentence is on.' },
]

export function SummaryStep({ status }: ReportStepProps) {
  const app = useApp()
  const p = app.state.job!.history.present
  const report = p.report!
  const t = templateOf(report.templateId)
  const tiles = useMemo(() => summaryTiles(p, report), [p, report])
  const left = status.issues.filter((i) => i.check?.listOn === 'summary')
  return (
    <>
      <ReportStepIssues status={status} />
      <section className="settings-group" aria-labelledby="summary-tiles-title">
        <h2 id="summary-tiles-title">Figures</h2>
        <p className="muted">As the summary page prints them. They follow the results; nothing to type here.</p>
        <ul className="summary-tiles">
          {tiles.map((tile) => (
            <li key={tile.label} className={`summary-tile tone-${tile.tone}`}>
              <span className="tile-value">{tile.value}</span>
              <span className="tile-label">{tile.label}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="settings-group">
        <div className="group-head">
          <div>
            <h2>Scope</h2>
            <p className="muted">The sentences the scope is built from, and the words only you can give it.</p>
          </div>
          <SavedListsButton />
        </div>
        <div className="field-grid">
          {FIELDS.map((f) => (
            <div key={f.key} id={`report-field-scope-${f.key}`} className="field-wrap-wide">
              <ReportBox label={f.label} value={report.text.scope.fields[f.key]} list={f.list} help={f.help} multiline={f.key === 'limitations'} wide
                set={(q: Project, v: string) => setScopeField(q, f.key, v)} boxKey={`report.text.scope.fields.${f.key}`} step={STEP} />
            </div>
          ))}
        </div>
        <BlockSwitches part="scope" blocks={t.textBlocks.filter((b) => b.part === 'scope')} />
        <TextEditor part="scope" />
      </section>

      <section className="settings-group">
        <h2>Summary</h2>
        <p className="muted">Built from the results; numbers in words where that option is on. The findings sentence follows the worst scan&apos;s severity, as the comments do.</p>
        <BlockSwitches part="summary" blocks={t.textBlocks.filter((b) => b.part === 'summary')} />
        <ReportCheckbox label="Numbers in words" help='"seventeen (17) AUT scans" instead of "17 AUT scans".' value={report.options.numberWords}
          set={(q: Project, on: boolean) => (q.report ? { ...q, report: { ...q.report, options: { ...q.report.options, numberWords: on } } } : q)}
          boxKey="report.options.numberWords" step={STEP} />
        <TextEditor part="summary" />
      </section>

      {left.length > 0 && (
        <section className="settings-group" aria-labelledby="summary-left-out">
          <h2 id="summary-left-out">Sentences left out</h2>
          <p className="muted">Each waits for a value; fill it in where it is asked for and the sentence prints.</p>
          <ul className="review-list">
            {left.map((i) => (
              <li key={i.text}>
                <span className="kind kind-review">Check</span>
                <span className="review-text">{i.text}</span>
                <button type="button" className="btn btn-small" title="Go to the value" onClick={() => {
                  const place = i.check!.place
                  if (place.kind === 'field' && place.step !== STEP) app.dispatch({ type: 'goToReportStep', step: place.step })
                  window.setTimeout(() => jumpToReport(place), 60)
                }}>
                  Go to
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

/** One switch per sentence (a group of sentences, e.g. the findings by severity, is one switch). */
function BlockSwitches({ part, blocks }: { part: TextPart; blocks: TextBlockDef[] }) {
  const app = useApp()
  const report = app.state.job!.history.present.report!
  const shown = blocks.filter((b, i) => !b.group || blocks.findIndex((x) => x.group === b.group) === i)
  return (
    <fieldset className="block-switches">
      <legend>Sentences</legend>
      {shown.map((b) => (
        <ReportCheckbox key={b.id} label={b.label} value={blockOn(report, b)}
          help={b.group ? 'One sentence, picked by the worst scan’s severity.' : undefined}
          tag={blockOn(report, b) !== b.defaultOn ? <Flag kind="changed" title="Not the template's default">changed</Flag> : undefined}
          set={(q: Project, on: boolean) => setTextBlock(q, part, b.id, on)} boxKey={`report.text.${part}.blocks.${b.id}`} step={STEP} />
      ))}
    </fieldset>
  )
}

function TextEditor({ part }: { part: TextPart }) {
  const app = useApp()
  const p = app.state.job!.history.present
  const report = p.report!
  const edited = isEdited(report, part)
  const name = part === 'scope' ? 'Scope' : 'Summary'
  const regenerate = async () => {
    const mine = shownText(p, report, part)
    const fresh = generatedText(p, report, part)
    const answer = await app.ask({
      title: `Regenerate the ${part}?`,
      message: (
        <div className="compare-texts">
          <div>
            <h3>Yours (edited by hand)</h3>
            <p className="compare-text">{mine}</p>
          </div>
          <div>
            <h3>New, from the data</h3>
            <p className="compare-text">{fresh || <span className="muted">(no complete sentence yet)</span>}</p>
          </div>
        </div>
      ),
      buttons: [{ id: 'keep', label: 'Keep mine' }, { id: 'new', label: 'Use new', primary: true }],
      cancelId: 'keep',
    })
    if (answer === 'new') app.edit(`Regenerate the ${part}`, (q) => regenerateText(q, part, new Date().toISOString()))
  }
  return (
    <div id={`report-field-${part}-text`} className="text-editor">
      <ReportBox label={`${name} text`} multiline wide value={shownText(p, report, part)}
        help={edited
          ? 'Edited by hand: kept as you wrote it, whatever the data does. The switches above change only the generated text.'
          : 'Generated from the sentences above and the data. Type to change it; your text is then kept until you regenerate.'}
        tag={edited ? <Flag title="Kept until you click Regenerate">edited by hand</Flag> : undefined}
        set={(q: Project, v: string) => editText(q, part, v, new Date().toISOString())} boxKey={`report.text.${part}.edited`} step={STEP} />
      {edited && (
        <button type="button" className="btn" onClick={() => void regenerate()}>
          Regenerate…
        </button>
      )}
    </div>
  )
}
