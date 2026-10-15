Attribute VB_Name = "SLG_ImportAUT"
Option Explicit

' AxisBuilder v5.0
' Import AUT - Phase 1 v1.6 - 150 Scan Capacity
'
' Imports ScanSheet CSV coordinates into:
'   Scan Import: A:E + formulas F:K + Include L
'   Scan Images: A + Include D; clears prior image assignments/status while preserving Notes
'
' Design rules:
'   - Imported scan names are trimmed, cleaned, and converted to uppercase.
'   - Duplicate names are blocked (case-insensitive, outer spaces ignored).
'   - Existing scan/image data is replaced only after confirmation.
'   - CSV columns are found by header name, not fixed position.
'   - Only currently used table rows are cleared. Scan Images Notes are preserved.

Private Const SHEET_SCAN_IMPORT As String = "Scan Import"
Private Const SHEET_SCAN_IMAGES As String = "Scan Images"
Private Const SHEET_HOME As String = "Home"
Private Const FIRST_DATA_ROW As Long = 3
Private Const LAST_DATA_ROW As Long = 152
Private Const MAX_SCAN_ROWS As Long = LAST_DATA_ROW - FIRST_DATA_ROW + 1

Public Sub Import_AUT_CSV()
    Dim csvPath As Variant
    Dim scanRows As Collection
    Dim duplicateReport As String
    Dim skippedCal As Long
    Dim existingData As Boolean
    Dim importedCount As Long
    Dim oldCalc As XlCalculation
    Dim oldScreen As Boolean
    Dim oldEvents As Boolean
    Dim importSheetWasProtected As Boolean
    Dim imageSheetWasProtected As Boolean
    Dim currentStage As String
    Dim failNumber As Long
    Dim failDescription As String
    Dim failSource As String

    oldScreen = Application.ScreenUpdating
    oldEvents = Application.EnableEvents
    oldCalc = Application.Calculation

    On Error GoTo ImportFail

    csvPath = Application.GetOpenFilename( _
        FileFilter:="CSV Files (*.csv),*.csv", _
        Title:="Select AUT ScanSheet CSV")

    If VarType(csvPath) = vbBoolean Then Exit Sub

    currentStage = "Reading and validating the CSV"
    Set scanRows = New Collection
    LoadAndValidateCSV CStr(csvPath), scanRows, duplicateReport, skippedCal

    If Len(duplicateReport) > 0 Then
        WriteAUTMessage "AUT IMPORT STOPPED" & vbCrLf & vbCrLf & _
                        "Duplicate scan names were found:" & vbCrLf & _
                        duplicateReport & vbCrLf & _
                        "No workbook data was changed."
        MsgBox "Duplicate scan names were found." & vbCrLf & vbCrLf & _
               duplicateReport & vbCrLf & _
               "Correct the CSV and import it again.", _
               vbExclamation, "Import AUT"
        Exit Sub
    End If

    If scanRows.count = 0 Then
        Err.Raise vbObjectError + 2100, "Import_AUT_CSV", _
                  "No scan rows were found in the selected CSV."
    End If

    If scanRows.count > MAX_SCAN_ROWS Then
        Err.Raise vbObjectError + 2101, "Import_AUT_CSV", _
                  "The CSV contains " & scanRows.count & " scans, but this workbook supports " & _
                  MAX_SCAN_ROWS & " scan rows."
    End If

    existingData = WorkbookHasExistingScanData()
    If existingData Then
        If MsgBox("Importing a new AUT CSV will replace all existing scan data " & _
                  "and image assignments." & vbCrLf & vbCrLf & _
                  "Continue?", vbYesNo + vbExclamation + vbDefaultButton2, _
                  "Replace Existing AUT Data?") <> vbYes Then
            Exit Sub
        End If
    End If

    Application.ScreenUpdating = False
    Application.EnableEvents = False
    Application.Calculation = xlCalculationManual

    currentStage = "Preparing protected worksheets"
    PrepareAUTSheetsForImport importSheetWasProtected, imageSheetWasProtected

    currentStage = "Clearing previous AUT data"
    ClearAUTData

    currentStage = "Writing imported scans and formulas"
    importedCount = WriteImportedScans(scanRows)

    currentStage = "Recalculating workbook"
    Application.Calculate

    currentStage = "Refreshing Home dashboard"
    RefreshHomeAfterAUT importedCount

    ThisWorkbook.Worksheets(SHEET_HOME).Activate

    WriteAUTMessage BuildSuccessMessage(importedCount, skippedCal, CStr(csvPath))

CleanExit:
    RestoreAUTSheetProtection importSheetWasProtected, imageSheetWasProtected
    Application.Calculation = oldCalc
    Application.EnableEvents = oldEvents
    Application.ScreenUpdating = oldScreen
    Exit Sub

ImportFail:
    failNumber = Err.Number
    failDescription = Err.description
    failSource = Err.Source

    On Error Resume Next
    RestoreAUTSheetProtection importSheetWasProtected, imageSheetWasProtected
    Application.Calculation = oldCalc
    Application.EnableEvents = oldEvents
    Application.ScreenUpdating = oldScreen

    If Len(failDescription) = 0 Then failDescription = "An unspecified VBA error occurred."

    WriteAUTMessage "AUT IMPORT FAILED" & vbCrLf & vbCrLf & _
                    "Stage: " & currentStage & vbCrLf & _
                    "Error " & failNumber & ": " & failDescription & vbCrLf & _
                    "Source: " & failSource & vbCrLf & vbCrLf & _
                    "The import did not finish."

    MsgBox "AUT import failed." & vbCrLf & vbCrLf & _
           "Stage: " & currentStage & vbCrLf & _
           "Error " & failNumber & ": " & failDescription, _
           vbCritical, "Import AUT"
End Sub

Private Sub LoadAndValidateCSV(ByVal csvPath As String, _
                               ByRef scanRows As Collection, _
                               ByRef duplicateReport As String, _
                               ByRef skippedCal As Long)
    Dim fileNo As Integer
    Dim lineText As String
    Dim fields As Variant
    Dim headers As Object
    Dim duplicateNames As Object
    Dim rowNumber As Long
    Dim nameCol As Long, xStartCol As Long, xStopCol As Long
    Dim yStartCol As Long, yStopCol As Long
    Dim scanName As String
    Dim duplicateKey As String
    Dim rowData(0 To 4) As Variant
    Dim maxRequiredCol As Long

    Set headers = CreateObject("Scripting.Dictionary")
    headers.CompareMode = vbTextCompare

    Set duplicateNames = CreateObject("Scripting.Dictionary")
    duplicateNames.CompareMode = vbTextCompare

    fileNo = FreeFile
    Open csvPath For Input As #fileNo

    If EOF(fileNo) Then
        Close #fileNo
        Err.Raise vbObjectError + 2110, "LoadAndValidateCSV", "The selected CSV is empty."
    End If

    Line Input #fileNo, lineText
    rowNumber = 1
    fields = ParseCSVLine(RemoveUTF8BOM(lineText))
    BuildHeaderMap fields, headers

    nameCol = FindRequiredHeader(headers, Array("filename", "scanname", "file"), "File Name")
    xStartCol = FindRequiredHeader(headers, Array("xstart"), "X-Start")
    xStopCol = FindRequiredHeader(headers, Array("xstop"), "X-Stop")
    yStartCol = FindRequiredHeader(headers, Array("ystart"), "Y-Start")
    yStopCol = FindRequiredHeader(headers, Array("ystop"), "Y-Stop")

    maxRequiredCol = Application.Max(nameCol, xStartCol, xStopCol, yStartCol, yStopCol)

    Do While Not EOF(fileNo)
        Line Input #fileNo, lineText
        rowNumber = rowNumber + 1

        If Len(Trim$(lineText)) > 0 Then
            fields = ParseCSVLine(lineText)

            If UBound(fields) >= maxRequiredCol Then
                scanName = NormalizeImportText(CStr(fields(nameCol)))

                If Len(scanName) > 0 Then
                    If LCase$(Trim$(scanName)) = "cal" Then
                        skippedCal = skippedCal + 1
                    Else
                        ValidateCoordinate fields(xStartCol), "X-Start", rowNumber
                        ValidateCoordinate fields(xStopCol), "X-Stop", rowNumber
                        ValidateCoordinate fields(yStartCol), "Y-Start", rowNumber
                        ValidateCoordinate fields(yStopCol), "Y-Stop", rowNumber

                        duplicateKey = LCase$(Trim$(scanName))
                        If duplicateNames.Exists(duplicateKey) Then
                            duplicateReport = duplicateReport & _
                                              "- " & scanName & _
                                              " (CSV rows " & duplicateNames(duplicateKey) & _
                                              " and " & rowNumber & ")" & vbCrLf
                        Else
                            duplicateNames.Add duplicateKey, rowNumber
                        End If

                        rowData(0) = scanName
                        rowData(1) = CDbl(fields(xStartCol))
                        rowData(2) = CDbl(fields(xStopCol))
                        rowData(3) = CDbl(fields(yStartCol))
                        rowData(4) = CDbl(fields(yStopCol))
                        scanRows.Add Array(rowData(0), rowData(1), rowData(2), rowData(3), rowData(4))
                    End If
                End If
            Else
                Err.Raise vbObjectError + 2111, "LoadAndValidateCSV", _
                          "CSV row " & rowNumber & " does not contain all required columns."
            End If
        End If
    Loop

    Close #fileNo
End Sub

Private Sub BuildHeaderMap(ByVal fields As Variant, ByRef headers As Object)
    Dim i As Long
    Dim key As String

    For i = LBound(fields) To UBound(fields)
        key = NormalizeHeader(CStr(fields(i)))
        If Len(key) > 0 Then
            If Not headers.Exists(key) Then headers.Add key, i
        End If
    Next i
End Sub

Private Function FindRequiredHeader(ByVal headers As Object, _
                                    ByVal acceptedKeys As Variant, _
                                    ByVal displayName As String) As Long
    Dim key As Variant

    For Each key In acceptedKeys
        If headers.Exists(CStr(key)) Then
            FindRequiredHeader = CLng(headers(CStr(key)))
            Exit Function
        End If
    Next key

    Err.Raise vbObjectError + 2112, "FindRequiredHeader", _
              "Required CSV header not found: " & displayName
End Function

Private Function NormalizeHeader(ByVal headerText As String) As String
    Dim s As String

    s = LCase$(Trim$(headerText))
    s = Replace(s, "-", "")
    s = Replace(s, "_", "")
    s = Replace(s, " ", "")
    s = Replace(s, ".", "")
    s = Replace(s, "'", "")
    s = Replace(s, Chr$(34), "")

    NormalizeHeader = s
End Function

Private Sub ValidateCoordinate(ByVal rawValue As Variant, _
                               ByVal fieldName As String, _
                               ByVal csvRow As Long)
    If Len(Trim$(CStr(rawValue))) = 0 Then
        Err.Raise vbObjectError + 2113, "ValidateCoordinate", _
                  fieldName & " is blank on CSV row " & csvRow & "."
    End If

    If Not IsNumeric(rawValue) Then
        Err.Raise vbObjectError + 2114, "ValidateCoordinate", _
                  fieldName & " is not numeric on CSV row " & csvRow & ": " & CStr(rawValue)
    End If
End Sub

Private Function WorkbookHasExistingScanData() As Boolean
    Dim wsImport As Worksheet
    Dim wsImages As Worksheet

    Set wsImport = ThisWorkbook.Worksheets(SHEET_SCAN_IMPORT)
    Set wsImages = ThisWorkbook.Worksheets(SHEET_SCAN_IMAGES)

    WorkbookHasExistingScanData = _
        (Application.WorksheetFunction.CountA(wsImport.Range("A" & FIRST_DATA_ROW & ":E" & LAST_DATA_ROW)) > 0) Or _
        (Application.WorksheetFunction.CountA(wsImages.Range("A" & FIRST_DATA_ROW & ":E" & LAST_DATA_ROW)) > 0)
End Function


Private Sub PrepareAUTSheetsForImport(ByRef importWasProtected As Boolean, _
                                      ByRef imagesWasProtected As Boolean)
    Dim wsImport As Worksheet
    Dim wsImages As Worksheet

    Set wsImport = ThisWorkbook.Worksheets(SHEET_SCAN_IMPORT)
    Set wsImages = ThisWorkbook.Worksheets(SHEET_SCAN_IMAGES)

    importWasProtected = wsImport.ProtectContents
    imagesWasProtected = wsImages.ProtectContents

    If importWasProtected Then wsImport.Unprotect
    If imagesWasProtected Then wsImages.Unprotect
End Sub

Private Sub RestoreAUTSheetProtection(ByVal importWasProtected As Boolean, _
                                      ByVal imagesWasProtected As Boolean)
    On Error Resume Next

    If importWasProtected Then
        ThisWorkbook.Worksheets(SHEET_SCAN_IMPORT).Protect _
            DrawingObjects:=True, Contents:=True, Scenarios:=True, _
            UserInterfaceOnly:=True
    End If

    If imagesWasProtected Then
        ThisWorkbook.Worksheets(SHEET_SCAN_IMAGES).Protect _
            DrawingObjects:=True, Contents:=True, Scenarios:=True, _
            UserInterfaceOnly:=True
    End If

    On Error GoTo 0
End Sub

Private Sub ClearAUTData()
    Dim wsImport As Worksheet
    Dim wsImages As Worksheet
    Dim lastImportRow As Long
    Dim lastImageRow As Long

    Set wsImport = ThisWorkbook.Worksheets(SHEET_SCAN_IMPORT)
    Set wsImages = ThisWorkbook.Worksheets(SHEET_SCAN_IMAGES)

    ' Clear only rows that currently contain AUT table data.
    ' Do not clear unused template rows or anything below the active table.
    lastImportRow = LastUsedRowAcrossColumns(wsImport, "A", "L")
    If lastImportRow >= FIRST_DATA_ROW Then
        wsImport.Range("A" & FIRST_DATA_ROW & ":L" & lastImportRow).ClearContents
    End If

    ' Clear scan/image assignments through Status only (A:E).
    ' Column F contains user instructions and notes and must be preserved.
    lastImageRow = LastUsedRowAcrossColumns(wsImages, "A", "E")
    If lastImageRow >= FIRST_DATA_ROW Then
        wsImages.Range("A" & FIRST_DATA_ROW & ":E" & lastImageRow).ClearContents
    End If
End Sub

Private Function LastUsedRowAcrossColumns(ByVal ws As Worksheet, _
                                          ByVal firstColumn As String, _
                                          ByVal lastColumn As String) As Long
    Dim searchRange As Range
    Dim foundCell As Range

    Set searchRange = ws.Range(firstColumn & FIRST_DATA_ROW & ":" & _
                               lastColumn & LAST_DATA_ROW)

    Set foundCell = searchRange.Find(What:="*", _
                                     After:=searchRange.Cells(1, 1), _
                                     LookIn:=xlFormulas, _
                                     LookAt:=xlPart, _
                                     SearchOrder:=xlByRows, _
                                     SearchDirection:=xlPrevious, _
                                     MatchCase:=False)

    If foundCell Is Nothing Then
        LastUsedRowAcrossColumns = FIRST_DATA_ROW - 1
    Else
        LastUsedRowAcrossColumns = foundCell.Row
    End If
End Function

Private Function WriteImportedScans(ByVal scanRows As Collection) As Long
    Dim wsImport As Worksheet
    Dim wsImages As Worksheet
    Dim importData() As Variant
    Dim imageData() As Variant
    Dim item As Variant
    Dim i As Long
    Dim lastRow As Long

    Set wsImport = ThisWorkbook.Worksheets(SHEET_SCAN_IMPORT)
    Set wsImages = ThisWorkbook.Worksheets(SHEET_SCAN_IMAGES)

    ReDim importData(1 To scanRows.count, 1 To 5)
    ReDim imageData(1 To scanRows.count, 1 To 5)

    For i = 1 To scanRows.count
        item = scanRows(i)

        importData(i, 1) = item(0)  ' Normalized uppercase scan name
        importData(i, 2) = item(1)
        importData(i, 3) = item(2)
        importData(i, 4) = item(3)
        importData(i, 5) = item(4)

        imageData(i, 1) = item(0)   ' Same normalized uppercase scan name
        imageData(i, 2) = vbNullString
        imageData(i, 3) = vbNullString
        imageData(i, 4) = "YES"
        imageData(i, 5) = vbNullString
    Next i

    lastRow = FIRST_DATA_ROW + scanRows.count - 1

    wsImport.Range("A" & FIRST_DATA_ROW).Resize(scanRows.count, 5).value = importData
    wsImport.Range("L" & FIRST_DATA_ROW & ":L" & lastRow).value = "YES"

    With wsImport
        .Range("F" & FIRST_DATA_ROW & ":F" & lastRow).FormulaR1C1 = "=IFERROR(RC[-3]-RC[-4],"""")"
        .Range("G" & FIRST_DATA_ROW & ":G" & lastRow).FormulaR1C1 = "=IFERROR(RC[-2]-RC[-3],"""")"
        .Range("H" & FIRST_DATA_ROW & ":H" & lastRow).FormulaR1C1 = "=IF(OR(RC[-6]="""",RC[-2]=""""),"""",RC[-6]+RC[-2]/2)"
        .Range("I" & FIRST_DATA_ROW & ":I" & lastRow).FormulaR1C1 = "=IF(OR(RC[-5]="""",RC[-2]=""""),"""",RC[-5]+RC[-2]/2)"
        .Range("J" & FIRST_DATA_ROW & ":J" & lastRow).FormulaR1C1 = "=IF(OR(RC[-4]="""",RC[-3]=""""),"""",IF(RC[-3]>RC[-4],90,0))"
        .Range("K" & FIRST_DATA_ROW & ":K" & lastRow).FormulaR1C1 = _
            "=IF(OR(RC[-5]="""",RC[-4]=""""),"""",MAX(0.45,MIN(MIN(RC[-5],RC[-4])*0.42," & _
            "(MAX(RC[-5],RC[-4])*0.82)/(MAX(1,LEN(RC[-10]))*0.6))*" & _
            "IFERROR(INDEX('Project Settings'!C2,MATCH(""Text Scale Factor"",'Project Settings'!C1,0)),1)))"
    End With

    wsImages.Range("A" & FIRST_DATA_ROW).Resize(scanRows.count, 5).value = imageData

    WriteImportedScans = scanRows.count
End Function

Private Sub RefreshHomeAfterAUT(ByVal importedCount As Long)
    Dim wsHome As Worksheet

    Set wsHome = ThisWorkbook.Worksheets(SHEET_HOME)

    wsHome.Range("C9").value = importedCount
    wsHome.Range("C10").value = "AUT Imported"

    'The current AxisBuilder dashboard exposes RefreshProjectSummary.
    'Call that exact procedure so Project Status updates immediately after import.
    Application.Run "'" & ThisWorkbook.Name & "'!RefreshProjectSummary"
End Sub

Private Sub RunOptionalMacro(ByVal macroName As String)
    On Error Resume Next
    Application.Run "'" & ThisWorkbook.Name & "'!" & macroName
    Err.Clear
    On Error GoTo 0
End Sub

Private Function BuildSuccessMessage(ByVal importedCount As Long, _
                                     ByVal skippedCal As Long, _
                                     ByVal csvPath As String) As String
    Dim msg As String

    msg = "AUT IMPORT COMPLETE" & vbCrLf & vbCrLf & _
          "Scans imported: " & importedCount & vbCrLf & _
          "Scan Import updated: Yes" & vbCrLf & _
          "Scan Images updated: Yes" & vbCrLf & _
          "Duplicate scan names: 0" & vbCrLf

    If skippedCal > 0 Then
        msg = msg & "Calibration rows ignored: " & skippedCal & vbCrLf
    End If

    msg = msg & vbCrLf & "Source file:" & vbCrLf & csvPath

    BuildSuccessMessage = msg
End Function

Private Sub WriteAUTMessage(ByVal messageText As String)
    Dim wsHome As Worksheet
    Dim shp As Shape
    Dim candidateNames As Variant
    Dim candidate As Variant
    Dim lines As Variant
    Dim lineItem As Variant

    On Error GoTo MessageFallback

    Set wsHome = ThisWorkbook.Worksheets(SHEET_HOME)
    candidateNames = Array("lstMessageCenter", "MessageCenterListBox", _
                           "ScrollableMessageCenter", "lstOCRMessageCenter")

    For Each candidate In candidateNames
        Set shp = Nothing
        On Error Resume Next
        Set shp = wsHome.Shapes(CStr(candidate))
        On Error GoTo MessageFallback

        If Not shp Is Nothing Then
            With shp.ControlFormat
                .RemoveAllItems
                lines = Split(Replace(messageText, vbCrLf, vbLf), vbLf)
                For Each lineItem In lines
                    .AddItem CStr(lineItem)
                Next lineItem
                .ListIndex = 1
            End With
            Exit Sub
        End If
    Next candidate

MessageFallback:
    On Error Resume Next
    wsHome.Range("C10").value = FirstMessageLine(messageText)
    On Error GoTo 0
End Sub

Private Function FirstMessageLine(ByVal messageText As String) As String
    Dim p As Long

    p = InStr(1, messageText, vbCrLf)
    If p = 0 Then p = InStr(1, messageText, vbLf)

    If p > 0 Then
        FirstMessageLine = Left$(messageText, p - 1)
    Else
        FirstMessageLine = messageText
    End If
End Function

Private Function NormalizeImportText(ByVal textValue As String) As String
    Dim s As String

    s = Trim$(textValue)

    Do While InStr(1, s, "  ", vbBinaryCompare) > 0
        s = Replace$(s, "  ", " ")
    Loop

    NormalizeImportText = UCase$(s)
End Function

Private Function ParseCSVLine(ByVal lineText As String) As Variant
    Dim values As Collection
    Dim result() As String
    Dim currentValue As String
    Dim i As Long
    Dim ch As String
    Dim inQuotes As Boolean

    Set values = New Collection

    i = 1
    Do While i <= Len(lineText)
        ch = Mid$(lineText, i, 1)

        If ch = Chr$(34) Then
            If inQuotes And i < Len(lineText) And Mid$(lineText, i + 1, 1) = Chr$(34) Then
                currentValue = currentValue & Chr$(34)
                i = i + 1
            Else
                inQuotes = Not inQuotes
            End If
        ElseIf ch = "," And Not inQuotes Then
            values.Add currentValue
            currentValue = vbNullString
        Else
            currentValue = currentValue & ch
        End If

        i = i + 1
    Loop

    values.Add currentValue

    ReDim result(0 To values.count - 1)
    For i = 1 To values.count
        result(i - 1) = values(i)
    Next i

    ParseCSVLine = result
End Function

Private Function RemoveUTF8BOM(ByVal textValue As String) As String
    If Len(textValue) > 0 Then
        If AscW(Left$(textValue, 1)) = &HFEFF Then
            RemoveUTF8BOM = Mid$(textValue, 2)
            Exit Function
        End If
    End If

    ' Handles a UTF-8 BOM that VBA reads as three ANSI characters.
    If Left$(textValue, 3) = Chr$(239) & Chr$(187) & Chr$(191) Then
        RemoveUTF8BOM = Mid$(textValue, 4)
    Else
        RemoveUTF8BOM = textValue
    End If
End Function
