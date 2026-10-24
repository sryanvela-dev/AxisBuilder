// Export step, the main way: the PDF and the report images, from the app's own sheets (Phase 4b).

export function ExportPdfPanel({ disabled }: { disabled: boolean }) {
  return (
    <section className="export-card">
      <h2>PDF and report images</h2>
      <div className="button-row">
        <button type="button" className="btn btn-primary" disabled>
          Make PDF
        </button>
        <button type="button" className="btn btn-primary" disabled>
          Export report images
        </button>
        <span className="muted">{disabled ? 'Choose the job folder and fix what blocks export first.' : 'Coming in the next part of this phase.'}</span>
      </div>
    </section>
  )
}
