# Task: fix open issue #7 and add automatic scan-photo filename matching

Read CLAUDE.md first and follow its editing rules (src/*.bas is master, cp1252 + CRLF, ASCII only,
Option Explicit, small targeted changes, never touch the .xlsm). When done: list which modules changed,
mark #7 FIXED in CLAUDE.md, and add a Change log line.

## Background (verified in the code, 2026-10-19)
- Two image-folder macros exist:
  - `SelectScanImageFolder` (SLG_ScanImages) is the one the Home button runs. It keeps existing Image File
    names, fills blanks with a default (SCAN01 -> "S1", digits via CLng), and marks LINKED / REVIEW using a
    *normalized* match (ignores spaces, - _ . and parentheses).
  - `SelectOriginalImageFolder` (SLG_Utilities, button on Project Settings D64) wipes Scan Images A:E and
    rebuilds it via `ResetScanImageNamesToOverlayDefaults` using `DefaultImageName` (SCAN01 -> "S01", all
    digits kept) and `DefaultProcessedName`.
- The generator needs the EXACT filename. `ResolveSourceImagePath` (SLG_Utilities, Private) accepts a full
  filename or a base name and tries exact, then .png, .jpg, .jpeg. So the linker can say LINKED when the
  generator will later fail (e.g. Image File "Scan_1" vs file "Scan 1.png").
- The workbook has only "Original Image Folder" (Project Settings row 77), no plain "Image Folder" row.
  `SelectScanImageFolder` only reaches row 77 through `FindValueCellByLabel`'s loose partial match.
- Scan Images columns: A Scan, B Image File, C Processed Image, D Include, E Status, F Notes.
  Column A mirrors Scan Import and must NOT be renamed.

## Part 1 - Unify (the #7 fix)
1. One default-name rule everywhere: first digit group of the scan name, converted with CLng, as "S" & n
   (SCAN01 -> "S1"). Make `DefaultImageName` and `DefaultProcessedName` (and `ScanNumberAlias`) share it.
   Keep column C values that are already filled.
2. Make `SelectOriginalImageFolder` a thin wrapper that calls `SelectScanImageFolder` (keep the public name:
   the Project Settings button OnAction uses it). Remove `ResetScanImageNamesToOverlayDefaults` if nothing
   else calls it.
3. Folder setting: look up "Original Image Folder" by exact label first, then fall back to "Image Folder".
   Do not rely on the partial-match fallback.
4. "LINKED" must mean the generator will find the file. Make `ResolveSourceImagePath` Public (or move it to a
   shared Public helper) and use it in `SelectScanImageFolder`, `ValidateCurrentScanImages` and
   `CountActuallyLinkedScanImages` instead of the normalized-key index.

## Part 2 - Home button auto-matches filenames
Rewrite the flow of `SelectScanImageFolder`. Compute everything in memory first and write to the sheet only at
the end, so Cancel at any prompt changes nothing (and Application settings are always restored).

1. Folder picker (existing `PickImageFolder`), save to the "Original Image Folder" cell.
2. List every .png / .jpg / .jpeg in the folder (case-insensitive). Ignore files with no digits (count them
   for the summary).
3. For each scan in Scan Images column A, take its number = first contiguous digit group, via CLng
   (01 = 1). Scans with no digits are not matched (status REVIEW).
4. For each file, number = first contiguous digit group of the base name. Pattern = base name with that digit
   group replaced by "#" (case-insensitive), e.g. S1 -> "S#", Scan 1 -> "Scan #", S1_edit -> "S#_edit".
5. Candidates for a scan = files whose number equals the scan's number.
6. Decide:
   - Only one pattern covers the candidates, and each scan has one candidate: assign automatically, no prompt.
   - More than one pattern: ONE prompt listing the patterns (top 9 by number of scans covered), each with
     its scan count and an example filename. User enters a number; invalid input re-prompts; Cancel aborts.
     Use InputBox (no UserForms, we only import .bas modules). Keep the prompt under ~900 characters.
   - After the pattern is chosen, per-scan prompts happen only for leftovers: a scan with no file in the chosen
     pattern but candidates in another pattern, or a scan with several files in the chosen pattern (for example
     S1.png and S1.jpg, or S1.png and S01.png). Numbered list of candidate filenames, 0 = skip this scan.
   - A scan with no candidates at all: leave Image File as it is and mark REVIEW: MISSING.
7. Store the FULL filename including extension (e.g. S1.png) in column B. `ResolveSourceImagePath` already
   accepts that.
8. Existing Image File values ("Ask me first"): if a scan already has a non-blank value whose resolved file
   differs from the new match, do NOT overwrite silently. Show ONE Yes / No / Cancel message box:
   "N scans already have an Image File name that differs from the folder match. Replace them? Yes = replace,
   No = keep existing, Cancel = stop." Show up to 5 examples ("old -> new"). Blank cells and values that already
   resolve to the same file never trigger the prompt.
9. Status column E: LINKED when `ResolveSourceImagePath(folder, B)` finds the file, otherwise
   "REVIEW: MISSING <name>" with the existing review formatting. Do not touch columns A, C (unless blank, then
   use `DefaultProcessedName`), D, or F.
10. Finish as today: Message Center message and MsgBox with "X of N matched, Y missing, Z skipped" and the
    missing scan names, then `RefreshProjectSummary`.

## Do not change
- Shapes on Home or Project Settings. (Home still has an icon bound to the missing macro `SelectImageFolder`;
  that is open issue #8, leave it.)
- Anything outside SLG_ScanImages and the image helpers in SLG_Utilities.

## Test checklist for the user (after re-import, compile, re-sign)
1. Folder with only S1..Sn .png, nothing filled in: names fill with no prompts.
2. Folder with both "S1.png" and "Scan 1.jpg" sets: one pattern prompt, then all scans use the choice.
3. A folder with S1.png and S1.jpg: per-scan prompt for that scan.
4. Remove one image: that scan shows REVIEW: MISSING.
5. Pre-filled different names: one Yes / No / Cancel prompt appears.
6. Cancel at each prompt: nothing changes on Scan Images.
7. SCAN01 and Scan 1 as scan names both match S1.png.
8. Generate CAD Drawing still finds every image (names with spaces, e.g. "Scan 1.png", too).
