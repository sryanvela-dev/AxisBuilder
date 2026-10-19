# Task: fix open issue #8 (Home icons bound to macros that don't exist)

Read CLAUDE.md first and follow its editing rules (src/*.bas is master, cp1252 + CRLF, ASCII only,
Option Explicit, small targeted changes, never touch the .xlsm). When done: list which modules changed,
mark #8 FIXED in CLAUDE.md, and add a Change log line.

## Background (verified 2026-10-19)
The Home sheet has an icon graphic beside each action button. Three of those icons are assigned to macro
names that do not exist in any module, so clicking them does nothing (or shows "cannot run the macro"):

| Icon bound to | Real macro it should run | Where the real macro lives |
|---|---|---|
| `ImportAUT` | `Import_AUT_CSV` | SLG_ImportAUT |
| `SelectImageFolder` | `SelectScanImageFolder` | SLG_ScanImages |
| `GenerateLayout` | `ExportAxisBuilderLSP` (Home "Generate CAD Drawing") | SLG_Utilities |

All three target macros already exist and are Public. None of the three alias names exist anywhere in src.
We cannot edit shapes in the signed workbook, so fix this in code with alias macros.

## What to do
1. Add three tiny Public Subs to `SLG_Dashboard.bas` (the Home module), each with a one-line comment
   saying it exists because a Home icon is still bound to the old name:

       Public Sub ImportAUT()
           Import_AUT_CSV
       End Sub

       Public Sub SelectImageFolder()
           SelectScanImageFolder
       End Sub

       Public Sub GenerateLayout()
           ExportAxisBuilderLSP
       End Sub

2. Keep each alias a pure pass-through: no new prompts, no new error handling, no behavior change.
3. Check for name clashes before finishing: no module, Sub, Function, Const or variable anywhere in src may
   already use `ImportAUT`, `SelectImageFolder` or `GenerateLayout` (note the module `SLG_ImportAUT` is a
   different name and is fine). VBA will not compile with duplicates.
4. Do not change any other module and do not touch the shapes.

## Test checklist for the user (after re-importing SLG_Dashboard, compile, re-sign)
1. Debug > Compile has no errors.
2. Click the icon next to Import AUT: it runs the same dialog as the Import AUT button.
3. Click the icon next to Select Image Folder: it opens the folder picker and the scan photo matching flow.
4. Click the icon next to Generate CAD Drawing: it runs the same export as the button (cancel at the save
   dialog is fine for the test).
5. The existing buttons still work.
