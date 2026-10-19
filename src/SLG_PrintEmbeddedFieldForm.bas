Attribute VB_Name = "SLG_PrintEmbeddedFieldForm"
Option Explicit

'===============================================================================
' AxisBuilder - Embedded Field Form PDF Export
'
' Home button macro:
'   PrintFieldForm
'
' Uses the four field-form worksheets already embedded in AxisBuilder.
' The sheets are shown only while they are exported to one PDF (in the user's
' temp folder), then restored to their original visibility settings. The PDF
' opens in the default viewer, where one-sided printing is easy to choose.
'===============================================================================

Private Const FORM_PAGE_1 As String = "Page 1 - Field Form"
Private Const FORM_PAGE_2 As String = "Page 2 - Shell Sketch"
Private Const FORM_PAGE_3 As String = "Page 3 - Objects and Nozzles"
Private Const FORM_PAGE_4 As String = "Page 4 - Heads"
Private Const HOME_SHEET As String = "Home"

Public Sub PrintFieldForm()

    Dim pageNames As Variant
    Dim previousVisibility(0 To 3) As XlSheetVisibility
    Dim savedCount As Long
    Dim previousSheet As Object
    Dim i As Long
    Dim oldScreenUpdating As Boolean
    Dim oldDisplayAlerts As Boolean
    Dim pdfPath As String
    Dim pdfExported As Boolean

    MsgBox "The Field Form will open as a PDF. When you print, choose ONE-SIDED printing " & _
           "(turn off 'print on both sides') so each page photographs cleanly for OCR.", _
           vbInformation, "AxisBuilder"

    oldScreenUpdating = Application.ScreenUpdating
    oldDisplayAlerts = Application.DisplayAlerts

    On Error GoTo PrintError

    pageNames = Array( _
        FORM_PAGE_1, _
        FORM_PAGE_2, _
        FORM_PAGE_3, _
        FORM_PAGE_4)

    'Confirm that all four embedded pages exist before changing anything.
    For i = LBound(pageNames) To UBound(pageNames)
        If Not WorksheetExists(CStr(pageNames(i)), ThisWorkbook) Then
            Err.Raise vbObjectError + 4730, "PrintFieldForm", _
                      "AxisBuilder is missing this embedded Field Form page:" & _
                      vbCrLf & CStr(pageNames(i))
        End If
    Next i

    Set previousSheet = ActiveSheet

    Application.ScreenUpdating = False
    Application.DisplayAlerts = False

    'Remember each page's current state, then temporarily show it.
    For i = LBound(pageNames) To UBound(pageNames)
        With ThisWorkbook.Worksheets(CStr(pageNames(i)))
            previousVisibility(i) = .Visible
            savedCount = i + 1
            .Visible = xlSheetVisible
        End With
    Next i

    'Select all four pages in packet order.
    ThisWorkbook.Worksheets(pageNames).Select
    ThisWorkbook.Worksheets(FORM_PAGE_1).Activate

    'Timestamped name, so a copy still open in a viewer never blocks a new export.
    pdfPath = TempFolderPath() & "AxisBuilder_Field_Form_" & Format$(Now, "yyyymmdd_hhnnss") & ".pdf"

    'Uses the existing print area and page setup stored on each form page.
    'With the four pages grouped, the active sheet exports the whole selection as one PDF.
    ActiveSheet.ExportAsFixedFormat _
        Type:=xlTypePDF, _
        Filename:=pdfPath, _
        Quality:=xlQualityStandard, _
        IncludeDocProperties:=False, _
        IgnorePrintAreas:=False, _
        OpenAfterPublish:=False

    pdfExported = True
    WriteMessageCenter "Field Form exported to PDF: " & pdfPath, "SUCCESS"

PrintCleanup:
    On Error Resume Next

    Application.ScreenUpdating = False
    Application.DisplayAlerts = False

    'Ungroup the form pages before hiding them again.
    If Not previousSheet Is Nothing Then
        previousSheet.Select
    ElseIf WorksheetExists(HOME_SHEET, ThisWorkbook) Then
        ThisWorkbook.Worksheets(HOME_SHEET).Select
    End If

    'Restore the exact visibility state each page had before the export.
    For i = 0 To savedCount - 1
        ThisWorkbook.Worksheets(CStr(pageNames(i))).Visible = previousVisibility(i)
    Next i

    If WorksheetExists(HOME_SHEET, ThisWorkbook) Then
        ThisWorkbook.Worksheets(HOME_SHEET).Activate
    End If

    Application.DisplayAlerts = oldDisplayAlerts
    Application.ScreenUpdating = oldScreenUpdating
    On Error GoTo 0

    'Open the PDF only after the form pages are hidden again.
    If pdfExported Then
        If Not OpenPdfFile(pdfPath) Then
            MsgBox "The Field Form PDF was saved but could not be opened automatically." & _
                   vbCrLf & vbCrLf & "Open it from:" & vbCrLf & pdfPath, _
                   vbExclamation, "AxisBuilder"
        End If
    End If

    Exit Sub

PrintError:
    WriteMessageCenter _
        "Unable to export the Field Form to PDF." & vbCrLf & _
        Err.description, _
        "ERROR"

    MsgBox _
        "The Field Form PDF could not be created." & _
        vbCrLf & vbCrLf & Err.description, _
        vbExclamation, _
        "AxisBuilder"

    Resume PrintCleanup

End Sub

Private Function TempFolderPath() As String

    'User temp folder with a trailing separator; workbook folder as a fallback.
    Dim folderPath As String

    folderPath = Environ$("TEMP")
    If Len(folderPath) = 0 Then folderPath = Environ$("TMP")
    If Len(folderPath) = 0 Then folderPath = ThisWorkbook.Path

    If Right$(folderPath, 1) <> "\" Then folderPath = folderPath & "\"
    TempFolderPath = folderPath

End Function

Private Function OpenPdfFile(ByVal pdfPath As String) As Boolean

    'Default PDF viewer via the Windows shell (no hyperlink security prompt).
    On Error GoTo OpenFailed

    If Len(Dir$(pdfPath)) = 0 Then GoTo OpenFailed

    CreateObject("Shell.Application").ShellExecute pdfPath, "", "", "open", 1
    OpenPdfFile = True
    Exit Function

OpenFailed:
    OpenPdfFile = False

End Function

Private Function WorksheetExists( _
    ByVal sheetName As String, _
    ByVal targetWorkbook As Workbook) As Boolean

    Dim ws As Worksheet

    On Error Resume Next
    Set ws = targetWorkbook.Worksheets(sheetName)
    WorksheetExists = Not ws Is Nothing
    Set ws = Nothing
    On Error GoTo 0

End Function

Private Sub WriteMessageCenter( _
    ByVal messageText As String, _
    ByVal messageType As String)

    'Avoids a compile dependency if the Message Center module name changes.
    On Error Resume Next

    Application.Run _
        "'" & ThisWorkbook.Name & "'!MC_WriteMessage", _
        messageText, _
        messageType

    On Error GoTo 0

End Sub
