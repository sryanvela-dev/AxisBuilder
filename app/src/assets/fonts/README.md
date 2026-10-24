# Bundled font

`Arimo-Regular.ttf`: Arimo Regular by Steve Matteson (Google Fonts), Apache License 2.0.
Copied from the `@expo-google-fonts/arimo` package (dev dependency) so the build ships it and the app works offline.

Used for the text in the PDF (embedded as a subset), the report images and the Sheets view. Arimo has the same
character widths as Arial, which the preview and the label sizing measure with, so labels fit the same way.

After replacing the font run `npm run gen:font-metrics` (the widths in `src/engine/fontMetrics.generated.ts`).
