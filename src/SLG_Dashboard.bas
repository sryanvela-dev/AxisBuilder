Attribute VB_Name = "SLG_Dashboard"
Option Explicit

Private Const HOME_SHEET As String = "Home"
Private Const PROJECT_SHEET As String = "Project Settings"
Private Const DRAWING_SHEET As String = "Drawing Information"
Private Const SCAN_SHEET As String = "Scan Import"
Private Const IMAGE_SHEET As String = "Scan Images"
Private Const SHELL_SHEET As String = "Shell Features"
Private Const HEAD_SHEET As String = "Head Features"
Private Const CAD_SETTING As String = "CAD Platform"
Private Const CAD_BUTTON As String = "btnCADPlatform"
Private Const CAD_INDICATOR As String = "shpCADPlatformIndicator"
Private Const CAD_ICON As String = "icoCADPlatform"

Public Sub RefreshProjectSummary()
    Dim wsHome As Worksheet
    Dim wasProtected As Boolean
    Dim projectReady As Boolean
    Dim drawingReady As Boolean
    Dim shellCount As Long
    Dim headCount As Long
    Dim scanCount As Long
    Dim imageCount As Long
    Dim scanReady As Boolean
    Dim imageReady As Boolean
    Dim layoutReady As Boolean
    Dim overlayReady As Boolean

    On Error GoTo CleanFail

    Application.ScreenUpdating = False
    Application.EnableEvents = False

    Set wsHome = ThisWorkbook.Worksheets(HOME_SHEET)
    wasProtected = wsHome.ProtectContents
    If wasProtected Then wsHome.Unprotect

    projectReady = IsProjectInformationReady()
    drawingReady = IsDrawingInformationReady()
    shellCount = CountShellFeatures()
    headCount = CountHeadFeatures()
    scanCount = CountValidScans()
    imageCount = CountLinkedImages()
    scanReady = AreScansReady(scanCount)
    imageReady = (scanCount > 0 And imageCount = scanCount)
    layoutReady = projectReady And drawingReady And scanReady
    overlayReady = layoutReady And imageReady

    ' Project Summary
    wsHome.Range("C4").value = DisplayValue(GetSettingValue("Project Name"))
    wsHome.Range("C5").value = DisplayValue(GetDrawingValue("Client"))
    wsHome.Range("C6").value = DisplayValue(GetDrawingValue("Component"))
    wsHome.Range("C7").value = DisplayValue(GetDrawingValue("Inspector"))
    wsHome.Range("C8").value = DisplayValue(GetSettingValue("Vessel Orientation"))
    wsHome.Range("C9").value = scanCount
    wsHome.Range("C10").value = GetWorkbookStatus(projectReady, drawingReady, scanReady, imageReady, layoutReady, overlayReady)

    ' Existing Project Status labels and formatting are left untouched.

    WriteReadyStatus wsHome.Range("N4:O4"), projectReady, "READY", "MISSING"
    WriteReadyStatus wsHome.Range("N5:O5"), drawingReady, "READY", "MISSING"
    WriteCountStatus wsHome.Range("N6:O6"), shellCount
    WriteCountStatus wsHome.Range("N7:O7"), headCount
    WriteReadyStatus wsHome.Range("N8:O8"), scanReady, CStr(scanCount) & " SCANS", IIf(scanCount = 0, "0 SCANS", "INCOMPLETE")
    WriteImageStatus wsHome.Range("N9:O9"), imageCount, scanCount
    WriteGenerationStatus wsHome.Range("N10:O10"), layoutReady, overlayReady
    RefreshCADPlatformUI wsHome

    If wasProtected Then wsHome.Protect UserInterfaceOnly:=True

CleanExit:
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    Exit Sub

CleanFail:
    On Error Resume Next
    If Not wsHome Is Nothing Then
        If wasProtected Then wsHome.Protect UserInterfaceOnly:=True
    End If
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    MsgBox "The dashboard could not be refreshed." & vbCrLf & vbCrLf & _
           "Error " & Err.Number & ": " & Err.description, _
           vbExclamation, "Refresh Project Summary"
End Sub

Public Sub InstallCADPlatformSelector()
    Dim ws As Worksheet, wsSet As Worksheet
    Dim imageButton As Shape, printButton As Shape
    Dim selector As Shape
    Dim wasProtected As Boolean
    Dim installErrorNumber As Long, installErrorDescription As String

    On Error GoTo InstallFail
    Set ws = ThisWorkbook.Worksheets(HOME_SHEET)
    Set wsSet = ThisWorkbook.Worksheets(PROJECT_SHEET)
    wasProtected = ws.ProtectContents
    If wasProtected Then ws.Unprotect

    EnsureCADPlatformSetting wsSet
    Set imageButton = FindShapeByMacroText(ws, Array("SelectScanImageFolder", "SelectOriginalImageFolder", "Select Image Folder"))
    Set printButton = FindShapeByMacroText(ws, Array("PrintFieldForm", "Print Field Form"))
    If imageButton Is Nothing Or printButton Is Nothing Then
        Err.Raise vbObjectError + 470, , "Could not locate the Image Folder and Print Field Form buttons."
    End If

    On Error Resume Next
    ws.Shapes(CAD_BUTTON).Delete
    ws.Shapes(CAD_INDICATOR).Delete
    ws.Shapes(CAD_ICON).Delete
    On Error GoTo InstallFail

    'Duplicate an existing dashboard button so every visual detail matches exactly.
    Set selector = imageButton.Duplicate
    selector.Left = imageButton.Left
    selector.Top = printButton.Top
    selector.Width = imageButton.Width
    selector.Height = printButton.Height
    selector.Name = CAD_BUTTON
    selector.OnAction = "'" & ThisWorkbook.Name & "'!ToggleCADPlatform"
    selector.placement = xlMoveAndSize

    CreateCADPlatformIcon ws, selector, imageButton
    RefreshCADPlatformUI ws
    If wasProtected Then ws.Protect UserInterfaceOnly:=True
    Exit Sub

InstallFail:
    installErrorNumber = Err.Number
    installErrorDescription = Err.description
    On Error Resume Next
    If Not ws Is Nothing Then If wasProtected Then ws.Protect UserInterfaceOnly:=True
    MsgBox "The CAD Platform selector could not be installed." & vbCrLf & vbCrLf & _
           "Error " & installErrorNumber & ": " & installErrorDescription, vbExclamation, "AxisBuilder"
End Sub

Private Sub CreateCADPlatformIcon(ByVal ws As Worksheet, _
                                  ByVal selector As Shape, _
                                  ByVal imageButton As Shape)
    Dim cadIcon As Shape, referenceIcon As Shape
    Dim iconLeft As Double, iconWidth As Double

    Set referenceIcon = FindPictureInsideShape(ws, imageButton, CAD_ICON)
    iconLeft = selector.Left + 12
    iconWidth = 26
    If Not referenceIcon Is Nothing Then
        iconLeft = selector.Left + (referenceIcon.Left - imageButton.Left)
        iconWidth = referenceIcon.Width
    End If

    Set cadIcon = ws.Shapes.AddTextbox(msoTextOrientationHorizontal, _
                  iconLeft, selector.Top, iconWidth, selector.Height)
    With cadIcon
        .Name = CAD_ICON
        .Fill.Visible = msoFalse
        .line.Visible = msoFalse
        .TextFrame2.textRange.Text = ChrW(&H21C4)
        .TextFrame2.textRange.Font.Name = "Segoe UI Symbol"
        .TextFrame2.textRange.Font.Size = 17
        .TextFrame2.textRange.Font.Fill.ForeColor.RGB = RGB(31, 78, 121)
        .TextFrame2.textRange.ParagraphFormat.Alignment = msoAlignCenter
        .TextFrame2.VerticalAnchor = msoAnchorMiddle
        .TextFrame2.MarginLeft = 0
        .TextFrame2.MarginRight = 0
        .TextFrame2.MarginTop = 0
        .TextFrame2.MarginBottom = 0
        .OnAction = "'" & ThisWorkbook.Name & "'!ToggleCADPlatform"
        .placement = xlMoveAndSize
        .ZOrder msoBringToFront
    End With
End Sub

Private Function FindPictureInsideShape(ByVal ws As Worksheet, _
                                        ByVal container As Shape, _
                                        ByVal excludedName As String) As Shape
    Dim shp As Shape, centerX As Double, centerY As Double
    For Each shp In ws.Shapes
        If shp.Name <> container.Name And shp.Name <> excludedName Then
            If shp.Type = msoPicture Or shp.Type = msoLinkedPicture Then
                centerX = shp.Left + shp.Width / 2
                centerY = shp.Top + shp.Height / 2
                If centerX >= container.Left And centerX <= container.Left + container.Width And _
                   centerY >= container.Top And centerY <= container.Top + container.Height Then
                    Set FindPictureInsideShape = shp
                    Exit Function
                End If
            End If
        End If
    Next shp
End Function

Public Sub ToggleCADPlatform()
    Dim wsSet As Worksheet, currentPlatform As String, nextPlatform As String
    Set wsSet = ThisWorkbook.Worksheets(PROJECT_SHEET)
    EnsureCADPlatformSetting wsSet
    currentPlatform = GetCADPlatformValue()
    If currentPlatform = "AUTOCAD" Then
        nextPlatform = "DRAFTSIGHT"
    Else
        nextPlatform = "AUTOCAD"
    End If
    SetCADPlatformValue wsSet, nextPlatform
    RefreshCADPlatformUI ThisWorkbook.Worksheets(HOME_SHEET)
    MC_WriteMessage "CAD PLATFORM SELECTED" & vbCrLf & vbCrLf & nextPlatform & _
                    vbCrLf & vbCrLf & "Layout and Overlay generation will use " & nextPlatform & ".", "SUCCESS"
End Sub

Public Sub RefreshCADPlatformIndicator()
    RefreshCADPlatformUI ThisWorkbook.Worksheets(HOME_SHEET)
End Sub

Private Sub RefreshCADPlatformUI(ByVal ws As Worksheet)
    Dim platform As String, selector As Shape
    platform = GetCADPlatformValue()
    On Error Resume Next
    Set selector = ws.Shapes(CAD_BUTTON)
    On Error GoTo 0

    If Not selector Is Nothing Then
        SetButtonCaption selector, "CAD Platform: " & IIf(platform = "AUTOCAD", "AutoCAD", "DraftSight")
    End If
End Sub

Private Function GetCADPlatformValue() As String
    Dim valueText As String
    valueText = UCase$(Trim$(GetSettingValue(CAD_SETTING)))
    If valueText <> "AUTOCAD" Then valueText = "DRAFTSIGHT"
    GetCADPlatformValue = valueText
End Function

Private Sub EnsureCADPlatformSetting(ByVal ws As Worksheet)
    Dim f As Range, nextRow As Long
    Set f = ws.Cells.Find(What:=CAD_SETTING, LookIn:=xlValues, LookAt:=xlWhole, MatchCase:=False)
    If f Is Nothing Then
        nextRow = ws.Cells(ws.Rows.count, "A").End(xlUp).Row + 1
        ws.Cells(nextRow, "A").value = CAD_SETTING
        ws.Cells(nextRow, "B").value = "DraftSight"
    ElseIf Trim$(CStr(f.Offset(0, 1).value)) = "" Then
        f.Offset(0, 1).value = "DraftSight"
    End If
End Sub

Private Sub SetCADPlatformValue(ByVal ws As Worksheet, ByVal platform As String)
    Dim f As Range
    Set f = ws.Cells.Find(What:=CAD_SETTING, LookIn:=xlValues, LookAt:=xlWhole, MatchCase:=False)
    If f Is Nothing Then
        EnsureCADPlatformSetting ws
        Set f = ws.Cells.Find(What:=CAD_SETTING, LookIn:=xlValues, LookAt:=xlWhole, MatchCase:=False)
    End If
    f.Offset(0, 1).value = IIf(platform = "AUTOCAD", "AutoCAD", "DraftSight")
End Sub

Private Function FindShapeByMacroText(ByVal ws As Worksheet, ByVal searchTerms As Variant) As Shape
    Dim shp As Shape, actionText As String, captionText As String, term As Variant
    For Each shp In ws.Shapes
        actionText = "": captionText = ""
        On Error Resume Next
        actionText = shp.OnAction
        captionText = shp.TextFrame2.textRange.Text
        On Error GoTo 0
        For Each term In searchTerms
            If InStr(1, actionText, CStr(term), vbTextCompare) > 0 Or _
               InStr(1, captionText, CStr(term), vbTextCompare) > 0 Then
                Set FindShapeByMacroText = shp
                Exit Function
            End If
        Next term
    Next shp
End Function

Public Sub InstallRefreshButton()
    Dim ws As Worksheet
    Dim shp As Shape
    Dim templateButton As Shape
    Dim headerRange As Range
    Dim wasProtected As Boolean
    Dim buttonWidth As Double
    Dim buttonHeight As Double
    Dim buttonLeft As Double
    Dim buttonTop As Double

    On Error GoTo InstallFail

    Set ws = ThisWorkbook.Worksheets(HOME_SHEET)
    wasProtected = ws.ProtectContents
    If wasProtected Then ws.Unprotect

    On Error Resume Next
    ws.Shapes("btnRefreshProjectSummary").Delete
    On Error GoTo InstallFail

    SetupProjectStatusArea ws

    Set headerRange = ws.Range("B3:G3")

    buttonWidth = 82
    buttonHeight = headerRange.Height - 6
    buttonLeft = headerRange.Left + headerRange.Width - buttonWidth - 4
    buttonTop = headerRange.Top + 3

    Set shp = ws.Shapes.AddShape(msoShapeRoundedRectangle, _
                buttonLeft, buttonTop, buttonWidth, buttonHeight)

    Set templateButton = FindDashboardButtonTemplate(ws, shp.Name)

    With shp
        .Name = "btnRefreshProjectSummary"
        .OnAction = "'" & ThisWorkbook.Name & "'!RefreshProjectSummary"
        .placement = xlMoveAndSize
        .AlternativeText = "Refresh the Home project summary and status checks."
    End With

    If Not templateButton Is Nothing Then
        CopyButtonAppearance templateButton, shp
    Else
        ApplyFallbackButtonAppearance shp
    End If

    SetButtonCaption shp, ChrW(&H21BB) & "  Refresh"
    FormatRefreshButtonText shp

    If wasProtected Then ws.Protect UserInterfaceOnly:=True
    RefreshProjectSummary
    Exit Sub

InstallFail:
    On Error Resume Next
    If Not ws Is Nothing Then
        If wasProtected Then ws.Protect UserInterfaceOnly:=True
    End If
    MsgBox "The Refresh button could not be installed." & vbCrLf & vbCrLf & _
           "Error " & Err.Number & ": " & Err.description, _
           vbExclamation, "Install Refresh Button"
End Sub

Private Sub SetupProjectStatusArea(ByVal ws As Worksheet)
    Dim rowNumber As Long
    Dim statusRange As Range
    Dim currentValue As Variant

    On Error GoTo SetupExit

    For rowNumber = 4 To 10
        Set statusRange = ws.Range("N" & rowNumber & ":O" & rowNumber)
        currentValue = statusRange.Cells(1, 1).value

        If statusRange.MergeCells Then statusRange.UnMerge
        statusRange.Merge
        statusRange.Cells(1, 1).value = currentValue

        With statusRange
            .Interior.Color = RGB(221, 235, 247)
            .HorizontalAlignment = xlLeft
            .VerticalAlignment = xlCenter
            .Font.Bold = True
            .Font.Italic = False
            .ShrinkToFit = True
            .IndentLevel = 1
        End With
    Next rowNumber

    ws.Range("I10:M10").Font.Italic = False

SetupExit:
End Sub

Private Sub FormatRefreshButtonText(ByVal shp As Shape)
    On Error Resume Next

    With shp.TextFrame2
        .MarginLeft = 9
        .MarginRight = 4
        .VerticalAnchor = msoAnchorMiddle
        .textRange.ParagraphFormat.Alignment = msoAlignLeft
    End With

    If Err.Number <> 0 Then
        Err.Clear
        shp.TextFrame.MarginLeft = 9
        shp.TextFrame.MarginRight = 4
        shp.TextFrame.HorizontalAlignment = xlHAlignLeft
        shp.TextFrame.VerticalAlignment = xlVAlignCenter
    End If

    On Error GoTo 0
End Sub

Private Sub RepairGenerationReadyRow(ByVal ws As Worksheet)
    ' Retained for compatibility with earlier versions.
    SetupProjectStatusArea ws
End Sub

Private Function FindDashboardButtonTemplate(ByVal ws As Worksheet, _
                                             ByVal excludedShapeName As String) As Shape
    Dim candidate As Shape
    Dim bestCandidate As Shape
    Dim actionText As String
    Dim minimumTop As Double

    minimumTop = ws.Rows(12).Top

    For Each candidate In ws.Shapes
        If candidate.Name <> excludedShapeName And _
           candidate.Name <> "btnRefreshProjectSummary" Then

            actionText = vbNullString
            On Error Resume Next
            actionText = candidate.OnAction
            On Error GoTo 0

            If Len(actionText) > 0 And candidate.Top >= minimumTop Then
                If candidate.Type = msoAutoShape Then
                    Set bestCandidate = candidate
                    Exit For
                End If
            End If
        End If
    Next candidate

    Set FindDashboardButtonTemplate = bestCandidate
End Function

Private Sub CopyButtonAppearance(ByVal sourceButton As Shape, _
                                 ByVal targetButton As Shape)
    On Error Resume Next

    With targetButton
        .Fill.Visible = sourceButton.Fill.Visible
        .Fill.ForeColor.RGB = sourceButton.Fill.ForeColor.RGB
        .Fill.BackColor.RGB = sourceButton.Fill.BackColor.RGB
        .Fill.Transparency = sourceButton.Fill.Transparency
        .Fill.Solid

        .line.Visible = sourceButton.line.Visible
        .line.ForeColor.RGB = sourceButton.line.ForeColor.RGB
        .line.BackColor.RGB = sourceButton.line.BackColor.RGB
        .line.Transparency = sourceButton.line.Transparency
        .line.Weight = sourceButton.line.Weight
        .line.DashStyle = sourceButton.line.DashStyle

        .Shadow.Visible = sourceButton.Shadow.Visible
        .Shadow.ForeColor.RGB = sourceButton.Shadow.ForeColor.RGB
        .Shadow.Transparency = sourceButton.Shadow.Transparency
        .Shadow.Blur = sourceButton.Shadow.Blur
        .Shadow.OffsetX = sourceButton.Shadow.OffsetX
        .Shadow.OffsetY = sourceButton.Shadow.OffsetY

        .TextFrame2.MarginLeft = sourceButton.TextFrame2.MarginLeft
        .TextFrame2.MarginRight = sourceButton.TextFrame2.MarginRight
        .TextFrame2.MarginTop = sourceButton.TextFrame2.MarginTop
        .TextFrame2.MarginBottom = sourceButton.TextFrame2.MarginBottom
        .TextFrame2.VerticalAnchor = msoAnchorMiddle
        .TextFrame2.textRange.Font.Name = sourceButton.TextFrame2.textRange.Font.Name
        .TextFrame2.textRange.Font.Size = sourceButton.TextFrame2.textRange.Font.Size
        .TextFrame2.textRange.Font.Bold = sourceButton.TextFrame2.textRange.Font.Bold
        .TextFrame2.textRange.Font.Fill.ForeColor.RGB = _
            sourceButton.TextFrame2.textRange.Font.Fill.ForeColor.RGB
        .TextFrame2.textRange.ParagraphFormat.Alignment = msoAlignLeft
    End With

    On Error GoTo 0
End Sub

Private Sub ApplyFallbackButtonAppearance(ByVal shp As Shape)
    With shp
        .Fill.ForeColor.RGB = RGB(71, 85, 105)
        .Fill.Solid
        .line.ForeColor.RGB = RGB(148, 163, 184)
        .line.Weight = 0.75
        .TextFrame2.VerticalAnchor = msoAnchorMiddle
        .TextFrame2.textRange.Font.Name = "Aptos"
        .TextFrame2.textRange.Font.Size = 9
        .TextFrame2.textRange.Font.Bold = msoTrue
        .TextFrame2.textRange.Font.Fill.ForeColor.RGB = RGB(255, 255, 255)
        .TextFrame2.textRange.ParagraphFormat.Alignment = msoAlignLeft
    End With
End Sub

Private Sub SetButtonCaption(ByVal shp As Shape, ByVal captionText As String)
    On Error Resume Next
    shp.TextFrame2.textRange.Text = captionText
    shp.TextFrame2.VerticalAnchor = msoAnchorMiddle
    shp.TextFrame2.textRange.ParagraphFormat.Alignment = msoAlignLeft

    If Err.Number <> 0 Then
        Err.Clear
        shp.TextFrame.Characters.Text = captionText
        shp.TextFrame.HorizontalAlignment = xlHAlignCenter
        shp.TextFrame.VerticalAlignment = xlVAlignCenter
    End If
    On Error GoTo 0
End Sub

Private Function IsProjectInformationReady() As Boolean
    IsProjectInformationReady = _
        Len(GetSettingValue("Project Name")) > 0 And _
        Len(GetSettingValue("Vessel Orientation")) > 0 And _
        IsPositiveNumber(GetSettingValue("Vessel Length")) And _
        IsPositiveNumber(GetSettingValue("Vessel Height"))
End Function

Private Function IsDrawingInformationReady() As Boolean
    IsDrawingInformationReady = _
        Len(GetDrawingValue("Drawing Title")) > 0 And _
        Len(GetDrawingValue("Component")) > 0 And _
        Len(GetDrawingValue("Client")) > 0 And _
        Len(GetDrawingValue("Inspector")) > 0 And _
        Len(GetDrawingValue("Date")) > 0
End Function

Private Function CountShellFeatures() As Long
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(SHELL_SHEET)

    CountShellFeatures = _
        CountNonBlank(ws, "A3:A12") + _
        CountNonBlank(ws, "A15:A24") + _
        CountNonBlank(ws, "A27:A46") + _
        CountNonBlank(ws, "A49:A68") + _
        CountNonBlank(ws, "A71:A90")
End Function

Private Function CountHeadFeatures() As Long
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(HEAD_SHEET)

    CountHeadFeatures = _
        CountNonBlank(ws, "B4:B23") + _
        CountNonBlank(ws, "B28:B200")
End Function

Private Function CountValidScans() As Long
    Dim ws As Worksheet
    Dim lastRow As Long
    Dim r As Long
    Dim scanName As String

    Set ws = ThisWorkbook.Worksheets(SCAN_SHEET)
    lastRow = LastUsedRow(ws, "A")

    For r = 3 To lastRow
        scanName = Trim$(CStr(ws.Cells(r, "A").value))
        If Len(scanName) > 0 And UCase$(scanName) <> "CAL" Then
            CountValidScans = CountValidScans + 1
        End If
    Next r
End Function

Private Function AreScansReady(ByVal scanCount As Long) As Boolean
    Dim ws As Worksheet
    Dim lastRow As Long
    Dim r As Long
    Dim scanName As String

    If scanCount = 0 Then Exit Function

    Set ws = ThisWorkbook.Worksheets(SCAN_SHEET)
    lastRow = LastUsedRow(ws, "A")

    For r = 3 To lastRow
        scanName = Trim$(CStr(ws.Cells(r, "A").value))
        If Len(scanName) > 0 And UCase$(scanName) <> "CAL" Then
            If Not IsNumeric(ws.Cells(r, "B").value) Or _
               Not IsNumeric(ws.Cells(r, "C").value) Or _
               Not IsNumeric(ws.Cells(r, "D").value) Or _
               Not IsNumeric(ws.Cells(r, "E").value) Then Exit Function
        End If
    Next r

    AreScansReady = True
End Function

Private Function CountLinkedImages() As Long
    'Count only expected images that currently exist in the selected folder.
    'A populated alias such as S58 is not proof that the file is present.
    CountLinkedImages = SLG_ScanImages.CountActuallyLinkedScanImages()
End Function

Private Function GetWorkbookStatus(ByVal projectReady As Boolean, _
                                   ByVal drawingReady As Boolean, _
                                   ByVal scanReady As Boolean, _
                                   ByVal imageReady As Boolean, _
                                   ByVal layoutReady As Boolean, _
                                   ByVal overlayReady As Boolean) As String
    If overlayReady Then
        GetWorkbookStatus = "Ready for Layout & Overlay"
    ElseIf layoutReady Then
        GetWorkbookStatus = "Ready for Layout"
    ElseIf scanReady Then
        GetWorkbookStatus = "Scan Data Ready"
    ElseIf projectReady And drawingReady Then
        GetWorkbookStatus = "Project Data Ready"
    ElseIf projectReady Or drawingReady Then
        GetWorkbookStatus = "Project Started"
    Else
        GetWorkbookStatus = "Blank Workbook"
    End If
End Function

Private Sub WriteReadyStatus(ByVal target As Range, _
                             ByVal isReady As Boolean, _
                             ByVal readyText As String, _
                             ByVal notReadyText As String)
    If isReady Then
        SetStatusCell target, ChrW(&H2713) & " " & readyText, RGB(22, 163, 74)
    Else
        SetStatusCell target, ChrW(&H2716) & " " & notReadyText, RGB(220, 38, 38)
    End If
End Sub

Private Sub WriteCountStatus(ByVal target As Range, ByVal itemCount As Long)
    If itemCount > 0 Then
        SetStatusCell target, ChrW(&H2713) & " " & CStr(itemCount) & " FEATURES", RGB(22, 163, 74)
    Else
        SetStatusCell target, ChrW(&H2022) & " OPTIONAL", RGB(100, 116, 139)
    End If
End Sub

Private Sub WriteImageStatus(ByVal target As Range, _
                             ByVal linkedCount As Long, _
                             ByVal scanCount As Long)
    If scanCount > 0 And linkedCount = scanCount Then
        SetStatusCell target, ChrW(&H2713) & " " & _
                      CStr(linkedCount) & " / " & CStr(scanCount) & " LINKED", _
                      RGB(22, 163, 74)
    Else
        SetStatusCell target, ChrW(&H26A0) & " " & _
                      CStr(linkedCount) & " / " & CStr(scanCount) & " LINKED" & _
                      IIf(scanCount > linkedCount, " - " & CStr(scanCount - linkedCount) & " REVIEW", ""), _
                      RGB(217, 119, 6)
    End If
End Sub

Private Sub WriteGenerationStatus(ByVal target As Range, _
                                  ByVal layoutReady As Boolean, _
                                  ByVal overlayReady As Boolean)
    If overlayReady Then
        SetStatusCell target, ChrW(&H2713) & " LAYOUT & OVERLAY READY", RGB(22, 163, 74)
    ElseIf layoutReady Then
        SetStatusCell target, ChrW(&H26A0) & " LAYOUT READY", RGB(217, 119, 6)
    Else
        SetStatusCell target, ChrW(&H2716) & " NOT READY", RGB(220, 38, 38)
    End If
End Sub

Private Sub SetStatusCell(ByVal target As Range, _
                          ByVal statusText As String, _
                          ByVal statusColor As Long)
    Dim statusRange As Range

    Set statusRange = target

    If Not statusRange.MergeCells Then
        statusRange.Merge
    End If

    With statusRange
        .value = statusText
        .Interior.Color = RGB(221, 235, 247)
        .Font.Color = statusColor
        .Font.Bold = True
        .Font.Italic = False
        .HorizontalAlignment = xlLeft
        .VerticalAlignment = xlCenter
        .ShrinkToFit = True
        .IndentLevel = 1
    End With
End Sub

Private Function GetSettingValue(ByVal settingName As String) As String
    GetSettingValue = GetValueBesideLabel(ThisWorkbook.Worksheets(PROJECT_SHEET), settingName)
End Function

Private Function GetDrawingValue(ByVal fieldName As String) As String
    GetDrawingValue = GetValueBesideLabel(ThisWorkbook.Worksheets(DRAWING_SHEET), fieldName)
End Function

Private Function GetValueBesideLabel(ByVal ws As Worksheet, ByVal labelText As String) As String
    Dim foundCell As Range

    Set foundCell = ws.Columns(1).Find(What:=labelText, _
                        After:=ws.Cells(ws.Rows.count, 1), _
                        LookIn:=xlValues, LookAt:=xlWhole, _
                        SearchOrder:=xlByRows, SearchDirection:=xlNext, _
                        MatchCase:=False)

    If Not foundCell Is Nothing Then
        GetValueBesideLabel = Trim$(CStr(foundCell.Offset(0, 1).value))
    End If
End Function

Private Function CountNonBlank(ByVal ws As Worksheet, ByVal addressText As String) As Long
    Dim cell As Range
    For Each cell In ws.Range(addressText).Cells
        If Len(Trim$(CStr(cell.value))) > 0 Then
            CountNonBlank = CountNonBlank + 1
        End If
    Next cell
End Function

Private Function IsPositiveNumber(ByVal valueText As String) As Boolean
    If IsNumeric(valueText) Then IsPositiveNumber = (CDbl(valueText) > 0)
End Function

Private Function LastUsedRow(ByVal ws As Worksheet, ByVal columnLetter As String) As Long
    LastUsedRow = ws.Cells(ws.Rows.count, columnLetter).End(xlUp).Row
End Function

Private Function DisplayValue(ByVal sourceText As String) As String
    If Len(Trim$(sourceText)) = 0 Then
        DisplayValue = "-"
    Else
        DisplayValue = sourceText
    End If
End Function

'Home icon aliases: these icons are still bound to the old macro names (open issue #8).

Public Sub ImportAUT()
    'Exists because a Home icon is still bound to the old name ImportAUT.
    Import_AUT_CSV
End Sub

Public Sub SelectImageFolder()
    'Exists because a Home icon is still bound to the old name SelectImageFolder.
    SelectScanImageFolder
End Sub

Public Sub GenerateLayout()
    'Exists because a Home icon is still bound to the old name GenerateLayout.
    ExportAxisBuilderLSP
End Sub
