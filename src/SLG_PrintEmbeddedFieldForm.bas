Attribute VB_Name = "SLG_PrintEmbeddedFieldForm"
Option Explicit

'===============================================================================
' AxisBuilder - Embedded Field Form Print Preview
'
' Home button macro:
'   PrintFieldForm
'
' Uses the four field-form worksheets already embedded in AxisBuilder.
' The sheets are shown only while Print Preview is open, then restored to their
' original visibility settings.
'===============================================================================

Private Const FORM_PAGE_1 As String = "Page 1 - Field Form"
Private Const FORM_PAGE_2 As String = "Page 2 - Shell Sketch"
Private Const FORM_PAGE_3 As String = "Page 3 - Objects and Nozzles"
Private Const FORM_PAGE_4 As String = "Page 4 - Heads"
Private Const HOME_SHEET As String = "Home"

Public Sub PrintFieldForm()

    Dim pageNames As Variant
    Dim previousVisibility(0 To 3) As XlSheetVisibility
    Dim previousSheet As Object
    Dim i As Long
    Dim oldScreenUpdating As Boolean
    Dim oldDisplayAlerts As Boolean
    Dim previewOpened As Boolean

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
    oldScreenUpdating = Application.ScreenUpdating
    oldDisplayAlerts = Application.DisplayAlerts

    Application.ScreenUpdating = False
    Application.DisplayAlerts = False

    'Remember each page's current state, then temporarily show it.
    For i = LBound(pageNames) To UBound(pageNames)
        With ThisWorkbook.Worksheets(CStr(pageNames(i)))
            previousVisibility(i) = .Visible
            .Visible = xlSheetVisible
        End With
    Next i

    'Select all four pages in packet order.
    ThisWorkbook.Worksheets(pageNames).Select
    ThisWorkbook.Worksheets(FORM_PAGE_1).Activate

    Application.ScreenUpdating = True
    Application.DisplayAlerts = oldDisplayAlerts

    WriteMessageCenter "Field Form opened in Print Preview.", "SUCCESS"
    previewOpened = True

    'Uses the existing print area and page setup stored on each form page.
    ActiveWindow.SelectedSheets.PrintPreview

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

    'Restore the exact visibility state each page had before preview.
    For i = LBound(pageNames) To UBound(pageNames)
        ThisWorkbook.Worksheets(CStr(pageNames(i))).Visible = previousVisibility(i)
    Next i

    If WorksheetExists(HOME_SHEET, ThisWorkbook) Then
        ThisWorkbook.Worksheets(HOME_SHEET).Activate
    End If

    Application.DisplayAlerts = oldDisplayAlerts
    Application.ScreenUpdating = oldScreenUpdating
    On Error GoTo 0

    Exit Sub

PrintError:
    WriteMessageCenter _
        "Unable to open the Field Form print preview." & vbCrLf & _
        Err.description, _
        "ERROR"

    MsgBox _
        "The Field Form print preview could not be opened." & _
        vbCrLf & vbCrLf & Err.description, _
        vbExclamation, _
        "AxisBuilder"

    Resume PrintCleanup

End Sub

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
