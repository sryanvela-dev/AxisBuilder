Attribute VB_Name = "SLG_FieldFormVisibility"
Option Explicit

'===============================================================================
' AxisBuilder - Embedded Field Form Visibility Utilities
'
' HideFieldFormSheets
'   Hides the embedded Field Form pages (VeryHidden).
'
' ShowFieldFormSheets
'   Makes the embedded Field Form pages visible for editing.
'===============================================================================

Private Const HOME_SHEET As String = "Home"

Public Sub HideFieldFormSheets()

    On Error GoTo ErrHandler

    Application.ScreenUpdating = False

    Worksheets("Page 1 - Field Form").Visible = xlSheetVeryHidden
    Worksheets("Page 2 - Shell Sketch").Visible = xlSheetVeryHidden
    Worksheets("Page 3 - Objects and Nozzles").Visible = xlSheetVeryHidden
    Worksheets("Page 4 - Heads").Visible = xlSheetVeryHidden

    If WorksheetExists(HOME_SHEET) Then Worksheets(HOME_SHEET).Activate

    Application.ScreenUpdating = True

    MsgBox "Embedded Field Form sheets are now hidden.", _
           vbInformation, "AxisBuilder"

    Exit Sub

ErrHandler:
    Application.ScreenUpdating = True
    MsgBox "Unable to hide one or more Field Form sheets." & vbCrLf & _
           Err.description, vbExclamation, "AxisBuilder"

End Sub

Public Sub ShowFieldFormSheets()

    On Error GoTo ErrHandler

    Application.ScreenUpdating = False

    Worksheets("Page 1 - Field Form").Visible = xlSheetVisible
    Worksheets("Page 2 - Shell Sketch").Visible = xlSheetVisible
    Worksheets("Page 3 - Objects and Nozzles").Visible = xlSheetVisible
    Worksheets("Page 4 - Heads").Visible = xlSheetVisible

    Application.ScreenUpdating = True

    MsgBox "Embedded Field Form sheets are now visible.", _
           vbInformation, "AxisBuilder"

    Exit Sub

ErrHandler:
    Application.ScreenUpdating = True
    MsgBox "Unable to show one or more Field Form sheets." & vbCrLf & _
           Err.description, vbExclamation, "AxisBuilder"

End Sub

Private Function WorksheetExists(ByVal sheetName As String) As Boolean

    Dim ws As Worksheet

    On Error Resume Next
    Set ws = Worksheets(sheetName)
    WorksheetExists = Not ws Is Nothing
    Set ws = Nothing
    On Error GoTo 0

End Function
