Attribute VB_Name = "SLG_OCR_Importer"
Option Explicit

' AxisBuilder v5.0 - OCR importer - numeric transcription verification
' OCR v1.4 - Dedicated Message Center Manager integration
' Y Axis Start Reference is preserved in Drawing Information Notes
' OCR clipboard workflow
' 1) Run CopyOCRPrompt.
' 2) Paste the prompt into ChatGPT and attach the completed field form.
' 3) Copy ChatGPT's complete structured response.
' 4) Run ImportOCR. The response is read directly from the Windows clipboard.

#If VBA7 Then
    Private Declare PtrSafe Function OpenClipboard Lib "user32" (ByVal hwnd As LongPtr) As Long
    Private Declare PtrSafe Function CloseClipboard Lib "user32" () As Long
    Private Declare PtrSafe Function EmptyClipboard Lib "user32" () As Long
    Private Declare PtrSafe Function GetClipboardData Lib "user32" (ByVal wFormat As Long) As LongPtr
    Private Declare PtrSafe Function SetClipboardData Lib "user32" (ByVal wFormat As Long, ByVal hMem As LongPtr) As LongPtr
    Private Declare PtrSafe Function GlobalAlloc Lib "kernel32" (ByVal wFlags As Long, ByVal dwBytes As LongPtr) As LongPtr
    Private Declare PtrSafe Function GlobalLock Lib "kernel32" (ByVal hMem As LongPtr) As LongPtr
    Private Declare PtrSafe Function GlobalUnlock Lib "kernel32" (ByVal hMem As LongPtr) As Long
    Private Declare PtrSafe Function GlobalSize Lib "kernel32" (ByVal hMem As LongPtr) As LongPtr
    Private Declare PtrSafe Sub CopyMemory Lib "kernel32" Alias "RtlMoveMemory" (ByVal Destination As LongPtr, ByVal Source As LongPtr, ByVal Length As LongPtr)
    Private Declare PtrSafe Function lstrlenW Lib "kernel32" (ByVal lpString As LongPtr) As Long
#Else
    Private Declare Function OpenClipboard Lib "user32" (ByVal hwnd As Long) As Long
    Private Declare Function CloseClipboard Lib "user32" () As Long
    Private Declare Function EmptyClipboard Lib "user32" () As Long
    Private Declare Function GetClipboardData Lib "user32" (ByVal wFormat As Long) As Long
    Private Declare Function SetClipboardData Lib "user32" (ByVal wFormat As Long, ByVal hMem As Long) As Long
    Private Declare Function GlobalAlloc Lib "kernel32" (ByVal wFlags As Long, ByVal dwBytes As Long) As Long
    Private Declare Function GlobalLock Lib "kernel32" (ByVal hMem As Long) As Long
    Private Declare Function GlobalUnlock Lib "kernel32" (ByVal hMem As Long) As Long
    Private Declare Function GlobalSize Lib "kernel32" (ByVal hMem As Long) As Long
    Private Declare Sub CopyMemory Lib "kernel32" Alias "RtlMoveMemory" (ByVal Destination As Long, ByVal Source As Long, ByVal Length As Long)
    Private Declare Function lstrlenW Lib "kernel32" (ByVal lpString As Long) As Long
#End If

Private Const CF_UNICODETEXT As Long = 13
Private Const GMEM_MOVEABLE As Long = &H2
Private Const REVIEW_FILL As Long = 10092543 ' RGB(255, 255, 153)

Private mStructureErrors As String
Private mStructureErrorCount As Long

Public Sub CopyOCRPrompt()
    Dim promptText As String
    promptText = BuildOCRPrompt()

    If ClipboardSetText(promptText) Then
        WriteHomeMessageBlock "OCR PROMPT COPIED" & vbCrLf & vbCrLf & _
                              "Paste the prompt into ChatGPT and attach pages 1, 3, and 4 of the completed field form." & vbCrLf & vbCrLf & _
                              "Copy ChatGPT's complete structured return, then click Import OCR Data.", "SUCCESS"
    Else
        MsgBox "The OCR prompt could not be copied to the Windows clipboard.", vbExclamation, "Scan Layout Generator OCR"
    End If
End Sub

Public Sub ImportOCR()
    Dim rawText As String
    rawText = ClipboardGetText()

    If Len(Trim$(rawText)) = 0 Then
        MsgBox "The clipboard does not contain text." & vbCrLf & vbCrLf & _
               "Copy ChatGPT's complete OCR response, then click Import OCR Data again.", _
               vbExclamation, "Scan Layout Generator OCR"
        Exit Sub
    End If

    If InStr(1, rawText, "[PROJECT]", vbTextCompare) = 0 Or _
       InStr(1, rawText, "[VESSEL]", vbTextCompare) = 0 Then
        MsgBox "The clipboard text is not a valid Scan Layout Generator OCR response." & vbCrLf & vbCrLf & _
               "Run Copy OCR Prompt, use that prompt in ChatGPT, and copy the complete structured response.", _
               vbExclamation, "Scan Layout Generator OCR"
        Exit Sub
    End If

    If MsgBox("Importing will replace the current OCR-controlled entries on Drawing Information, Shell Features, and Head Features." & _
              vbCrLf & vbCrLf & "Continue?", vbQuestion + vbYesNo, "Import OCR Data") <> vbYes Then Exit Sub

    Dim oldCalc As XlCalculation
    oldCalc = Application.Calculation
    On Error GoTo ImportFailed
    Application.ScreenUpdating = False
    Application.EnableEvents = False
    Application.Calculation = xlCalculationManual

    Dim sections As Object
    Set sections = ParseSections(rawText)

    mStructureErrors = vbNullString
    mStructureErrorCount = 0

    ClearOCRTargets

    Dim imported As Long, reviewCount As Long, missingCount As Long
    ImportProjectAndVessel sections, imported, reviewCount, missingCount
    ImportCircWelds sections, imported, reviewCount
    ImportLongSeams sections, imported, reviewCount
    ImportShellMUT sections, imported, reviewCount
    ImportObjects sections, imported, reviewCount
    ImportShellNozzles sections, imported, reviewCount
    ImportHeadData sections, "HEAD1", "HEAD 1", 4, 28, imported, reviewCount
    ImportHeadData sections, "HEAD2", "HEAD 2", 14, 33, imported, reviewCount
    ImportFieldNotes sections, imported, reviewCount

    Application.CalculateFull
    RefreshHomeProjectSummary reviewCount
    WriteOCRMessageCenter sections, imported, reviewCount, missingCount

    Application.Calculation = oldCalc
    Application.EnableEvents = True
    Application.ScreenUpdating = True

    ThisWorkbook.Worksheets("Home").Activate
    Exit Sub

ImportFailed:
    Application.Calculation = oldCalc
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    WriteHomeMessageBlock "OCR IMPORT FAILED" & vbCrLf & vbCrLf & _
                          "Error: " & Err.description & vbCrLf & vbCrLf & _
                          "No further import steps were completed.", "ERROR"
    ThisWorkbook.Worksheets("Home").Activate
End Sub

Private Function BuildOCRPrompt() As String
    Dim s As String

    s = "You are reading a completed Scan Layout Generator Vessel Inspection Field Form." & vbCrLf & vbCrLf
    s = s & "Extract the information exactly as written from pages 1, 3, and 4. Ignore page 2 completely." & vbCrLf & vbCrLf
    s = s & "RULES" & vbCrLf

    s = s & "- Do not invent, calculate, correct, normalize, or renumber any value." & vbCrLf
    s = s & "- Preserve IDs, wording, units, decimal places, clock positions, and row order." & vbCrLf
    s = s & "- Leave an unread or uncertain individual field as REVIEW: <brief reason>." & vbCrLf
    s = s & "- Mark only the uncertain field, not the entire row. Preserve all readable fields in that row." & vbCrLf
    s = s & "- CAUTION OVER GUESSING: If any handwritten digit or value is not clearly readable, mark only that field as REVIEW: <brief reason>. Do not choose the most likely value." & vbCrLf
    s = s & "- NUMERIC TRANSCRIPTION IS CHARACTER-BY-CHARACTER: Read every handwritten number one character at a time from left to right. Do not recognize the value as a whole or complete it from an expected pattern." & vbCrLf
    s = s & "- Pay special attention to handwritten 4 versus 1, and to 6, 10, 0, 1, and 7. A visible open or closed triangle, cross-stroke, vertical stroke, loop, or hook must be preserved as actually drawn. If a digit could reasonably be read more than one way, use REVIEW instead of guessing." & vbCrLf
    s = s & "- CRITICAL EXAMPLE: 240 and 210 are different values. If the middle digit visibly has the writer's form of 4, return 240 exactly; do not simplify it to 210. If the middle digit cannot be distinguished between 4 and 1, return REVIEW: middle digit unclear (4 or 1)." & vbCrLf
    s = s & "- SAME-WRITER COMPARISON: When a digit is difficult, compare its shape with clearly written examples of that digit elsewhere on the same included pages. Use this only to identify handwriting shape, never to infer what the value should be." & vbCrLf
    s = s & "- NO PATTERN COMPLETION: Do not change a photographed value because adjacent rows, increasing sequences, vessel dimensions, geometry, or engineering expectations suggest another value." & vbCrLf
    s = s & "- REQUIRED NUMERIC SECOND PASS: After filling the template, re-open and visually re-read every populated numeric field directly from its original cell. Compare the returned value digit-for-digit, including signs, decimal points, and trailing zeros. Correct any mismatch before responding." & vbCrLf
    s = s & "- REQUIRED LONG SEAM CHECK: Re-read every Long Seam XPosition, StartY, and StopY directly from its own row. Confirm that LS1 and all following rows were not shifted, copied from a neighbor, or changed to fit a sequence." & vbCrLf
    s = s & "- SCRATCHED-OUT DATA: Treat clearly crossed-out or scribbled-over text as deleted. If a clear replacement is written in the same field, return only the replacement. If the final value is unclear, mark only that field as REVIEW: scratched-out value unclear." & vbCrLf
    s = s & "- Leave a blank field blank, except for the ID fallback rule below." & vbCrLf
    s = s & "- ID FALLBACK RULE FOR EVERY STRUCTURED SECTION: If a row contains any data but its written ID field is blank, use that template row identifier as the ID (for example CW1, LS1, MUT1, O1, N1, HN1, or HMUT1)." & vbCrLf
    s = s & "- A written ID always overrides the fallback ID. Use the fallback ID ONLY when the written ID cell on the form is blank. A completely blank row must remain blank." & vbCrLf
    s = s & "- Never output both a fallback ID and a written ID in the same row. The first field after = must contain exactly one ID: either the written ID or the fallback template ID." & vbCrLf
    s = s & "- Never shift the second field into the ID field. Every populated row must retain the exact field count and delimiter positions shown below." & vbCrLf
    s = s & "- CRITICAL: For every populated structured row, the first field AFTER the = sign must be the written ID or the required fallback ID. The label before the = sign (such as N1= or LS1=) is NOT the row ID and does not count as a field." & vbCrLf

    s = s & "- NOZZLE EXAMPLE - blank written ID: Correct: N1=N1|6|109.5|16|.813|.657   Incorrect: N1=6|109.5|16|.813|.657" & vbCrLf
    s = s & "- OBJECT EXAMPLE - written ID present: Correct: O1=Support 1|108|107|123|14|   Incorrect: O1=O1|Support 1|108|107|123|14|" & vbCrLf
    s = s & "- OBJECT EXAMPLE - blank written ID: Correct: O1=O1|108|107|123|14|" & vbCrLf
    s = s & "- Before returning the template, verify every populated structured row has exactly the required number of fields and exactly one ID field after =." & vbCrLf
    s = s & "- If a populated row is missing its required first ID field, contains both a fallback and written ID, or has the wrong field count, regenerate that row instead of shifting values." & vbCrLf
    s = s & "- Use the vertical bar | only as the field delimiter." & vbCrLf
    s = s & "- Do not place | inside Notes or Field Notes; replace any such character with a slash." & vbCrLf
    s = s & "- Return only the completed template. Do not add Markdown fences, commentary, summaries, or explanations." & vbCrLf
    s = s & "- HEAD ASSIGNMENT: On page 4, the left-hand head is always HEAD1 and the right-hand head is always HEAD2. Assign the head side before extracting any head nozzle or head MUT data. Do not swap heads based on handwritten east/west labels." & vbCrLf
    s = s & "- For every Head Nozzle row, preserve all seven fields and all required trailing delimiters, even when the final fields are blank." & vbCrLf
    s = s & "- Page 2 Shell Sketch must not produce data or review warnings." & vbCrLf & vbCrLf

    s = s & "For Circ Weld rows use: WeldID|YPosition" & vbCrLf
    s = s & "For Long Seam rows use: SeamID|XPosition|StartY|StopY" & vbCrLf
    s = s & "For Shell MUT rows use: MUTID|XPosition|YPosition|Thickness|Notes" & vbCrLf
    s = s & "For Object rows use: ObjectID|XPosition|YPosition|CircWidth|Length|Notes" & vbCrLf
    s = s & "For Shell Nozzle rows use: NozzleID|Diameter|XPosition|YPosition|MinT|Notes" & vbCrLf
    s = s & "For Head Nozzle rows use: NozzleID|Diameter|ClockPosition|RadiusPosition|CustomRadius|MinT|Notes" & vbCrLf
    s = s & "For Head MUT rows use: MUTID|ClockPosition|RadiusPosition|CustomRadius|MinT|Notes" & vbCrLf & vbCrLf

    s = s & "[PROJECT]" & vbCrLf
    s = s & "Client=" & vbCrLf & "Facility=" & vbCrLf & "Unit=" & vbCrLf
    s = s & "EquipmentID=" & vbCrLf & "Date=" & vbCrLf & "Inspector=" & vbCrLf & vbCrLf
    s = s & "[VESSEL]" & vbCrLf
    s = s & "Orientation=" & vbCrLf & "Circumference=" & vbCrLf & "Length=" & vbCrLf
    s = s & "NominalThickness=" & vbCrLf & "XAxisStartReference=" & vbCrLf & "XAxisDirection=" & vbCrLf
    s = s & "YAxisStartReference=" & vbCrLf & "YAxisDirection=" & vbCrLf & vbCrLf

    s = s & NumberedTemplate("CIRCWELDS", "CW", 10)
    s = s & NumberedTemplate("LONGSEAMS", "LS", 10)
    s = s & NumberedTemplate("SHELLMUT", "MUT", 20)
    s = s & NumberedTemplate("OBJECTS", "O", 20)
    s = s & NumberedTemplate("SHELLNOZZLES", "N", 20)

    s = s & "[HEAD1]" & vbCrLf
    s = s & NumberedLines("HN", 10) & NumberedLines("HMUT", 5) & vbCrLf
    s = s & "[HEAD2]" & vbCrLf
    s = s & NumberedLines("HN", 10) & NumberedLines("HMUT", 5) & vbCrLf
    s = s & "[FIELDNOTES]" & vbCrLf & "Text=" & vbCrLf & vbCrLf
    s = s & "[REVIEW]" & vbCrLf & "Text=" & vbCrLf

    BuildOCRPrompt = s
End Function

Private Function NumberedTemplate(ByVal sectionName As String, ByVal prefix As String, ByVal count As Long) As String
    NumberedTemplate = "[" & sectionName & "]" & vbCrLf & NumberedLines(prefix, count) & vbCrLf
End Function

Private Function NumberedLines(ByVal prefix As String, ByVal count As Long) As String
    Dim i As Long, s As String
    For i = 1 To count
        s = s & prefix & CStr(i) & "=" & vbCrLf
    Next i
    NumberedLines = s
End Function

Private Function ParseSections(ByVal rawText As String) As Object
    Dim result As Object, current As Object
    Set result = CreateObject("Scripting.Dictionary")
    result.CompareMode = vbTextCompare

    rawText = Replace(rawText, vbCrLf, vbLf)
    rawText = Replace(rawText, vbCr, vbLf)

    Dim lines() As String, line As Variant, t As String, sectionName As String
    lines = Split(rawText, vbLf)

    For Each line In lines
        t = Trim$(CStr(line))
        If Len(t) >= 3 And Left$(t, 1) = "[" And Right$(t, 1) = "]" Then
            sectionName = UCase$(Mid$(t, 2, Len(t) - 2))
            Set current = CreateObject("Scripting.Dictionary")
            current.CompareMode = vbTextCompare
            Set result(sectionName) = current
        ElseIf Not current Is Nothing Then
            Dim p As Long
            p = InStr(1, t, "=", vbBinaryCompare)
            If p > 0 Then current(Trim$(Left$(t, p - 1))) = Trim$(Mid$(t, p + 1))
        End If
    Next line

    Set ParseSections = result
End Function

Private Sub ClearOCRTargets()
    Dim wsInfo As Worksheet, wsShell As Worksheet, wsHead As Worksheet
    Set wsInfo = ThisWorkbook.Worksheets("Drawing Information")
    Set wsShell = ThisWorkbook.Worksheets("Shell Features")
    Set wsHead = ThisWorkbook.Worksheets("Head Features")

    ClearRangeAndFill wsInfo.Range("B5:B9")
    ClearRangeAndFill wsInfo.Range("B24")

    ClearRangeAndFill wsShell.Range("A3:D12")
    ClearRangeAndFill wsShell.Range("A15:F24")
    ClearRangeAndFill wsShell.Range("A27:H66")
    ClearRangeAndFill wsShell.Range("A69:G88")
    ClearRangeAndFill wsShell.Range("A91:E110")

    ClearRangeAndFill wsHead.Range("A4:J23")
    ClearRangeAndFill wsHead.Range("A28:I47")

    wsShell.Range("C3:D12").value = "NO"
    wsShell.Range("E15:F24").value = "NO"
    wsShell.Range("G27:G66").value = "NO"
    wsShell.Range("H27:H66").value = "AUTO"
    wsShell.Range("F69:F88").value = "NO"

    wsHead.Range("I4:I23").value = "AUTO"
    wsHead.Range("J4:J23").value = "NO"
    wsHead.Range("G28:G47").value = "AUTO"
    wsHead.Range("H28:H47").value = "NO"
End Sub

Private Sub ClearRangeAndFill(ByVal rng As Range)
    Dim cell As Range
    Dim target As Range
    Dim cleared As Object
    Dim areaKey As String

    Set cleared = CreateObject("Scripting.Dictionary")

    For Each cell In rng.Cells
        If cell.MergeCells Then
            Set target = cell.MergeArea
        Else
            Set target = cell
        End If

        areaKey = target.Worksheet.CodeName & "!" & target.address(False, False)
        If Not cleared.Exists(areaKey) Then
            target.ClearContents
            target.Interior.Pattern = xlNone
            cleared.Add areaKey, True
        End If
    Next cell
End Sub

Private Function SafeTarget(ByVal target As Range) As Range
    If target.MergeCells Then
        Set SafeTarget = target.MergeArea.Cells(1, 1)
    Else
        Set SafeTarget = target.Cells(1, 1)
    End If
End Function

Private Sub ImportProjectAndVessel(ByVal sections As Object, ByRef imported As Long, ByRef reviewCount As Long, ByRef missingCount As Long)
    Dim wsInfo As Worksheet, wsSet As Worksheet
    Set wsInfo = ThisWorkbook.Worksheets("Drawing Information")
    Set wsSet = ThisWorkbook.Worksheets("Project Settings")

    WriteKey sections, "PROJECT", "EquipmentID", wsInfo.Range("B5"), imported, reviewCount, missingCount

    Dim facility As String, unitName As String, combinedUnit As String
    facility = SectionValue(sections, "PROJECT", "Facility")
    unitName = SectionValue(sections, "PROJECT", "Unit")
    If Len(facility) > 0 And Len(unitName) > 0 Then
        combinedUnit = facility & " - " & unitName
    ElseIf Len(facility) > 0 Then
        combinedUnit = facility
    Else
        combinedUnit = unitName
    End If
    WriteValue wsInfo.Range("B6"), combinedUnit, imported, reviewCount, missingCount

    WriteKey sections, "PROJECT", "Client", wsInfo.Range("B7"), imported, reviewCount, missingCount
    WriteKey sections, "PROJECT", "Inspector", wsInfo.Range("B8"), imported, reviewCount, missingCount
    WriteDateKey sections, "PROJECT", "Date", wsInfo.Range("B9"), imported, reviewCount, missingCount

    Dim equipmentID As String
    equipmentID = SectionValue(sections, "PROJECT", "EquipmentID")
    If Len(equipmentID) > 0 And UCase$(equipmentID) <> "REVIEW" Then wsSet.Range("B5").value = CleanProjectName(equipmentID)

    Dim orientationText As String
    orientationText = ResolveVesselOrientation( _
        SectionValue(sections, "VESSEL", "Orientation"), _
        SectionValue(sections, "VESSEL", "XAxisDirection"))
    WriteValue wsSet.Range("B9"), orientationText, imported, reviewCount, missingCount

    WriteKey sections, "VESSEL", "Length", wsSet.Range("B10"), imported, reviewCount, missingCount
    WriteKey sections, "VESSEL", "Circumference", wsSet.Range("B11"), imported, reviewCount, missingCount

    ' Axis and reference information belongs on Project Settings.
    WriteKey sections, "VESSEL", "XAxisDirection", wsSet.Range("B21"), imported, reviewCount, missingCount
    WriteKey sections, "VESSEL", "YAxisDirection", wsSet.Range("B22"), imported, reviewCount, missingCount

    Dim xStartReference As String
    xStartReference = SectionValue(sections, "VESSEL", "XAxisStartReference")

    If Len(xStartReference) > 0 Then
        WriteValue wsSet.Range("B32"), xStartReference, imported, reviewCount, missingCount
        WriteValue wsSet.Range("B36"), xStartReference, imported, reviewCount, missingCount
        ApplyReferenceLabelSet wsSet, xStartReference
    End If

    ' There is currently no dedicated Y Axis Start Reference field in the workbook.
    ' It is preserved in Drawing Information Notes by BuildVesselNotes.

    Dim vesselNotes As String
    vesselNotes = BuildVesselNotes(sections)
    If Len(vesselNotes) > 0 Then
        If Len(Trim$(CStr(wsInfo.Range("B24").value))) > 0 Then vesselNotes = wsInfo.Range("B24").value & vbCrLf & vesselNotes
        SafeTarget(wsInfo.Range("B24")).value = vesselNotes
        imported = imported + 1
        If InStr(1, vesselNotes, "REVIEW", vbTextCompare) > 0 Then MarkReview wsInfo.Range("B24"), reviewCount
    End If
End Sub

Private Function BuildVesselNotes(ByVal sections As Object) As String
    Dim s As String
    ' Project Settings currently has no dedicated fields for these values.
    AddNote s, "Nominal Thickness", SectionValue(sections, "VESSEL", "NominalThickness")
    AddNote s, "Y Axis Start Reference", SectionValue(sections, "VESSEL", "YAxisStartReference")
    BuildVesselNotes = s
End Function

Private Function ResolveVesselOrientation(ByVal formOrientation As String, ByVal xDirection As String) As String
    Dim o As String, d As String
    o = UCase$(Trim$(formOrientation))
    d = UCase$(Trim$(xDirection))

    If o = "REVIEW" Then
        ResolveVesselOrientation = "REVIEW"
    ElseIf InStr(1, o, "VERT", vbTextCompare) > 0 Then
        ResolveVesselOrientation = "Vertical"
    ElseIf InStr(1, o, "CCW", vbTextCompare) > 0 Or InStr(1, d, "CCW", vbTextCompare) > 0 Then
        ResolveVesselOrientation = "Horizontal CCW"
    ElseIf InStr(1, o, "CW", vbTextCompare) > 0 Or InStr(1, d, "CW", vbTextCompare) > 0 Then
        ResolveVesselOrientation = "Horizontal CW"
    ElseIf InStr(1, o, "HORIZ", vbTextCompare) > 0 Then
        ResolveVesselOrientation = "Horizontal CW"
    Else
        ResolveVesselOrientation = formOrientation
    End If
End Function

Private Sub ApplyReferenceLabelSet(ByVal wsSet As Worksheet, ByVal startReference As String)
    Dim refText As String
    refText = UCase$(Trim$(startReference))

    If refText = "TDC" Or refText = "BDC" Then
        wsSet.Range("B29").value = "Custom Cardinal"
        wsSet.Range("B30").value = "TDC/BDC"
        wsSet.Range("B32").value = "TDC"
        wsSet.Range("B34").value = "BDC"
        wsSet.Range("B36").value = "TDC"
    ElseIf refText = "NDC" Or refText = "SDC" Then
        wsSet.Range("B29").value = "Custom Cardinal"
        wsSet.Range("B30").value = "NDC/SDC"
        wsSet.Range("B32").value = "NDC"
        wsSet.Range("B34").value = "SDC"
        wsSet.Range("B36").value = "NDC"
    End If
End Sub

Private Function IsCardinalDirection(ByVal valueText As String) As Boolean
    Select Case UCase$(Trim$(valueText))
        Case "NORTH", "SOUTH", "EAST", "WEST"
            IsCardinalDirection = True
    End Select
End Function

Private Function ProperCardinal(ByVal valueText As String) As String
    Dim t As String
    t = LCase$(Trim$(valueText))
    If Len(t) > 0 Then ProperCardinal = UCase$(Left$(t, 1)) & Mid$(t, 2)
End Function

Private Sub AddNote(ByRef notes As String, ByVal labelText As String, ByVal valueText As String)
    If Len(valueText) = 0 Then Exit Sub
    If Len(notes) > 0 Then notes = notes & vbCrLf
    notes = notes & labelText & ": " & valueText
End Sub

Private Sub ImportCircWelds(ByVal sections As Object, ByRef imported As Long, ByRef reviewCount As Long)
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets("Shell Features")
    Dim i As Long, parts As Variant, valueText As String, rowNum As Long
    For i = 1 To 10
        valueText = SectionValue(sections, "CIRCWELDS", "CW" & i)
        If Len(valueText) > 0 Then
            rowNum = i + 2
            If Not ValidateStructuredRow(valueText, 2, "CIRCWELDS", "CW" & i, ws.Range(ws.Cells(rowNum, "A"), ws.Cells(rowNum, "B")), reviewCount) Then GoTo NextCircWeld
            parts = SplitFixed(valueText, 2)
            ApplyDefaultID parts, "CW" & i
            WriteCell ws.Cells(rowNum, "A"), parts(0), imported, reviewCount
            WriteNumericCell ws.Cells(rowNum, "B"), parts(1), imported, reviewCount
            ws.Cells(rowNum, "C").value = "YES": ws.Cells(rowNum, "D").value = "YES"
        End If
NextCircWeld:
    Next i
End Sub

Private Sub ImportLongSeams(ByVal sections As Object, ByRef imported As Long, ByRef reviewCount As Long)
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets("Shell Features")
    Dim i As Long, parts As Variant, valueText As String, rowNum As Long
    For i = 1 To 10
        valueText = SectionValue(sections, "LONGSEAMS", "LS" & i)
        If Len(valueText) > 0 Then
            rowNum = i + 14
            If Not ValidateStructuredRow(valueText, 4, "LONGSEAMS", "LS" & i, ws.Range(ws.Cells(rowNum, "A"), ws.Cells(rowNum, "D")), reviewCount) Then GoTo NextLongSeam
            parts = SplitFixed(valueText, 4)
            ApplyDefaultID parts, "LS" & i
            WriteCell ws.Cells(rowNum, "A"), parts(0), imported, reviewCount
            WriteNumericCell ws.Cells(rowNum, "B"), parts(1), imported, reviewCount
            WriteNumericCell ws.Cells(rowNum, "C"), parts(2), imported, reviewCount
            WriteNumericCell ws.Cells(rowNum, "D"), parts(3), imported, reviewCount
            ws.Cells(rowNum, "E").value = "YES": ws.Cells(rowNum, "F").value = "YES"
        End If
NextLongSeam:
    Next i
End Sub

Private Sub ImportShellMUT(ByVal sections As Object, ByRef imported As Long, ByRef reviewCount As Long)
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets("Shell Features")
    Dim i As Long, parts As Variant, valueText As String, rowNum As Long
    For i = 1 To 20
        valueText = SectionValue(sections, "SHELLMUT", "MUT" & i)
        If Len(valueText) > 0 Then
            rowNum = i + 90
            If Not ValidateStructuredRow(valueText, 5, "SHELLMUT", "MUT" & i, ws.Range(ws.Cells(rowNum, "A"), ws.Cells(rowNum, "E")), reviewCount) Then GoTo NextShellMUT
            parts = SplitFixed(valueText, 5)
            ApplyDefaultID parts, "MUT" & i
            WriteCell ws.Cells(rowNum, "A"), parts(0), imported, reviewCount
            WriteNumericCell ws.Cells(rowNum, "B"), parts(1), imported, reviewCount
            WriteNumericCell ws.Cells(rowNum, "C"), parts(2), imported, reviewCount
            WriteNumericCell ws.Cells(rowNum, "D"), parts(3), imported, reviewCount
            WriteCell ws.Cells(rowNum, "E"), parts(4), imported, reviewCount
        End If
NextShellMUT:
    Next i
End Sub

Private Sub ImportObjects(ByVal sections As Object, ByRef imported As Long, ByRef reviewCount As Long)
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets("Shell Features")
    Dim i As Long, parts As Variant, valueText As String, rowNum As Long
    For i = 1 To 20
        valueText = SectionValue(sections, "OBJECTS", "O" & i)
        If Len(valueText) > 0 Then
            rowNum = i + 68
            If Not ValidateStructuredRow(valueText, 6, "OBJECTS", "O" & i, ws.Range(ws.Cells(rowNum, "A"), ws.Cells(rowNum, "G")), reviewCount) Then GoTo NextObject
            parts = SplitFixed(valueText, 6)
            ApplyDefaultID parts, "O" & i
            WriteCell ws.Cells(rowNum, "A"), parts(0), imported, reviewCount
            WriteNumericCell ws.Cells(rowNum, "B"), parts(1), imported, reviewCount
            WriteNumericCell ws.Cells(rowNum, "C"), parts(2), imported, reviewCount
            WriteNumericCell ws.Cells(rowNum, "D"), parts(3), imported, reviewCount
            WriteNumericCell ws.Cells(rowNum, "E"), parts(4), imported, reviewCount
            ws.Cells(rowNum, "F").value = "YES"
            WriteCell ws.Cells(rowNum, "G"), parts(5), imported, reviewCount
        End If
NextObject:
    Next i
End Sub

Private Sub ImportShellNozzles(ByVal sections As Object, ByRef imported As Long, ByRef reviewCount As Long)
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets("Shell Features")
    Dim i As Long, p As Variant, valueText As String, rowNum As Long
    For i = 1 To 20
        valueText = SectionValue(sections, "SHELLNOZZLES", "N" & i)
        If Len(valueText) > 0 Then
            rowNum = i + 26
            If Not ValidateStructuredRow(valueText, 6, "SHELLNOZZLES", "N" & i, ws.Range(ws.Cells(rowNum, "A"), ws.Cells(rowNum, "F")), reviewCount) Then GoTo NextShellNozzle
            p = SplitFixed(valueText, 6)
            ApplyDefaultID p, "N" & i
            ' Worksheet order: ID, Diameter, X, Y, MinT, Notes, Include, Label Mode
            WriteCell ws.Cells(rowNum, "A"), p(0), imported, reviewCount
            WriteNumericCell ws.Cells(rowNum, "B"), p(1), imported, reviewCount
            WriteNumericCell ws.Cells(rowNum, "C"), p(2), imported, reviewCount
            WriteNumericCell ws.Cells(rowNum, "D"), p(3), imported, reviewCount
            WriteNumericCell ws.Cells(rowNum, "E"), p(4), imported, reviewCount
            WriteCell ws.Cells(rowNum, "F"), p(5), imported, reviewCount
            ws.Cells(rowNum, "G").value = "YES": ws.Cells(rowNum, "H").value = "AUTO"
        End If
NextShellNozzle:
    Next i
End Sub

Private Sub ImportHeadData(ByVal sections As Object, ByVal sectionName As String, ByVal headName As String, _
                           ByVal nozzleStartRow As Long, ByVal mutStartRow As Long, _
                           ByRef imported As Long, ByRef reviewCount As Long)
    Dim ws As Worksheet: Set ws = ThisWorkbook.Worksheets("Head Features")
    Dim i As Long, p As Variant, valueText As String, rowNum As Long

    For i = 1 To 10
        valueText = SectionValue(sections, sectionName, "HN" & i)
        If Len(valueText) > 0 Then
            rowNum = nozzleStartRow + i - 1
            If Not ValidateStructuredRow(valueText, 7, sectionName, "HN" & i, ws.Range(ws.Cells(rowNum, "B"), ws.Cells(rowNum, "H")), reviewCount) Then GoTo NextHeadNozzle
            p = SplitFixed(valueText, 7)
            ApplyDefaultID p, "HN" & i
            ws.Cells(rowNum, "A").value = headName
            WriteCell ws.Cells(rowNum, "B"), p(0), imported, reviewCount
            WriteNumericCell ws.Cells(rowNum, "C"), p(1), imported, reviewCount
            WriteNumericCell ws.Cells(rowNum, "D"), p(2), imported, reviewCount
            WriteCell ws.Cells(rowNum, "E"), NormalizeRadius(p(3)), imported, reviewCount
            WriteNumericCell ws.Cells(rowNum, "F"), p(4), imported, reviewCount
            WriteNumericCell ws.Cells(rowNum, "G"), p(5), imported, reviewCount
            WriteCell ws.Cells(rowNum, "H"), p(6), imported, reviewCount
            ws.Cells(rowNum, "I").value = "AUTO": ws.Cells(rowNum, "J").value = "YES"
        End If
NextHeadNozzle:
    Next i

    For i = 1 To 5
        valueText = SectionValue(sections, sectionName, "HMUT" & i)
        If Len(valueText) > 0 Then
            rowNum = mutStartRow + i - 1
            If Not ValidateStructuredRow(valueText, 6, sectionName, "HMUT" & i, ws.Range(ws.Cells(rowNum, "B"), ws.Cells(rowNum, "I")), reviewCount) Then GoTo NextHeadMUT
            p = SplitFixed(valueText, 6)
            ApplyDefaultID p, "HMUT" & i
            ws.Cells(rowNum, "A").value = headName
            WriteCell ws.Cells(rowNum, "B"), p(0), imported, reviewCount
            WriteNumericCell ws.Cells(rowNum, "C"), p(1), imported, reviewCount
            WriteCell ws.Cells(rowNum, "D"), NormalizeRadius(p(2)), imported, reviewCount
            WriteNumericCell ws.Cells(rowNum, "E"), p(3), imported, reviewCount
            WriteNumericCell ws.Cells(rowNum, "F"), p(4), imported, reviewCount
            WriteCell ws.Cells(rowNum, "I"), p(5), imported, reviewCount
            ws.Cells(rowNum, "G").value = "AUTO": ws.Cells(rowNum, "H").value = "YES"
        End If
NextHeadMUT:
    Next i
End Sub

Private Sub ImportFieldNotes(ByVal sections As Object, ByRef imported As Long, ByRef reviewCount As Long)
    ' Only actual field notes belong in Drawing Information Notes.
    ' OCR review details are reported exclusively in the Home Message Center.
    Dim notesText As String, combined As String
    notesText = SectionValue(sections, "FIELDNOTES", "Text")
    If Len(notesText) = 0 Then Exit Sub

    Dim target As Range
    Set target = SafeTarget(ThisWorkbook.Worksheets("Drawing Information").Range("B24"))
    combined = notesText
    If Len(Trim$(CStr(target.value))) > 0 Then combined = target.value & vbCrLf & vbCrLf & combined
    target.value = combined
    imported = imported + 1
    If InStr(1, notesText, "REVIEW", vbTextCompare) > 0 Then MarkReview target, reviewCount
End Sub

Private Sub WriteKey(ByVal sections As Object, ByVal sectionName As String, ByVal keyName As String, _
                     ByVal target As Range, ByRef imported As Long, ByRef reviewCount As Long, ByRef missingCount As Long)
    WriteValue target, SectionValue(sections, sectionName, keyName), imported, reviewCount, missingCount
End Sub

Private Sub WriteDateKey(ByVal sections As Object, ByVal sectionName As String, ByVal keyName As String, _
                         ByVal target As Range, ByRef imported As Long, ByRef reviewCount As Long, ByRef missingCount As Long)
    Dim valueText As String
    Dim writeTarget As Range

    Set writeTarget = SafeTarget(target)
    valueText = SectionValue(sections, sectionName, keyName)
    If Len(valueText) = 0 Then missingCount = missingCount + 1: Exit Sub
    If UCase$(valueText) = "REVIEW" Then
        writeTarget.value = valueText: MarkReview writeTarget, reviewCount: imported = imported + 1
    ElseIf IsDate(valueText) Then
        writeTarget.value = CDate(valueText): writeTarget.NumberFormat = "m/d/yyyy": imported = imported + 1
    Else
        writeTarget.NumberFormat = "@": writeTarget.value = valueText: imported = imported + 1
    End If
End Sub

Private Sub WriteValue(ByVal target As Range, ByVal valueText As String, ByRef imported As Long, ByRef reviewCount As Long, ByRef missingCount As Long)
    If Len(valueText) = 0 Then missingCount = missingCount + 1: Exit Sub
    WriteCell target, valueText, imported, reviewCount
End Sub

Private Sub WriteRowValues(ByVal ws As Worksheet, ByVal rowNum As Long, ByVal startCol As Long, _
                           ByVal parts As Variant, ByRef imported As Long, ByRef reviewCount As Long)
    Dim i As Long
    For i = LBound(parts) To UBound(parts)
        WriteCell ws.Cells(rowNum, startCol + i), parts(i), imported, reviewCount
    Next i
End Sub

Private Sub WriteCell(ByVal target As Range, ByVal valueText As String, ByRef imported As Long, ByRef reviewCount As Long)
    Dim writeTarget As Range

    valueText = Trim$(valueText)
    If Len(valueText) = 0 Then Exit Sub

    'Field-test preference: all OCR-imported wording is stored in uppercase.
    'Numbers and punctuation are unchanged by UCase$.
    valueText = UCase$(valueText)

    Set writeTarget = SafeTarget(target)
    writeTarget.NumberFormat = "General"
    writeTarget.value = valueText
    imported = imported + 1
    If UCase$(valueText) = "REVIEW" Or InStr(1, valueText, "REVIEW", vbTextCompare) > 0 Then MarkReview writeTarget, reviewCount
End Sub

Private Sub WriteNumericCell(ByVal target As Range, ByVal valueText As String, ByRef imported As Long, ByRef reviewCount As Long)
    Dim writeTarget As Range

    valueText = Trim$(valueText)
    If Len(valueText) = 0 Then Exit Sub

    Set writeTarget = SafeTarget(target)
    writeTarget.NumberFormat = "General"

    If InStr(1, valueText, "REVIEW", vbTextCompare) > 0 Then
        writeTarget.value = UCase$(valueText)
        imported = imported + 1
        MarkReview writeTarget, reviewCount
    ElseIf IsNumeric(valueText) Then
        writeTarget.value = CDbl(valueText)
        imported = imported + 1
    Else
        writeTarget.value = UCase$(valueText)
        imported = imported + 1
    End If
End Sub

Private Sub ApplyDefaultID(ByRef parts As Variant, ByVal rowIdentifier As String)
    Dim i As Long, rowHasData As Boolean

    For i = LBound(parts) To UBound(parts)
        If Len(Trim$(CStr(parts(i)))) > 0 Then
            rowHasData = True
            Exit For
        End If
    Next i

    If rowHasData And Len(Trim$(CStr(parts(LBound(parts))))) = 0 Then
        parts(LBound(parts)) = UCase$(Trim$(rowIdentifier))
    End If
End Sub

Private Sub MarkReview(ByVal target As Range, ByRef reviewCount As Long)
    If target.MergeCells Then
        target.MergeArea.Interior.Color = REVIEW_FILL
    Else
        target.Interior.Color = REVIEW_FILL
    End If
    reviewCount = reviewCount + 1
End Sub

Private Function SectionValue(ByVal sections As Object, ByVal sectionName As String, ByVal keyName As String) As String
    If sections.Exists(sectionName) Then
        If sections(sectionName).Exists(keyName) Then SectionValue = Trim$(CStr(sections(sectionName)(keyName)))
    End If
End Function

Private Function ValidateStructuredRow(ByVal valueText As String, ByVal expectedFields As Long, _
                                       ByVal sectionName As String, ByVal rowIdentifier As String, _
                                       ByVal reviewRange As Range, ByRef reviewCount As Long) As Boolean
    Dim actualFields As Long
    actualFields = StructuredFieldCount(valueText)

    If actualFields = expectedFields Then
        ValidateStructuredRow = True
        Exit Function
    End If

    mStructureErrorCount = mStructureErrorCount + 1
    If Len(mStructureErrors) > 0 Then mStructureErrors = mStructureErrors & vbCrLf

    If actualFields < expectedFields Then
        'The prompt requires blank interior fields to retain their delimiters.
        'Therefore, a short row is treated as missing trailing fields only.
        'Readable values are imported, missing destination cells remain blank,
        'and only those missing cells are highlighted for review.
        mStructureErrors = mStructureErrors & "- " & sectionName & " / " & rowIdentifier & _
                           ": expected " & expectedFields & " fields, found " & actualFields & _
                           ". Readable fields imported; " & (expectedFields - actualFields) & _
                           " missing trailing field(s) left blank and cautioned."
        MarkMissingStructuredFields sectionName, rowIdentifier, actualFields + 1, expectedFields, reviewCount
        ValidateStructuredRow = True
        Exit Function
    End If

    'Extra fields cannot be aligned safely. Do not import or shift the row.
    mStructureErrors = mStructureErrors & "- " & sectionName & " / " & rowIdentifier & _
                       ": expected " & expectedFields & " fields, found " & actualFields & _
                       ". Extra fields prevent safe alignment; row skipped."
    MarkReviewRange reviewRange, reviewCount
End Function

Private Sub MarkMissingStructuredFields(ByVal sectionName As String, ByVal rowIdentifier As String, _
                                        ByVal firstMissingField As Long, ByVal expectedFields As Long, _
                                        ByRef reviewCount As Long)
    Dim ws As Worksheet, rowNum As Long, itemNum As Long
    Dim fieldIndex As Long, columnNumber As Long
    Dim isHeadNozzle As Boolean, isHeadMUT As Boolean

    itemNum = TrailingNumber(rowIdentifier)

    Select Case UCase$(sectionName)
        Case "CIRCWELDS"
            Set ws = ThisWorkbook.Worksheets("Shell Features")
            rowNum = itemNum + 2
        Case "LONGSEAMS"
            Set ws = ThisWorkbook.Worksheets("Shell Features")
            rowNum = itemNum + 14
        Case "SHELLMUT"
            Set ws = ThisWorkbook.Worksheets("Shell Features")
            rowNum = itemNum + 90
        Case "OBJECTS"
            Set ws = ThisWorkbook.Worksheets("Shell Features")
            rowNum = itemNum + 68
        Case "SHELLNOZZLES"
            Set ws = ThisWorkbook.Worksheets("Shell Features")
            rowNum = itemNum + 26
        Case "HEAD1", "HEAD2"
            Set ws = ThisWorkbook.Worksheets("Head Features")
            isHeadNozzle = (UCase$(Left$(rowIdentifier, 2)) = "HN")
            isHeadMUT = (UCase$(Left$(rowIdentifier, 4)) = "HMUT")
            If isHeadNozzle Then
                If UCase$(sectionName) = "HEAD1" Then rowNum = itemNum + 3 Else rowNum = itemNum + 13
            ElseIf isHeadMUT Then
                If UCase$(sectionName) = "HEAD1" Then rowNum = itemNum + 27 Else rowNum = itemNum + 32
            End If
    End Select

    If ws Is Nothing Or rowNum = 0 Then Exit Sub

    For fieldIndex = firstMissingField To expectedFields
        columnNumber = StructuredDestinationColumn(sectionName, rowIdentifier, fieldIndex)
        If columnNumber > 0 Then MarkReview ws.Cells(rowNum, columnNumber), reviewCount
    Next fieldIndex
End Sub

Private Function StructuredDestinationColumn(ByVal sectionName As String, ByVal rowIdentifier As String, _
                                             ByVal fieldIndex As Long) As Long
    Select Case UCase$(sectionName)
        Case "CIRCWELDS", "LONGSEAMS", "SHELLMUT", "SHELLNOZZLES"
            StructuredDestinationColumn = fieldIndex
        Case "OBJECTS"
            Select Case fieldIndex
                Case 1 To 5: StructuredDestinationColumn = fieldIndex
                Case 6: StructuredDestinationColumn = 7
            End Select
        Case "HEAD1", "HEAD2"
            If UCase$(Left$(rowIdentifier, 2)) = "HN" Then
                'Head nozzle fields map to columns B:H.
                StructuredDestinationColumn = fieldIndex + 1
            ElseIf UCase$(Left$(rowIdentifier, 4)) = "HMUT" Then
                'Head MUT fields map to B,C,D,E,F,I.
                Select Case fieldIndex
                    Case 1 To 5: StructuredDestinationColumn = fieldIndex + 1
                    Case 6: StructuredDestinationColumn = 9
                End Select
            End If
    End Select
End Function

Private Function TrailingNumber(ByVal valueText As String) As Long
    Dim i As Long, digits As String, ch As String
    For i = Len(valueText) To 1 Step -1
        ch = Mid$(valueText, i, 1)
        If ch Like "#" Then
            digits = ch & digits
        ElseIf Len(digits) > 0 Then
            Exit For
        End If
    Next i
    If Len(digits) > 0 Then TrailingNumber = CLng(digits)
End Function

Private Function StructuredFieldCount(ByVal valueText As String) As Long
    Dim raw As Variant
    raw = Split(valueText, "|")
    StructuredFieldCount = UBound(raw) - LBound(raw) + 1
End Function

Private Sub MarkReviewRange(ByVal target As Range, ByRef reviewCount As Long)
    target.Interior.Color = REVIEW_FILL
    reviewCount = reviewCount + 1
End Sub

Private Function SplitFixed(ByVal valueText As String, ByVal fieldCount As Long) As Variant
    Dim raw As Variant, result() As String, i As Long
    raw = Split(valueText, "|")
    ReDim result(0 To fieldCount - 1)
    For i = 0 To fieldCount - 1
        If i <= UBound(raw) Then result(i) = Trim$(CStr(raw(i))) Else result(i) = ""
    Next i
    SplitFixed = result
End Function

Private Function NormalizeRadius(ByVal valueText As String) As String
    Select Case UCase$(Trim$(valueText))
        Case "C", "CENTER": NormalizeRadius = "CENTER"
        Case "H", "HALF", "HALF RADIUS": NormalizeRadius = "HALF"
        Case "T", "THREE QUARTER", "THREE-QUARTER", "THREE_QUARTER", "3/4": NormalizeRadius = "THREE_QUARTER"
        Case "O", "OUTER", "OUTER RADIUS": NormalizeRadius = "OUTER"
        Case "X", "CUSTOM", "CUSTOM RADIUS": NormalizeRadius = "CUSTOM"
        Case Else: NormalizeRadius = valueText
    End Select
End Function

Private Function JoinNonblank(ByVal firstText As String, ByVal secondText As String) As String
    If Len(Trim$(firstText)) > 0 And Len(Trim$(secondText)) > 0 Then
        JoinNonblank = "Min T: " & firstText & "; " & secondText
    ElseIf Len(Trim$(firstText)) > 0 Then
        JoinNonblank = "Min T: " & firstText
    Else
        JoinNonblank = secondText
    End If
End Function

Private Function CleanProjectName(ByVal valueText As String) As String
    Dim bad As Variant, item As Variant
    bad = Array("\", "/", ":", "*", "?", Chr$(34), "<", ">", "|")
    For Each item In bad
        valueText = Replace(valueText, CStr(item), "_")
    Next item
    CleanProjectName = Trim$(valueText)
End Function

Private Sub RefreshHomeProjectSummary(ByVal reviewCount As Long)
    On Error GoTo SafeExit

    Dim wsHome As Worksheet, wsInfo As Worksheet, wsSet As Worksheet, wsScan As Worksheet
    Set wsHome = ThisWorkbook.Worksheets("Home")
    Set wsInfo = ThisWorkbook.Worksheets("Drawing Information")
    Set wsSet = ThisWorkbook.Worksheets("Project Settings")
    Set wsScan = ThisWorkbook.Worksheets("Scan Import")

    SafeTarget(wsHome.Range("C4")).value = Trim$(CStr(wsSet.Range("B5").value))
    SafeTarget(wsHome.Range("C5")).value = Trim$(CStr(wsInfo.Range("B7").value))
    SafeTarget(wsHome.Range("C6")).value = Trim$(CStr(wsInfo.Range("B5").value))
    SafeTarget(wsHome.Range("C7")).value = Trim$(CStr(wsInfo.Range("B8").value))
    SafeTarget(wsHome.Range("C8")).value = Trim$(CStr(wsSet.Range("B9").value))
    SafeTarget(wsHome.Range("C9")).value = CountNonblankScanRows(wsScan)

    If reviewCount > 0 Then
        SafeTarget(wsHome.Range("C10")).value = "OCR Imported - Review Required"
    Else
        SafeTarget(wsHome.Range("C10")).value = "OCR Import Complete"
    End If
SafeExit:
End Sub

Private Function CountNonblankScanRows(ByVal ws As Worksheet) As Long
    Dim lastRow As Long, rowNum As Long, countRows As Long
    lastRow = ws.Cells(ws.Rows.count, "A").End(xlUp).Row
    For rowNum = 1 To lastRow
        If Len(Trim$(CStr(ws.Cells(rowNum, "A").value))) > 0 Then
            If UCase$(Trim$(CStr(ws.Cells(rowNum, "A").value))) Like "S#*" Then countRows = countRows + 1
        End If
    Next rowNum
    CountNonblankScanRows = countRows
End Function

Private Sub WriteOCRMessageCenter(ByVal sections As Object, ByVal imported As Long, ByVal reviewCount As Long, ByVal missingCount As Long)
    Dim report As String, reviewDetails As String, statusText As String

    If mStructureErrorCount > 0 Then
        statusText = "COMPLETED WITH STRUCTURE ERRORS"
    ElseIf reviewCount > 0 Then
        statusText = "SUCCESS WITH REVIEW ITEMS"
    Else
        statusText = "SUCCESS"
    End If

    report = "OCR IMPORT COMPLETE" & vbCrLf & _
             "Status: " & statusText & vbCrLf & vbCrLf & _
             "Project / Vessel: " & CountSectionValues(sections, "PROJECT") + CountSectionValues(sections, "VESSEL") & " fields" & vbCrLf & _
             "Circ Welds: " & CountSectionRows(sections, "CIRCWELDS") & " of 10" & vbCrLf & _
             "Long Seams: " & CountSectionRows(sections, "LONGSEAMS") & " of 10" & vbCrLf & _
             "Shell MUT: " & CountSectionRows(sections, "SHELLMUT") & " of 20" & vbCrLf & _
             "Objects: " & CountSectionRows(sections, "OBJECTS") & " of 20" & vbCrLf & _
             "Shell Nozzles: " & CountSectionRows(sections, "SHELLNOZZLES") & " of 40" & vbCrLf & _
             "Head 1: " & CountSectionRows(sections, "HEAD1") & " items" & vbCrLf & _
             "Head 2: " & CountSectionRows(sections, "HEAD2") & " items" & vbCrLf & vbCrLf & _
             "Imported values: " & imported & vbCrLf & _
             "Review fields: " & reviewCount

    If missingCount > 0 Then report = report & vbCrLf & "Blank project/vessel fields: " & missingCount

    If mStructureErrorCount > 0 Then
        report = report & vbCrLf & "Structure errors: " & mStructureErrorCount & vbCrLf & vbCrLf & _
                 "STRUCTURE REVIEW" & vbCrLf & mStructureErrors
    End If

    reviewDetails = BuildReviewDetails(sections)
    If Len(reviewDetails) > 0 Then report = report & vbCrLf & vbCrLf & "REVIEW" & vbCrLf & reviewDetails

    report = report & vbCrLf & vbCrLf & "NOTES" & vbCrLf & _
             "Nominal Thickness and Y Axis Start Reference stored in Drawing Information Notes."

    WriteHomeMessageBlock report, IIf(reviewCount > 0 Or mStructureErrorCount > 0, "WARNING", "SUCCESS")
End Sub

Private Function CountSectionValues(ByVal sections As Object, ByVal sectionName As String) As Long
    Dim key As Variant, n As Long
    If Not sections.Exists(sectionName) Then Exit Function
    For Each key In sections(sectionName).Keys
        If Len(Trim$(CStr(sections(sectionName)(key)))) > 0 Then n = n + 1
    Next key
    CountSectionValues = n
End Function

Private Function CountSectionRows(ByVal sections As Object, ByVal sectionName As String) As Long
    CountSectionRows = CountSectionValues(sections, sectionName)
End Function

Private Function BuildReviewDetails(ByVal sections As Object) As String
    Dim sectionName As Variant, key As Variant, valueText As String, s As String, explicitReview As String

    explicitReview = SectionValue(sections, "REVIEW", "Text")
    If Len(explicitReview) > 0 Then s = SplitExplicitReviewItems(explicitReview)

    For Each sectionName In sections.Keys
        If UCase$(CStr(sectionName)) <> "REVIEW" Then
            For Each key In sections(sectionName).Keys
                valueText = CStr(sections(sectionName)(key))
                If InStr(1, valueText, "REVIEW", vbTextCompare) > 0 Then
                    If Len(s) > 0 Then s = s & vbCrLf
                    s = s & "- " & CStr(sectionName) & " / " & CStr(key) & ": " & ExtractReviewReason(valueText)
                End If
            Next key
        End If
    Next sectionName

    BuildReviewDetails = s
End Function

Private Function SplitExplicitReviewItems(ByVal reviewText As String) As String
    Dim normalized As String
    Dim parts() As String
    Dim item As Variant
    Dim cleaned As String
    Dim result As String

    normalized = Replace(reviewText, vbCrLf, vbLf)
    normalized = Replace(normalized, vbCr, vbLf)

    'OCR responses commonly return the REVIEW summary as one long sentence line.
    'Convert sentence boundaries into separate Message Center entries.
    normalized = Replace(normalized, ". ", "." & vbLf)
    normalized = Replace(normalized, "; ", ";" & vbLf)
    parts = Split(normalized, vbLf)

    For Each item In parts
        cleaned = Trim$(CStr(item))
        If Len(cleaned) > 0 Then
            If Left$(cleaned, 1) = "-" Then cleaned = Trim$(Mid$(cleaned, 2))
            If Len(result) > 0 Then result = result & vbCrLf
            result = result & "- " & cleaned
        End If
    Next item

    SplitExplicitReviewItems = result
End Function

Private Function ExtractReviewReason(ByVal valueText As String) As String
    Dim p As Long, t As String
    p = InStr(1, valueText, "REVIEW", vbTextCompare)
    If p = 0 Then Exit Function
    t = Mid$(valueText, p)
    p = InStr(1, t, "|")
    If p > 0 Then t = Left$(t, p - 1)
    If Len(Trim$(t)) = 0 Then t = "Verify this field."
    ExtractReviewReason = Trim$(t)
End Function

Public Sub InstallScrollableMessageCenter()
    On Error GoTo InstallFailed

    Dim ws As Worksheet
    Dim target As Range
    Dim box As ListBox

    Set ws = ThisWorkbook.Worksheets("Home")
    Set target = ws.Range("K23").MergeArea

    On Error Resume Next
    ws.OLEObjects("txtMessageCenter").Delete
    ws.ListBoxes("lstMessageCenter").Delete
    On Error GoTo InstallFailed

    target.ClearContents

    Set box = ws.ListBoxes.Add( _
        target.Left + 1, _
        target.Top + 1, _
        target.Width - 2, _
        target.Height - 2)

    With box
        .Name = "lstMessageCenter"
        .placement = xlMoveAndSize
        .PrintObject = True
        .MultiSelect = xlNone
        .Display3DShading = False
        .AddItem "Message Center ready."
    End With

    ApplyMessageListBoxStyle box, RGB(255, 255, 255)

    MsgBox "The scrollable Message Center has been installed.", _
           vbInformation, "Scan Layout Generator"
    Exit Sub

InstallFailed:
    MsgBox "The scrollable Message Center could not be installed." & vbCrLf & _
           "Error: " & Err.description, vbExclamation, "Scan Layout Generator"
End Sub


Private Sub ApplyMessageListBoxStyle(ByVal box As ListBox, ByVal fillColor As Long)
    'Excel Forms controls vary slightly by version. Cosmetic settings are
    'applied separately so an unsupported property cannot stop installation.
    On Error Resume Next
    box.Font.Name = "Aptos"
    box.Font.Size = 9
    box.ShapeRange.Fill.Visible = msoTrue
    box.ShapeRange.Fill.ForeColor.RGB = fillColor
    box.ShapeRange.line.ForeColor.RGB = RGB(166, 166, 166)
    On Error GoTo 0
End Sub

Private Function EnsureMessageCenterListBox() As ListBox
    On Error GoTo CreateBox
    Set EnsureMessageCenterListBox = ThisWorkbook.Worksheets("Home").ListBoxes("lstMessageCenter")
    Exit Function

CreateBox:
    Err.Clear
    On Error GoTo Failed

    Dim ws As Worksheet
    Dim target As Range
    Dim box As ListBox

    Set ws = ThisWorkbook.Worksheets("Home")
    Set target = ws.Range("K23").MergeArea
    target.ClearContents

    Set box = ws.ListBoxes.Add( _
        target.Left + 1, _
        target.Top + 1, _
        target.Width - 2, _
        target.Height - 2)

    With box
        .Name = "lstMessageCenter"
        .placement = xlMoveAndSize
        .PrintObject = True
        .MultiSelect = xlNone
        .Display3DShading = False
    End With

    ApplyMessageListBoxStyle box, RGB(255, 255, 255)

    Set EnsureMessageCenterListBox = box
    Exit Function

Failed:
    Set EnsureMessageCenterListBox = Nothing
End Function

Private Sub WriteHomeMessageBlock(ByVal messageText As String, ByVal messageType As String)
    'All Message Center display work is handled by SLG_MessageCenter.
    MC_WriteMessage messageText, messageType
End Sub

Private Sub SetHomeMessage(ByVal messageText As String)
    WriteHomeMessageBlock messageText, "SUCCESS"
End Sub

Private Function ClipboardGetText() As String
#If VBA7 Then
    Dim hData As LongPtr, pData As LongPtr
#Else
    Dim hData As Long, pData As Long
#End If
    Dim charCount As Long, result As String

    If OpenClipboard(0) = 0 Then Exit Function
    hData = GetClipboardData(CF_UNICODETEXT)
    If hData <> 0 Then
        pData = GlobalLock(hData)
        If pData <> 0 Then
            charCount = lstrlenW(pData)
            If charCount > 0 Then
                result = String$(charCount, vbNullChar)
                CopyMemory StrPtr(result), pData, CLng(charCount) * 2
            End If
            GlobalUnlock hData
        End If
    End If
    CloseClipboard
    ClipboardGetText = result
End Function

Private Function ClipboardSetText(ByVal textValue As String) As Boolean
#If VBA7 Then
    Dim hMem As LongPtr, pMem As LongPtr, byteCount As LongPtr
#Else
    Dim hMem As Long, pMem As Long, byteCount As Long
#End If
    Dim ok As Boolean

    byteCount = (Len(textValue) + 1) * 2
    hMem = GlobalAlloc(GMEM_MOVEABLE, byteCount)
    If hMem = 0 Then Exit Function

    pMem = GlobalLock(hMem)
    If pMem = 0 Then Exit Function
    CopyMemory pMem, StrPtr(textValue), byteCount - 2
    GlobalUnlock hMem

    If OpenClipboard(0) <> 0 Then
        EmptyClipboard
        If SetClipboardData(CF_UNICODETEXT, hMem) <> 0 Then ok = True
        CloseClipboard
    End If
    ClipboardSetText = ok
End Function
