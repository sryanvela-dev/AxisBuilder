# TightPDF (for the record)

`tightpdf_final.py` (TightPDF 1.2) is the desktop tool that turned the CAD-printed PDF into one JPEG per page for the
inspection report: render each page at 300 DPI, crop to the pixels darker than 248, add 8 px of white padding, save
at quality 95 without chroma subsampling, with the DPI in the file. Names: `<name>.jpg` for one page,
`<name>_001.jpg`, `_002`, ... for several.

The web app's Export step replaces it ("Export report images", `app/src/export/report/`): the same defaults, but each
image is drawn straight from the sheet and cropped to the sheet's printed extents (worked out from the drawing, not
from the pixels). See `app/docs/pdf-export.md`. Only the script is kept here, never the .exe.
