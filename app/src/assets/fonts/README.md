# Bundled fonts

All fonts are shipped with the build (precached by the service worker), so the app works offline.

## Drawing (PDF, report images, Sheets view)

`Arimo-Regular.ttf`: Arimo Regular by Steve Matteson (Google Fonts), Apache License 2.0.
Copied from the `@expo-google-fonts/arimo` package (dev dependency).

Used for the text in the drawing PDF (embedded whole), the report images and the Sheets view. Arimo has the same
character widths as Arial, which the preview and the label sizing measure with, so labels fit the same way.

## AUT report (brand fonts)

| File | Font | Used for |
|---|---|---|
| `Montserrat-SemiBold.ttf` | Montserrat 600 | headings, table headers, labels |
| `Montserrat-Bold.ttf` | Montserrat 700 | titles, tile figures |
| `Roboto-Regular.ttf` | Roboto 400 | body text, tables |
| `Roboto-Medium.ttf` | Roboto 500 | field labels |
| `Roboto-Bold.ttf` | Roboto 700 | totals, emphasis |

Source: Google Fonts, the static TrueType instances served by the Google Fonts CSS API
(`https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700&family=Roboto:wght@400;500;700`, files on
fonts.gstatic.com: Montserrat v31, Roboto v51), downloaded 2026-10-30. Licence: SIL Open Font License 1.1, texts
beside them (`Montserrat-OFL.txt`, `Roboto-OFL.txt`, from github.com/google/fonts `ofl/montserrat` and `ofl/roboto`).
Embedded whole in the report PDF (pdf-lib's subsetting dropped letters in Edge, Phase 4b).

After replacing any font run `npm run gen:font-metrics` (the widths in `src/engine/fontMetrics.generated.ts` and
`src/report/fontMetrics.generated.ts`).
