# Task: Print Field Form should export a PDF and open it (no Excel Print Preview window)

Read CLAUDE.md first and follow its editing rules (src/*.bas is master, cp1252 + CRLF, ASCII only,
Option Explicit, small targeted changes, never touch the .xlsm). When done: list which modules changed
and add a Change log line; update the module table row for SLG_PrintEmbeddedFieldForm.

## Why (user, 2026-10-19)
`PrintFieldForm` (SLG_PrintEmbeddedFieldForm, Home button) shows the four hidden form pages and opens Excel's old
Print Preview window via `ActiveWindow.SelectedSheets.PrintPreview`. The user does not like that window and
wants one-sided printing to be easy to choose on any computer. The user's printer defaults to two-sided, and
Excel's VBA cannot set duplex reliably. Decision: export the form to a PDF and open it, so printing happens in
the PDF viewer, where "print on both sides" is a standard, visible option.

## Behavior
1. Keep the public name `PrintFieldForm` (the Home button is bound to it) and keep the existing safety logic:
   confirm all four pages exist before changing anything, remember each page's `Visible` state, show them
   temporarily, and ALWAYS restore the exact previous visibility (also on error) via the existing cleanup path.
2. Before doing anything else, show a short reminder MsgBox (OK only is fine):
   "The Field Form will open as a PDF. When you print, choose ONE-SIDED printing (turn off 'print on both sides')
   so each page photographs cleanly for OCR."
3. Select the four pages in packet order (as today) and export them as one PDF with
   `ActiveWindow.SelectedSheets.ExportAsFixedFormat Type:=xlTypePDF, Filename:=pdfPath, Quality:=xlQualityStandard,
   IncludeDocProperties:=False, IgnorePrintAreas:=False, OpenAfterPublish:=False`.
   It must use each page's existing print area and page setup (do not change page setup). Page order must be
   Page 1, 2, 3, 4.
4. File location and name: the user's temp folder (`Environ("TEMP")`), named
   `AxisBuilder_Field_Form_yyyymmdd_hhnnss.pdf` (timestamped so a copy that is still open in a viewer never causes
   a file-lock error). Do not delete old copies.
5. Restore page visibility and the previously active sheet right after the export finishes (before opening the
   PDF), using the existing cleanup code.
6. Open the PDF with the default viewer using `CreateObject("Shell.Application").ShellExecute pdfPath, "", "", "open", 1`
   (not `FollowHyperlink`, which can show security prompts). If opening fails, or there is no PDF viewer, show a
   MsgBox with the full file path so the user can open it by hand.
7. Message Center (existing `WriteMessageCenter`): "Field Form exported to PDF: <path>" with type SUCCESS, and an
   ERROR message if the export fails. Keep the existing error MsgBox style for failures.
8. Update the module header comment (it still says Print Preview) and remove the PrintPreview call.

## Do not change
- Page setup / print areas on the form sheets, the Home button, `SLG_FieldFormVisibility`, or any other module.

## Test checklist for the user (after re-importing SLG_PrintEmbeddedFieldForm, compile, re-sign)
1. Click Print Field Form: the one-sided reminder appears, then a PDF opens with 4 pages in order and the same
   layout the old preview showed (letter size, nothing cut off).
2. After it opens, the four form pages are hidden again (not visible as sheet tabs) and you are back on Home.
3. Click the button again while the first PDF is still open: a second PDF opens, no error.
4. Print from the PDF viewer with "print on both sides" off: pages come out one-sided.
5. Message Center shows the PDF path.
