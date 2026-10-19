Attribute VB_Name = "SLG_NewProject"
Option Explicit

' AxisBuilder New Project installer and controlled project reset.
' Import this module, then run InstallNewProjectButton once.

Private Const HOME_SHEET As String = "Home"
Private Const PROJECT_SHEET As String = "Project Settings"
Private Const DRAWING_SHEET As String = "Drawing Information"
Private Const SCAN_SHEET As String = "Scan Import"
Private Const IMAGE_SHEET As String = "Scan Images"
Private Const SHELL_SHEET As String = "Shell Features"
Private Const HEAD_SHEET As String = "Head Features"
Private Const NEW_PROJECT_BUTTON As String = "btnNewProject"
Private Const REFRESH_BUTTON As String = "btnRefreshProjectSummary"

Public Sub InstallNewProjectButton()
    Dim ws As Worksheet
    Dim shp As Shape
    Dim refreshButton As Shape
    Dim headerRange As Range
    Dim wasProtected As Boolean

    On Error GoTo InstallFail

    Application.ScreenUpdating = False
    Set ws = ThisWorkbook.Worksheets(HOME_SHEET)
    wasProtected = ws.ProtectContents
    If wasProtected Then ws.Unprotect

    On Error Resume Next
    ws.Shapes(NEW_PROJECT_BUTTON).Delete
    DeleteDuplicateRefreshButtons ws
    Set refreshButton = ws.Shapes(REFRESH_BUTTON)
    On Error GoTo InstallFail

    If refreshButton Is Nothing Then
        Err.Raise vbObjectError + 1700, "InstallNewProjectButton", _
                  "The Refresh button was not found. Run InstallRefreshButton first."
    End If

    Set headerRange = ws.Range("B1:O1")

    Set shp = refreshButton.Duplicate

    With shp
        .Name = NEW_PROJECT_BUTTON
        .OnAction = "'" & ThisWorkbook.Name & "'!NewProject"
        .placement = xlMoveAndSize
        .AlternativeText = "Clear the previous project and prepare AxisBuilder for a new project."
        .Left = headerRange.Left + 4
        .Top = headerRange.Top + ((headerRange.Height - .Height) / 2)
        .TextFrame2.textRange.Text = "New Project"
        .TextFrame2.VerticalAnchor = msoAnchorMiddle
        .TextFrame2.textRange.ParagraphFormat.Alignment = msoAlignLeft
    End With

    If wasProtected Then ws.Protect UserInterfaceOnly:=True
    ws.Activate
    ws.Range("B1").Select

InstallExit:
    Application.ScreenUpdating = True
    Exit Sub

InstallFail:
    On Error Resume Next
    If Not ws Is Nothing Then
        If wasProtected Then ws.Protect UserInterfaceOnly:=True
    End If
    Application.ScreenUpdating = True
    MsgBox "The New Project button could not be installed." & vbCrLf & vbCrLf & _
           "Error " & Err.Number & ": " & Err.description, _
           vbExclamation, "Install New Project Button"
End Sub

Private Sub DeleteDuplicateRefreshButtons(ByVal ws As Worksheet)
    Dim shapeIndex As Long
    Dim candidate As Shape
    Dim actionText As String

    ' A failed earlier install may have left a duplicated Refresh shape.
    ' Keep the correctly named Refresh button and delete only its copies.
    For shapeIndex = ws.Shapes.count To 1 Step -1
        Set candidate = ws.Shapes(shapeIndex)

        If candidate.Name <> REFRESH_BUTTON Then
            actionText = vbNullString
            On Error Resume Next
            actionText = candidate.OnAction
            On Error GoTo 0

            If InStr(1, actionText, "RefreshProjectSummary", vbTextCompare) > 0 Then
                candidate.Delete
            End If
        End If
    Next shapeIndex
End Sub

Public Sub NewProject()
    Dim answer As VbMsgBoxResult
    Dim previousSheet As Worksheet
    Dim protectedSheets As Collection
    Dim resetErrorNumber As Long
    Dim resetErrorDescription As String

    answer = MsgBox( _
        "Do you want to erase the previous project?" & vbCrLf & vbCrLf & _
        "This clears the project inputs and cannot be undone after the workbook is saved.", _
        vbYesNo + vbQuestion + vbDefaultButton2, _
        "New Project")

    If answer <> vbYes Then Exit Sub

    On Error GoTo ResetFail

    Set previousSheet = ActiveSheet
    Set protectedSheets = New Collection

    Application.ScreenUpdating = False
    Application.EnableEvents = False
    Application.Calculation = xlCalculationManual

    UnprotectForReset ThisWorkbook.Worksheets(PROJECT_SHEET), protectedSheets
    UnprotectForReset ThisWorkbook.Worksheets(DRAWING_SHEET), protectedSheets
    UnprotectForReset ThisWorkbook.Worksheets(SCAN_SHEET), protectedSheets
    UnprotectForReset ThisWorkbook.Worksheets(IMAGE_SHEET), protectedSheets
    UnprotectForReset ThisWorkbook.Worksheets(SHELL_SHEET), protectedSheets
    UnprotectForReset ThisWorkbook.Worksheets(HEAD_SHEET), protectedSheets

    ClearProjectSettings
    ClearDrawingInformation
    ClearScanImport
    ClearScanImages
    ClearShellFeatures
    ClearHeadFeatures

    ReprotectResetSheets protectedSheets

    Application.Calculation = xlCalculationAutomatic
    Application.Calculate

    On Error Resume Next
    Application.Run "'" & ThisWorkbook.Name & "'!RefreshProjectSummary"
    On Error GoTo ResetFail

    UpdateNewProjectMessage

    ThisWorkbook.Worksheets(HOME_SHEET).Activate
    ThisWorkbook.Worksheets(HOME_SHEET).Range("B1").Select

    Application.EnableEvents = True
    Application.ScreenUpdating = True

    MsgBox "The previous project has been cleared.", _
           vbInformation, "New Project"
    Exit Sub

ResetFail:
    resetErrorNumber = Err.Number
    resetErrorDescription = Err.description
    On Error Resume Next
    ReprotectResetSheets protectedSheets
    Application.Calculation = xlCalculationAutomatic
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    If Not previousSheet Is Nothing Then previousSheet.Activate
    MsgBox "The previous project could not be completely cleared." & vbCrLf & vbCrLf & _
           "Error " & resetErrorNumber & ": " & resetErrorDescription, _
           vbExclamation, "New Project"
End Sub

Private Sub ClearProjectSettings()
    With ThisWorkbook.Worksheets(PROJECT_SHEET)
        .Range("B5").ClearContents           ' Project Name
        .Range("B10:B11").ClearContents       ' Vessel Length / Vessel Height
        .Range("B21:B22").ClearContents       ' X / Y Axis Direction Text
        .Range("B32:B36").ClearContents       ' Reference Labels 0 through 360 degrees
    End With
End Sub

Private Sub UpdateNewProjectMessage()
    On Error Resume Next
    Application.Run "'" & ThisWorkbook.Name & "'!MC_Clear"
    Application.Run "'" & ThisWorkbook.Name & "'!MC_WriteMessage", _
                    "NEW PROJECT STARTED" & vbCrLf & vbCrLf & _
                    "Previous project inputs cleared.", _
                    "SUCCESS"
    On Error GoTo 0
End Sub

Private Sub ClearDrawingInformation()
    With ThisWorkbook.Worksheets(DRAWING_SHEET)
        .Range("B4:B11").ClearContents
        .Range("B16:B23").ClearContents
        .Range("B24:C28").ClearContents       ' Merged Notes field
    End With
End Sub

Private Sub ClearScanImport()
    ' Preserve calculated columns F:K and their formulas.
    With ThisWorkbook.Worksheets(SCAN_SHEET)
        .Range("A3:E202").ClearContents
        .Range("L3:L202").ClearContents
    End With
End Sub

Private Sub ClearScanImages()
    ' Clear scan/image links and generated results; preserve the instruction note in F3.
    With ThisWorkbook.Worksheets(IMAGE_SHEET)
        .Range("A3:E202").ClearContents
    End With
End Sub

Private Sub ClearShellFeatures()
    With ThisWorkbook.Worksheets(SHELL_SHEET)
        .Range("A3:D12").ClearContents        ' Circumferential welds
        .Range("A15:F24").ClearContents       ' Long seam welds
        .Range("A27:H66").ClearContents       ' Shell nozzles
        .Range("A69:G88").ClearContents       ' Objects / supports
        .Range("A91:E110").ClearContents      ' Shell MUT
    End With
End Sub

Private Sub ClearHeadFeatures()
    With ThisWorkbook.Worksheets(HEAD_SHEET)
        .Range("A4:J24").ClearContents        ' Head nozzles
        .Range("A28:I47").ClearContents       ' Head MUT
    End With
End Sub

Private Sub UnprotectForReset(ByVal ws As Worksheet, ByVal protectedSheets As Collection)
    If ws.ProtectContents Then
        ws.Unprotect
        protectedSheets.Add ws
    End If
End Sub

Private Sub ReprotectResetSheets(ByVal protectedSheets As Collection)
    Dim item As Variant

    If protectedSheets Is Nothing Then Exit Sub

    For Each item In protectedSheets
        item.Protect UserInterfaceOnly:=True
    Next item
End Sub
