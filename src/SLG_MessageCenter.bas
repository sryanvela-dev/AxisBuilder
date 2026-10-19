Attribute VB_Name = "SLG_MessageCenter"
Option Explicit

' AxisBuilder v5.0
' Reusable Forms ListBox Message Center Manager v3.1
' Clears the prior update before displaying the newest Message Center update.
' No ActiveX controls are used.

Private Const MC_HOME_SHEET As String = "Home"
Private Const MC_TARGET_CELL As String = "K23"
Private Const MC_CONTROL_NAME As String = "lstMessageCenter"

Public Sub InstallMessageCenter()
    Dim ws As Worksheet
    Dim target As Range
    Dim box As ListBox

    On Error GoTo InstallFailed
    Application.ScreenUpdating = False

    Set ws = ThisWorkbook.Worksheets(MC_HOME_SHEET)
    Set target = ws.Range(MC_TARGET_CELL).MergeArea

    DeleteExistingMessageCenter ws

    Set box = ws.ListBoxes.Add( _
        target.Left, _
        target.Top, _
        target.Width, _
        target.Height)

    With box
        .Name = MC_CONTROL_NAME
        .placement = xlMoveAndSize
        .PrintObject = True
        .MultiSelect = xlNone
        .Display3DShading = False
        .ListFillRange = vbNullString
        .LinkedCell = vbNullString
        .AddItem "Message Center ready."
    End With

    MC_ApplyStyle box, "READY"
    MC_MatchBackground target, "READY"

    Application.ScreenUpdating = True
    MsgBox "The Forms Message Center has been installed.", _
           vbInformation, "Scan Layout Generator"
    Exit Sub

InstallFailed:
    Application.ScreenUpdating = True
    MsgBox "The Message Center could not be installed." & vbCrLf & _
           "Error: " & Err.description, _
           vbExclamation, "Scan Layout Generator"
End Sub

Public Sub MC_WriteMessage(ByVal messageText As String, _
                           Optional ByVal messageType As String = "SUCCESS")
    Dim ws As Worksheet
    Dim target As Range
    Dim box As ListBox
    Dim normalized As String
    Dim lines() As String
    Dim i As Long

    On Error GoTo MessageFailed

    Set ws = ThisWorkbook.Worksheets(MC_HOME_SHEET)
    Set target = ws.Range(MC_TARGET_CELL).MergeArea
    Set box = MC_EnsureListBox()

    If box Is Nothing Then GoTo CellFallback

    MC_SizeToTarget box, target

    normalized = Replace(messageText, vbCrLf, vbLf)
    normalized = Replace(normalized, vbCr, vbLf)
    lines = Split(normalized, vbLf)

    With box
        'A Forms ListBox bound to a worksheet range rejects AddItem.
        'Clear any accidental bindings before repopulating it.
        On Error Resume Next
        .ListFillRange = vbNullString
        .LinkedCell = vbNullString
        On Error GoTo MessageFailed
        'Classic behavior: each new update replaces the previous update.
        .RemoveAllItems
        For i = LBound(lines) To UBound(lines)
            MC_AddSafeLine box, CStr(lines(i))
        Next i
    End With

    'Do not force ListIndex = -1. Some Excel versions raise error 1004
    'for Forms ListBoxes after repopulating the control.

    MC_ApplyStyle box, messageType
    MC_MatchBackground target, messageType
    Exit Sub

CellFallback:
    If Len(Trim$(CStr(target.Cells(1, 1).value))) > 0 Then
        target.Cells(1, 1).value = CStr(target.Cells(1, 1).value) & _
                                   vbCrLf & vbCrLf & messageText
    Else
        target.Cells(1, 1).value = messageText
    End If
    target.WrapText = True
    target.VerticalAlignment = xlTop
    target.HorizontalAlignment = xlLeft
    target.Font.Name = "Aptos"
    target.Font.Size = 10
    target.Interior.Color = MC_StatusColor(messageType)
    Exit Sub

MessageFailed:
    MsgBox "The Home Message Center could not be updated." & vbCrLf & _
           "Error: " & Err.description, _
           vbExclamation, "Scan Layout Generator"
End Sub

Public Sub MC_AppendMessage(ByVal messageText As String, _
                            Optional ByVal messageType As String = "SUCCESS")
    Dim box As ListBox
    Dim normalized As String
    Dim lines() As String
    Dim i As Long

    On Error GoTo AppendFailed

    Set box = MC_EnsureListBox()
    If box Is Nothing Then
        MC_WriteMessage messageText, messageType
        Exit Sub
    End If

    normalized = Replace(messageText, vbCrLf, vbLf)
    normalized = Replace(normalized, vbCr, vbLf)
    lines = Split(normalized, vbLf)

    On Error Resume Next
    box.ListFillRange = vbNullString
    box.LinkedCell = vbNullString
    On Error GoTo AppendFailed

    If box.ListCount > 0 Then MC_AddSafeLine box, vbNullString
    For i = LBound(lines) To UBound(lines)
        MC_AddSafeLine box, CStr(lines(i))
    Next i

    MC_ApplyStyle box, messageType
    MC_MatchBackground ThisWorkbook.Worksheets(MC_HOME_SHEET).Range(MC_TARGET_CELL).MergeArea, messageType
    Exit Sub

AppendFailed:
    MC_WriteMessage messageText, messageType
End Sub

Private Sub MC_AddSafeLine(ByVal box As ListBox, ByVal lineText As String)
    Const MAX_ITEM_LENGTH As Long = 180
    Dim remaining As String
    Dim chunk As String
    Dim splitAt As Long

    remaining = CStr(lineText)

    If Len(remaining) = 0 Then
        On Error Resume Next
        box.AddItem vbNullString
        On Error GoTo 0
        Exit Sub
    End If

    Do While Len(remaining) > 0
        If Len(remaining) <= MAX_ITEM_LENGTH Then
            chunk = remaining
            remaining = vbNullString
        Else
            splitAt = MC_FindWrapPosition(remaining, MAX_ITEM_LENGTH)
            chunk = RTrim$(Left$(remaining, splitAt))
            remaining = LTrim$(Mid$(remaining, splitAt + 1))
        End If

        On Error Resume Next
        Err.Clear
        box.AddItem chunk

        'Some Excel builds reject unusually long or malformed ListBox items.
        'Retry with shorter pieces instead of interrupting the completed action.
        If Err.Number <> 0 Then
            Err.Clear
            If Len(chunk) > 80 Then
                box.AddItem Left$(chunk, 80)
                If Len(chunk) > 80 Then box.AddItem Mid$(chunk, 81, 80)
                If Len(chunk) > 160 Then box.AddItem Mid$(chunk, 161, 80)
            Else
                box.AddItem "[Message omitted: ListBox item could not be displayed]"
            End If
        End If
        On Error GoTo 0
    Loop
End Sub

Private Function MC_FindWrapPosition(ByVal textValue As String, ByVal maxLength As Long) As Long
    Dim i As Long

    For i = maxLength To 1 Step -1
        Select Case Mid$(textValue, i, 1)
            Case " ", ";", ",", ".", ":"
                MC_FindWrapPosition = i
                Exit Function
        End Select
    Next i

    MC_FindWrapPosition = maxLength
End Function

Public Sub MC_Clear()
    Dim box As ListBox
    On Error Resume Next
    Set box = ThisWorkbook.Worksheets(MC_HOME_SHEET).ListBoxes(MC_CONTROL_NAME)
    If Not box Is Nothing Then box.RemoveAllItems
    On Error GoTo 0
End Sub

Public Sub ApplyMessageCenterFinalStyle()
    Dim ws As Worksheet
    Dim target As Range
    Dim box As ListBox
    Dim statusType As String

    On Error GoTo StyleFailed

    Set ws = ThisWorkbook.Worksheets(MC_HOME_SHEET)
    Set target = ws.Range(MC_TARGET_CELL).MergeArea
    Set box = MC_EnsureListBox()

    If box Is Nothing Then
        MsgBox "The Message Center was not found. Run InstallMessageCenter.", _
               vbExclamation, "Scan Layout Generator"
        Exit Sub
    End If

    statusType = MC_DetectCurrentStatus(box)
    MC_SizeToTarget box, target
    MC_ApplyStyle box, statusType
    MC_MatchBackground target, statusType
    Exit Sub

StyleFailed:
    MsgBox "The final Message Center style could not be applied." & vbCrLf & _
           "Error: " & Err.description, _
           vbExclamation, "Scan Layout Generator"
End Sub

Private Function MC_DetectCurrentStatus(ByVal box As ListBox) As String
    Dim i As Long
    Dim allText As String

    On Error Resume Next
    For i = 1 To box.ListCount
        allText = allText & " " & UCase$(CStr(box.List(i)))
    Next i
    On Error GoTo 0

    If InStr(allText, "ERROR") > 0 Or InStr(allText, "FAILED") > 0 Then
        MC_DetectCurrentStatus = "ERROR"
    ElseIf InStr(allText, "REVIEW") > 0 Or InStr(allText, "WARNING") > 0 Then
        MC_DetectCurrentStatus = "REVIEW"
    ElseIf Len(Trim$(allText)) = 0 Or InStr(allText, "READY") > 0 Then
        MC_DetectCurrentStatus = "READY"
    Else
        MC_DetectCurrentStatus = "SUCCESS"
    End If
End Function

Public Sub ResizeMessageCenter()
    Dim ws As Worksheet
    Dim target As Range
    Dim box As ListBox

    On Error GoTo ResizeFailed

    Set ws = ThisWorkbook.Worksheets(MC_HOME_SHEET)
    Set target = ws.Range(MC_TARGET_CELL).MergeArea
    Set box = MC_EnsureListBox()

    If box Is Nothing Then
        MsgBox "The Message Center was not found. Run InstallMessageCenter.", _
               vbExclamation, "Scan Layout Generator"
        Exit Sub
    End If

    MC_SizeToTarget box, target
    Exit Sub

ResizeFailed:
    MsgBox "The Message Center could not be resized." & vbCrLf & _
           "Error: " & Err.description, _
           vbExclamation, "Scan Layout Generator"
End Sub

Private Function MC_EnsureListBox() As ListBox
    Dim ws As Worksheet
    Dim target As Range
    Dim box As ListBox

    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(MC_HOME_SHEET)
    Set box = ws.ListBoxes(MC_CONTROL_NAME)
    On Error GoTo 0

    If Not box Is Nothing Then
        Set MC_EnsureListBox = box
        Exit Function
    End If

    On Error GoTo Failed
    Set target = ws.Range(MC_TARGET_CELL).MergeArea

    Set box = ws.ListBoxes.Add( _
        target.Left, _
        target.Top, _
        target.Width, _
        target.Height)

    With box
        .Name = MC_CONTROL_NAME
        .placement = xlMoveAndSize
        .PrintObject = True
        .MultiSelect = xlNone
        .Display3DShading = False
        .ListFillRange = vbNullString
        .LinkedCell = vbNullString
    End With

    MC_ApplyStyle box, "READY"
    Set MC_EnsureListBox = box
    Exit Function

Failed:
    Set MC_EnsureListBox = Nothing
End Function

Private Sub MC_SizeToTarget(ByVal box As ListBox, ByVal target As Range)
    With box
        .Left = target.Left
        .Top = target.Top
        .Width = target.Width
        .Height = target.Height
        .placement = xlMoveAndSize
    End With
End Sub

Private Sub MC_ApplyStyle(ByVal box As ListBox, ByVal messageType As String)
    Dim fillColor As Long
    Dim shp As Shape
    Dim obj As Object

    fillColor = MC_StatusColor(messageType)

    On Error Resume Next

    Set shp = ThisWorkbook.Worksheets(MC_HOME_SHEET).Shapes(box.Name)
    Set obj = shp.DrawingObject

    'Apply the font through both supported Forms-control routes.
    box.Font.Name = "Aptos"
    box.Font.Size = 11
    box.Font.Bold = False
    box.Font.Italic = False
    box.Font.Color = RGB(64, 64, 64)

    obj.Font.Name = "Aptos"
    obj.Font.Size = 11
    obj.Font.Bold = False
    obj.Font.Italic = False
    obj.Font.Color = RGB(64, 64, 64)

    shp.Fill.Visible = msoTrue
    shp.Fill.Solid
    shp.Fill.ForeColor.RGB = fillColor
    shp.line.Visible = msoTrue
    shp.line.ForeColor.RGB = RGB(91, 155, 213)
    shp.line.Weight = 0.75

    On Error GoTo 0
End Sub

Private Sub MC_MatchBackground(ByVal target As Range, ByVal messageType As String)
    On Error Resume Next
    target.Interior.Pattern = xlSolid
    target.Interior.Color = MC_StatusColor(messageType)
    target.Borders.LineStyle = xlNone
    target.Font.Color = MC_StatusColor(messageType)
    target.ClearContents
    On Error GoTo 0
End Sub

Private Function MC_StatusColor(ByVal messageType As String) As Long
    Select Case UCase$(Trim$(messageType))
        Case "ERROR", "FAILED"
            MC_StatusColor = RGB(244, 204, 204)
        Case "WARNING", "REVIEW"
            MC_StatusColor = RGB(255, 242, 204)
        Case "READY", "INFO"
            MC_StatusColor = RGB(255, 255, 255)
        Case Else
            MC_StatusColor = RGB(226, 239, 218)
    End Select
End Function

Private Sub DeleteExistingMessageCenter(ByVal ws As Worksheet)
    Dim shp As Shape

    On Error Resume Next
    ws.ListBoxes(MC_CONTROL_NAME).Delete
    ws.OLEObjects("txtMessageCenter").Delete

    For Each shp In ws.Shapes
        If shp.Type = msoFormControl Then
            If shp.FormControlType = xlListBox Then
                If MC_OverlapsTarget(shp, ws.Range(MC_TARGET_CELL).MergeArea) Then
                    shp.Delete
                End If
            End If
        End If
    Next shp
    On Error GoTo 0
End Sub

Private Function MC_OverlapsTarget(ByVal shp As Shape, ByVal target As Range) As Boolean
    MC_OverlapsTarget = Not ( _
        shp.Left + shp.Width < target.Left Or _
        shp.Left > target.Left + target.Width Or _
        shp.Top + shp.Height < target.Top Or _
        shp.Top > target.Top + target.Height)
End Function
