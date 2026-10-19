Attribute VB_Name = "SLG_Utilities"

Option Explicit

'Phase 1D Validation Summary counters
Private gValidationScansProcessed As Long
Private gValidationImagesFound As Long
Private gValidationImagesMissing As Long
Private gValidationOverlapsDetected As Long
Private gValidationErrors As Long
Private gValidationWarnings As Long
Private gValidationCoordinateCorrections As Long
Private gValidationRequiresImages As Boolean
Private gValidationWarningDetails As String
Private gCADPlatformOutput As String


'============================================================
' AxisBuilder v4.7.28 - AXISBUILDER command launcher
' Based on v4.6.57 FIXED TOTAL SCANS TO AUT/MUT TEXT GAP
' Generates a DraftSight AutoLISP file from this workbook.
'
' Workflow:
' 1. Save workbook as .xlsm.
' 2. Import/paste this module.
' 3. Fill Project Settings, Scan Import, Supports, and Nozzles.
' 4. Run ExportScanLayoutLSP.
' 5. Load the output .lsp in DraftSight with LOADAPPLICATION.
' 6. Run SCANLAYOUT.
'============================================================

Public Sub ExportScanLayoutLSP()
    Dim wsSet As Worksheet, wsScan As Worksheet, wsShell As Worksheet, wsInfo As Worksheet, wsHead As Worksheet
    Set wsSet = ThisWorkbook.Worksheets("Project Settings")
    Set wsScan = ThisWorkbook.Worksheets("Scan Import")
    Set wsShell = ThisWorkbook.Worksheets("Shell Features")
    Set wsInfo = ThisWorkbook.Worksheets("Drawing Information")
    Set wsHead = ThisWorkbook.Worksheets("Head Features")
    gCADPlatformOutput = SelectedCADPlatform()

    ResetValidationSummaryStats False
    If ValidationEnabled() Then
        If Not ValidatePhase1A(wsScan, False) Then Exit Sub
        If Not ValidatePhase1B(wsScan) Then Exit Sub
    Else
        UpdateBasicValidationScanCount wsScan
    End If

    'Generation safety gate: stop before any CDbl conversion when OCR REVIEW text,
    'missing required values, or other non-numeric data exists.
    If Not ValidateLayoutGenerationData(wsScan, wsShell, wsHead) Then Exit Sub

    Dim projectName As String
    projectName = CleanFileName(CStr(GetSettingValue("Project Name", "Scan_Layout")))
    If Len(projectName) = 0 Then projectName = "Scan_Layout"

    Dim filePath As Variant
    filePath = Application.GetSaveAsFilename( _
        InitialFileName:=projectName & ".lsp", _
        FileFilter:="AutoLISP Files (*.lsp), *.lsp", _
        Title:="Save " & CADPlatformDisplayName() & " AutoLISP File")

    If filePath = False Then Exit Sub

    Dim f As Integer
    f = FreeFile
    Open CStr(filePath) For Output As #f

    Print #f, ";;; AxisBuilder v4.7.28 AXISBUILDER COMMAND LAUNCHER"
    Print #f, ";;; Generated from Excel on " & Format(Now, "yyyy-mm-dd hh:nn:ss")
    Print #f, ";;; Load in " & CADPlatformDisplayName() & " with APPLOAD/LOADAPPLICATION. Type AXISBUILDER for the command launcher, or run SCANLAYOUT directly."
    Print #f, ""

    WriteLispHeader f

    Dim orientation As String
    orientation = NormalizeVesselOrientation(CStr(GetSettingValue("Vessel Orientation", "Horizontal CW")))

    Dim vesselLength As Double, vesselHeight As Double
    vesselLength = CDbl(GetSettingValue("Vessel Length", 144))
    vesselHeight = CDbl(GetSettingValue("Vessel Height", 151))

    Dim spacing As Double
    spacing = CDbl(GetSettingValue("Ruler Spacing", 12))

    Dim showRuler As String, showLabels As String, hatchEnabled As String, legendEnabled As String, showCenterline As String
    Dim smartNozzleLabels As String, showTitleBlock As String, showWeldLabels As String
    Dim showCoverage As String, coverageLocation As String, coverageText As String
    Dim legendTotalScansText As String, legendOrientationText As String, legendOverlayText As String
    showRuler = UCase(CStr(GetSettingValue("Show Rulers", GetSettingValue("Show Ruler", "YES"))))
    showLabels = UCase(CStr(GetSettingValue("Show Direction Labels", "YES")))
    hatchEnabled = UCase(CStr(GetSettingValue("AUT Hatch Enabled", "YES")))
    legendEnabled = UCase(CStr(GetSettingValue("Legend Enabled", "YES")))
    showCenterline = UCase(CStr(GetSettingValue("Show Centerline", "YES")))
    smartNozzleLabels = UCase(CStr(GetSettingValue("Smart Nozzle Labels", "YES")))
    showTitleBlock = UCase(CStr(GetSettingValue("Show Title Block", "NO")))
    showWeldLabels = UCase(CStr(GetSettingValue("Show Weld Labels", "YES")))
    showCoverage = UCase(Trim(CStr(GetSettingValue("Show Coverage Percentage", "YES"))))
    coverageLocation = UCase(Trim(CStr(GetSettingValue("Coverage Location", "Legend"))))
    If coverageLocation = "" Then coverageLocation = "LEGEND"
    coverageText = CoverageDisplayText(wsScan, vesselLength, vesselHeight)
    If showCoverage = "NO" Then coverageText = ""
    legendTotalScansText = TotalScansDisplayText(wsScan)
    legendOrientationText = LegendOrientationDisplayText(orientation)
    legendOverlayText = LegendOverlayDisplayText(False)

    Dim xCard As String, yCard As String
    xCard = AxisDirectionText("X Axis Cardinal Direction", "X Axis Direction Text")
    yCard = AxisDirectionText("Y Axis Cardinal Direction", "Y Axis Direction Text")

    Dim headMode As String, headSize As String, showHeadNozzles As String
    Dim head1Label As String, head2Label As String, headLeaderLen As Double
    Dim showHeadCenterlines As String, showHeadClockRef As String
    headMode = UCase(Trim(CStr(GetSettingValue("Head View Mode", "NONE"))))
    headSize = UCase(Trim(CStr(GetSettingValue("Head View Size", "SMALL"))))
    showHeadNozzles = UCase(Trim(CStr(GetSettingValue("Show Head Nozzles", "YES"))))
    showHeadCenterlines = UCase(Trim(CStr(GetSettingValue("Show Head Centerlines", "NO"))))
    showHeadClockRef = UCase(Trim(CStr(GetSettingValue("Show Head Clock References", GetSettingValue("Show Head Clock Reference", "NO")))))
    head1Label = UCase(Trim(CStr(GetSettingValue("Head 1 Label", "HEAD 1"))))
    head2Label = UCase(Trim(CStr(GetSettingValue("Head 2 Label", "HEAD 2"))))
    headLeaderLen = CDbl(GetSettingValue("Head Nozzle Leader Length", 8))
    If headMode = "" Then headMode = "NONE"
    If headSize = "" Then headSize = "SMALL"

    Dim hatchScale As Double, hatchAngle As Double
    hatchScale = CDbl(GetSettingValue("AUT Hatch Scale", 2.5))
    hatchAngle = CDbl(GetSettingValue("AUT Hatch Angle", 45))

    Dim arrowHead As Double, rulerOffset As Double, minNozzleDia As Double, nozzleLeaderLen As Double
    arrowHead = CDbl(GetSettingValue("Arrow Head Size", 3))
    rulerOffset = CDbl(GetSettingValue("Ruler Offset", 2))
    minNozzleDia = CDbl(GetSettingValue("Minimum Nozzle Inside Label Diameter", 8))
    nozzleLeaderLen = CDbl(GetSettingValue("Nozzle Leader Length", 6))

    Dim headDia As Double
    Dim head1X As Double, head1Y As Double, head2X As Double, head2Y As Double
    headDia = HeadViewDiameter(headSize, vesselHeight)

    Dim legendX As Double, legendY As Double
    Call ComputeLegendPosition(orientation, vesselHeight, vesselLength, headDia, legendX, legendY)
    Call ComputeHeadCenters(orientation, vesselHeight, vesselLength, headDia, headMode, head1X, head1Y, head2X, head2Y)

    Print #f, "(setq SL_ORIENTATION " & LispStr(orientation) & ")"
    Print #f, "(setq SL_SECTION_PREFIX ""SEC-"")"
    Print #f, "(setq SL_COVERAGE_TEXT " & LispStr(coverageText) & ")"
    Print #f, "(setq SL_COVERAGE_LOCATION " & LispStr(coverageLocation) & ")"
    Print #f, "(setq SL_LEGEND_TOTAL_SCANS_TEXT " & LispStr(legendTotalScansText) & ")"
    Print #f, "(setq SL_LEGEND_ORIENTATION_TEXT " & LispStr(legendOrientationText) & ")"
    Print #f, "(setq SL_LEGEND_OVERLAY_TEXT " & LispStr(legendOverlayText) & ")"
    Print #f, "(setq SL_HATCH_ENABLED " & LispStr(hatchEnabled) & ")"
    Print #f, "(setq SL_HATCH_SPACING " & LispNum(hatchScale) & ")"
    Print #f, "(setq SL_HATCH_ANGLE " & LispNum(hatchAngle) & ")"
    Print #f, "(setq SL_ARROW_HEAD " & LispNum(arrowHead) & ")"
    Print #f, "(setq SL_SMART_NOZZLES " & LispStr(smartNozzleLabels) & ")"
    Print #f, "(setq SL_MIN_NOZZLE_DIA " & LispNum(minNozzleDia) & ")"
    Print #f, "(setq SL_SHOW_HEAD_CENTERLINES " & LispStr(showHeadCenterlines) & ")"
    Print #f, "(setq SL_SHOW_HEAD_CLOCK_REF " & LispStr(showHeadClockRef) & ")"
    Print #f, "(setq SL_NOZZLE_LEADER_LEN " & LispNum(nozzleLeaderLen) & ")"
    Print #f, "(setq SL_HEAD_NOZZLE_LEADER_LEN " & LispNum(headLeaderLen) & ")"
    Print #f, "(setq SL_RULER_SPACING " & LispNum(spacing) & ")"
    Print #f, "(setq SL_RULER_OFFSET " & LispNum(rulerOffset) & ")"
    Print #f, "(setq SL_X_AXIS_LABEL " & LispStr(AxisLabel("X AXIS DIRECTION", xCard)) & ")"
    Print #f, "(setq SL_Y_AXIS_LABEL " & LispStr(AxisLabel("Y AXIS DIRECTION", yCard)) & ")"
    WriteSectionPageSettings f, "YES", "YES"
    Print #f, ""

    Print #f, "(defun c:SCANLAYOUT ( / vesselXLen vesselYLen spacing oldOsmode)"
    Print #f, "  ;; Prevent running object snaps from pulling generated geometry onto nearby corners."
    Print #f, "  (setq oldOsmode (getvar ""OSMODE""))"
    Print #f, "  (setvar ""OSMODE"" 0)"
    Print #f, "  (SL_SetupLayers)"
    Print #f, "  ;; Keep ordinary paper-space viewport borders out of PDF/JPG output."
    Print #f, "  ;; Section-report viewports use REPORT_VIEWPORT and remain printable."
    Print #f, "  (SL_SetupViewportLayers)"
    Print #f, "  (SL_AssignNormalViewportsToNonPlotLayer)"
    Print #f, "  (setvar ""UCSICON"" 0)"   ' Hide UCS icon (WCS workflow)
    Print #f, "  (setq vesselXLen " & LispNum(vesselHeight) & ")"
    Print #f, "  (setq vesselYLen " & LispNum(vesselLength) & ")"
    Print #f, "  (setq spacing " & LispNum(spacing) & ")"
    Print #f, ""
    Print #f, "  ;; Vessel border"
    Print #f, "  (setq SL_VESSEL_XLEN vesselXLen)"
    Print #f, "  (setq SL_VESSEL_YLEN vesselYLen)"
    Print #f, "  (setq SL_AVOID_RECTS nil)"
    Print #f, "  (SL_Rect 0.0 0.0 vesselXLen vesselYLen ""VESSEL"")"
    If showCenterline = "YES" Then
        Print #f, "  ;; Optional vessel centerline: long dash, runs with Y axis at vessel midpoint"
        Print #f, "  (SL_Centerline vesselXLen vesselYLen)"
    End If
    Print #f, ""
    Print #f, "  ;; AUT scan rectangles"

    Dim lastRow As Long, r As Long
    lastRow = wsScan.Cells(wsScan.Rows.count, "A").End(xlUp).Row
    For r = 3 To lastRow
        If Trim(CStr(wsScan.Cells(r, "A").value)) <> "" Then
            If UCase(Trim(CStr(wsScan.Cells(r, "L").value))) <> "NO" Then
                Dim sName As String
                Dim xs As Double, ys As Double, w As Double, h As Double
                sName = Trim(CStr(wsScan.Cells(r, "A").value))
                xs = CDbl(wsScan.Cells(r, "B").value)
                ys = CDbl(wsScan.Cells(r, "D").value)
                w = CDbl(wsScan.Cells(r, "F").value)
                h = CDbl(wsScan.Cells(r, "G").value)
                Print #f, "  (SL_LabelRect " & LispNum(xs) & " " & LispNum(ys) & " " & LispNum(w) & " " & LispNum(h) & " " & LispStr(sName) & " ""SCANS"" ""AUT_HATCH"")"
                Print #f, "  (SL_AddAvoidRect " & LispNum(xs) & " " & LispNum(ys) & " " & LispNum(w) & " " & LispNum(h) & ")"
            End If
        End If
    Next r

    Print #f, ""
    Print #f, "  ;; Supports / structures - purple"
    ' Supports and objects now read from Shell Features rows 49-68:
    ' A=Object ID, B=X Position, C=Y Position, D=Circ. Width, E=Length, F=Include.
    For r = 49 To 68
        If Trim(CStr(wsShell.Cells(r, "A").value)) <> "" Then
            If UCase(Trim(CStr(wsShell.Cells(r, "F").value))) <> "NO" Then
                Print #f, "  (SL_LabelRect " & LispNum(CDbl(wsShell.Cells(r, "B").value)) & " " & LispNum(CDbl(wsShell.Cells(r, "C").value)) & " " & LispNum(CDbl(wsShell.Cells(r, "D").value)) & " " & LispNum(CDbl(wsShell.Cells(r, "E").value)) & " " & LispStr(CStr(wsShell.Cells(r, "A").value)) & " ""SUPPORTS"" """")"
                Print #f, "  (SL_AddAvoidRect " & LispNum(CDbl(wsShell.Cells(r, "B").value)) & " " & LispNum(CDbl(wsShell.Cells(r, "C").value)) & " " & LispNum(CDbl(wsShell.Cells(r, "D").value)) & " " & LispNum(CDbl(wsShell.Cells(r, "E").value)) & ")"
            End If
        End If
    Next r

    Print #f, ""
    Print #f, "  ;; Nozzles / circles"
    PrintShellNozzleLispRows f

    Print #f, ""
    Print #f, "  ;; Shell MUT points - rows 71-90: A=MUT ID, B=X, C=Y, D=Min. T., E=Notes"
    For r = 71 To 90
        If Trim(CStr(wsShell.Cells(r, "A").value)) <> "" Then
            If IsNumeric(wsShell.Cells(r, "B").value) And IsNumeric(wsShell.Cells(r, "C").value) Then
                Print #f, "  (SL_MUTPoint " & LispNum(CDbl(wsShell.Cells(r, "B").value)) & " " & LispNum(CDbl(wsShell.Cells(r, "C").value)) & " " & LispStr(Trim(CStr(wsShell.Cells(r, "A").value))) & ")"
            End If
        End If
    Next r

    Print #f, ""
    Print #f, "  ;; Weld placement - white dashed"
    Dim wID As String, wType As String, wLabel As String
    Dim wLoc As Double, wStart As Double, wStop As Double

    ' Circumferential welds now read from Shell Features rows 3-12:
    ' A=Weld ID, B=Y Position, C=Include, D=Label.
    For r = 3 To 12
        If Trim(CStr(wsShell.Cells(r, "A").value)) <> "" Then
            If UCase(Trim(CStr(wsShell.Cells(r, "C").value))) <> "NO" Then
                wID = Trim(CStr(wsShell.Cells(r, "A").value))
                wLoc = CDbl(wsShell.Cells(r, "B").value)
                wStart = -1
                wStop = -1
                If showWeldLabels = "YES" And UCase(Trim(CStr(wsShell.Cells(r, "D").value))) = "YES" Then
                    wLabel = wID
                Else
                    wLabel = ""
                End If
                Print #f, "  (SL_CircWeld " & LispNum(wLoc) & " " & LispNum(wStart) & " " & LispNum(wStop) & " vesselXLen " & LispStr(wLabel) & ")"
            End If
        End If
    Next r

    ' Long seams now read from Shell Features rows 15-24:
    ' A=Seam ID, B=X Position, C=Start Y, D=Stop Y, E=Include, F=Label.
    For r = 15 To 24
        If Trim(CStr(wsShell.Cells(r, "A").value)) <> "" Then
            If UCase(Trim(CStr(wsShell.Cells(r, "E").value))) <> "NO" Then
                wID = Trim(CStr(wsShell.Cells(r, "A").value))
                wLoc = CDbl(wsShell.Cells(r, "B").value)
                If Trim(CStr(wsShell.Cells(r, "C").value)) = "" Then wStart = -1 Else wStart = CDbl(wsShell.Cells(r, "C").value)
                If Trim(CStr(wsShell.Cells(r, "D").value)) = "" Then wStop = -1 Else wStop = CDbl(wsShell.Cells(r, "D").value)
                If showWeldLabels = "YES" And UCase(Trim(CStr(wsShell.Cells(r, "F").value))) = "YES" Then wLabel = wID Else wLabel = ""
                Print #f, "  (SL_LongSeam " & LispNum(wLoc) & " " & LispNum(wStart) & " " & LispNum(wStop) & " vesselYLen " & LispStr(wLabel) & ")"
            End If
        End If
    Next r

    Print #f, ""
    If showRuler = "YES" Then
        Print #f, "  ;; Rulers and direction arrows"
        PrintVisualBottomLeftRulers f, orientation, rulerOffset, AxisLabel("X AXIS DIRECTION", xCard), AxisLabel("Y AXIS DIRECTION", yCard)
    End If

    Print #f, ""
    Print #f, "  ;; Optional vessel reference indicators"
    PrintVesselReferenceLabels f, orientation, vesselHeight, vesselLength

    If headMode <> "NONE" Then
        Print #f, ""
        Print #f, "  ;; Optional head views - Version 3.0A"
        If ShouldShowHead(headMode, "HEAD 1") Then
            Print #f, "  (SL_HeadView " & LispNum(head1X) & " " & LispNum(head1Y) & " " & LispNum(headDia) & " " & LispStr(head1Label) & ")"
        End If
        If ShouldShowHead(headMode, "HEAD 2") Then
            Print #f, "  (SL_HeadView " & LispNum(head2X) & " " & LispNum(head2Y) & " " & LispNum(headDia) & " " & LispStr(head2Label) & ")"
        End If

        If showHeadNozzles = "YES" Then
            Print #f, ""
            Print #f, "  ;; Head nozzles - clock position references nozzle centerline penetration point"
            Dim hr As Long, hLastRow As Long
            hLastRow = HeadNozzleLastRow(wsHead)
            For hr = 4 To hLastRow
                If Trim(CStr(wsHead.Cells(hr, "A").value)) <> "" Then
                    If UCase(Trim(CStr(wsHead.Cells(hr, "J").value))) <> "NO" Then
                        Dim hName As String, hNoz As String, hClock As String, hRadPos As String, hMode As String
                        Dim hDeg As Double, hFactor As Double, hDia As Double, hCX As Double, hCY As Double
                        hName = NormalizeHeadName(CStr(wsHead.Cells(hr, "A").value))
                        If ShouldShowHead(headMode, hName) Then
                            hNoz = Trim(CStr(wsHead.Cells(hr, "B").value))
                            hClock = Trim(CStr(wsHead.Cells(hr, "D").value))
                            hRadPos = UCase(Trim(CStr(wsHead.Cells(hr, "E").value)))
                            If hRadPos = "" Then hRadPos = "CENTER"
                            hFactor = RadiusFactor(hRadPos, wsHead.Cells(hr, "F").value)
                            hDeg = ClockPositionDegrees(hClock)
                            hDia = CDbl(wsHead.Cells(hr, "C").value)
                            hMode = UCase(Trim(CStr(wsHead.Cells(hr, "I").value)))
                            If hMode = "" Then hMode = "AUTO"
                            If hName = "HEAD 1" Then
                                hCX = head1X: hCY = head1Y
                            Else
                                hCX = head2X: hCY = head2Y
                            End If
                            Print #f, "  (SL_HeadNozzle " & LispNum(hCX) & " " & LispNum(hCY) & " " & LispNum(headDia) & " " & LispNum(hDeg) & " " & LispNum(hFactor) & " " & LispNum(hDia) & " " & LispStr(hNoz) & " " & LispStr(hMode) & " ""HEADS"")"
                        End If
                    End If
                End If
            Next hr
        End If

        Dim hmRow As Long, hmFirstRow As Long, hmLastRow As Long
        hmFirstRow = HeadMUTFirstDataRow(wsHead)
        If hmFirstRow > 0 Then
            hmLastRow = wsHead.Cells(wsHead.Rows.count, "A").End(xlUp).Row
            Print #f, ""
            Print #f, "  ;; Head MUT points - MUT ID text at clock/radius position"
            For hmRow = hmFirstRow To hmLastRow
                If Trim(CStr(wsHead.Cells(hmRow, "A").value)) <> "" And Trim(CStr(wsHead.Cells(hmRow, "B").value)) <> "" Then
                    If UCase(Trim(CStr(wsHead.Cells(hmRow, "H").value))) <> "NO" Then
                        Dim hmHead As String, hmID As String, hmClock As String, hmRadPos As String
                        Dim hmDeg As Double, hmFactor As Double, hmCX As Double, hmCY As Double
                        hmHead = NormalizeHeadName(CStr(wsHead.Cells(hmRow, "A").value))
                        If ShouldShowHead(headMode, hmHead) Then
                            hmID = Trim(CStr(wsHead.Cells(hmRow, "B").value))
                            hmClock = Trim(CStr(wsHead.Cells(hmRow, "C").value))
                            hmRadPos = UCase(Trim(CStr(wsHead.Cells(hmRow, "D").value)))
                            If hmRadPos = "" Then hmRadPos = "CENTER"
                            hmFactor = RadiusFactor(hmRadPos, wsHead.Cells(hmRow, "E").value)
                            hmDeg = ClockPositionDegrees(hmClock)
                            If hmHead = "HEAD 1" Then
                                hmCX = head1X: hmCY = head1Y
                            Else
                                hmCX = head2X: hmCY = head2Y
                            End If
                            Print #f, "  (SL_HeadMUT " & LispNum(hmCX) & " " & LispNum(hmCY) & " " & LispNum(headDia) & " " & LispNum(hmDeg) & " " & LispNum(hmFactor) & " " & LispStr(hmID) & " ""MUT_TEXT"")"
                        End If
                    End If
                End If
            Next hmRow
        End If
    End If

    If legendEnabled = "YES" Then
        Print #f, ""
        Print #f, "  ;; Legend"
        Print #f, "  (SL_Legend " & LispNum(legendX) & " " & LispNum(legendY) & ")"
    End If

    If showTitleBlock = "YES" Then
        Print #f, ""
        Print #f, "  ;; Title block - auto-placed as a right-side information panel under the legend"
        Print #f, "  (SL_TitleBlock " & LispNum(TitleBlockX(orientation, legendX, legendY, vesselHeight, vesselLength, headDia)) & " " & LispNum(TitleBlockY(orientation, legendX, legendY, vesselHeight, vesselLength, headDia)) & " " & _
            LispStr(GetDrawingInfoValue("Drawing Title", "AUT COVERAGE MAP")) & " " & _
            LispStr("COMPONENT: " & GetDrawingInfoValue("Component", "")) & " " & _
            LispStr("UNIT: " & GetDrawingInfoValue("Unit", "")) & " " & _
            LispStr("CLIENT: " & GetDrawingInfoValue("Client", "")) & " " & _
            LispStr("INSPECTOR: " & GetDrawingInfoValue("Inspector", "")) & " " & _
            LispStr("DATE: " & GetDrawingInfoValue("Date", "")) & " " & _
            LispStr("REV: " & GetDrawingInfoValue("Revision", "")) & ")"
    End If

    Print #f, ""
    Print #f, "  (command ""ZOOM"" ""E"")"
    Print #f, "  (setvar ""OSMODE"" oldOsmode)"
    Print #f, "  (princ ""\nSCANLAYOUT complete."")"
    Print #f, "  (princ)"
    Print #f, ")"
    Print #f, "(princ ""\nAxisBuilder v4.7.28 loaded. Type AXISBUILDER."")"
    Print #f, "(princ)"

    Close #f

    WriteUtilityMessage "SCAN LAYOUT GENERATED" & vbCrLf & vbCrLf & _
                        CADPlatformDisplayName() & " LSP:" & vbCrLf & CStr(filePath), "SUCCESS"
    WriteValidationWarningsToMessageCenter "Scan Layout"
    MsgBox CADPlatformDisplayName() & " LSP exported successfully:" & vbCrLf & CStr(filePath), vbInformation, "AxisBuilder"
    ShowValidationSummaryIfEnabled "Scan Layout"
End Sub


'============================================================
' Phase 1A Validation - fatal checks before generation
'============================================================
Private Function ValidatePhase1A(ByVal wsScan As Worksheet, ByVal requireImages As Boolean, Optional ByVal imageFolder As String = "", Optional ByVal wsImg As Worksheet = Nothing) As Boolean
    Dim errors As String
    Dim scanCount As Long
    Dim missingImageCount As Long
    Dim imagesFoundCount As Long

    errors = ""
    scanCount = 0
    missingImageCount = 0
    imagesFoundCount = 0

    'Auto-correct reversed coordinate ranges before width/height validation.
    'This protects layout and overlay generation when X Start/Stop or Y Start/Stop are entered backwards.
    NormalizeScanCoordinateRanges wsScan

    If Not IsPositiveNumber(GetSettingValue("Vessel Length", "")) Then
        errors = errors & "- Vessel Length must be greater than 0." & vbCrLf
    End If

    If Not IsPositiveNumber(GetSettingValue("Vessel Height", "")) Then
        errors = errors & "- Vessel Height must be greater than 0." & vbCrLf
    End If

    If requireImages Then
        imageFolder = Trim(CStr(imageFolder))
        If imageFolder = "" Then
            errors = errors & "- Original Image Folder is missing." & vbCrLf
        ElseIf Not FolderExists(imageFolder) Then
            errors = errors & "- Original Image Folder was not found: " & imageFolder & vbCrLf
        End If
    End If

    Dim lastRow As Long, r As Long
    lastRow = LastScanDataRow(wsScan)
    If lastRow < 3 Then lastRow = 3

    For r = 3 To lastRow
        Dim scanName As String
        scanName = Trim(CStr(wsScan.Cells(r, "A").value))

        If ScanRowHasData(wsScan, r) Then
            If scanName = "" Then
                errors = errors & "- Scan Import row " & r & " has data but no Scan Name." & vbCrLf
            Else
                scanCount = scanCount + 1

                If Not IsPositiveNumber(wsScan.Cells(r, "F").value) Then
                    errors = errors & "- " & scanName & " width must be greater than 0." & vbCrLf
                End If

                If Not IsPositiveNumber(wsScan.Cells(r, "G").value) Then
                    errors = errors & "- " & scanName & " height must be greater than 0." & vbCrLf
                End If


                If requireImages And FolderExists(imageFolder) Then
                    Dim imageName As String, imgPath As String
                    imageName = ImageNameForScan(wsImg, scanName)
                    If imageName = "" Then imageName = DefaultImageName(scanName)
                    imgPath = ResolveSourceImagePath(imageFolder, imageName)
                    If imgPath = "" Then
                        missingImageCount = missingImageCount + 1
                        errors = errors & "- Image not found for " & scanName & ": " & imageName & " (.png/.jpg/.jpeg)" & vbCrLf
                    Else
                        imagesFoundCount = imagesFoundCount + 1
                    End If
                End If
            End If
        End If
    Next r

    If scanCount = 0 Then
        errors = errors & "- No scans found on the Scan Import sheet." & vbCrLf
    End If

    gValidationScansProcessed = scanCount
    gValidationImagesFound = imagesFoundCount
    gValidationImagesMissing = missingImageCount
    gValidationErrors = gValidationErrors + CountReportItems(errors)

    If errors <> "" Then
        MsgBox "Phase 1A Validation Failed" & vbCrLf & vbCrLf & _
               "Fix the following items before generating:" & vbCrLf & vbCrLf & _
               errors, vbCritical, "Scan Layout Generator Validation"
        ValidatePhase1A = False
    Else
        ValidatePhase1A = True
    End If
End Function

Private Sub NormalizeScanCoordinateRanges(ByVal wsScan As Worksheet)
    On Error GoTo SafeExit

    Dim lastRow As Long, r As Long
    Dim corrections As Long
    Dim tmp As Variant
    Dim scanName As String
    Dim oldStart As Variant, oldStop As Variant

    lastRow = LastScanDataRow(wsScan)
    If lastRow < 3 Then Exit Sub

    For r = 3 To lastRow
        If ScanRowHasData(wsScan, r) Then
            scanName = Trim$(CStr(wsScan.Cells(r, "A").value))
            If scanName = "" Then scanName = "Scan Import row " & CStr(r)

            'Scan Import columns:
            'B = X Start, C = X Stop, D = Y Start, E = Y Stop
            If IsNumeric(wsScan.Cells(r, "B").value) And IsNumeric(wsScan.Cells(r, "C").value) Then
                If CDbl(wsScan.Cells(r, "B").value) > CDbl(wsScan.Cells(r, "C").value) Then
                    oldStart = wsScan.Cells(r, "B").value
                    oldStop = wsScan.Cells(r, "C").value
                    tmp = wsScan.Cells(r, "B").value
                    wsScan.Cells(r, "B").value = wsScan.Cells(r, "C").value
                    wsScan.Cells(r, "C").value = tmp
                    corrections = corrections + 1
                    AddValidationWarningDetail scanName & " X Start/Stop reversed: " & _
                                               CStr(oldStart) & " / " & CStr(oldStop) & _
                                               " -> " & CStr(oldStop) & " / " & CStr(oldStart)
                End If
            End If

            If IsNumeric(wsScan.Cells(r, "D").value) And IsNumeric(wsScan.Cells(r, "E").value) Then
                If CDbl(wsScan.Cells(r, "D").value) > CDbl(wsScan.Cells(r, "E").value) Then
                    oldStart = wsScan.Cells(r, "D").value
                    oldStop = wsScan.Cells(r, "E").value
                    tmp = wsScan.Cells(r, "D").value
                    wsScan.Cells(r, "D").value = wsScan.Cells(r, "E").value
                    wsScan.Cells(r, "E").value = tmp
                    corrections = corrections + 1
                    AddValidationWarningDetail scanName & " Y Start/Stop reversed: " & _
                                               CStr(oldStart) & " / " & CStr(oldStop) & _
                                               " -> " & CStr(oldStop) & " / " & CStr(oldStart)
                End If
            End If
        End If
    Next r

    If corrections > 0 Then
        gValidationCoordinateCorrections = gValidationCoordinateCorrections + corrections
        gValidationWarnings = gValidationWarnings + corrections
        Application.Calculate
    End If

SafeExit:
End Sub

Private Function LastScanDataRow(ByVal ws As Worksheet) As Long
    Dim c As Long, lr As Long, maxRow As Long
    maxRow = 3
    For c = 1 To 7
        lr = ws.Cells(ws.Rows.count, c).End(xlUp).Row
        If lr > maxRow Then maxRow = lr
    Next c
    LastScanDataRow = maxRow
End Function

Private Function ScanRowHasData(ByVal ws As Worksheet, ByVal rowNum As Long) As Boolean
    Dim c As Long
    For c = 1 To 7
        If Trim(CStr(ws.Cells(rowNum, c).value)) <> "" Then
            If c = 6 Or c = 7 Then
                If IsNumeric(ws.Cells(rowNum, c).value) Then
                    If CDbl(ws.Cells(rowNum, c).value) <> 0 Then
                        ScanRowHasData = True
                        Exit Function
                    End If
                Else
                    ScanRowHasData = True
                    Exit Function
                End If
            Else
                ScanRowHasData = True
                Exit Function
            End If
        End If
    Next c
    ScanRowHasData = False
End Function

Private Function IsPositiveNumber(ByVal valueToCheck As Variant) As Boolean
    On Error GoTo Fail
    If IsError(valueToCheck) Then GoTo Fail
    If Trim(CStr(valueToCheck)) = "" Then GoTo Fail
    If Not IsNumeric(valueToCheck) Then GoTo Fail
    IsPositiveNumber = (CDbl(valueToCheck) > 0)
    Exit Function
Fail:
    IsPositiveNumber = False
End Function

Private Function FolderExists(ByVal folderPath As String) As Boolean
    On Error GoTo Fail
    folderPath = Trim(CStr(folderPath))
    If folderPath = "" Then GoTo Fail
    FolderExists = ((GetAttr(folderPath) And vbDirectory) = vbDirectory)
    Exit Function
Fail:
    FolderExists = False
End Function

Private Function ImageNameForScan(ByVal wsImg As Worksheet, ByVal scanName As String) As String
    On Error GoTo Fail
    If wsImg Is Nothing Then GoTo Fail

    Dim r As Long, lastRow As Long
    lastRow = wsImg.Cells(wsImg.Rows.count, "A").End(xlUp).Row
    For r = 3 To lastRow
        If UCase(Trim(CStr(wsImg.Cells(r, "A").value))) = UCase(Trim(scanName)) Then
            ImageNameForScan = Trim(CStr(wsImg.Cells(r, "B").value))
            Exit Function
        End If
    Next r
Fail:
    If ImageNameForScan = "" Then ImageNameForScan = ""
End Function

'============================================================
' Phase 1B Validation - overlap detection with user override
'============================================================
Private Function ValidatePhase1B(ByVal wsScan As Worksheet) As Boolean
    On Error GoTo SafeFail

    Dim overlapMode As String
    overlapMode = UCase(Trim(CStr(GetSettingValue("Overlap Detection", "WARN"))))
    If overlapMode = "" Then overlapMode = "WARN"

    If overlapMode = "OFF" Then
        ValidatePhase1B = True
        Exit Function
    End If

    Dim overlapReport As String
    overlapReport = BuildScanOverlapReport(wsScan)

    If overlapReport = "" Then
        gValidationOverlapsDetected = 0
        ValidatePhase1B = True
        Exit Function
    End If

    If overlapMode = "BLOCK" Then
        gValidationErrors = gValidationErrors + IIf(gValidationOverlapsDetected > 0, gValidationOverlapsDetected, 1)
        MsgBox "Phase 1B Validation Failed" & vbCrLf & vbCrLf & _
               "Scan overlap detected and Overlap Detection is set to BLOCK." & vbCrLf & vbCrLf & _
               overlapReport, vbCritical, "Scan Layout Generator Validation"
        ValidatePhase1B = False
        Exit Function
    End If

    gValidationWarnings = gValidationWarnings + IIf(gValidationOverlapsDetected > 0, gValidationOverlapsDetected, 1)
    AddValidationWarningDetail "Scan overlap detected:" & vbCrLf & overlapReport

    Dim response As VbMsgBoxResult
    response = MsgBox("Phase 1B Validation Warning" & vbCrLf & vbCrLf & _
                      "Scan overlap detected." & vbCrLf & _
                      "This may be intentional for rescans, additional coverage, or verification scans." & vbCrLf & vbCrLf & _
                      overlapReport & vbCrLf & _
                      "Continue generating?", _
                      vbExclamation + vbYesNo, "Scan Layout Generator Validation")

    ValidatePhase1B = (response = vbYes)
    Exit Function

SafeFail:
    MsgBox "Phase 1B Validation Error" & vbCrLf & vbCrLf & _
           "Overlap validation could not be completed." & vbCrLf & _
           "Generation was stopped so the scan data can be checked." & vbCrLf & vbCrLf & _
           "Details: " & Err.description, vbCritical, "Scan Layout Generator Validation"
    ValidatePhase1B = False
End Function

Private Function BuildScanOverlapReport(ByVal wsScan As Worksheet) As String
    Dim names() As String
    Dim xs() As Double, ys() As Double, ws() As Double, hs() As Double
    Dim count As Long, lastRow As Long, r As Long

    count = 0
    lastRow = LastScanDataRow(wsScan)

    For r = 3 To lastRow
        If ScanRowHasData(wsScan, r) Then
            If UCase(Trim(CStr(wsScan.Cells(r, "L").value))) <> "NO" Then
                If Trim(CStr(wsScan.Cells(r, "A").value)) <> "" _
                   And IsNumeric(wsScan.Cells(r, "B").value) _
                   And IsNumeric(wsScan.Cells(r, "D").value) _
                   And IsPositiveNumber(wsScan.Cells(r, "F").value) _
                   And IsPositiveNumber(wsScan.Cells(r, "G").value) Then

                    count = count + 1
                    ReDim Preserve names(1 To count)
                    ReDim Preserve xs(1 To count)
                    ReDim Preserve ys(1 To count)
                    ReDim Preserve ws(1 To count)
                    ReDim Preserve hs(1 To count)

                    names(count) = Trim(CStr(wsScan.Cells(r, "A").value))
                    xs(count) = CDbl(wsScan.Cells(r, "B").value)
                    ys(count) = CDbl(wsScan.Cells(r, "D").value)
                    ws(count) = CDbl(wsScan.Cells(r, "F").value)
                    hs(count) = CDbl(wsScan.Cells(r, "G").value)
                End If
            End If
        End If
    Next r

    If count < 2 Then
        BuildScanOverlapReport = ""
        Exit Function
    End If

    Dim i As Long, j As Long
    Dim overlapArea As Double
    Dim report As String
    Dim pairCount As Long
    report = ""
    pairCount = 0

    For i = 1 To count - 1
        For j = i + 1 To count
            overlapArea = RectOverlapArea(xs(i), ys(i), ws(i), hs(i), xs(j), ys(j), ws(j), hs(j))
            If overlapArea > 0 Then
                pairCount = pairCount + 1
                If pairCount <= 20 Then
                    report = report & "- " & names(i) & " overlaps " & names(j) & _
                             " | Area: " & Format(overlapArea, "0.00") & " sq in" & vbCrLf
                End If
            End If
        Next j
    Next i

    If pairCount > 20 Then
        report = report & "- Additional overlaps not listed: " & CStr(pairCount - 20) & vbCrLf
    End If

    gValidationOverlapsDetected = pairCount

    If pairCount > 0 Then
        report = "Overlap Detection: " & CStr(pairCount) & " overlap pair(s) found." & vbCrLf & vbCrLf & report
    End If

    BuildScanOverlapReport = report
End Function

Private Function RectOverlapArea(ByVal x1 As Double, ByVal y1 As Double, ByVal w1 As Double, ByVal h1 As Double, _
                                 ByVal x2 As Double, ByVal y2 As Double, ByVal w2 As Double, ByVal h2 As Double) As Double
    Dim leftEdge As Double, rightEdge As Double
    Dim bottomEdge As Double, topEdge As Double
    Dim ow As Double, oh As Double

    leftEdge = MaxD(x1, x2)
    rightEdge = MinD(x1 + w1, x2 + w2)
    bottomEdge = MaxD(y1, y2)
    topEdge = MinD(y1 + h1, y2 + h2)

    ow = rightEdge - leftEdge
    oh = topEdge - bottomEdge

    If ow > 0 And oh > 0 Then
        RectOverlapArea = ow * oh
    Else
        RectOverlapArea = 0
    End If
End Function

Private Function MinD(ByVal a As Double, ByVal b As Double) As Double
    If a < b Then MinD = a Else MinD = b
End Function

Private Function MaxD(ByVal a As Double, ByVal b As Double) As Double
    If a > b Then MaxD = a Else MaxD = b
End Function

Private Function CoverageDisplayText(ByVal wsScan As Worksheet, ByVal vesselLength As Double, ByVal vesselHeight As Double) As String
    Dim pct As Double
    pct = ComputeCoveragePercent(wsScan, vesselLength, vesselHeight)
    If pct < 0 Then
        CoverageDisplayText = ""
    Else
        CoverageDisplayText = "Coverage: " & Format(pct, "0.0") & "%"
    End If
End Function

Private Function TotalScansDisplayText(ByVal wsScan As Worksheet) As String
    TotalScansDisplayText = "Total Scans: " & CStr(CountEnabledScans(wsScan))
End Function

Private Function CountEnabledScans(ByVal wsScan As Worksheet) As Long
    On Error GoTo SafeExit

    Dim lastRow As Long, r As Long
    lastRow = LastScanDataRow(wsScan)

    For r = 3 To lastRow
        If Trim(CStr(wsScan.Cells(r, "A").value)) <> "" Then
            If UCase(Trim(CStr(wsScan.Cells(r, "L").value))) <> "NO" Then
                If IsPositiveNumber(wsScan.Cells(r, "F").value) And IsPositiveNumber(wsScan.Cells(r, "G").value) Then
                    CountEnabledScans = CountEnabledScans + 1
                End If
            End If
        End If
    Next r

SafeExit:
End Function

Private Function NormalizeVesselOrientation(ByVal rawOrientation As String) As String
    'Accept both workbook dropdown wording and field-form/OCR wording.
    'All downstream VBA and generated AutoLISP require these exact canonical values.
    Dim key As String
    key = UCase$(Trim$(rawOrientation))
    key = Replace(key, "_", " ")
    key = Replace(key, "-", " ")
    Do While InStr(key, "  ") > 0
        key = Replace(key, "  ", " ")
    Loop

    Select Case key
        Case "VERTICAL", "VERTICAL VESSEL"
            NormalizeVesselOrientation = "Vertical"
        Case "HORIZONTAL CW", "CW HORIZONTAL", "HORIZONTAL CLOCKWISE", "CLOCKWISE HORIZONTAL"
            NormalizeVesselOrientation = "Horizontal CW"
        Case "HORIZONTAL CCW", "CCW HORIZONTAL", "HORIZONTAL COUNTERCLOCKWISE", _
             "COUNTERCLOCKWISE HORIZONTAL", "HORIZONTAL COUNTER CLOCKWISE", "COUNTER CLOCKWISE HORIZONTAL"
            NormalizeVesselOrientation = "Horizontal CCW"
        Case Else
            NormalizeVesselOrientation = Trim$(rawOrientation)
    End Select
End Function

Private Function LegendOrientationDisplayText(ByVal orientation As String) As String
    If UCase(Trim(CStr(orientation))) = "VERTICAL" Then
        LegendOrientationDisplayText = "Orientation: Vertical"
    Else
        LegendOrientationDisplayText = "Orientation: Horizontal"
    End If
End Function

Private Function LegendOverlayDisplayText(Optional ByVal isOverlayOutput As Boolean = False) As String
    'Normal scan layout output does not contain overlay images.
    'Overlay output does contain overlay images once Generate Scan Overlay is used.
    If isOverlayOutput Then
        LegendOverlayDisplayText = "Overlay: Enabled"
    Else
        LegendOverlayDisplayText = "Overlay: Disabled"
    End If
End Function

Private Function ComputeCoveragePercent(ByVal wsScan As Worksheet, ByVal vesselLength As Double, ByVal vesselHeight As Double) As Double
    On Error GoTo Fail

    Dim vesselArea As Double
    vesselArea = vesselLength * vesselHeight
    If vesselArea <= 0 Then GoTo Fail

    Dim lastRow As Long, r As Long
    Dim scanArea As Double
    Dim w As Double, h As Double

    lastRow = LastScanDataRow(wsScan)
    scanArea = 0

    For r = 3 To lastRow
        If Trim(CStr(wsScan.Cells(r, "A").value)) <> "" Then
            If UCase(Trim(CStr(wsScan.Cells(r, "L").value))) <> "NO" Then
                If IsPositiveNumber(wsScan.Cells(r, "F").value) And IsPositiveNumber(wsScan.Cells(r, "G").value) Then
                    w = CDbl(wsScan.Cells(r, "F").value)
                    h = CDbl(wsScan.Cells(r, "G").value)
                    scanArea = scanArea + (w * h)
                End If
            End If
        End If
    Next r

    ComputeCoveragePercent = (scanArea / vesselArea) * 100
    Exit Function

Fail:
    ComputeCoveragePercent = -1
End Function

Private Sub ResetValidationSummaryStats(ByVal requireImages As Boolean)
    gValidationScansProcessed = 0
    gValidationImagesFound = 0
    gValidationImagesMissing = 0
    gValidationOverlapsDetected = 0
    gValidationErrors = 0
    gValidationWarnings = 0
    gValidationCoordinateCorrections = 0
    gValidationRequiresImages = requireImages
    gValidationWarningDetails = ""
End Sub

Private Sub AddValidationWarningDetail(ByVal detailText As String)
    detailText = Trim$(detailText)
    If detailText = "" Then Exit Sub

    If gValidationWarningDetails <> "" Then
        gValidationWarningDetails = gValidationWarningDetails & vbCrLf
    End If
    gValidationWarningDetails = gValidationWarningDetails & "- " & detailText
End Sub

Private Sub WriteValidationWarningsToMessageCenter(ByVal outputName As String)
    If gValidationWarnings <= 0 Then Exit Sub

    Dim msg As String
    msg = "GENERATION COMPLETED WITH WARNINGS" & vbCrLf & vbCrLf & _
          "Output: " & outputName & vbCrLf & _
          "Warnings: " & CStr(gValidationWarnings)

    If gValidationWarningDetails <> "" Then
        msg = msg & vbCrLf & vbCrLf & "Details:" & vbCrLf & gValidationWarningDetails
    End If

    MC_AppendMessage msg, "WARNING"
End Sub

Private Function ValidationEnabled() As Boolean
    Dim settingValue As String
    settingValue = UCase(Trim(CStr(GetSettingValue("Enable Validation", "YES"))))
    ValidationEnabled = (settingValue <> "NO")
End Function

Private Function ShowValidationSummaryEnabled() As Boolean
    Dim settingValue As String
    settingValue = UCase(Trim(CStr(GetSettingValue("Show Validation Summary", "YES"))))
    ShowValidationSummaryEnabled = (settingValue <> "NO")
End Function

Private Sub UpdateBasicValidationScanCount(ByVal wsScan As Worksheet)
    Dim r As Long, lastRow As Long, scanCount As Long
    lastRow = LastScanDataRow(wsScan)
    scanCount = 0
    For r = 3 To lastRow
        If ScanRowHasData(wsScan, r) Then
            If Trim(CStr(wsScan.Cells(r, "A").value)) <> "" Then scanCount = scanCount + 1
        End If
    Next r
    gValidationScansProcessed = scanCount
End Sub

Private Function CountReportItems(ByVal reportText As String) As Long
    Dim lines() As String, i As Long, n As Long
    If Len(Trim(reportText)) = 0 Then
        CountReportItems = 0
        Exit Function
    End If
    lines = Split(reportText, vbCrLf)
    n = 0
    For i = LBound(lines) To UBound(lines)
        If Left$(Trim(lines(i)), 2) = "- " Then n = n + 1
    Next i
    If n = 0 Then n = 1
    CountReportItems = n
End Function

Private Sub ShowValidationSummaryIfEnabled(ByVal outputName As String)
    If Not ShowValidationSummaryEnabled() Then Exit Sub

    Dim msg As String
    msg = "Validation Summary" & vbCrLf & vbCrLf
    msg = msg & "Output: " & outputName & vbCrLf
    msg = msg & "Validation: " & IIf(ValidationEnabled(), "Enabled", "Disabled") & vbCrLf
    msg = msg & "Scans Processed: " & CStr(gValidationScansProcessed) & vbCrLf

    If gValidationRequiresImages Then
        msg = msg & "Images Found: " & CStr(gValidationImagesFound) & vbCrLf
        msg = msg & "Images Missing: " & CStr(gValidationImagesMissing) & vbCrLf
    Else
        msg = msg & "Images Found: Not required for layout export" & vbCrLf
        msg = msg & "Images Missing: Not required for layout export" & vbCrLf
    End If

    msg = msg & "Overlaps Detected: " & CStr(gValidationOverlapsDetected) & vbCrLf
    msg = msg & "Coordinate Corrections: " & CStr(gValidationCoordinateCorrections) & vbCrLf
    msg = msg & "Errors: " & CStr(gValidationErrors) & vbCrLf
    msg = msg & "Warnings: " & CStr(gValidationWarnings)

    MsgBox msg, vbInformation, "Scan Layout Generator Validation"
End Sub

Private Function GetSettingValue(ByVal settingName As String, ByVal defaultValue As Variant) As Variant
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets("Project Settings")

    Dim f As Range
    Set f = ws.Columns("A").Find(What:=settingName, LookIn:=xlValues, LookAt:=xlWhole)
    If f Is Nothing Then Set f = FindSettingTrimmed(ws, settingName)

    If f Is Nothing Then
        GetSettingValue = defaultValue
    ElseIf Trim(CStr(f.Offset(0, 1).value)) = "" Then
        GetSettingValue = defaultValue
    Else
        GetSettingValue = f.Offset(0, 1).value
    End If
End Function

Private Function FindSettingTrimmed(ByVal ws As Worksheet, ByVal settingName As String) As Range
    'Fallback label match that ignores leading/trailing spaces (including non-breaking spaces) and case.
    Dim lastRow As Long, r As Long, target As String, cellText As String
    target = LCase$(Trim$(Replace(settingName, ChrW(160), " ")))
    lastRow = ws.Cells(ws.Rows.Count, "A").End(xlUp).Row
    For r = 1 To lastRow
        If Not IsError(ws.Cells(r, "A").Value) Then
            cellText = LCase$(Trim$(Replace(CStr(ws.Cells(r, "A").Value), ChrW(160), " ")))
            If cellText = target Then
                Set FindSettingTrimmed = ws.Cells(r, "A")
                Exit Function
            End If
        End If
    Next r
End Function

Private Function SelectedCADPlatform() As String
    Dim valueText As String
    valueText = UCase$(Trim$(CStr(GetSettingValue("CAD Platform", "DraftSight"))))
    If valueText = "AUTOCAD" Then
        SelectedCADPlatform = "AUTOCAD"
    Else
        SelectedCADPlatform = "DRAFTSIGHT"
    End If
End Function

Private Function IsAutoCADOutput() As Boolean
    If gCADPlatformOutput = "" Then gCADPlatformOutput = SelectedCADPlatform()
    IsAutoCADOutput = (gCADPlatformOutput = "AUTOCAD")
End Function

Private Function CADPlatformDisplayName() As String
    If IsAutoCADOutput() Then
        CADPlatformDisplayName = "AutoCAD"
    Else
        CADPlatformDisplayName = "DraftSight"
    End If
End Function

Private Function ShowScanBordersOnOverlayValue() As String
    'Reads Project Settings -> Show Scan Borders On Overlay.
    'The setting label is expected in column A and the Yes/No value in column B.
    Dim v As String
    v = UCase(Trim(CStr(GetSettingValue("Show Scan Borders On Overlay", "NO"))))

    Select Case v
        Case "YES", "Y", "ON", "TRUE", "1", "SHOW", "VISIBLE"
            ShowScanBordersOnOverlayValue = "YES"
        Case Else
            ShowScanBordersOnOverlayValue = "NO"
    End Select
End Function

Private Function OverlayImageFrameValue(ByVal showScanBordersValue As String) As Long
    'Project Settings -> Show Scan Borders On Overlay drives DraftSight IMAGEFRAME.
    'YES = show image frames/borders.
    'NO  = hide image frames for seamless overlay.
    Dim v As String
    v = UCase(Trim(CStr(showScanBordersValue)))

    Select Case v
        Case "YES", "Y", "ON", "TRUE", "1", "SHOW", "VISIBLE"
            OverlayImageFrameValue = 1
        Case Else
            OverlayImageFrameValue = 0
    End Select
End Function


Private Function GetDrawingInfoValue(ByVal fieldName As String, ByVal defaultValue As String) As String
    On Error GoTo SafeDefault
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets("Drawing Information")

    Dim f As Range
    Set f = ws.Columns("A").Find(What:=fieldName, LookIn:=xlValues, LookAt:=xlWhole)

    If f Is Nothing Then
        GetDrawingInfoValue = defaultValue
    ElseIf Trim(CStr(f.Offset(0, 1).Text)) = "" Then
        GetDrawingInfoValue = defaultValue
    Else
        GetDrawingInfoValue = CStr(f.Offset(0, 1).Text)
    End If
    Exit Function
SafeDefault:
    GetDrawingInfoValue = defaultValue
End Function

Private Function AxisDirectionText(ByVal cardinalSetting As String, ByVal directionSetting As String) As String
    Dim directionText As String, legacyText As String, cardinalText As String
    directionText = UCase(Trim(CStr(GetSettingValue(directionSetting, ""))))
    cardinalText = UCase(Trim(CStr(GetSettingValue(cardinalSetting, ""))))

    'Backward compatibility with older v2.5.3 workbooks that used Custom Direction fields.
    If directionSetting = "X Axis Direction Text" Then
        legacyText = UCase(Trim(CStr(GetSettingValue("X Axis Custom Direction", ""))))
    ElseIf directionSetting = "Y Axis Direction Text" Then
        legacyText = UCase(Trim(CStr(GetSettingValue("Y Axis Custom Direction", ""))))
    Else
        legacyText = ""
    End If

    If directionText <> "" Then
        AxisDirectionText = directionText
    ElseIf legacyText <> "" Then
        AxisDirectionText = legacyText
    Else
        AxisDirectionText = cardinalText
    End If
End Function

Private Function AxisLabel(ByVal baseLabel As String, ByVal directionText As String) As String
    baseLabel = UCase(Trim(baseLabel))
    directionText = UCase(Trim(directionText))

    If directionText = "" Then
        AxisLabel = baseLabel
    Else
        AxisLabel = baseLabel & " " & directionText
    End If
End Function

Private Sub ReadCustomReferenceLabels(ByRef labels() As String)
    'Read the five custom values by their stable position in the reference block.
    'This avoids degree-symbol encoding problems when a BAS module is imported.
    Dim ws As Worksheet, anchor As Range, i As Long
    Set ws = ThisWorkbook.Worksheets("Project Settings")
    Set anchor = ws.Columns("A").Find(What:="Reference Label Mode", LookIn:=xlValues, LookAt:=xlWhole)

    If Not anchor Is Nothing Then
        'Rows after Mode are: Label Set, Tick Length, then 0/90/180/270/360.
        For i = 0 To 4
            labels(i) = CStr(anchor.Offset(3 + i, 1).value)
        Next i
    Else
        For i = 0 To 4
            labels(i) = ""
        Next i
    End If
End Sub


Private Sub PrintVesselReferenceLabels(ByVal f As Integer, ByVal orientation As String, ByVal vesselXLen As Double, ByVal vesselYLen As Double)
    'v4.6.2: Vessel reference labels are always cardinal positions on the VESSEL X-axis.
    '
    'Rules:
    '  - Uses the proven opposite-vessel-X-axis placement from v4.5.4/v4.5.5.
    '  - Draws possible cardinal positions at 0, 90, 180, 270, and 360 degrees.
    '  - Auto Cardinal uses the Reference Label Set defaults.
    '  - Custom Cardinal reads Project Settings labels; blank custom cells draw nothing.
    '  - LISP output uses SL_Line / SL_Text so the orientation transform is applied.
    Dim showRef As String, modeRef As String, setRef As String
    Dim labels(0 To 4) As String
    Dim placement As String, tickLen As Double
    Dim ori As String
    Dim textGap As Double, textH As Double

    showRef = UCase(Trim(CStr(GetSettingValue("Show Vessel Reference Labels", "NO"))))
    If showRef <> "YES" Then Exit Sub

    modeRef = UCase(Trim(CStr(GetSettingValue("Reference Label Mode", "AUTO CARDINAL"))))
    setRef = UCase(Trim(CStr(GetSettingValue("Reference Label Set", "TDC/BDC"))))
    tickLen = Val(GetSettingValue("Reference Label Tick Length", 3))
    If tickLen <= 0 Then tickLen = 3

    textGap = 1.25
    textH = 1.5

    Select Case modeRef
        Case "CUSTOM CARDINAL", "CUSTOM"
            ReadCustomReferenceLabels labels

        Case "NONE", "OFF", "NO"
            Exit Sub

        Case Else
            Select Case setRef
                Case "NDC/SDC", "NDC / SDC"
                    labels(0) = "N.D.C."
                    labels(1) = "E.D.C."
                    labels(2) = "S.D.C."
                    labels(3) = "W.D.C."
                    labels(4) = "N.D.C."

                Case "NAMEPLATE DC", "NAMEPLATE D.C.", "NAMEPLATE D.C", "NPDC"
                    labels(0) = "NAMEPLATE D.C."
                    labels(1) = "NP + 90" & ChrW(176)
                    labels(2) = "180" & ChrW(176) & " OPPOSITE"
                    labels(3) = "NP + 270" & ChrW(176)
                    labels(4) = "NAMEPLATE D.C."

                Case Else
                    labels(0) = "T.D.C."
                    labels(1) = "R.D.C."
                    labels(2) = "B.D.C."
                    labels(3) = "L.D.C."
                    labels(4) = "T.D.C."
            End Select
    End Select

    If Trim(labels(0)) = "" And Trim(labels(1)) = "" And Trim(labels(2)) = "" And Trim(labels(3)) = "" And Trim(labels(4)) = "" Then Exit Sub

    placement = UCase(Trim(CStr(GetSettingValue("Ruler Placement", "BOTTOM + LEFT"))))
    If placement = "" Then placement = "BOTTOM + LEFT"
    ori = UCase(Trim(CStr(orientation)))

    Print #f, "  ;; Vessel reference labels - v4.6.2 cardinal vessel X-axis references"

    Select Case ori
        Case "HORIZONTAL CW"
            'CW: vessel X-axis plots as the red vertical ruler.
            'If X-axis ruler is on the visual right, labels go to the opposite logical side.
            If InStr(placement, "RIGHT") > 0 Then
                Call PrintRefCardinalAlongVesselXAxis(f, labels, "0.0", vesselXLen, tickLen, textGap, textH, True)
            Else
                Call PrintRefCardinalAlongVesselXAxis(f, labels, "vesselYLen", vesselXLen, tickLen, textGap, textH, False)
            End If

        Case "HORIZONTAL CCW"
            'CCW: vessel X-axis also plots as a vertical ruler, but visual left/right is reversed by transform.
            If InStr(placement, "LEFT") > 0 Then
                Call PrintRefCardinalAlongVesselXAxis(f, labels, "0.0", vesselXLen, tickLen, textGap, textH, True)
            Else
                Call PrintRefCardinalAlongVesselXAxis(f, labels, "vesselYLen", vesselXLen, tickLen, textGap, textH, False)
            End If

        Case Else
            'Vertical: vessel X-axis is the horizontal ruler.
            'TOP x-axis ruler side -> labels below; BOTTOM x-axis ruler side -> labels above.
            If InStr(placement, "TOP") > 0 Then
                Call PrintRefCardinalAlongVesselXAxis(f, labels, "0.0", vesselXLen, tickLen, textGap, textH, True)
            Else
                Call PrintRefCardinalAlongVesselXAxis(f, labels, "vesselYLen", vesselXLen, tickLen, textGap, textH, False)
            End If
    End Select
End Sub

Private Sub PrintRefCardinalAlongVesselXAxis(ByVal f As Integer, ByRef labels() As String, _
    ByVal baseY As String, ByVal vesselXLen As Double, ByVal tickLen As Double, _
    ByVal textGap As Double, ByVal textH As Double, ByVal negativeOut As Boolean)
    'Logical X coordinate carries the vessel X-axis distance.
    'Logical Y controls the opposite side of the vessel X-axis ruler.
    'Blank labels are skipped completely: no tick and no text.
    Dim yTick As String, yText As String
    Dim posExpr(0 To 4) As String
    Dim i As Long

    If negativeOut Then
        yTick = "(- " & baseY & " " & LispNum(tickLen) & ")"
        yText = "(- " & baseY & " " & LispNum(tickLen + textGap) & ")"
    Else
        yTick = "(+ " & baseY & " " & LispNum(tickLen) & ")"
        yText = "(+ " & baseY & " " & LispNum(tickLen + textGap) & ")"
    End If

    posExpr(0) = "0.0"
    posExpr(1) = "(* vesselXLen 0.25)"
    posExpr(2) = "(/ vesselXLen 2.0)"
    posExpr(3) = "(* vesselXLen 0.75)"
    posExpr(4) = "vesselXLen"

    For i = 0 To 4
        If Trim(labels(i)) <> "" Then
            Print #f, "  (SL_Line " & posExpr(i) & " " & baseY & " " & posExpr(i) & " " & yTick & " ""X_AXIS"")"
            Print #f, "  (SL_Text " & posExpr(i) & " " & yText & " " & LispNum(textH) & " (SL_RulerTextRotX) " & LispStr(labels(i)) & " ""X_AXIS"")"
        End If
    Next i
End Sub

Private Sub PrintVisualBottomLeftRulers(ByVal f As Integer, ByVal orientation As String, ByVal rulerOffset As Double, ByVal xAxisLabel As String, ByVal yAxisLabel As String)
    'v4.4.9: Add missing right-side visual ruler placement.
    'Ruler Placement is now treated as VISUAL placement after orientation transform.
    'Validated left-side behavior from v4.4.8 is preserved.
    Dim placement As String
    Dim ori As String

    placement = UCase(Trim(CStr(GetSettingValue("Ruler Placement", "Bottom + Left"))))
    If placement = "" Then placement = "BOTTOM + LEFT"
    ori = UCase(Trim(CStr(orientation)))

    Select Case placement
        Case "NONE", "OFF", "NO"
            Exit Sub
    End Select

    Select Case ori
        Case "HORIZONTAL CW"
            Select Case placement
                Case "TOP"
                    Print #f, "  ;; Horizontal CW visual TOP ruler"
                    Print #f, "  (SL_RulerY (- 0.0 " & LispNum(rulerOffset) & ") 0.0 vesselYLen spacing ""Y_AXIS"" " & LispStr(yAxisLabel) & ")"
                Case "BOTTOM"
                    Print #f, "  ;; Horizontal CW visual BOTTOM ruler"
                    Print #f, "  (SL_RulerY_CW_Bottom (+ vesselXLen " & LispNum(rulerOffset) & ") 0.0 vesselYLen spacing ""Y_AXIS"" " & LispStr(yAxisLabel) & ")"
                Case "LEFT"
                    Print #f, "  ;; Horizontal CW visual LEFT ruler"
                    Print #f, "  (SL_RulerX_CW_Left 0.0 (- 0.0 " & LispNum(rulerOffset) & ") vesselXLen spacing ""X_AXIS"" " & LispStr(xAxisLabel) & ")"
                Case "RIGHT"
                    Print #f, "  ;; Horizontal CW visual RIGHT ruler"
                    Print #f, "  (SL_RulerX_Top 0.0 (+ vesselYLen " & LispNum(rulerOffset) & ") vesselXLen spacing ""X_AXIS"" " & LispStr(xAxisLabel) & ")"
                Case "TOP + LEFT"
                    Print #f, "  ;; Horizontal CW visual TOP + LEFT rulers"
                    Print #f, "  (SL_RulerY (- 0.0 " & LispNum(rulerOffset) & ") 0.0 vesselYLen spacing ""Y_AXIS"" " & LispStr(yAxisLabel) & ")"
                    Print #f, "  (SL_RulerX_CW_Left 0.0 (- 0.0 " & LispNum(rulerOffset) & ") vesselXLen spacing ""X_AXIS"" " & LispStr(xAxisLabel) & ")"
                Case "BOTTOM + LEFT"
                    Print #f, "  ;; Horizontal CW visual BOTTOM + LEFT rulers"
                    Print #f, "  (SL_RulerY_CW_Bottom (+ vesselXLen " & LispNum(rulerOffset) & ") 0.0 vesselYLen spacing ""Y_AXIS"" " & LispStr(yAxisLabel) & ")"
                    Print #f, "  (SL_RulerX_CW_Left 0.0 (- 0.0 " & LispNum(rulerOffset) & ") vesselXLen spacing ""X_AXIS"" " & LispStr(xAxisLabel) & ")"
                Case "TOP + RIGHT"
                    Print #f, "  ;; Horizontal CW visual TOP + RIGHT rulers"
                    Print #f, "  (SL_RulerY (- 0.0 " & LispNum(rulerOffset) & ") 0.0 vesselYLen spacing ""Y_AXIS"" " & LispStr(yAxisLabel) & ")"
                    Print #f, "  (SL_RulerX_Top 0.0 (+ vesselYLen " & LispNum(rulerOffset) & ") vesselXLen spacing ""X_AXIS"" " & LispStr(xAxisLabel) & ")"
                Case "BOTTOM + RIGHT"
                    Print #f, "  ;; Horizontal CW visual BOTTOM + RIGHT rulers"
                    Print #f, "  (SL_RulerY_CW_Bottom (+ vesselXLen " & LispNum(rulerOffset) & ") 0.0 vesselYLen spacing ""Y_AXIS"" " & LispStr(yAxisLabel) & ")"
                    Print #f, "  (SL_RulerX_Top 0.0 (+ vesselYLen " & LispNum(rulerOffset) & ") vesselXLen spacing ""X_AXIS"" " & LispStr(xAxisLabel) & ")"
                Case Else
                    Print #f, "  ;; Horizontal CW fallback visual BOTTOM + LEFT rulers"
                    Print #f, "  (SL_RulerY_CW_Bottom (+ vesselXLen " & LispNum(rulerOffset) & ") 0.0 vesselYLen spacing ""Y_AXIS"" " & LispStr(yAxisLabel) & ")"
                    Print #f, "  (SL_RulerX_CW_Left 0.0 (- 0.0 " & LispNum(rulerOffset) & ") vesselXLen spacing ""X_AXIS"" " & LispStr(xAxisLabel) & ")"
            End Select

        Case "HORIZONTAL CCW"
            Select Case placement
                Case "TOP"
                    Print #f, "  ;; Horizontal CCW visual TOP ruler"
                    Print #f, "  (SL_RulerY_CCW_Top (+ vesselXLen " & LispNum(rulerOffset) & ") 0.0 vesselYLen spacing ""Y_AXIS"" " & LispStr(yAxisLabel) & ")"
                Case "BOTTOM"
                    Print #f, "  ;; Horizontal CCW visual BOTTOM ruler"
                    Print #f, "  (SL_RulerY_CCW_Bottom (- 0.0 " & LispNum(rulerOffset) & ") 0.0 vesselYLen spacing ""Y_AXIS"" " & LispStr(yAxisLabel) & ")"
                Case "LEFT"
                    Print #f, "  ;; Horizontal CCW visual LEFT ruler"
                    Print #f, "  (SL_RulerX_CCW_Left 0.0 (+ vesselYLen " & LispNum(rulerOffset) & ") vesselXLen spacing ""X_AXIS"" " & LispStr(xAxisLabel) & ")"
                Case "RIGHT"
                    Print #f, "  ;; Horizontal CCW visual RIGHT ruler"
                    Print #f, "  (SL_RulerX 0.0 (- 0.0 " & LispNum(rulerOffset) & ") vesselXLen spacing ""X_AXIS"" " & LispStr(xAxisLabel) & ")"
                Case "TOP + LEFT"
                    Print #f, "  ;; Horizontal CCW visual TOP + LEFT rulers"
                    Print #f, "  (SL_RulerY_CCW_Top (+ vesselXLen " & LispNum(rulerOffset) & ") 0.0 vesselYLen spacing ""Y_AXIS"" " & LispStr(yAxisLabel) & ")"
                    Print #f, "  (SL_RulerX_CCW_Left 0.0 (+ vesselYLen " & LispNum(rulerOffset) & ") vesselXLen spacing ""X_AXIS"" " & LispStr(xAxisLabel) & ")"
                Case "BOTTOM + LEFT"
                    Print #f, "  ;; Horizontal CCW visual BOTTOM + LEFT rulers"
                    Print #f, "  (SL_RulerY_CCW_Bottom (- 0.0 " & LispNum(rulerOffset) & ") 0.0 vesselYLen spacing ""Y_AXIS"" " & LispStr(yAxisLabel) & ")"
                    Print #f, "  (SL_RulerX_CCW_Left 0.0 (+ vesselYLen " & LispNum(rulerOffset) & ") vesselXLen spacing ""X_AXIS"" " & LispStr(xAxisLabel) & ")"
                Case "TOP + RIGHT"
                    Print #f, "  ;; Horizontal CCW visual TOP + RIGHT rulers"
                    Print #f, "  (SL_RulerY_CCW_Top (+ vesselXLen " & LispNum(rulerOffset) & ") 0.0 vesselYLen spacing ""Y_AXIS"" " & LispStr(yAxisLabel) & ")"
                    Print #f, "  (SL_RulerX 0.0 (- 0.0 " & LispNum(rulerOffset) & ") vesselXLen spacing ""X_AXIS"" " & LispStr(xAxisLabel) & ")"
                Case "BOTTOM + RIGHT"
                    Print #f, "  ;; Horizontal CCW visual BOTTOM + RIGHT rulers"
                    Print #f, "  (SL_RulerY_CCW_Bottom (- 0.0 " & LispNum(rulerOffset) & ") 0.0 vesselYLen spacing ""Y_AXIS"" " & LispStr(yAxisLabel) & ")"
                    Print #f, "  (SL_RulerX 0.0 (- 0.0 " & LispNum(rulerOffset) & ") vesselXLen spacing ""X_AXIS"" " & LispStr(xAxisLabel) & ")"
                Case Else
                    Print #f, "  ;; Horizontal CCW fallback visual BOTTOM + LEFT rulers"
                    Print #f, "  (SL_RulerY_CCW_Bottom (- 0.0 " & LispNum(rulerOffset) & ") 0.0 vesselYLen spacing ""Y_AXIS"" " & LispStr(yAxisLabel) & ")"
                    Print #f, "  (SL_RulerX_CCW_Left 0.0 (+ vesselYLen " & LispNum(rulerOffset) & ") vesselXLen spacing ""X_AXIS"" " & LispStr(xAxisLabel) & ")"
            End Select

        Case Else
            Select Case placement
                Case "TOP"
                    Print #f, "  ;; Vertical/default visual TOP ruler"
                    Print #f, "  (SL_RulerX_Top 0.0 (+ vesselYLen " & LispNum(rulerOffset) & ") vesselXLen spacing ""X_AXIS"" " & LispStr(xAxisLabel) & ")"
                Case "BOTTOM"
                    Print #f, "  ;; Vertical/default visual BOTTOM ruler"
                    Print #f, "  (SL_RulerX 0.0 (- 0.0 " & LispNum(rulerOffset) & ") vesselXLen spacing ""X_AXIS"" " & LispStr(xAxisLabel) & ")"
                Case "LEFT"
                    Print #f, "  ;; Vertical/default visual LEFT ruler"
                    Print #f, "  (SL_RulerY (- 0.0 " & LispNum(rulerOffset) & ") 0.0 vesselYLen spacing ""Y_AXIS"" " & LispStr(yAxisLabel) & ")"
                Case "RIGHT"
                    Print #f, "  ;; Vertical/default visual RIGHT ruler"
                    Print #f, "  (SL_RulerY_Right (+ vesselXLen " & LispNum(rulerOffset) & ") 0.0 vesselYLen spacing ""Y_AXIS"" " & LispStr(yAxisLabel) & ")"
                Case "TOP + LEFT"
                    Print #f, "  ;; Vertical/default visual TOP + LEFT rulers"
                    Print #f, "  (SL_RulerX_Top 0.0 (+ vesselYLen " & LispNum(rulerOffset) & ") vesselXLen spacing ""X_AXIS"" " & LispStr(xAxisLabel) & ")"
                    Print #f, "  (SL_RulerY (- 0.0 " & LispNum(rulerOffset) & ") 0.0 vesselYLen spacing ""Y_AXIS"" " & LispStr(yAxisLabel) & ")"
                Case "BOTTOM + LEFT"
                    Print #f, "  ;; Vertical/default visual BOTTOM + LEFT rulers"
                    Print #f, "  (SL_RulerX 0.0 (- 0.0 " & LispNum(rulerOffset) & ") vesselXLen spacing ""X_AXIS"" " & LispStr(xAxisLabel) & ")"
                    Print #f, "  (SL_RulerY (- 0.0 " & LispNum(rulerOffset) & ") 0.0 vesselYLen spacing ""Y_AXIS"" " & LispStr(yAxisLabel) & ")"
                Case "TOP + RIGHT"
                    Print #f, "  ;; Vertical/default visual TOP + RIGHT rulers"
                    Print #f, "  (SL_RulerX_Top 0.0 (+ vesselYLen " & LispNum(rulerOffset) & ") vesselXLen spacing ""X_AXIS"" " & LispStr(xAxisLabel) & ")"
                    Print #f, "  (SL_RulerY_Right (+ vesselXLen " & LispNum(rulerOffset) & ") 0.0 vesselYLen spacing ""Y_AXIS"" " & LispStr(yAxisLabel) & ")"
                Case "BOTTOM + RIGHT"
                    Print #f, "  ;; Vertical/default visual BOTTOM + RIGHT rulers"
                    Print #f, "  (SL_RulerX 0.0 (- 0.0 " & LispNum(rulerOffset) & ") vesselXLen spacing ""X_AXIS"" " & LispStr(xAxisLabel) & ")"
                    Print #f, "  (SL_RulerY_Right (+ vesselXLen " & LispNum(rulerOffset) & ") 0.0 vesselYLen spacing ""Y_AXIS"" " & LispStr(yAxisLabel) & ")"
                Case Else
                    Print #f, "  ;; Vertical/default fallback visual BOTTOM + LEFT rulers"
                    Print #f, "  (SL_RulerX 0.0 (- 0.0 " & LispNum(rulerOffset) & ") vesselXLen spacing ""X_AXIS"" " & LispStr(xAxisLabel) & ")"
                    Print #f, "  (SL_RulerY (- 0.0 " & LispNum(rulerOffset) & ") 0.0 vesselYLen spacing ""Y_AXIS"" " & LispStr(yAxisLabel) & ")"
            End Select
    End Select
End Sub

Private Function RightPanelGap() As Double
    'Distance from the final vessel/layout edge to the left edge of the right-side information panel.
    RightPanelGap = 12
End Function

Private Function RightPanelGapCCW() As Double
    'Horizontal CCW-only panel clearance.
    'v4.6.5: moved CCW right-side panel 15 inches closer to vessel; CW and Vertical unchanged.
    RightPanelGapCCW = 12
End Function

Private Function RightPanelExtraForRightRuler(ByVal orientation As String) As Double
    'v4.4.10: When a right-side ruler is active, move the right-side information panel
    '15 inches farther right in Vertical and Horizontal CW so the panel clears the ruler.
    'CCW is intentionally left unchanged for now.
    Dim placement As String
    Dim ori As String

    placement = UCase(Trim(CStr(GetSettingValue("Ruler Placement", "Bottom + Left"))))
    ori = UCase(Trim(CStr(orientation)))

    If ori = "VERTICAL" Or ori = "HORIZONTAL CW" Then
        If placement = "RIGHT" Or placement = "TOP + RIGHT" Or placement = "BOTTOM + RIGHT" Then
            RightPanelExtraForRightRuler = 15
        Else
            RightPanelExtraForRightRuler = 0
        End If
    Else
        RightPanelExtraForRightRuler = 0
    End If
End Function

Private Function RightPanelLeft(ByVal orientation As String, ByVal vesselHeight As Double, ByVal vesselLength As Double) As Double
    'Returns the visual left edge of the right-side information panel.
    'Horizontal orientations anchor from the final length edge of the vessel.
    'Vertical anchors from the right side of the vessel width.
    Select Case UCase(Trim(orientation))
        Case "HORIZONTAL CW"
            RightPanelLeft = vesselLength + RightPanelGap() + RightPanelExtraForRightRuler(orientation)
        Case "HORIZONTAL CCW"
            'CCW rollout is mirrored into negative visual X.
            'The visual right edge of the vessel is near 0, but the ruler/axis also lives there.
            'Use a larger CCW clearance so the panel clears the side ruler.
            RightPanelLeft = RightPanelGapCCW()
        Case Else
            RightPanelLeft = vesselHeight + RightPanelGap() + RightPanelExtraForRightRuler(orientation)
    End Select
End Function

Private Function VisualVesselBottom(ByVal orientation As String, ByVal vesselHeight As Double) As Double
    'Visual bottom edge after the final orientation transform.
    Select Case UCase(Trim(orientation))
        Case "HORIZONTAL CW"
            VisualVesselBottom = -vesselHeight
        Case Else
            VisualVesselBottom = 0
    End Select
End Function

Private Function VisualToLogicalX(ByVal orientation As String, ByVal visualX As Double, ByVal visualY As Double) As Double
    'Inverse of the DraftSight output transform:
    'Vertical: visual=(x,y), CW: visual=(y,-x), CCW: visual=(-y,x).
    Select Case UCase(Trim(orientation))
        Case "HORIZONTAL CW"
            VisualToLogicalX = -visualY
        Case "HORIZONTAL CCW"
            VisualToLogicalX = visualY
        Case Else
            VisualToLogicalX = visualX
    End Select
End Function

Private Function VisualToLogicalY(ByVal orientation As String, ByVal visualX As Double, ByVal visualY As Double) As Double
    Select Case UCase(Trim(orientation))
        Case "HORIZONTAL CW"
            VisualToLogicalY = visualX
        Case "HORIZONTAL CCW"
            VisualToLogicalY = -visualX
        Case Else
            VisualToLogicalY = visualY
    End Select
End Function

Private Sub ComputeRightPanelLayout(ByVal orientation As String, ByVal vesselHeight As Double, ByVal vesselLength As Double, _
                                    ByVal headDia As Double, ByVal headMode As String, _
                                    ByRef legendX As Double, ByRef legendY As Double, _
                                    ByRef head1X As Double, ByRef head1Y As Double, _
                                    ByRef head2X As Double, ByRef head2Y As Double, _
                                    ByRef titleX As Double, ByRef titleY As Double)
    'v4.6.37: One bottom-up visual-coordinate layout for Vertical, Horizontal CW, and Horizontal CCW.
    'Bottom-up dependency chain: vessel bottom -> legend -> Head 2 -> Head 1 -> full title block.
    'Only the final point conversion is orientation-specific.
    Dim panelLeft As Double, panelBottom As Double
    Dim r As Double, headGap As Double, legendClearance As Double, titleClearance As Double
    Dim titleBlockHeight As Double
    Dim legendVisualBottom As Double, legendVisualTop As Double
    Dim h1VX As Double, h1VY As Double, h2VX As Double, h2VY As Double
    Dim titleVX As Double, titleVY As Double
    Dim legendAnchorVX As Double, legendAnchorVY As Double
    Dim ori As String

    ori = UCase(Trim(orientation))
    panelLeft = RightPanelLeft(orientation, vesselHeight, vesselLength)
    panelBottom = VisualVesselBottom(orientation, vesselHeight)
    r = headDia / 2

    headGap = 14
    legendClearance = 18

    'SL_TitleBlock contains seven possible lines spaced at 3.4 drawing units.
    'Its anchor is the FIRST/TOP line and the remaining six lines extend visually downward.
    'Therefore, the title anchor must include the full 20.4-unit line-stack depth plus
    'a larger visible gap above Head 1. This keeps the lowest title line clear of the head.
    titleBlockHeight = 6 * 3.4
    titleClearance = 16

    'The current legend geometry extends approximately 10.8 inches below its Vertical anchor
    'and approximately 36 inches from visual bottom to visual top at the baseline text size.
    'Anchor its true visual bottom to the vessel/drawing bottom.
    legendVisualBottom = panelBottom
    legendVisualTop = legendVisualBottom + 36

    h2VX = panelLeft + r
    h2VY = legendVisualTop + legendClearance + r
    h1VX = h2VX
    h1VY = h2VY + headDia + headGap

    Select Case UCase(Trim(headMode))
        Case "HEAD 1", "HEAD 2"
            'A single selected head occupies the upper head position.
            h2VX = h1VX
            h2VY = h1VY
            titleVX = panelLeft
            titleVY = h1VY + r + titleClearance + titleBlockHeight
        Case "BOTH"
            titleVX = panelLeft
            titleVY = h1VY + r + titleClearance + titleBlockHeight
        Case Else
            'No head views: place the title directly above the legend clearance.
            h1VX = panelLeft + r
            h1VY = legendVisualTop + legendClearance
            h2VX = h1VX
            h2VY = h1VY
            titleVX = panelLeft
            titleVY = legendVisualTop + legendClearance + titleBlockHeight
    End Select

    'Every vertical position above is derived from panelBottom. There is no separate
    'top margin or vessel-top anchor, so small and large vessels use the same dependency chain.

    'Convert visual head and title anchors back to the generator's logical coordinates.
    head1X = VisualToLogicalX(orientation, h1VX, h1VY)
    head1Y = VisualToLogicalY(orientation, h1VX, h1VY)
    head2X = VisualToLogicalX(orientation, h2VX, h2VY)
    head2Y = VisualToLogicalY(orientation, h2VX, h2VY)
    titleX = VisualToLogicalX(orientation, titleVX, titleVY)
    titleY = VisualToLogicalY(orientation, titleVX, titleVY)

    'The legacy SL_Legend routine has different internal anchor extents by orientation.
    'Translate the shared visual bottom/left target into the anchor that routine expects.
    Select Case ori
        Case "HORIZONTAL CW"
            legendX = -legendVisualBottom - 30.8
            legendY = panelLeft
        Case "HORIZONTAL CCW"
            legendX = legendVisualBottom + 15.8
            legendY = -(panelLeft + 15)
        Case Else
            legendX = panelLeft
            legendY = legendVisualBottom + 10.8
    End Select
End Sub

Private Sub ComputeLegendPosition(ByVal orientation As String, ByVal vesselHeight As Double, ByVal vesselLength As Double, ByVal headDia As Double, ByRef legendX As Double, ByRef legendY As Double)
    Dim h1x As Double, h1y As Double, h2x As Double, h2y As Double, tx As Double, ty As Double
    Dim headMode As String
    headMode = UCase(Trim(CStr(GetSettingValue("Head View Mode", "NONE"))))
    Call ComputeRightPanelLayout(orientation, vesselHeight, vesselLength, headDia, headMode, legendX, legendY, h1x, h1y, h2x, h2y, tx, ty)
End Sub

Private Function TitleBlockX(ByVal orientation As String, ByVal legendX As Double, ByVal legendY As Double, ByVal vesselHeight As Double, ByVal vesselLength As Double, ByVal headDia As Double) As Double
    Dim lx As Double, ly As Double, h1x As Double, h1y As Double, h2x As Double, h2y As Double, tx As Double, ty As Double
    Dim headMode As String
    headMode = UCase(Trim(CStr(GetSettingValue("Head View Mode", "NONE"))))
    Call ComputeRightPanelLayout(orientation, vesselHeight, vesselLength, headDia, headMode, lx, ly, h1x, h1y, h2x, h2y, tx, ty)
    TitleBlockX = tx
End Function

Private Function TitleBlockY(ByVal orientation As String, ByVal legendX As Double, ByVal legendY As Double, ByVal vesselHeight As Double, ByVal vesselLength As Double, ByVal headDia As Double) As Double
    Dim lx As Double, ly As Double, h1x As Double, h1y As Double, h2x As Double, h2y As Double, tx As Double, ty As Double
    Dim headMode As String
    headMode = UCase(Trim(CStr(GetSettingValue("Head View Mode", "NONE"))))
    Call ComputeRightPanelLayout(orientation, vesselHeight, vesselLength, headDia, headMode, lx, ly, h1x, h1y, h2x, h2y, tx, ty)
    TitleBlockY = ty
End Function

Private Function HeadViewDiameter(ByVal headSize As String, ByVal vesselHeight As Double) As Double
    Select Case UCase(Trim(headSize))
        Case "MEDIUM"
            HeadViewDiameter = vesselHeight * 0.3
        Case "LARGE"
            HeadViewDiameter = vesselHeight * 0.38
        Case Else
            HeadViewDiameter = vesselHeight * 0.24
    End Select
    If HeadViewDiameter < 24 Then HeadViewDiameter = 24
End Function

Private Sub ComputeHeadCenters(ByVal orientation As String, ByVal vesselHeight As Double, ByVal vesselLength As Double, ByVal headDia As Double, ByVal headMode As String, ByRef head1X As Double, ByRef head1Y As Double, ByRef head2X As Double, ByRef head2Y As Double)
    Dim lx As Double, ly As Double, tx As Double, ty As Double
    Call ComputeRightPanelLayout(orientation, vesselHeight, vesselLength, headDia, headMode, lx, ly, head1X, head1Y, head2X, head2Y, tx, ty)
End Sub

Private Function ShouldShowHead(ByVal headMode As String, ByVal headName As String) As Boolean
    headMode = UCase(Trim(headMode))
    headName = NormalizeHeadName(headName)
    ShouldShowHead = False
    If headMode = "BOTH" Then ShouldShowHead = True
    If headMode = "HEAD 1" And headName = "HEAD 1" Then ShouldShowHead = True
    If headMode = "HEAD 2" And headName = "HEAD 2" Then ShouldShowHead = True
End Function


Private Sub PrintShellNozzleLispRows(ByVal f As Integer)
    'Uses the new Shell Features > Nozzles / Circles section when present.
    'Falls back to the legacy Nozzles tab so older workbooks still run.
    '
    'IMPORTANT CURRENT WORKBOOK MAPPING:
    'A Nozzle ID
    'B Diameter
    'C X Position
    'D Y Position
    'E Min T
    'F Notes
    'G Include
    'H Label Mode
    Dim wsShell As Worksheet
    Dim firstRow As Long, lastRow As Long
    Dim r As Long
    Dim nName As String, nMode As String
    Dim nX As Variant, nY As Variant, nDia As Variant

    If WorksheetExists("Shell Features") Then
        Set wsShell = ThisWorkbook.Worksheets("Shell Features")
        firstRow = FindSectionHeaderRow(wsShell, "SHELL NOZZLES")
        If firstRow = 0 Then firstRow = FindSectionHeaderRow(wsShell, "NOZZLES / CIRCLES")
        If firstRow = 0 Then firstRow = FindSectionHeaderRow(wsShell, "NOZZLES")

        If firstRow > 0 Then
            lastRow = SectionLastRow(wsShell, firstRow + 1)
            For r = firstRow + 2 To lastRow
                nName = Trim(CStr(wsShell.Cells(r, "A").value))
                If nName <> "" Then
                    If UCase(Trim(CStr(wsShell.Cells(r, "G").value))) <> "NO" Then
                        nDia = wsShell.Cells(r, "B").value
                        nX = wsShell.Cells(r, "C").value
                        nY = wsShell.Cells(r, "D").value
                        If IsNumeric(nX) And IsNumeric(nY) And IsNumeric(nDia) Then
                            nMode = UCase(Trim(CStr(wsShell.Cells(r, "H").value)))
                            If nMode = "" Then nMode = "AUTO"
                            Print #f, "  (SL_CircleSmart " & LispNum(CDbl(nX)) & " " & LispNum(CDbl(nY)) & " " & LispNum(CDbl(nDia)) & " " & LispStr(nName) & " " & LispStr(nMode) & " ""NOZZLES"")"
                        End If
                    End If
                End If
            Next r
            Exit Sub
        End If
    End If

End Sub

Private Function WorksheetExists(ByVal sheetName As String) As Boolean
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(sheetName)
    WorksheetExists = Not ws Is Nothing
    On Error GoTo 0
End Function

Private Function FindSectionHeaderRow(ByVal ws As Worksheet, ByVal sectionName As String) As Long
    Dim lastUsed As Long, r As Long, c As Long
    Dim txt As String
    lastUsed = ws.UsedRange.Row + ws.UsedRange.Rows.count - 1
    sectionName = UCase(Trim(sectionName))
    For r = 1 To lastUsed
        For c = 1 To 12
            txt = UCase(Trim(CStr(ws.Cells(r, c).value)))
            If txt = sectionName Then
                FindSectionHeaderRow = r
                Exit Function
            End If
        Next c
    Next r
    FindSectionHeaderRow = 0
End Function

Private Function SectionLastRow(ByVal ws As Worksheet, ByVal firstDataOrHeaderRow As Long) As Long
    'Stops before the next section header. Section headers are expected in column A or nearby.
    Dim lastUsed As Long, r As Long, c As Long
    Dim txt As String
    lastUsed = ws.UsedRange.Row + ws.UsedRange.Rows.count - 1
    SectionLastRow = lastUsed
    For r = firstDataOrHeaderRow To lastUsed
        For c = 1 To 12
            txt = UCase(Trim(CStr(ws.Cells(r, c).value)))
            Select Case txt
                Case "CIRC WELDS", "CIRCUMFERENTIAL WELDS", "LONG SEAMS", "SHELL NOZZLES", "NOZZLES / CIRCLES", "NOZZLES", "OBJECTS", "SHELL MUT", "SHELL M.U.T.", "HEAD MUT", "HEAD FEATURES"
                    If r > firstDataOrHeaderRow Then
                        SectionLastRow = r - 1
                        Exit Function
                    End If
            End Select
        Next c
    Next r
End Function

Private Function HeadNozzleLastRow(ByVal wsHead As Worksheet) As Long
    'Head Features contains Head Nozzles first and Head MUT below it.
    'This returns the last row in the nozzle section so the generator does not read MUT rows as nozzles.
    Dim lastUsed As Long
    Dim r As Long
    Dim c As Long
    Dim cellText As String

    lastUsed = wsHead.Cells(wsHead.Rows.count, "A").End(xlUp).Row
    HeadNozzleLastRow = lastUsed

    For r = 1 To lastUsed
        For c = 1 To 9
            cellText = UCase(Trim(CStr(wsHead.Cells(r, c).value)))
            If cellText = "HEAD MUT" Or cellText = "HEAD M.U.T." Or cellText = "HEAD MUT READINGS" Then
                HeadNozzleLastRow = r - 1
                Exit Function
            End If
        Next c
    Next r
End Function

Private Function HeadMUTFirstDataRow(ByVal wsHead As Worksheet) As Long
    'Finds the Head MUT section dynamically and returns the first data row below its column headings.
    Dim headerRow As Long
    headerRow = FindSectionHeaderRow(wsHead, "HEAD MUT")
    If headerRow = 0 Then headerRow = FindSectionHeaderRow(wsHead, "HEAD M.U.T.")
    If headerRow = 0 Then headerRow = FindSectionHeaderRow(wsHead, "HEAD MUT READINGS")
    If headerRow > 0 Then
        HeadMUTFirstDataRow = headerRow + 3
    Else
        HeadMUTFirstDataRow = 0
    End If
End Function

Private Function NormalizeHeadName(ByVal headName As String) As String
    headName = UCase(Trim(headName))
    headName = Replace(headName, "_", " ")
    If headName = "H1" Or headName = "1" Or headName = "HEAD1" Then headName = "HEAD 1"
    If headName = "H2" Or headName = "2" Or headName = "HEAD2" Then headName = "HEAD 2"
    NormalizeHeadName = headName
End Function

Private Function RadiusFactor(ByVal radiusPosition As String, ByVal customValue As Variant) As Double
    radiusPosition = UCase(Trim(radiusPosition))
    Select Case radiusPosition
        Case "CENTER"
            RadiusFactor = 0
        Case "HALF"
            RadiusFactor = 0.5
        Case "THREE_QUARTER", "THREE QUARTER", "3/4", "3-4"
            RadiusFactor = 0.75
        Case "OUTER"
            RadiusFactor = 1
        Case "CUSTOM"
            If IsNumeric(customValue) Then
                RadiusFactor = CDbl(customValue)
            Else
                RadiusFactor = 0.5
            End If
        Case Else
            RadiusFactor = 0.5
    End Select
End Function

Private Function ClockPositionDegrees(ByVal clockText As String) As Double
    'Safe clock parser for Head Features.
    'Accepts numeric clock values, half-hour values, HH:MM values, or degree values with a degree symbol.
    'Invalid/blank/OCR REVIEW values return 0 instead of crashing the generator.
    Dim parts() As String
    Dim hr As Double, mn As Double

    clockText = Trim(CStr(clockText))

    If clockText = "" Then
        ClockPositionDegrees = 0
        Exit Function
    End If

    If UCase(clockText) = "REVIEW" Then
        ClockPositionDegrees = 0
        Exit Function
    End If

    If Right(clockText, 1) = ChrW(176) Then
        clockText = Replace(clockText, ChrW(176), "")
        If IsNumeric(clockText) Then
            ClockPositionDegrees = CDbl(clockText)
        Else
            ClockPositionDegrees = 0
        End If
        Exit Function
    End If

    If InStr(1, clockText, ":", vbTextCompare) > 0 Then
        parts = Split(clockText, ":")
        If UBound(parts) < 1 Then
            ClockPositionDegrees = 0
            Exit Function
        End If

        If Not IsNumeric(parts(0)) Or Not IsNumeric(parts(1)) Then
            ClockPositionDegrees = 0
            Exit Function
        End If

        hr = CDbl(parts(0))
        mn = CDbl(parts(1))
    Else
        If Not IsNumeric(clockText) Then
            ClockPositionDegrees = 0
            Exit Function
        End If

        hr = CDbl(clockText)
        mn = 0
    End If

    If hr = 12 Then hr = 0
    ClockPositionDegrees = (hr * 30) + (mn * 0.5)
End Function


Private Function LispStr(ByVal s As String) As String
    s = Replace(s, "\", "\\")
    s = Replace(s, Chr(34), "\" & Chr(34))
    LispStr = Chr(34) & s & Chr(34)
End Function
Private Function LispNum(ByVal n As Double) As String
    LispNum = Replace(Format(n, "0.###"), ",", ".")
End Function

Private Function CleanFileName(ByVal s As String) As String
    Dim bad As Variant, i As Long
    bad = Array("\", "/", ":", "*", "?", """", "<", ">", "|")
    For i = LBound(bad) To UBound(bad)
        s = Replace(s, CStr(bad(i)), "_")
    Next i
    CleanFileName = s
End Function

Private Sub WriteSectionPageSettings(ByVal f As Integer, ByVal showLegend As String, ByVal showTitle As String)
    'Paper-space information repeated on every SECTIONPAGES sheet.
    Dim showRef As String, modeRef As String, setRef As String
    Dim labels(0 To 4) As String

    'Section sheets always need the opposite-side indications. Their wording
    'still follows the same reference set/custom labels as the main layout.
    showRef = "YES"
    modeRef = UCase(Trim(CStr(GetSettingValue("Reference Label Mode", "AUTO CARDINAL"))))
    setRef = UCase(Trim(CStr(GetSettingValue("Reference Label Set", "TDC/BDC"))))

    If showRef = "YES" Then
        Select Case modeRef
            Case "CUSTOM CARDINAL", "CUSTOM"
                ReadCustomReferenceLabels labels
            Case Else
                Select Case setRef
                    Case "NDC/SDC", "NDC / SDC"
                        labels(0) = "N.D.C.": labels(1) = "E.D.C.": labels(2) = "S.D.C.": labels(3) = "W.D.C.": labels(4) = "N.D.C."
                    Case "NAMEPLATE DC", "NAMEPLATE D.C.", "NAMEPLATE D.C", "NPDC"
                        labels(0) = "NAMEPLATE D.C.": labels(1) = "NP + 90" & ChrW(176): labels(2) = "180" & ChrW(176) & " OPPOSITE": labels(3) = "NP + 270" & ChrW(176): labels(4) = "NAMEPLATE D.C."
                    Case Else
                        labels(0) = "T.D.C.": labels(1) = "R.D.C.": labels(2) = "B.D.C.": labels(3) = "L.D.C.": labels(4) = "T.D.C."
                End Select
        End Select
    End If

    Print #f, "(setq SL_SECTION_SHOW_REFS " & LispStr(showRef) & ")"
    Print #f, "(setq SL_SECTION_REF_LABELS (list " & LispStr(labels(0)) & " " & LispStr(labels(1)) & " " & LispStr(labels(2)) & " " & LispStr(labels(3)) & " " & LispStr(labels(4)) & "))"
    Print #f, "(setq SL_SECTION_SHOW_TITLE " & LispStr(UCase(Trim(showTitle))) & ")"
    Print #f, "(setq SL_SECTION_SHOW_LEGEND " & LispStr(UCase(Trim(showLegend))) & ")"
    Print #f, "(setq SL_SECTION_TITLE_LINES (list " & _
        LispStr(GetDrawingInfoValue("Drawing Title", "AUT COVERAGE MAP")) & " " & _
        LispStr("COMPONENT: " & GetDrawingInfoValue("Component", "")) & " " & _
        LispStr("UNIT: " & GetDrawingInfoValue("Unit", "")) & " " & _
        LispStr("CLIENT: " & GetDrawingInfoValue("Client", "")) & " " & _
        LispStr("INSPECTOR: " & GetDrawingInfoValue("Inspector", "")) & " " & _
        LispStr("DATE: " & GetDrawingInfoValue("Date", "")) & " " & _
        LispStr("REV: " & GetDrawingInfoValue("Revision", "")) & "))"
    Print #f, "(setq SL_SECTION_LEGEND_LINES (list SL_LEGEND_TOTAL_SCANS_TEXT SL_COVERAGE_TEXT SL_LEGEND_ORIENTATION_TEXT SL_LEGEND_OVERLAY_TEXT))"
End Sub

Private Sub WriteObjectWrapLisp(ByVal f As Integer)
    Print #f, ";; ------------------------------------------------------------"
    Print #f, ";; OBJECTWRAP - split rectangular supports/objects across the circumferential rollout seam."
    Print #f, ";; Processes only closed rectangular LWPOLYLINE entities on SUPPORTS."
    Print #f, ";; One SUPPORT_TEXT label is retained on the larger piece; equal pieces follow the original start corner."
    Print #f, ";; ------------------------------------------------------------"
    Print #f, "(defun SL_OWBBox (edata / minx miny maxx maxy p item)"
    Print #f, "  (foreach item edata"
    Print #f, "    (if (= (car item) 10)"
    Print #f, "      (progn"
    Print #f, "        (setq p (cdr item))"
    Print #f, "        (if (null minx)"
    Print #f, "          (setq minx (car p) maxx (car p) miny (cadr p) maxy (cadr p))"
    Print #f, "          (progn"
    Print #f, "            (setq minx (min minx (car p)) maxx (max maxx (car p)))"
    Print #f, "            (setq miny (min miny (cadr p)) maxy (max maxy (cadr p)))"
    Print #f, "          )"
    Print #f, "        )"
    Print #f, "      )"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  (if minx (list minx miny maxx maxy) nil)"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_OWRectangleP (edata bb tol / count ok p item)"
    Print #f, "  (setq count 0 ok T)"
    Print #f, "  (foreach item edata"
    Print #f, "    (if (= (car item) 10)"
    Print #f, "      (progn"
    Print #f, "        (setq count (1+ count) p (cdr item))"
    Print #f, "        (if (not (and (or (equal (car p) (nth 0 bb) tol) (equal (car p) (nth 2 bb) tol))"
    Print #f, "                      (or (equal (cadr p) (nth 1 bb) tol) (equal (cadr p) (nth 3 bb) tol))))"
    Print #f, "          (setq ok nil)"
    Print #f, "        )"
    Print #f, "      )"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  (and ok (= count 4) (> (- (nth 2 bb) (nth 0 bb)) tol) (> (- (nth 3 bb) (nth 1 bb)) tol))"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_OWMakeRect (x1 y1 x2 y2)"
    Print #f, "  (entmakex"
    Print #f, "    (list '(0 . ""LWPOLYLINE"") '(100 . ""AcDbEntity"") (cons 8 ""SUPPORTS"")"
    Print #f, "          '(100 . ""AcDbPolyline"") (cons 90 4) (cons 70 1)"
    Print #f, "          (cons 10 (list x1 y1)) (cons 10 (list x2 y1))"
    Print #f, "          (cons 10 (list x2 y2)) (cons 10 (list x1 y2)))"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_OWTextPoint (edata / typ)"
    Print #f, "  (setq typ (cdr (assoc 0 edata)))"
    Print #f, "  (if (and (= typ ""TEXT"") (assoc 11 edata)) (cdr (assoc 11 edata)) (cdr (assoc 10 edata)))"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_OWFindLabel (bb tol / ss i ent ed p cx cy d best bestD)"
    Print #f, "  (setq ss (ssget ""_X"" (list (cons 0 ""TEXT,MTEXT"") (cons 8 ""SUPPORT_TEXT""))))"
    Print #f, "  (setq i 0 best nil bestD nil cx (/ (+ (nth 0 bb) (nth 2 bb)) 2.0) cy (/ (+ (nth 1 bb) (nth 3 bb)) 2.0))"
    Print #f, "  (if ss"
    Print #f, "    (repeat (sslength ss)"
    Print #f, "      (setq ent (ssname ss i) i (1+ i) ed (entget ent) p (SL_OWTextPoint ed))"
    Print #f, "      (if (and p (>= (car p) (- (nth 0 bb) tol)) (<= (car p) (+ (nth 2 bb) tol))"
    Print #f, "                 (>= (cadr p) (- (nth 1 bb) tol)) (<= (cadr p) (+ (nth 3 bb) tol)))"
    Print #f, "        (progn"
    Print #f, "          (setq d (distance p (list cx cy 0.0)))"
    Print #f, "          (if (or (null bestD) (< d bestD)) (setq best ent bestD d))"
    Print #f, "        )"
    Print #f, "      )"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  best"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_OWCopyLabel (label pt / ed clean item typ p3)"
    Print #f, "  (if label"
    Print #f, "    (progn"
    Print #f, "      (setq ed (entget label) clean nil typ (cdr (assoc 0 ed)))"
    Print #f, "      (foreach item ed"
    Print #f, "        (if (not (member (car item) '(-1 5 330 360))) (setq clean (cons item clean)))"
    Print #f, "      )"
    Print #f, "      (setq clean (reverse clean) p3 (list (car pt) (cadr pt) 0.0))"
    Print #f, "      (if (assoc 10 clean) (setq clean (subst (cons 10 p3) (assoc 10 clean) clean)))"
    Print #f, "      (if (and (= typ ""TEXT"") (assoc 11 clean)) (setq clean (subst (cons 11 p3) (assoc 11 clean) clean)))"
    Print #f, "      (entmakex clean)"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_OWCenter (r) (list (/ (+ (nth 0 r) (nth 2 r)) 2.0) (/ (+ (nth 1 r) (nth 3 r)) 2.0) 0.0))"
    Print #f, ""
    Print #f, "(defun SL_OWFirstVertex (edata / item found)"
    Print #f, "  (setq found nil)"
    Print #f, "  (while (and edata (null found))"
    Print #f, "    (setq item (car edata) edata (cdr edata))"
    Print #f, "    (if (= (car item) 10) (setq found (cdr item)))"
    Print #f, "  )"
    Print #f, "  found"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_OWPointInRect (pt r tol)"
    Print #f, "  (and pt (>= (car pt) (- (nth 0 r) tol)) (<= (car pt) (+ (nth 2 r) tol))"
    Print #f, "          (>= (cadr pt) (- (nth 1 r) tol)) (<= (cadr pt) (+ (nth 3 r) tol)))"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_OWWrapRect (ent ed bb horizontal low high tol / bmin bmax overflow r1 r2 label area1 area2 target startPt startCoord mappedCoord mappedStart span)"
    Print #f, "  (setq bmin (if horizontal (nth 1 bb) (nth 0 bb)))"
    Print #f, "  (setq bmax (if horizontal (nth 3 bb) (nth 2 bb)))"
    Print #f, "  (setq r1 nil r2 nil)"
    Print #f, "  ;; Ignore objects spanning both edges or lying completely outside the rollout."
    Print #f, "  (if (not (or (and (< bmin (- low tol)) (> bmax (+ high tol))) (<= bmax (+ low tol)) (>= bmin (- high tol))))"
    Print #f, "    (cond"
    Print #f, "      ((> bmax (+ high tol))"
    Print #f, "        (setq overflow (- bmax high))"
    Print #f, "        (if horizontal"
    Print #f, "          (setq r1 (list (nth 0 bb) (nth 1 bb) (nth 2 bb) high) r2 (list (nth 0 bb) low (nth 2 bb) (+ low overflow)))"
    Print #f, "          (setq r1 (list (nth 0 bb) (nth 1 bb) high (nth 3 bb)) r2 (list low (nth 1 bb) (+ low overflow) (nth 3 bb)))"
    Print #f, "        )"
    Print #f, "      )"
    Print #f, "      ((< bmin (- low tol))"
    Print #f, "        (setq overflow (- low bmin))"
    Print #f, "        (if horizontal"
    Print #f, "          (setq r1 (list (nth 0 bb) low (nth 2 bb) (nth 3 bb)) r2 (list (nth 0 bb) (- high overflow) (nth 2 bb) high))"
    Print #f, "          (setq r1 (list low (nth 1 bb) (nth 2 bb) (nth 3 bb)) r2 (list (- high overflow) (nth 1 bb) high (nth 3 bb)))"
    Print #f, "        )"
    Print #f, "      )"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  (if (and r1 r2)"
    Print #f, "    (progn"
    Print #f, "      (setq label (SL_OWFindLabel bb tol))"
    Print #f, "      (SL_OWMakeRect (nth 0 r1) (nth 1 r1) (nth 2 r1) (nth 3 r1))"
    Print #f, "      (SL_OWMakeRect (nth 0 r2) (nth 1 r2) (nth 2 r2) (nth 3 r2))"
    Print #f, "      ;; Keep one ID: larger piece wins; an equal split follows the original starting corner."
    Print #f, "      (setq area1 (* (- (nth 2 r1) (nth 0 r1)) (- (nth 3 r1) (nth 1 r1))))"
    Print #f, "      (setq area2 (* (- (nth 2 r2) (nth 0 r2)) (- (nth 3 r2) (nth 1 r2))))"
    Print #f, "      (cond"
    Print #f, "        ((> area1 (+ area2 tol)) (setq target r1))"
    Print #f, "        ((> area2 (+ area1 tol)) (setq target r2))"
    Print #f, "        (T"
    Print #f, "          (setq startPt (SL_OWFirstVertex ed) span (- high low))"
    Print #f, "          (if startPt"
    Print #f, "            (progn"
    Print #f, "              (setq startCoord (if horizontal (cadr startPt) (car startPt)) mappedCoord startCoord)"
    Print #f, "              (if (< mappedCoord low) (setq mappedCoord (+ mappedCoord span)))"
    Print #f, "              (if (> mappedCoord high) (setq mappedCoord (- mappedCoord span)))"
    Print #f, "              (if horizontal"
    Print #f, "                (setq mappedStart (list (car startPt) mappedCoord 0.0))"
    Print #f, "                (setq mappedStart (list mappedCoord (cadr startPt) 0.0))"
    Print #f, "              )"
    Print #f, "              (if (SL_OWPointInRect mappedStart r1 tol) (setq target r1) (setq target r2))"
    Print #f, "            )"
    Print #f, "            (setq target r1)"
    Print #f, "          )"
    Print #f, "        )"
    Print #f, "      )"
    Print #f, "      (SL_OWCopyLabel label (SL_OWCenter target))"
    Print #f, "      (if label (entdel label))"
    Print #f, "      (entdel ent)"
    Print #f, "      T"
    Print #f, "    )"
    Print #f, "    nil"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun c:OBJECTWRAP ( / *error* oldOsmode undoOpen p1 p2 dx dy horizontal edge1 edge2 low high tol ss i ent ed bb count skipped)"
    Print #f, "  (setq oldOsmode (getvar ""OSMODE"") undoOpen nil)"
    Print #f, "  (defun *error* (msg)"
    Print #f, "    (if undoOpen (command ""_.UNDO"" ""_End""))"
    Print #f, "    (setvar ""OSMODE"" oldOsmode)"
    Print #f, "    (if (and msg (/= msg ""Function cancelled"") (/= msg ""quit / exit abort"")) (princ (strcat ""\nOBJECTWRAP error: "" msg)))"
    Print #f, "    (princ)"
    Print #f, "  )"
    Print #f, "  (setvar ""OSMODE"" (logior oldOsmode 512))"
    Print #f, "  (setq tol 0.01)"
    Print #f, "  (setq p1 (getpoint ""\nFIRST EDGE: Click the vessel TOP long edge. If rotated, click the LEFT long edge: ""))"
    Print #f, "  (if p1 (setq p2 (getpoint ""\nSECOND EDGE: Click the opposite BOTTOM long edge. If rotated, click the RIGHT long edge: "")))"
    Print #f, "  (cond"
    Print #f, "    ((or (null p1) (null p2)) (princ ""\nOBJECTWRAP cancelled.""))"
    Print #f, "    (T"
    Print #f, "      (setq dx (abs (- (car p2) (car p1))) dy (abs (- (cadr p2) (cadr p1))))"
    Print #f, "      (if (and (< dx 0.000001) (< dy 0.000001))"
    Print #f, "        (princ ""\nThe two boundary points are too close together."")"
    Print #f, "        (progn"
    Print #f, "          (setq horizontal (> dy dx))"
    Print #f, "          (if horizontal (setq edge1 (cadr p1) edge2 (cadr p2)) (setq edge1 (car p1) edge2 (car p2)))"
    Print #f, "          (setq low (min edge1 edge2) high (max edge1 edge2))"
    Print #f, "          (setq ss (ssget ""_X"" (list (cons 0 ""LWPOLYLINE"") (cons 8 ""SUPPORTS""))))"
    Print #f, "          (setq count 0 skipped 0 i 0)"
    Print #f, "          (command ""_.UNDO"" ""_Begin"")"
    Print #f, "          (setq undoOpen T)"
    Print #f, "          (if ss"
    Print #f, "            (repeat (sslength ss)"
    Print #f, "              (setq ent (ssname ss i) i (1+ i) ed (entget ent) bb (SL_OWBBox ed))"
    Print #f, "              (if (and bb (SL_OWRectangleP ed bb tol))"
    Print #f, "                (if (SL_OWWrapRect ent ed bb horizontal low high tol) (setq count (1+ count)))"
    Print #f, "                (setq skipped (1+ skipped))"
    Print #f, "              )"
    Print #f, "            )"
    Print #f, "          )"
    Print #f, "          (command ""_.UNDO"" ""_End"")"
    Print #f, "          (setq undoOpen nil)"
    Print #f, "          (command ""_.REGEN"")"
    Print #f, "          (if (> count 0)"
    Print #f, "            (princ (strcat ""\nOBJECTWRAP complete. "" (itoa count) "" support/object rectangle(s) wrapped. One ID was retained per object.""))"
    Print #f, "            (princ ""\nNo support/object rectangles crossed the selected boundaries."")"
    Print #f, "          )"
    Print #f, "          (if (> skipped 0) (princ (strcat ""\nSkipped "" (itoa skipped) "" non-rectangular SUPPORTS polyline(s)."")))"
    Print #f, "        )"
    Print #f, "      )"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  (setvar ""OSMODE"" oldOsmode)"
    Print #f, "  (princ)"
    Print #f, ")"
    Print #f, ""
End Sub

Private Sub WriteSectionViewportLisp(ByVal f As Integer)
    Print #f, ";; SECTIONVIEWPORTS - build equal-scale report strips on the active Sheet."
    Print #f, ";; Run SCANLAYOUT first, then switch to a Sheet tab before using this command."
    Print #f, ";; ------------------------------------------------------------"
    Print #f, "(defun SL_LockViewport (vp / ed flags)"
    Print #f, "  (if vp"
    Print #f, "    (progn"
    Print #f, "      (setq ed (entget vp))"
    Print #f, "      (setq flags (cdr (assoc 90 ed)))"
    Print #f, "      (if (null flags) (setq flags 0))"
    Print #f, "      (if (= 0 (logand flags 16384))"
    Print #f, "        (if (assoc 90 ed)"
    Print #f, "          (entmod (subst (cons 90 (+ flags 16384)) (assoc 90 ed) ed))"
    Print #f, "          (entmod (append ed (list (cons 90 16384))))"
    Print #f, "        )"
    Print #f, "      )"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_UnlockViewport (vp / ed flags)"
    Print #f, "  (if vp"
    Print #f, "    (progn"
    Print #f, "      (setq ed (entget vp) flags (cdr (assoc 90 ed)))"
    Print #f, "      (if (and flags (/= 0 (logand flags 16384)))"
    Print #f, "        (entmod (subst (cons 90 (- flags 16384)) (assoc 90 ed) ed))"
    Print #f, "      )"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    If IsAutoCADOutput() Then
        Print #f, ";; AutoCAD overrides the DraftSight DXF viewport lock helpers."
        Print #f, "(defun SL_LockViewport (vp / obj)"
        Print #f, "  (if vp (progn (vl-load-com) (setq obj (vlax-ename->vla-object vp)) (vla-put-DisplayLocked obj :vlax-true) (vla-Update obj)))"
        Print #f, ")"
        Print #f, "(defun SL_UnlockViewport (vp / obj)"
        Print #f, "  (if vp (progn (vl-load-com) (setq obj (vlax-ename->vla-object vp)) (vla-put-DisplayLocked obj :vlax-false) (vla-Update obj)))"
        Print #f, ")"
        Print #f, ""
    End If
    Print #f, "(defun SL_CreateViewport (ll ur /)"
    If IsAutoCADOutput() Then
        Print #f, "  (command ""_.MVIEW"" ll ur)"
    Else
        Print #f, "  (command ""VIEWPORT"" ll ur)"
    End If
    Print #f, ")"
    Print #f, "(defun SL_ActivateViewport (vp / app doc obj)"
    If IsAutoCADOutput() Then
        Print #f, "  (vl-load-com)"
        Print #f, "  (setq app (vlax-get-acad-object) doc (vla-get-ActiveDocument app) obj (vlax-ename->vla-object vp))"
        Print #f, "  (vla-put-MSpace doc :vlax-true)"
        Print #f, "  (vla-put-ActivePViewport doc obj)"
    Else
        Print #f, "  (setvar ""CVPORT"" (cdr (assoc 69 (entget vp))))"
    End If
    Print #f, ")"
    Print #f, "(defun SL_ReturnPaperSpace (/ app doc)"
    If IsAutoCADOutput() Then
        Print #f, "  (vl-load-com) (setq app (vlax-get-acad-object) doc (vla-get-ActiveDocument app)) (vla-put-MSpace doc :vlax-false)"
    Else
        Print #f, "  (setvar ""CVPORT"" 1)"
    End If
    Print #f, ")"
    Print #f, "(defun SL_CopySheet (source target /)"
    If IsAutoCADOutput() Then
        Print #f, "  (command ""_.-LAYOUT"" ""_Copy"" source target)"
    Else
        Print #f, "  (command ""SHEET"" ""COPY"" source target)"
    End If
    Print #f, ")"
    Print #f, "(defun SL_ActivateSheet (name /)"
    If IsAutoCADOutput() Then
        Print #f, "  (command ""_.-LAYOUT"" ""_Set"" name)"
    Else
        Print #f, "  (command ""SHEET"" ""ACTIVATE"" name)"
    End If
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_SetViewportView (vp center viewHeight / ed)"
    Print #f, "  ;; Set the viewport view directly so DraftSight does not reinterpret ZOOM prompts."
    Print #f, "  (setq ed (entget vp))"
    Print #f, "  (if (assoc 12 ed) (setq ed (subst (cons 12 center) (assoc 12 ed) ed)))"
    Print #f, "  (if (assoc 45 ed) (setq ed (subst (cons 45 viewHeight) (assoc 45 ed) ed)))"
    Print #f, "  (entmod ed)"
    Print #f, "  (entupd vp)"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_PaperLine (x1 y1 x2 y2 layer /)"
    Print #f, "  (SL_SetLayer layer)"
    Print #f, "  (command ""LINE"" (SL_pt x1 y1) (SL_pt x2 y2) """")"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_PaperText (x y h rot txt layer /)"
    Print #f, "  (SL_SetLayer layer)"
    Print #f, "  (command ""-TEXT"" ""J"" ""MC"" (SL_pt x y) (rtos h 2 6) (rtos rot 2 2) txt)"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_PaperTextLeft (x y h txt layer /)"
    Print #f, "  (SL_SetLayer layer)"
    Print #f, "  (command ""-TEXT"" ""J"" ""ML"" (SL_pt x y) (rtos h 2 6) ""0"" txt)"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_PaperRect (x y w h layer /)"
    Print #f, "  (SL_PaperLine x y (+ x w) y layer)"
    Print #f, "  (SL_PaperLine (+ x w) y (+ x w) (+ y h) layer)"
    Print #f, "  (SL_PaperLine (+ x w) (+ y h) x (+ y h) layer)"
    Print #f, "  (SL_PaperLine x (+ y h) x y layer)"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_PaperHatchRect (x y w h step layer / p x1 y1 x2 y2)"
    Print #f, "  (setq p (- h))"
    Print #f, "  (while (<= p w)"
    Print #f, "    (setq x1 (max 0.0 p) y1 (- x1 p) x2 (min w (+ h p)) y2 (- x2 p))"
    Print #f, "    (if (> x2 x1) (SL_PaperLine (+ x x1) (+ y y1) (+ x x2) (+ y y2) layer))"
    Print #f, "    (setq p (+ p step))"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_PaperSectionReferences (vpLeft vpBottom vpW vpH / sc tick gap h i py txt)"
    Print #f, "  (if (= SL_SECTION_SHOW_REFS ""YES"")"
    Print #f, "    (progn"
    Print #f, "      (setq sc (/ vpH SL_VESSEL_XLEN) tick (* 3.0 sc) gap (* 1.5 sc) h (* 1.8 sc SL_REPORT_RULER_TEXT_SCALE) i 0)"
    Print #f, "      (foreach txt SL_SECTION_REF_LABELS"
    Print #f, "        (if (/= txt """")"
    Print #f, "          (progn"
    Print #f, "            (setq py (if (= SL_ORIENTATION ""Horizontal CCW"")"
    Print #f, "                       (+ vpBottom (* SL_VESSEL_XLEN (/ i 4.0) sc))"
    Print #f, "                       (- (+ vpBottom vpH) (* SL_VESSEL_XLEN (/ i 4.0) sc))))"
    Print #f, "            (SL_PaperLine (+ vpLeft vpW) py (+ vpLeft vpW tick) py ""REPORT_X_REFERENCE"")"
    Print #f, "            (SL_PaperTextLeft (+ vpLeft vpW tick gap) py h txt ""REPORT_X_REFERENCE"")"
    Print #f, "          )"
    Print #f, "        )"
    Print #f, "        (setq i (1+ i))"
    Print #f, "      )"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_PaperSectionInfo (x top u / y h boxW boxH txt)"
    Print #f, "  (if (= SL_SECTION_SHOW_TITLE ""YES"")"
    Print #f, "    (progn"
    Print #f, "      (setq y top)"
    Print #f, "      (SL_PaperTextLeft x y (* 0.12 u) (nth 0 SL_SECTION_TITLE_LINES) ""REPORT_TITLE"")"
    Print #f, "      (setq y (- y (* 0.19 u)))"
    Print #f, "      (foreach txt (cdr SL_SECTION_TITLE_LINES)"
    Print #f, "        (if (/= txt """") (progn (SL_PaperTextLeft x y (* 0.09 u) txt ""REPORT_TITLE"") (setq y (- y (* 0.15 u)))))"
    Print #f, "      )"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  (if (= SL_SECTION_SHOW_LEGEND ""YES"")"
    Print #f, "    (progn"
    Print #f, "      (setq y (- top (* 1.40 u)) boxW (* 0.30 u) boxH (* 0.16 u))"
    Print #f, "      (SL_PaperTextLeft x y (* 0.11 u) ""LEGEND"" ""REPORT_LEGEND"")"
    Print #f, "      (setq y (- y (* 0.38 u)))"
    Print #f, "      (if (= SL_HATCH_ENABLED ""YES"")"
    Print #f, "        (progn"
    Print #f, "          (SL_PaperRect x y boxW boxH ""REPORT_LEGEND_AUT_BOX"")"
    Print #f, "          (SL_PaperHatchRect x y boxW boxH (* 0.055 u) ""REPORT_LEGEND_AUT"")"
    Print #f, "          (SL_PaperTextLeft (+ x (* 0.38 u)) (+ y (/ boxH 2.0)) (* 0.085 u) ""AUT"" ""REPORT_LEGEND"")"
    Print #f, "        )"
    Print #f, "      )"
    Print #f, "      (SL_PaperRect (+ x (* 0.72 u)) y boxW boxH ""REPORT_LEGEND_MUT_BOX"")"
    Print #f, "      (SL_PaperHatchRect (+ x (* 0.72 u)) y boxW boxH (* 0.055 u) ""REPORT_LEGEND_MUT"")"
    Print #f, "      (SL_PaperTextLeft (+ x (* 1.10 u)) (+ y (/ boxH 2.0)) (* 0.085 u) ""MUT"" ""REPORT_LEGEND"")"
    Print #f, "      (setq y (- y (* 0.27 u)))"
    Print #f, "      (foreach txt SL_SECTION_LEGEND_LINES"
    Print #f, "        (if (/= txt """") (progn (SL_PaperTextLeft x y (* 0.082 u) txt ""REPORT_LEGEND"") (setq y (- y (* 0.145 u)))))"
    Print #f, "      )"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_PaperArrow (x1 y1 x2 y2 size layer / dx dy len ux uy px py)"
    Print #f, "  (setq dx (- x2 x1) dy (- y2 y1) len (sqrt (+ (* dx dx) (* dy dy))))"
    Print #f, "  (if (> len 0.000001)"
    Print #f, "    (progn"
    Print #f, "      (setq ux (/ dx len) uy (/ dy len) px (- uy) py ux)"
    Print #f, "      (SL_PaperLine x1 y1 x2 y2 layer)"
    Print #f, "      (SL_PaperLine x2 y2 (- x2 (* size ux) (* 0.55 size px)) (- y2 (* size uy) (* 0.55 size py)) layer)"
    Print #f, "      (SL_PaperLine x2 y2 (+ (- x2 (* size ux)) (* 0.55 size px)) (+ (- y2 (* size uy)) (* 0.55 size py)) layer)"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_PaperSectionRulers (vpLeft vpBottom vpW vpH startPos actualLen / spacing sc tick numH labelH textMult xNumOffset yNumOffset labelOffset arrowOffset pos px py rulerX rulerY mid arrowLen)"
    Print #f, "  (setq spacing SL_RULER_SPACING)"
    Print #f, "  (setq sc (/ vpH SL_VESSEL_XLEN))"
    Print #f, "  (setq textMult SL_REPORT_RULER_TEXT_SCALE)"
    Print #f, "  (setq tick (* 3.0 sc) numH (* 1.8 sc textMult) labelH (* 2.5 sc textMult))"
    Print #f, "  (setq xNumOffset (+ 5.0 (* 5.0 (max 0.0 (- textMult 1.0)))))"
    Print #f, "  (setq yNumOffset (+ 5.5 (* 2.0 (max 0.0 (- textMult 1.0)))))"
    Print #f, "  (setq labelOffset (+ 10.0 (* 8.0 (max 0.0 (- textMult 1.0)))))"
    Print #f, "  (setq arrowOffset (+ labelOffset 5.5))"
    Print #f, "  ;; Match the original red X-axis ruler outside the left viewport edge."
    Print #f, "  (setq rulerX (- vpLeft (* SL_RULER_OFFSET sc)))"
    Print #f, "  (SL_PaperLine rulerX vpBottom rulerX (+ vpBottom vpH) ""REPORT_X_RULER"")"
    Print #f, "  (setq pos 0.0)"
    Print #f, "  (while (<= pos SL_VESSEL_XLEN)"
    Print #f, "    (if (= SL_ORIENTATION ""Horizontal CCW"")"
    Print #f, "      (setq py (+ vpBottom (* pos sc)))"
    Print #f, "      (setq py (- (+ vpBottom vpH) (* pos sc)))"
    Print #f, "    )"
    Print #f, "    (SL_PaperLine rulerX py (- rulerX tick) py ""REPORT_X_RULER"")"
    Print #f, "    (SL_PaperText (- rulerX (* xNumOffset sc)) py numH 0 (SL_InchLabel pos) ""REPORT_X_RULER"")"
    Print #f, "    (setq pos (+ pos spacing))"
    Print #f, "  )"
    Print #f, "  (if (> (- SL_VESSEL_XLEN (- pos spacing)) 0.001)"
    Print #f, "    (progn"
    Print #f, "      (setq py (if (= SL_ORIENTATION ""Horizontal CCW"") (+ vpBottom vpH) vpBottom))"
    Print #f, "      (SL_PaperLine rulerX py (- rulerX tick) py ""REPORT_X_RULER"")"
    Print #f, "      (SL_PaperText (- rulerX (* xNumOffset sc)) py numH 0 (SL_InchLabel SL_VESSEL_XLEN) ""REPORT_X_RULER"")"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  (setq mid (+ vpBottom (/ vpH 2.0)))"
    Print #f, "  (SL_PaperText (- rulerX (* labelOffset sc)) mid labelH 90 SL_X_AXIS_LABEL ""REPORT_X_RULER"")"
    Print #f, "  (setq arrowLen (min (* 0.70 vpH) (* (SL_LabelArrowLength SL_X_AXIS_LABEL 2.5 0.0) sc)))"
    Print #f, "  (if (= SL_ORIENTATION ""Horizontal CCW"")"
    Print #f, "    (SL_PaperArrow (- rulerX (* arrowOffset sc)) (- mid (/ arrowLen 2.0))"
    Print #f, "                   (- rulerX (* arrowOffset sc)) (+ mid (/ arrowLen 2.0))"
    Print #f, "                   (* SL_ARROW_HEAD sc) ""REPORT_X_RULER"")"
    Print #f, "    (SL_PaperArrow (- rulerX (* arrowOffset sc)) (+ mid (/ arrowLen 2.0))"
    Print #f, "                   (- rulerX (* arrowOffset sc)) (- mid (/ arrowLen 2.0))"
    Print #f, "                   (* SL_ARROW_HEAD sc) ""REPORT_X_RULER"")"
    Print #f, "  )"
    Print #f, "  ;; Match the original blue Y-axis ruler below the viewport."
    Print #f, "  (setq rulerY (- vpBottom (* SL_RULER_OFFSET sc)))"
    Print #f, "  (SL_PaperLine vpLeft rulerY (+ vpLeft vpW) rulerY ""REPORT_Y_RULER"")"
    Print #f, "  (setq pos startPos)"
    Print #f, "  (while (<= pos (+ startPos actualLen))"
    Print #f, "    (if (= SL_ORIENTATION ""Horizontal CCW"")"
    Print #f, "      (setq px (- (+ vpLeft vpW) (* (- pos startPos) sc)))"
    Print #f, "      (setq px (+ vpLeft (* (- pos startPos) sc)))"
    Print #f, "    )"
    Print #f, "    (SL_PaperLine px rulerY px (- rulerY tick) ""REPORT_Y_RULER"")"
    Print #f, "    (SL_PaperText px (- rulerY (* yNumOffset sc)) numH 0 (SL_InchLabel pos) ""REPORT_Y_RULER"")"
    Print #f, "    (setq pos (+ pos spacing))"
    Print #f, "  )"
    Print #f, "  (if (> (- (+ startPos actualLen) (- pos spacing)) 0.001)"
    Print #f, "    (progn"
    Print #f, "      (setq px (if (= SL_ORIENTATION ""Horizontal CCW"") vpLeft (+ vpLeft vpW)))"
    Print #f, "      (SL_PaperLine px rulerY px (- rulerY tick) ""REPORT_Y_RULER"")"
    Print #f, "      (SL_PaperText px (- rulerY (* yNumOffset sc)) numH 0"
    Print #f, "                    (SL_InchLabel (+ startPos actualLen)) ""REPORT_Y_RULER"")"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  (setq mid (+ vpLeft (/ vpW 2.0)))"
    Print #f, "  (SL_PaperText mid (- rulerY (* (+ labelOffset 1.0) sc)) labelH 0 SL_Y_AXIS_LABEL ""REPORT_Y_RULER"")"
    Print #f, "  (setq arrowLen (min (* 0.70 vpW) (* (SL_LabelArrowLength SL_Y_AXIS_LABEL 2.5 0.0) sc)))"
    Print #f, "  (if (= SL_ORIENTATION ""Horizontal CCW"")"
    Print #f, "    (SL_PaperArrow (+ mid (/ arrowLen 2.0)) (- rulerY (* (+ arrowOffset 1.0) sc))"
    Print #f, "                   (- mid (/ arrowLen 2.0)) (- rulerY (* (+ arrowOffset 1.0) sc))"
    Print #f, "                   (* SL_ARROW_HEAD sc) ""REPORT_Y_RULER"")"
    Print #f, "    (SL_PaperArrow (- mid (/ arrowLen 2.0)) (- rulerY (* (+ arrowOffset 1.0) sc))"
    Print #f, "                   (+ mid (/ arrowLen 2.0)) (- rulerY (* (+ arrowOffset 1.0) sc))"
    Print #f, "                   (* SL_ARROW_HEAD sc) ""REPORT_Y_RULER"")"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun c:SECTIONVIEWPORTS ( / *error* oldOsmode pick oldVp ed ctr oldW oldH sectionLen rulerTextScale gap n i startPos endPos actualLen"
    Print #f, "                              left bottom areaW areaH leftMargin bottomMargin usableW usableH scale"
    Print #f, "                              vpW vpH vpLeft vpBottom groupBottom totalUsed ll ur vp win1 win2 oldCmdecho)"
    Print #f, "  (setq oldOsmode (getvar ""OSMODE"") oldCmdecho (getvar ""CMDECHO""))"
    Print #f, "  (defun *error* (msg)"
    Print #f, "    (setvar ""OSMODE"" oldOsmode)"
    Print #f, "    (setvar ""CMDECHO"" oldCmdecho)"
    Print #f, "    (if (and msg (/= msg ""Function cancelled"") (/= msg ""quit / exit abort"")) (princ (strcat ""\nSECTIONVIEWPORTS error: "" msg)))"
    Print #f, "    (princ)"
    Print #f, "  )"
    Print #f, "  (cond"
    Print #f, "    ((or (null SL_VESSEL_XLEN) (null SL_VESSEL_YLEN))"
    Print #f, "      (princ ""\nRun SCANLAYOUT before creating report viewports.""))"
    Print #f, "    ((/= (getvar ""TILEMODE"") 0)"
    Print #f, "      (princ ""\nSwitch to the report Sheet tab, then run SECTIONVIEWPORTS again.""))"
    Print #f, "    ((= SL_ORIENTATION ""Vertical"")"
    Print #f, "      (princ ""\nThis paper-ruler prototype is for Horizontal CW/CCW layouts.""))"
    Print #f, "    (T"
    Print #f, "      (setq pick (entsel ""\nSelect the existing sheet viewport to replace: ""))"
    Print #f, "      (if pick"
    Print #f, "        (progn"
    Print #f, "          (setq oldVp (car pick) ed (entget oldVp))"
    Print #f, "          (if (/= (cdr (assoc 0 ed)) ""VIEWPORT"")"
    Print #f, "            (princ ""\nThat object is not a sheet viewport."")"
    Print #f, "            (progn"
    Print #f, "              (initget 6)"
    Print #f, "              (setq sectionLen (getreal ""\nSection length in inches <360>: ""))"
    Print #f, "              (if (null sectionLen) (setq sectionLen 360.0))"
    Print #f, "              (initget 6)"
    Print #f, "              (setq rulerTextScale (getreal ""\nRuler text size multiplier <2.0>: ""))"
    Print #f, "              (if (null rulerTextScale) (setq rulerTextScale 2.0))"
    Print #f, "              (setq SL_REPORT_RULER_TEXT_SCALE rulerTextScale)"
    Print #f, "              (setq ctr (cdr (assoc 10 ed)) oldW (cdr (assoc 40 ed)) oldH (cdr (assoc 41 ed)))"
    Print #f, "              (setq left (- (car ctr) (/ oldW 2.0)) bottom (- (cadr ctr) (/ oldH 2.0)))"
    Print #f, "              (setq areaW oldW areaH oldH gap 0.15 leftMargin 0.65 bottomMargin 0.45)"
    Print #f, "              (setq n (fix (/ (+ SL_VESSEL_YLEN (- sectionLen 0.0000001)) sectionLen)))"
    Print #f, "              (setq usableW (- areaW leftMargin))"
    Print #f, "              (setq usableH (- areaH (* n bottomMargin) (* (1- n) gap)))"
    Print #f, "              (setq scale (min (/ usableW sectionLen) (/ usableH (* n SL_VESSEL_XLEN))))"
    Print #f, "              (setq vpH (* SL_VESSEL_XLEN scale))"
    Print #f, "              (setq totalUsed (+ (* n (+ vpH bottomMargin)) (* (1- n) gap)))"
    Print #f, "              (setq groupBottom (+ bottom (/ (- areaH totalUsed) 2.0)))"
    Print #f, "              ;; Paper-space construction must ignore running object snaps."
    Print #f, "              (setvar ""OSMODE"" 0)"
    Print #f, "              (setvar ""CMDECHO"" 0)"
    Print #f, "              (command ""_.UNDO"" ""_Begin"")"
    Print #f, "              (SL_ReturnPaperSpace)"
    Print #f, "              (SL_UnlockViewport oldVp)"
    Print #f, "              (command ""ERASE"" oldVp """")"
              Print #f, "              (SL_Layer ""REPORT_X_RULER"" 1)"
              Print #f, "              (SL_Layer ""REPORT_Y_RULER"" 5)"
              Print #f, "              (SL_Layer ""REPORT_VIEWPORT"" 7)"
              Print #f, "              (SL_SetLayerPlottable ""REPORT_VIEWPORT"" T)"
              Print #f, "              (setq i 0)"
    Print #f, "              (repeat n"
    Print #f, "                (setq startPos (* i sectionLen))"
    Print #f, "                (setq endPos (min SL_VESSEL_YLEN (+ startPos sectionLen)))"
    Print #f, "                (setq actualLen (- endPos startPos))"
    Print #f, "                (setq vpW (* actualLen scale))"
    Print #f, "                (setq vpLeft (+ left leftMargin (/ (- usableW vpW) 2.0)))"
                Print #f, "                (setq vpBottom (+ groupBottom (* (- n 1 i) (+ vpH bottomMargin gap)) bottomMargin))"
                Print #f, "                (setq ll (list vpLeft vpBottom) ur (list (+ vpLeft vpW) (+ vpBottom vpH)))"
                Print #f, "                (SL_SetLayer ""REPORT_VIEWPORT"")"
                Print #f, "                (SL_CreateViewport ll ur)"
    Print #f, "                (setq vp (entlast))"
    Print #f, "                (if (= SL_ORIENTATION ""Horizontal CCW"")"
    Print #f, "                  (progn"
    Print #f, "                    (setq win1 (list (- endPos) 0.0))"
    Print #f, "                    (setq win2 (list (- startPos) SL_VESSEL_XLEN))"
    Print #f, "                  )"
    Print #f, "                  (progn"
    Print #f, "                    (setq win1 (list startPos (- SL_VESSEL_XLEN)))"
    Print #f, "                    (setq win2 (list endPos 0.0))"
    Print #f, "                  )"
    Print #f, "                )"
    Print #f, "                (SL_ActivateViewport vp)"
    Print #f, "                (command ""ZOOM"" ""W"" win1 win2)"
    Print #f, "                (SL_ReturnPaperSpace)"
    Print #f, "                (SL_LockViewport vp)"
    Print #f, "                (SL_PaperSectionRulers vpLeft vpBottom vpW vpH startPos actualLen)"
    Print #f, "                (setq i (1+ i))"
    Print #f, "              )"
    Print #f, "              (command ""_.UNDO"" ""_End"")"
    Print #f, "              (setvar ""CMDECHO"" oldCmdecho)"
    Print #f, "              (command ""_.REGEN"")"
    Print #f, "              (princ (strcat ""\nCreated "" (itoa n) "" exact-size viewport(s) with paper-space rulers.""))"
    Print #f, "            )"
    Print #f, "          )"
    Print #f, "        )"
    Print #f, "        (princ ""\nSECTIONVIEWPORTS cancelled."")"
    Print #f, "      )"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  (setvar ""OSMODE"" oldOsmode)"
    Print #f, "  (setvar ""CMDECHO"" oldCmdecho)"
    Print #f, "  (princ)"
    Print #f, ")"
    Print #f, ""
    Print #f, ";; ------------------------------------------------------------"
    Print #f, ";; SECTIONPAGES - copy the active letter-size Sheet once per section."
    Print #f, ";; The selected viewport defines the usable report rectangle and the active"
    Print #f, ";; Sheet supplies the existing printer, paper, orientation, border, and title block."
    Print #f, ";; ------------------------------------------------------------"
    Print #f, "(defun SL_ClearSectionSheet (sheetName / ss kill i ent ed layerName)"
    Print #f, "  (SL_ReturnPaperSpace)"
    Print #f, "  (setq ss (ssget ""_X"" (list (cons 0 ""VIEWPORT"") (cons 410 sheetName))))"
    Print #f, "  (setq kill (ssadd))"
    Print #f, "  (if ss"
    Print #f, "    (progn"
    Print #f, "      (setq i 0)"
    Print #f, "      (repeat (sslength ss)"
    Print #f, "        (setq ent (ssname ss i) ed (entget ent) i (1+ i))"
    Print #f, "        (if (> (cdr (assoc 69 ed)) 1)"
    Print #f, "          (progn (SL_UnlockViewport ent) (ssadd ent kill))"
    Print #f, "        )"
    Print #f, "      )"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  (if (> (sslength kill) 0) (command ""ERASE"" kill """"))"
    Print #f, "  (foreach layerName (list ""REPORT_X_RULER"" ""REPORT_Y_RULER"" ""REPORT_X_REFERENCE"" ""REPORT_TITLE"" ""REPORT_LEGEND"" ""REPORT_LEGEND_AUT"" ""REPORT_LEGEND_MUT"" ""REPORT_LEGEND_AUT_BOX"" ""REPORT_LEGEND_MUT_BOX"" ""REPORT_VIEWPORT"")"
    Print #f, "    (setq ss (ssget ""_X"" (list (cons 8 layerName) (cons 410 sheetName))))"
    Print #f, "    (if ss (command ""ERASE"" ss """"))"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_SectionPagesStop (msg /)"
    Print #f, "  ;; Show the reason in a pop-up so the AXISBUILDER menu redraw cannot bury it."
    Print #f, "  (princ (strcat ""\nSECTIONPAGES: "" msg))"
    Print #f, "  (alert (strcat ""SECTIONPAGES cannot run:\n\n"" msg))"
    Print #f, "  (princ)"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun c:SECTIONPAGES ( / *error* oldOsmode pick templateVp ed ctr areaW areaH left bottom templateName"
    Print #f, "                           sectionLen rulerTextScale n i startPos endPos actualLen"
    Print #f, "                           leftMargin bottomMargin usableW usableH scale vpW vpH vpLeft vpBottom"
    Print #f, "                           sheetName firstSheet ll ur vp win1 win2 oldCmdecho infoX infoTop paperUnit)"
    Print #f, "  (setq oldOsmode (getvar ""OSMODE"") oldCmdecho (getvar ""CMDECHO""))"
    Print #f, "  (defun *error* (msg)"
    Print #f, "    (setvar ""OSMODE"" oldOsmode)"
    Print #f, "    (setvar ""CMDECHO"" oldCmdecho)"
    Print #f, "    (if (and msg (/= msg ""Function cancelled"") (/= msg ""quit / exit abort"")) (princ (strcat ""\nSECTIONPAGES error: "" msg)))"
    Print #f, "    (princ)"
    Print #f, "  )"
    Print #f, "  (cond"
    Print #f, "    ((or (null SL_VESSEL_XLEN) (null SL_VESSEL_YLEN))"
    Print #f, "      (SL_SectionPagesStop ""Generate the drawing first (SCANLAYOUT, or option 1 / AXISDRAWING in the AXISBUILDER menu), then run SECTIONPAGES again.""))"
    Print #f, "    ((/= (getvar ""TILEMODE"") 0)"
    Print #f, "      (SL_SectionPagesStop ""Switch to the letter-size template Sheet tab (paper space), then run SECTIONPAGES again.""))"
    Print #f, "    ((= SL_ORIENTATION ""Vertical"")"
    Print #f, "      (SL_SectionPagesStop ""Section sheets are not available for Vertical orientation yet. Set Project Settings orientation to Horizontal CW or Horizontal CCW, regenerate, and try again.""))"
    Print #f, "    (T"
    Print #f, "      (setq pick (entsel ""\nSelect the template viewport that defines the printable report area: ""))"
    Print #f, "      (if pick"
    Print #f, "        (progn"
    Print #f, "          (setq templateVp (car pick) ed (entget templateVp))"
    Print #f, "          (if (/= (cdr (assoc 0 ed)) ""VIEWPORT"")"
    Print #f, "            (princ ""\nThat object is not a sheet viewport."")"
    Print #f, "            (progn"
    Print #f, "              (initget 6)"
    Print #f, "              (setq sectionLen (getreal ""\nSection length in inches <180>: ""))"
    Print #f, "              (if (null sectionLen) (setq sectionLen 180.0))"
    Print #f, "              (initget 6)"
    Print #f, "              (setq rulerTextScale (getreal ""\nRuler text size multiplier <2.0>: ""))"
    Print #f, "              (if (null rulerTextScale) (setq rulerTextScale 2.0))"
    Print #f, "              (setq SL_REPORT_RULER_TEXT_SCALE rulerTextScale)"
    Print #f, "              (setq ctr (cdr (assoc 10 ed)) areaW (cdr (assoc 40 ed)) areaH (cdr (assoc 41 ed)))"
    Print #f, "              (setq left (- (car ctr) (/ areaW 2.0)) bottom (- (cadr ctr) (/ areaH 2.0)))"
    Print #f, "              (setq templateName (getvar ""CTAB""))"
    Print #f, "              ;; Give the section 68% of the sheet while preserving the right information panel."
    Print #f, "              (setq leftMargin (* areaW 0.13) bottomMargin (* areaH 0.08) paperUnit (/ areaH 7.5))"
    Print #f, "              (setq usableW (* areaW 0.68) usableH (- areaH bottomMargin))"
    Print #f, "              (setq scale (min (/ usableW sectionLen) (/ usableH SL_VESSEL_XLEN)))"
    Print #f, "              (setq vpH (* SL_VESSEL_XLEN scale))"
    Print #f, "              (setq n (fix (/ (+ SL_VESSEL_YLEN (- sectionLen 0.0000001)) sectionLen)))"
    Print #f, "              ;; Paper-space construction must ignore running object snaps."
    Print #f, "              (setvar ""OSMODE"" 0)"
    Print #f, "              (setvar ""CMDECHO"" 0)"
    Print #f, "              (SL_Layer ""REPORT_X_RULER"" 1)"
    Print #f, "              (SL_Layer ""REPORT_Y_RULER"" 5)"
    Print #f, "              (SL_Layer ""REPORT_X_REFERENCE"" 1)"
    Print #f, "              (SL_Layer ""REPORT_TITLE"" 7)"
    Print #f, "              (SL_Layer ""REPORT_LEGEND"" 7)"
              Print #f, "              (SL_Layer ""REPORT_LEGEND_AUT"" 5)"
              Print #f, "              (SL_Layer ""REPORT_LEGEND_MUT"" 3)"
              Print #f, "              (SL_Layer ""REPORT_LEGEND_AUT_BOX"" 5)"
              Print #f, "              (SL_Layer ""REPORT_LEGEND_MUT_BOX"" 3)"
              Print #f, "              (SL_SetLayerTransparency ""REPORT_LEGEND_AUT,REPORT_LEGEND_MUT"")"
              Print #f, "              (SL_Layer ""REPORT_VIEWPORT"" 7)"
              Print #f, "              (SL_SetLayerPlottable ""REPORT_VIEWPORT"" T)"
    Print #f, "              (setq i 0 firstSheet nil)"
    Print #f, "              (repeat n"
    Print #f, "                (setq startPos (* i sectionLen))"
    Print #f, "                (setq endPos (min SL_VESSEL_YLEN (+ startPos sectionLen)))"
    Print #f, "                (setq actualLen (- endPos startPos))"
    Print #f, "                (setq sheetName (strcat SL_SECTION_PREFIX (if (< i 9) ""0"" """") (itoa (1+ i)) ""_"" (rtos startPos 2 0) ""-"" (rtos endPos 2 0)))"
    Print #f, "                (SL_CopySheet templateName sheetName)"
    Print #f, "                (SL_ActivateSheet sheetName)"
    Print #f, "                (if (null firstSheet) (setq firstSheet sheetName))"
    Print #f, "                (SL_ClearSectionSheet sheetName)"
    Print #f, "                (setq vpW (* actualLen scale))"
    Print #f, "                (setq vpLeft (+ left leftMargin (/ (- usableW vpW) 2.0)))"
    Print #f, "                (setq vpBottom (+ bottom bottomMargin (/ (- usableH vpH) 2.0)))"
    Print #f, "                (setq ll (list vpLeft vpBottom) ur (list (+ vpLeft vpW) (+ vpBottom vpH)))"
    Print #f, "                (SL_SetLayer ""REPORT_VIEWPORT"")"
    Print #f, "                (SL_CreateViewport ll ur)"
    Print #f, "                (setq vp (entlast))"
    Print #f, "                (if (= SL_ORIENTATION ""Horizontal CCW"")"
    Print #f, "                  (progn (setq win1 (list (- endPos) 0.0)) (setq win2 (list (- startPos) SL_VESSEL_XLEN)))"
    Print #f, "                  (progn (setq win1 (list startPos (- SL_VESSEL_XLEN))) (setq win2 (list endPos 0.0)))"
    Print #f, "                )"
    Print #f, "                (SL_ActivateViewport vp)"
    Print #f, "                (command ""ZOOM"" ""W"" win1 win2)"
    Print #f, "                (SL_ReturnPaperSpace)"
    Print #f, "                (SL_LockViewport vp)"
    Print #f, "                (SL_PaperSectionRulers vpLeft vpBottom vpW vpH startPos actualLen)"
    Print #f, "                (SL_PaperSectionReferences vpLeft vpBottom vpW vpH)"
    Print #f, "                ;; Keep the panel clear of the right-side reference labels and"
    Print #f, "                ;; align the bottom of its legend summary with the section bottom."
    Print #f, "                (setq infoX (+ left (* areaW 0.865)) infoTop (+ vpBottom (* 2.55 paperUnit)))"
    Print #f, "                (SL_PaperSectionInfo infoX infoTop paperUnit)"
    Print #f, "                (setq i (1+ i))"
    Print #f, "              )"
    Print #f, "              (if firstSheet (SL_ActivateSheet firstSheet))"
    Print #f, "              (setvar ""CMDECHO"" oldCmdecho)"
    Print #f, "              (command ""_.REGEN"")"
    Print #f, "              (princ (strcat ""\nCreated "" (itoa n) "" letter-size section Sheet tab(s).""))"
    Print #f, "            )"
    Print #f, "          )"
    Print #f, "        )"
    Print #f, "        (princ ""\nSECTIONPAGES cancelled."")"
    Print #f, "      )"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  (setvar ""OSMODE"" oldOsmode)"
    Print #f, "  (setvar ""CMDECHO"" oldCmdecho)"
    Print #f, "  (princ)"
    Print #f, ")"
    Print #f, ""
    Print #f, ";; ------------------------------------------------------------"
End Sub

Private Function HatchTransparencySetting() As Long
    ' Layer transparency for hatch layers: 0 = opaque, 90 = most transparent.
    Dim v As Variant, t As Double
    v = GetSettingValue("AUT Hatch Transparency", 50)
    If IsNumeric(v) Then t = CDbl(v) Else t = 50
    If t < 0 Then t = 0
    If t > 90 Then t = 90
    HatchTransparencySetting = CLng(t)
End Function

Private Sub WriteLispHeader(ByVal f As Integer)
    Print #f, "(setq SL_CAD_PLATFORM " & LispStr(IIf(IsAutoCADOutput(), "AUTOCAD", "DRAFTSIGHT")) & ")"
    Print #f, "(setq SL_HATCH_TRANSPARENCY " & CStr(HatchTransparencySetting()) & ")"
    Print #f, ""
    Print #f, "(defun SL_pt (x y)"
    Print #f, "  ;; Normalize signed zero before constructing a CAD point."
    Print #f, "  (if (< (abs x) 0.0000001) (setq x 0.0))"
    Print #f, "  (if (< (abs y) 0.0000001) (setq y 0.0))"
    If IsAutoCADOutput() Then
        Print #f, "  ;; Native point lists bypass AutoCAD Dynamic Input/coordinate-string interpretation."
        Print #f, "  (list x y 0.0)"
    Else
        Print #f, "  (strcat (rtos x 2 3) "","" (rtos y 2 3))"
    End If
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_tf_x (x y)"
    Print #f, "  (cond"
    Print #f, "    ((= SL_ORIENTATION ""Vertical"") x)"
    Print #f, "    ((= SL_ORIENTATION ""Horizontal CW"") y)"
    Print #f, "    ((= SL_ORIENTATION ""Horizontal CCW"") (- y))"
    Print #f, "    (T y)"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_tf_y (x y)"
    Print #f, "  (cond"
    Print #f, "    ((= SL_ORIENTATION ""Vertical"") y)"
    Print #f, "    ((= SL_ORIENTATION ""Horizontal CW"") (- x))"
    Print #f, "    ((= SL_ORIENTATION ""Horizontal CCW"") x)"
    Print #f, "    (T (- x))"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_rot (base)"
    Print #f, "  (cond"
    Print #f, "    ((= SL_ORIENTATION ""Vertical"") base)"
    Print #f, "    ((= SL_ORIENTATION ""Horizontal CW"") (- base 90))"
    Print #f, "    ((= SL_ORIENTATION ""Horizontal CCW"") (+ base 90))"
    Print #f, "    (T (- base 90))"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_Layer (name color)"
    Print #f, "  (command ""-LAYER"" ""M"" name ""C"" (itoa color) """" """")"
    Print #f, ")"
    Print #f, ""
    Print #f, ";; Hatch lines are drawn ByLayer, so layer transparency (0-90) controls them."
    Print #f, ";; Reapplied on every run so existing layers pick up the current setting."
    Print #f, "(defun SL_SetLayerTransparency (layers / result ok act)"
    If IsAutoCADOutput() Then
        Print #f, "  (setq result (vl-catch-all-apply 'command (list ""_.-LAYER"" ""_TRansparency"" (itoa SL_HATCH_TRANSPARENCY) layers """")))"
    Else
        Print #f, "  (setq result (vl-catch-all-apply 'command (list ""_.-LAYER"" ""_Transparency"" (itoa SL_HATCH_TRANSPARENCY) layers """")))"
    End If
    Print #f, "  (setq ok (not (vl-catch-all-error-p result)))"
    Print #f, "  ;; If -LAYER is still waiting for input, cancel it so generation can continue."
    Print #f, "  (setq act (getvar ""CMDACTIVE""))"
    Print #f, "  (if (and act (> (logand act 3) 0)) (progn (command) (setq ok nil)))"
    Print #f, "  (if (not ok) (princ ""\nAxisBuilder: hatch layer transparency could not be set (set it in the Layer Manager).""))"
    Print #f, "  (princ)"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_SetLayer (layer)"
    Print #f, "  ;; Fast path for AutoCAD and DraftSight: avoid repeated -LAYER commands."
    Print #f, "  (if (and (/= layer """") (/= (strcase (getvar ""CLAYER"")) (strcase layer)))"
    Print #f, "    (setvar ""CLAYER"" layer)"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, ";; Set the DXF 290 layer plot flag directly for DraftSight/AutoCAD compatibility."
    Print #f, "(defun SL_SetLayerPlottable (name shouldPlot / rec flag)"
    Print #f, "  (setq rec (tblobjname ""LAYER"" name) flag (if shouldPlot 1 0))"
    Print #f, "  (if rec"
    Print #f, "    (progn"
    Print #f, "      (setq rec (entget rec))"
    Print #f, "      (if (assoc 290 rec)"
    Print #f, "        (setq rec (subst (cons 290 flag) (assoc 290 rec) rec))"
    Print #f, "        (setq rec (append rec (list (cons 290 flag))))"
    Print #f, "      )"
    Print #f, "      (entmod rec)"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_SetupViewportLayers ()"
    Print #f, "  (SL_Layer ""SLG_VIEWPORTS"" 7)"
    Print #f, "  (SL_SetLayerPlottable ""SLG_VIEWPORTS"" nil)"
    Print #f, "  (SL_Layer ""REPORT_VIEWPORT"" 7)"
    Print #f, "  (SL_SetLayerPlottable ""REPORT_VIEWPORT"" T)"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_AssignNormalViewportsToNonPlotLayer ( / vp nextEnt ed vpNum vpLayer)"
    Print #f, "  ;; DraftSight ssget cannot reliably see VIEWPORT entities on inactive Sheets."
    Print #f, "  ;; Walk the drawing database directly so Model-space generation can update them."
    Print #f, "  (setq vp (entnext))"
    Print #f, "  (while vp"
    Print #f, "    (setq nextEnt (entnext vp) ed (entget vp))"
    Print #f, "    (if (= (cdr (assoc 0 ed)) ""VIEWPORT"")"
    Print #f, "      (progn"
    Print #f, "        (setq vpNum (cdr (assoc 69 ed)) vpLayer (cdr (assoc 8 ed)))"
    Print #f, "        ;; Number 1 is DraftSight's built-in paper-space viewport."
    Print #f, "        ;; REPORT_VIEWPORT is intentionally printable for section reports."
    Print #f, "        (if (and vpNum (> vpNum 1) vpLayer (/= (strcase vpLayer) ""REPORT_VIEWPORT""))"
    Print #f, "          (progn"
    Print #f, "            (entmod (subst (cons 8 ""SLG_VIEWPORTS"") (assoc 8 ed) ed))"
    Print #f, "            (entupd vp)"
    Print #f, "          )"
    Print #f, "        )"
    Print #f, "      )"
    Print #f, "    )"
    Print #f, "    (setq vp nextEnt)"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_AssignCurrentSheetViewports ( / ss i vp ed vpNum vpLayer moved)"
    Print #f, "  ;; DraftSight materializes/rebuilds a Sheet viewport only after that Sheet is active."
    Print #f, "  (setq moved 0)"
    Print #f, "  (if (= (getvar ""TILEMODE"") 0)"
    Print #f, "    (progn"
    Print #f, "      (setq ss (ssget ""_X"" '((0 . ""VIEWPORT""))))"
    Print #f, "      (if ss"
    Print #f, "        (progn"
    Print #f, "          (setq i 0)"
    Print #f, "          (repeat (sslength ss)"
    Print #f, "            (setq vp (ssname ss i) ed (entget vp) i (1+ i))"
    Print #f, "            (setq vpNum (cdr (assoc 69 ed)) vpLayer (cdr (assoc 8 ed)))"
    Print #f, "            (if (and vpNum (> vpNum 1) vpLayer (/= (strcase vpLayer) ""REPORT_VIEWPORT""))"
    Print #f, "              (progn"
    Print #f, "                (entmod (subst (cons 8 ""SLG_VIEWPORTS"") (assoc 8 ed) ed))"
    Print #f, "                (entupd vp)"
    Print #f, "                (setq moved (1+ moved))"
    Print #f, "              )"
    Print #f, "            )"
    Print #f, "          )"
    Print #f, "        )"
    Print #f, "      )"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  moved"
    Print #f, ")"
    Print #f, ""
    If IsAutoCADOutput() Then
        Print #f, ";; AutoCAD override: update active PaperSpace viewport objects through COM."
        Print #f, "(defun SL_AssignCurrentSheetViewports ( / app doc paper obj objName vpLayer moved)"
        Print #f, "  (vl-load-com)"
        Print #f, "  (setq moved 0 app (vlax-get-acad-object) doc (vla-get-ActiveDocument app))"
        Print #f, "  (if (= (getvar ""TILEMODE"") 0)"
        Print #f, "    (progn"
        Print #f, "      (setq paper (vla-get-PaperSpace doc))"
        Print #f, "      (vlax-for obj paper"
        Print #f, "        (setq objName (vla-get-ObjectName obj))"
        Print #f, "        (if (= objName ""AcDbViewport"")"
        Print #f, "          (progn"
        Print #f, "            (setq vpLayer (vla-get-Layer obj))"
        Print #f, "            (if (/= (strcase vpLayer) ""REPORT_VIEWPORT"")"
        Print #f, "              (progn"
        Print #f, "                (vla-put-Layer obj ""SLG_VIEWPORTS"")"
        Print #f, "                (vla-Update obj)"
        Print #f, "                (setq moved (1+ moved))"
        Print #f, "              )"
        Print #f, "            )"
        Print #f, "          )"
        Print #f, "        )"
        Print #f, "      )"
        Print #f, "    )"
        Print #f, "  )"
        Print #f, "  moved"
        Print #f, ")"
        Print #f, ""
    End If
    Print #f, "(defun c:ABVIEWPORTFIX ( / moved)"
    Print #f, "  (SL_SetupViewportLayers)"
    Print #f, "  (setq moved (SL_AssignCurrentSheetViewports))"
    Print #f, "  (command ""_.REGEN"")"
    Print #f, "  (princ (strcat ""\nAxisBuilder moved "" (itoa moved) "" viewport(s) to the non-print layer.""))"
    Print #f, "  (princ)"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_SetupLayers ()"
    Print #f, "  (SL_Layer ""VESSEL"" 7)"
    Print #f, "  (SL_Layer ""SCANS"" 7)"
    Print #f, "  (SL_Layer ""SCAN_IMAGES"" 7)"
    Print #f, "  (SL_Layer ""AUT_HATCH"" 5)"
    Print #f, "  (SL_Layer ""SUPPORTS"" 6)"
    Print #f, "  (SL_Layer ""NOZZLES"" 7)"
    Print #f, "  (SL_Layer ""X_AXIS"" 1)"
    Print #f, "  (SL_Layer ""Y_AXIS"" 5)"
    Print #f, "  (SL_Layer ""LEGEND"" 7)"
    Print #f, "  ;; Dedicated legend sample layers prevent TEXTRESIZE from touching vessel scan geometry."
    Print #f, "  (SL_Layer ""LEGEND_SAMPLE"" 7)"
    Print #f, "  (SL_Layer ""LEGEND_AUT_HATCH"" 5)"
    Print #f, "  (SL_Layer ""LEGEND_MUT_HATCH"" 3)"
    Print #f, "  (SL_Layer ""MANUAL_UT_HATCH"" 3)"
    Print #f, "  (SL_Layer ""MUT_TEXT"" 7)"
    Print #f, "  (SL_Layer ""CIRC_WELDS"" 7)"
    Print #f, "  (SL_Layer ""LONG_SEAMS"" 7)"
    Print #f, "  (SL_Layer ""CENTERLINE"" 7)"
    Print #f, "  (SL_Layer ""TITLE_BLOCK"" 7)"
    Print #f, "  (SL_Layer ""HEADS"" 7)"
    Print #f, "  ;; Dedicated text-only layers used by the TEXTRESIZE command."
    Print #f, "  (SL_Layer ""SCAN_TEXT"" 7)"
    Print #f, "  (SL_Layer ""SUPPORT_TEXT"" 7)"
    Print #f, "  (SL_Layer ""SHELL_NOZZLE_TEXT"" 7)"
    Print #f, "  (SL_Layer ""HEAD_NOZZLE_TEXT"" 7)"
    Print #f, "  (SL_Layer ""SHELL_MUT_TEXT"" 7)"
    Print #f, "  (SL_Layer ""HEAD_MUT_TEXT"" 7)"
    Print #f, "  (SL_Layer ""X_RULER_TEXT"" 1)"
    Print #f, "  (SL_Layer ""Y_RULER_TEXT"" 5)"
    Print #f, "  (SL_Layer ""LEGEND_TEXT"" 7)"
    Print #f, "  (SL_Layer ""CIRC_WELD_TEXT"" 7)"
    Print #f, "  (SL_Layer ""LONG_SEAM_TEXT"" 7)"
    Print #f, "  (SL_Layer ""TITLE_BLOCK_TEXT"" 7)"
    Print #f, "  (SL_Layer ""HEAD_TITLE_TEXT"" 7)"
    Print #f, "  (SL_Layer ""HEAD_CLOCK_TEXT"" 7)"
    Print #f, "  (SL_SetLayerTransparency ""AUT_HATCH,LEGEND_AUT_HATCH,LEGEND_MUT_HATCH,MANUAL_UT_HATCH"")"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_Line (x1 y1 x2 y2 layer)"
    Print #f, "  (SL_SetLayer layer)"
    Print #f, "  (command ""LINE"""
    Print #f, "    (SL_pt (SL_tf_x x1 y1) (SL_tf_y x1 y1))"
    Print #f, "    (SL_pt (SL_tf_x x2 y2) (SL_tf_y x2 y2))"
    Print #f, "    """""
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_Rect (x y w h layer)"
    Print #f, "  (SL_SetLayer layer)"
    Print #f, "  (command ""RECTANGLE"""
    Print #f, "    (SL_pt (SL_tf_x x y) (SL_tf_y x y))"
    Print #f, "    (SL_pt (SL_tf_x (+ x w) (+ y h)) (SL_tf_y (+ x w) (+ y h)))"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_TextLayer (layer)"
    Print #f, "  ;; Maps geometry layers to dedicated text-only layers."
    Print #f, "  (cond"
    Print #f, "    ((= layer ""SCANS"") ""SCAN_TEXT"")"
    Print #f, "    ((= layer ""SUPPORTS"") ""SUPPORT_TEXT"")"
    Print #f, "    ((= layer ""NOZZLES"") ""SHELL_NOZZLE_TEXT"")"
    Print #f, "    ((= layer ""MUT_TEXT"") ""SHELL_MUT_TEXT"")"
    Print #f, "    ((= layer ""X_AXIS"") ""X_RULER_TEXT"")"
    Print #f, "    ((= layer ""Y_AXIS"") ""Y_RULER_TEXT"")"
    Print #f, "    ((= layer ""LEGEND"") ""LEGEND_TEXT"")"
    Print #f, "    ((= layer ""CIRC_WELDS"") ""CIRC_WELD_TEXT"")"
    Print #f, "    ((= layer ""LONG_SEAMS"") ""LONG_SEAM_TEXT"")"
    Print #f, "    ((= layer ""TITLE_BLOCK"") ""TITLE_BLOCK_TEXT"")"
    Print #f, "    (T layer)"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_Text (x y h rot txt layer / textLayer)"
    Print #f, "  (setq textLayer (SL_TextLayer layer))"
    Print #f, "  (SL_SetLayer textLayer)"
    Print #f, "  (command ""-TEXT"" ""J"" ""MC"""
    Print #f, "    (SL_pt (SL_tf_x x y) (SL_tf_y x y))"
    Print #f, "    (rtos h 2 3)"
    Print #f, "    (rtos (SL_rot rot) 2 0)"
    Print #f, "    txt"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_TextLeft (x y h rot txt layer / textLayer)"
    Print #f, "  ;; Middle-left justification for title blocks and notes."
    Print #f, "  (setq textLayer (SL_TextLayer layer))"
    Print #f, "  (SL_SetLayer textLayer)"
    Print #f, "  (command ""-TEXT"" ""J"" ""ML"""
    Print #f, "    (SL_pt (SL_tf_x x y) (SL_tf_y x y))"
    Print #f, "    (rtos h 2 3)"
    Print #f, "    (rtos (SL_rot rot) 2 0)"
    Print #f, "    txt"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_SetTextHeightInSelection (ss newH / i ent data)"
    Print #f, "  (if ss"
    Print #f, "    (progn"
    Print #f, "      (setq i 0)"
    Print #f, "      (while (< i (sslength ss))"
    Print #f, "        (setq ent (ssname ss i))"
    Print #f, "        (setq data (entget ent))"
    Print #f, "        (if (assoc 40 data)"
    Print #f, "          (progn"
    Print #f, "            (setq data (subst (cons 40 newH) (assoc 40 data) data))"
    Print #f, "            (entmod data)"
    Print #f, "            (entupd ent)"
    Print #f, "          )"
    Print #f, "        )"
    Print #f, "        (setq i (+ i 1))"
    Print #f, "      )"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_ResizeTextLayer (layer newH / ss)"
    Print #f, "  (setq ss (ssget ""_X"" (list (cons 0 ""TEXT,MTEXT"") (cons 8 layer))))"
    Print #f, "  (SL_SetTextHeightInSelection ss newH)"
    Print #f, "  (if ss (sslength ss) 0)"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_TextEntityPoint (ent / data)"
    Print #f, "  (setq data (entget ent))"
    Print #f, "  (cond"
    Print #f, "    ((assoc 11 data) (cdr (assoc 11 data)))"
    Print #f, "    ((assoc 10 data) (cdr (assoc 10 data)))"
    Print #f, "    (T nil)"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_TextEntityY (ent / p)"
    Print #f, "  (setq p (SL_TextEntityPoint ent))"
    Print #f, "  (if p (cadr p) 0.0)"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_SetTextEntityY (ent newY / data pair p newP)"
    Print #f, "  (setq data (entget ent))"
    Print #f, "  (setq pair (if (assoc 11 data) (assoc 11 data) (assoc 10 data)))"
    Print #f, "  (if pair"
    Print #f, "    (progn"
    Print #f, "      (setq p (cdr pair))"
    Print #f, "      (setq newP (list (car p) newY (if (caddr p) (caddr p) 0.0)))"
    Print #f, "      (setq data (subst (cons (car pair) newP) pair data))"
    Print #f, "      (entmod data)"
    Print #f, "      (entupd ent)"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_InsertTextByY (ent lst / y result placed item)"
    Print #f, "  (setq y (SL_TextEntityY ent))"
    Print #f, "  (setq result nil placed nil)"
    Print #f, "  (foreach item lst"
    Print #f, "    (if (and (not placed) (< y (SL_TextEntityY item)))"
    Print #f, "      (progn (setq result (append result (list ent))) (setq placed T))"
    Print #f, "    )"
    Print #f, "    (setq result (append result (list item)))"
    Print #f, "  )"
    Print #f, "  (if (not placed) (setq result (append result (list ent))))"
    Print #f, "  result"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_CollectLayerText (layer summaryOnly / ss i ent txt result rawTxt)"
    Print #f, "  (setq ss (ssget ""_X"" (list (cons 0 ""TEXT,MTEXT"") (cons 8 layer))))"
    Print #f, "  (setq result nil i 0)"
    Print #f, "  (if ss"
    Print #f, "    (while (< i (sslength ss))"
    Print #f, "      (setq ent (ssname ss i))"
    Print #f, "      (setq rawTxt (cdr (assoc 1 (entget ent))))"
    Print #f, "      (setq txt (if rawTxt (strcase rawTxt) """"))"
    Print #f, "      (if (or (not summaryOnly)"
    Print #f, "              (wcmatch txt ""TOTAL SCANS*,COVERAGE*,ORIENTATION*,OVERLAY*""))"
    Print #f, "        (setq result (SL_InsertTextByY ent result))"
    Print #f, "      )"
    Print #f, "      (setq i (+ i 1))"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  result"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_ReflowTextStack (layer newH spacingFactor summaryOnly / ents anchorY step i ent)"
    Print #f, "  ;; Keep the lowest text line fixed and re-space the remaining lines upward."
    Print #f, "  (setq ents (SL_CollectLayerText layer summaryOnly))"
    Print #f, "  (if (> (length ents) 1)"
    Print #f, "    (progn"
    Print #f, "      (setq anchorY (SL_TextEntityY (car ents)))"
    Print #f, "      (setq step (* newH spacingFactor))"
    Print #f, "      (setq i 0)"
    Print #f, "      (foreach ent ents"
    Print #f, "        (SL_SetTextEntityY ent (+ anchorY (* i step)))"
    Print #f, "        (setq i (+ i 1))"
    Print #f, "      )"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  (length ents)"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_PositionLegendSummaryBelowSamples (newH sampleBottomY / ents count step gap topY anchorY i ent)"
    Print #f, "  ;; Place the summary below the AUT/MUT samples using text-height-based clearance."
    Print #f, "  (setq ents (SL_CollectLayerText ""LEGEND_TEXT"" T))"
    Print #f, "  (setq count (length ents))"
    Print #f, "  (if (> count 0)"
    Print #f, "    (progn"
    Print #f, "      (setq step (* newH 1.55))"
    Print #f, "      (setq gap (* newH 2.0))"
    Print #f, "      (setq topY (- sampleBottomY gap))"
    Print #f, "      (setq anchorY (- topY (* (- count 1) step)))"
    Print #f, "      (setq i 0)"
    Print #f, "      (foreach ent ents"
    Print #f, "        (SL_SetTextEntityY ent (+ anchorY (* i step)))"
    Print #f, "        (setq i (+ i 1))"
    Print #f, "      )"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  count"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_IsLegendSummaryText (ent / raw txt)"
    Print #f, "  (setq raw (cdr (assoc 1 (entget ent))))"
    Print #f, "  (setq txt (if raw (strcase raw) """"))"
    Print #f, "  (wcmatch txt ""TOTAL SCANS*,COVERAGE*,ORIENTATION*,OVERLAY*"")"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_AddLayerToSS (layer target / src i ent)"
    Print #f, "  (setq src (ssget ""_X"" (list (cons 8 layer))))"
    Print #f, "  (if src"
    Print #f, "    (progn"
    Print #f, "      (setq i 0)"
    Print #f, "      (while (< i (sslength src))"
    Print #f, "        (setq ent (ssname src i))"
    Print #f, "        (if (not (ssmemb ent target)) (ssadd ent target))"
    Print #f, "        (setq i (+ i 1))"
    Print #f, "      )"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  target"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_SelectionByLayers (layers / result layer)"
    Print #f, "  (setq result (ssadd))"
    Print #f, "  (foreach layer layers (SL_AddLayerToSS layer result))"
    Print #f, "  result"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_EntityIntersectsBounds (ent bounds / obj pmin pmax lo hi err)"
    Print #f, "  (vl-load-com)"
    Print #f, "  (setq obj (vlax-ename->vla-object ent))"
    Print #f, "  (setq err (vl-catch-all-apply 'vla-GetBoundingBox (list obj 'pmin 'pmax)))"
    Print #f, "  (if (vl-catch-all-error-p err)"
    Print #f, "    nil"
    Print #f, "    (progn"
    Print #f, "      (setq lo (vlax-safearray->list pmin))"
    Print #f, "      (setq hi (vlax-safearray->list pmax))"
    Print #f, "      (and (<= (car lo) (nth 2 bounds)) (>= (car hi) (nth 0 bounds)) (<= (cadr lo) (nth 3 bounds)) (>= (cadr hi) (nth 1 bounds)))"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_ExpandBounds (bounds pad /)"
    Print #f, "  (if bounds (list (- (nth 0 bounds) pad) (- (nth 1 bounds) pad) (+ (nth 2 bounds) pad) (+ (nth 3 bounds) pad)) nil)"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_SelectionByLayersInBounds (layers bounds / result layer src i ent)"
    Print #f, "  (setq result (ssadd))"
    Print #f, "  (if bounds"
    Print #f, "    (foreach layer layers"
    Print #f, "      (setq src (ssget ""_X"" (list (cons 8 layer))))"
    Print #f, "      (if src"
    Print #f, "        (progn"
    Print #f, "          (setq i 0)"
    Print #f, "          (while (< i (sslength src))"
    Print #f, "            (setq ent (ssname src i))"
    Print #f, "            (if (SL_EntityIntersectsBounds ent bounds) (ssadd ent result))"
    Print #f, "            (setq i (+ i 1))"
    Print #f, "          )"
    Print #f, "        )"
    Print #f, "      )"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  result"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_SelectionBounds (ss / i ent obj pmin pmax lo hi minX minY maxX maxY err)"
    Print #f, "  (vl-load-com)"
    Print #f, "  (if (and ss (> (sslength ss) 0))"
    Print #f, "    (progn"
    Print #f, "      (setq i 0 minX nil minY nil maxX nil maxY nil)"
    Print #f, "      (while (< i (sslength ss))"
    Print #f, "        (setq ent (ssname ss i))"
    Print #f, "        (setq obj (vlax-ename->vla-object ent))"
    Print #f, "        (setq err (vl-catch-all-apply 'vla-GetBoundingBox (list obj 'pmin 'pmax)))"
    Print #f, "        (if (not (vl-catch-all-error-p err))"
    Print #f, "          (progn"
    Print #f, "            (setq lo (vlax-safearray->list pmin))"
    Print #f, "            (setq hi (vlax-safearray->list pmax))"
    Print #f, "            (setq minX (if minX (min minX (car lo)) (car lo)))"
    Print #f, "            (setq minY (if minY (min minY (cadr lo)) (cadr lo)))"
    Print #f, "            (setq maxX (if maxX (max maxX (car hi)) (car hi)))"
    Print #f, "            (setq maxY (if maxY (max maxY (cadr hi)) (cadr hi)))"
    Print #f, "          )"
    Print #f, "        )"
    Print #f, "        (setq i (+ i 1))"
    Print #f, "      )"
    Print #f, "      (if minX (list minX minY maxX maxY) nil)"
    Print #f, "    )"
    Print #f, "    nil"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_SetTextEntityPoint (ent newP / data pair)"
    Print #f, "  (setq data (entget ent))"
    Print #f, "  (setq pair (if (assoc 11 data) (assoc 11 data) (assoc 10 data)))"
    Print #f, "  (if pair"
    Print #f, "    (progn"
    Print #f, "      (setq data (subst (cons (car pair) newP) pair data))"
    Print #f, "      (entmod data)"
    Print #f, "      (entupd ent)"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_ScaleLegendLabelPositions (base factor / ss i ent p newP)"
    Print #f, "  (setq ss (ssget ""_X"" (list (cons 0 ""TEXT,MTEXT"") (cons 8 ""LEGEND_TEXT""))))"
    Print #f, "  (if ss"
    Print #f, "    (progn"
    Print #f, "      (setq i 0)"
    Print #f, "      (while (< i (sslength ss))"
    Print #f, "        (setq ent (ssname ss i))"
    Print #f, "        (if (not (SL_IsLegendSummaryText ent))"
    Print #f, "          (progn"
    Print #f, "            (setq p (SL_TextEntityPoint ent))"
    Print #f, "            (if p"
    Print #f, "              (progn"
    Print #f, "                (setq newP (list (+ (car base) (* (- (car p) (car base)) factor)) (+ (cadr base) (* (- (cadr p) (cadr base)) factor)) (if (caddr p) (caddr p) 0.0)))"
    Print #f, "                (SL_SetTextEntityPoint ent newP)"
    Print #f, "              )"
    Print #f, "            )"
    Print #f, "          )"
    Print #f, "        )"
    Print #f, "        (setq i (+ i 1))"
    Print #f, "      )"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_MoveLegendNonSummaryTextY (dy / ss i ent p)"
    Print #f, "  ;; Move LEGEND heading and AUT/MUT labels while leaving the four summary lines anchored."
    Print #f, "  (setq ss (ssget ""_X"" (list (cons 0 ""TEXT,MTEXT"") (cons 8 ""LEGEND_TEXT""))))"
    Print #f, "  (if (and ss (> (abs dy) 0.000001))"
    Print #f, "    (progn"
    Print #f, "      (setq i 0)"
    Print #f, "      (while (< i (sslength ss))"
    Print #f, "        (setq ent (ssname ss i))"
    Print #f, "        (if (not (SL_IsLegendSummaryText ent))"
    Print #f, "          (progn"
    Print #f, "            (setq p (SL_TextEntityPoint ent))"
    Print #f, "            (if p (SL_SetTextEntityPoint ent (list (car p) (+ (cadr p) dy) (if (caddr p) (caddr p) 0.0))))"
    Print #f, "          )"
    Print #f, "        )"
    Print #f, "        (setq i (+ i 1))"
    Print #f, "      )"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_MoveSelectionY (ss dy / i ent)"
    Print #f, "  (if (and ss (> (abs dy) 0.000001))"
    Print #f, "    (progn"
    Print #f, "      (setq i 0)"
    Print #f, "      (while (< i (sslength ss))"
    Print #f, "        (setq ent (ssname ss i))"
    Print #f, "        (command ""_.MOVE"" ent """" (list 0.0 0.0 0.0) (list 0.0 dy 0.0))"
    Print #f, "        (setq i (+ i 1))"
    Print #f, "      )"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_FirstTextHeight (layer / ss i data h value)"
    Print #f, "  ;; Return the smallest current height on the layer so mixed 2.0/2.3 legend text scales from the 2.0 body-text baseline."
    Print #f, "  (setq ss (ssget ""_X"" (list (cons 0 ""TEXT,MTEXT"") (cons 8 layer))))"
    Print #f, "  (setq i 0 h nil)"
    Print #f, "  (if ss"
    Print #f, "    (while (< i (sslength ss))"
    Print #f, "      (setq data (entget (ssname ss i)))"
    Print #f, "      (setq value (cdr (assoc 40 data)))"
    Print #f, "      (if value (setq h (if h (min h value) value)))"
    Print #f, "      (setq i (+ i 1))"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  h"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_ReflowRightPanelForLegend (oldH newH / factor textSS textBounds localBounds geomSS geomBounds allLegendSS before after base delta upperSS summarySS summaryBounds summaryBeforeBounds sampleGroupSS sampleGroupBounds fixedGap desiredBottom moveY i ent)"
    Print #f, "  ;; The summary stack is the fixed bottom anchor. Samples and all upper panel content grow upward."
    Print #f, "  (if (and oldH (> oldH 0.000001) newH (> newH 0.000001))"
    Print #f, "    (progn"
    Print #f, "      (setq factor (/ newH oldH))"
    Print #f, "      (setq textSS (SL_SelectionByLayers (list ""LEGEND_TEXT"")))"
    Print #f, "      (setq textBounds (SL_SelectionBounds textSS))"
    Print #f, "      (setq localBounds (SL_ExpandBounds textBounds (* oldH 2.5)))"
    Print #f, "      (setq geomSS (SL_SelectionByLayersInBounds (list ""LEGEND_SAMPLE"" ""LEGEND_AUT_HATCH"" ""LEGEND_MUT_HATCH"") localBounds))"
    Print #f, "      (setq allLegendSS (SL_SelectionByLayersInBounds (list ""LEGEND_SAMPLE"" ""LEGEND_AUT_HATCH"" ""LEGEND_MUT_HATCH"" ""LEGEND_TEXT"") localBounds))"
    Print #f, "      (setq geomBounds (SL_SelectionBounds geomSS))"
    Print #f, "      (setq before (SL_SelectionBounds allLegendSS))"
    Print #f, "      ;; Use a deliberate fixed clearance from the top of Total Scans to the bottom of the AUT/MUT boxes."
    Print #f, "      (setq summarySS (ssadd))"
    Print #f, "      (setq i 0)"
    Print #f, "      (if textSS"
    Print #f, "        (while (< i (sslength textSS))"
    Print #f, "          (setq ent (ssname textSS i))"
    Print #f, "          (if (SL_IsLegendSummaryText ent) (ssadd ent summarySS))"
    Print #f, "          (setq i (+ i 1))"
    Print #f, "        )"
    Print #f, "      )"
    Print #f, "      (setq summaryBeforeBounds (SL_SelectionBounds summarySS))"
    Print #f, "      (setq fixedGap 3.0)"
    Print #f, "      ;; Keep Overlay (the lowest summary line) fixed and re-space the other summary lines upward."
    Print #f, "      (SL_ReflowTextStack ""LEGEND_TEXT"" newH 1.55 T)"
    Print #f, "      (if (and before geomBounds geomSS (> (sslength geomSS) 0))"
    Print #f, "        (progn"
    Print #f, "          ;; Scale the AUT/MUT sample geometry from its bottom-left corner."
    Print #f, "          (setq base (list (nth 0 geomBounds) (nth 1 geomBounds) 0.0))"
    Print #f, "          (command ""_.SCALE"" geomSS """" base factor)"
    Print #f, "          (SL_ScaleLegendLabelPositions base factor)"
    Print #f, "        )"
    Print #f, "      )"
    Print #f, "      ;; Position the sample group from its true lowest visible point."
    Print #f, "      ;; This includes the AUT/MUT captions, which extend below the sample boxes."
    Print #f, "      (setq summaryBounds (SL_SelectionBounds summarySS))"
    Print #f, "      (setq sampleGroupSS (ssadd))"
    Print #f, "      (setq i 0)"
    Print #f, "      (if geomSS"
    Print #f, "        (while (< i (sslength geomSS))"
    Print #f, "          (ssadd (ssname geomSS i) sampleGroupSS)"
    Print #f, "          (setq i (+ i 1))"
    Print #f, "        )"
    Print #f, "      )"
    Print #f, "      (setq i 0)"
    Print #f, "      (if textSS"
    Print #f, "        (while (< i (sslength textSS))"
    Print #f, "          (setq ent (ssname textSS i))"
    Print #f, "          (if (not (SL_IsLegendSummaryText ent)) (ssadd ent sampleGroupSS))"
    Print #f, "          (setq i (+ i 1))"
    Print #f, "        )"
    Print #f, "      )"
    Print #f, "      (setq sampleGroupBounds (SL_SelectionBounds sampleGroupSS))"
    Print #f, "      (if (and summaryBounds sampleGroupBounds)"
    Print #f, "        (progn"
    Print #f, "          (setq desiredBottom (+ (nth 3 summaryBounds) fixedGap))"
    Print #f, "          (setq moveY (- desiredBottom (nth 1 sampleGroupBounds)))"
    Print #f, "          (SL_MoveSelectionY geomSS moveY)"
    Print #f, "          (SL_MoveLegendNonSummaryTextY moveY)"
    Print #f, "        )"
    Print #f, "      )"
    Print #f, "      (setq textSS (SL_SelectionByLayers (list ""LEGEND_TEXT"")))"
    Print #f, "      (setq textBounds (SL_SelectionBounds textSS))"
    Print #f, "      (setq localBounds (SL_ExpandBounds textBounds (* newH 2.5)))"
    Print #f, "      (setq allLegendSS (SL_SelectionByLayersInBounds (list ""LEGEND_SAMPLE"" ""LEGEND_AUT_HATCH"" ""LEGEND_MUT_HATCH"" ""LEGEND_TEXT"") localBounds))"
    Print #f, "      (setq after (SL_SelectionBounds allLegendSS))"
    Print #f, "      (setq delta (if (and before after) (- (nth 3 after) (nth 3 before)) 0.0))"
    Print #f, "      (if (> (abs delta) 0.000001)"
    Print #f, "        (progn"
    Print #f, "          (setq upperSS (SL_SelectionByLayers (list ""HEADS"" ""HEAD_NOZZLE_TEXT"" ""HEAD_MUT_TEXT"" ""HEAD_TITLE_TEXT"" ""HEAD_CLOCK_TEXT"" ""TITLE_BLOCK"" ""TITLE_BLOCK_TEXT"")))"
    Print #f, "          (SL_MoveSelectionY upperSS delta)"
    Print #f, "        )"
    Print #f, "      )"
    Print #f, "      delta"
    Print #f, "    )"
    Print #f, "    0.0"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_TextLayerHeight (layer / ss ent data h mixed i h2)"
    Print #f, "  (setq ss (ssget ""_X"" (list (cons 0 ""TEXT,MTEXT"") (cons 8 layer))))"
    Print #f, "  (if (and ss (> (sslength ss) 0))"
    Print #f, "    (progn"
    Print #f, "      (setq i 0 h nil mixed nil)"
    Print #f, "      (while (< i (sslength ss))"
    Print #f, "        (setq ent (ssname ss i))"
    Print #f, "        (setq data (entget ent))"
    Print #f, "        (setq h2 (cdr (assoc 40 data)))"
    Print #f, "        (if h2"
    Print #f, "          (if (null h)"
    Print #f, "            (setq h h2)"
    Print #f, "            (if (> (abs (- h h2)) 0.000001) (setq mixed T))"
    Print #f, "          )"
    Print #f, "        )"
    Print #f, "        (setq i (+ i 1))"
    Print #f, "      )"
    Print #f, "      (cond"
    Print #f, "        (mixed ""Mixed"")"
    Print #f, "        (h (rtos h 2 3))"
    Print #f, "        (T ""--"")"
    Print #f, "      )"
    Print #f, "    )"
    Print #f, "    ""--"""
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_MenuLine (num label layer)"
    Print #f, "  (princ (strcat ""\n "" (if (< num 10) "" "" """") (itoa num) ""  "" label ""  ["" (SL_TextLayerHeight layer) ""]""))"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_TextSizeMenu ()"
    Print #f, "  (princ ""\n========================================"")"
    Print #f, "  (princ ""\n         SCAN GENERATOR TEXT RESIZE"")"
    Print #f, "  (princ ""\n========================================"")"
    Print #f, "  (princ ""\nCurrent heights are shown in brackets."")"
    Print #f, "  (SL_MenuLine 1  ""Scan IDs...................."" ""SCAN_TEXT"")"
    Print #f, "  (SL_MenuLine 2  ""Support / Object IDs........"" ""SUPPORT_TEXT"")"
    Print #f, "  (SL_MenuLine 3  ""Shell Nozzle IDs............"" ""SHELL_NOZZLE_TEXT"")"
    Print #f, "  (SL_MenuLine 4  ""Head Nozzle IDs............."" ""HEAD_NOZZLE_TEXT"")"
    Print #f, "  (SL_MenuLine 5  ""Shell MUT IDs..............."" ""SHELL_MUT_TEXT"")"
    Print #f, "  (SL_MenuLine 6  ""Head MUT IDs................"" ""HEAD_MUT_TEXT"")"
    Print #f, "  (SL_MenuLine 7  ""X-Axis ruler text..........."" ""X_RULER_TEXT"")"
    Print #f, "  (SL_MenuLine 8  ""Y-Axis ruler text..........."" ""Y_RULER_TEXT"")"
    Print #f, "  (SL_MenuLine 9  ""Legend / summary............"" ""LEGEND_TEXT"")"
    Print #f, "  (SL_MenuLine 10 ""Circ weld labels............"" ""CIRC_WELD_TEXT"")"
    Print #f, "  (SL_MenuLine 11 ""Long seam labels............"" ""LONG_SEAM_TEXT"")"
    Print #f, "  (SL_MenuLine 12 ""Title block text............"" ""TITLE_BLOCK_TEXT"")"
    Print #f, "  (SL_MenuLine 13 ""Head titles................."" ""HEAD_TITLE_TEXT"")"
    Print #f, "  (SL_MenuLine 14 ""Head clock text............."" ""HEAD_CLOCK_TEXT"")"
    Print #f, "  (princ ""\n 15  All generated text"")"
    Print #f, "  (princ ""\n 16  Select individual text objects"")"
    Print #f, "  (princ ""\n  0  Exit"")"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun c:TEXTRESIZE ( / choice newH oldLegendH layer layers ss count item done)"
    Print #f, "  (setq done nil)"
    Print #f, "  (while (not done)"
    Print #f, "    (SL_TextSizeMenu)"
    Print #f, "    (initget 4)"
    Print #f, "    (setq choice (getint ""\nEnter option number <0>: ""))"
    Print #f, "    (if (null choice) (setq choice 0))"
    Print #f, "    (cond"
    Print #f, "      ((= choice 0)"
    Print #f, "        (setq done T)"
    Print #f, "        (princ ""\nTEXTRESIZE finished."")"
    Print #f, "      )"
    Print #f, "      ((and (>= choice 1) (<= choice 16))"
    Print #f, "        (initget 7)"
    Print #f, "        (setq newH (getreal ""\nEnter new text height: ""))"
    Print #f, "        (setq oldLegendH (if (or (= choice 9) (= choice 15)) (SL_FirstTextHeight ""LEGEND_TEXT"") nil))"
    Print #f, "        (if newH"
    Print #f, "          (progn"
    Print #f, "            (setq layer (cond"
    Print #f, "              ((= choice 1) ""SCAN_TEXT"")"
    Print #f, "              ((= choice 2) ""SUPPORT_TEXT"")"
    Print #f, "              ((= choice 3) ""SHELL_NOZZLE_TEXT"")"
    Print #f, "              ((= choice 4) ""HEAD_NOZZLE_TEXT"")"
    Print #f, "              ((= choice 5) ""SHELL_MUT_TEXT"")"
    Print #f, "              ((= choice 6) ""HEAD_MUT_TEXT"")"
    Print #f, "              ((= choice 7) ""X_RULER_TEXT"")"
    Print #f, "              ((= choice 8) ""Y_RULER_TEXT"")"
    Print #f, "              ((= choice 9) ""LEGEND_TEXT"")"
    Print #f, "              ((= choice 10) ""CIRC_WELD_TEXT"")"
    Print #f, "              ((= choice 11) ""LONG_SEAM_TEXT"")"
    Print #f, "              ((= choice 12) ""TITLE_BLOCK_TEXT"")"
    Print #f, "              ((= choice 13) ""HEAD_TITLE_TEXT"")"
    Print #f, "              ((= choice 14) ""HEAD_CLOCK_TEXT"")"
    Print #f, "              (T """")"
    Print #f, "            ))"
    Print #f, "            (cond"
    Print #f, "              ((<= choice 14)"
    Print #f, "                (setq count (SL_ResizeTextLayer layer newH))"
    Print #f, "              )"
    Print #f, "              ((= choice 15)"
    Print #f, "                (setq layers (list ""SCAN_TEXT"" ""SUPPORT_TEXT"" ""SHELL_NOZZLE_TEXT"" ""HEAD_NOZZLE_TEXT"" ""SHELL_MUT_TEXT"" ""HEAD_MUT_TEXT"" ""X_RULER_TEXT"" ""Y_RULER_TEXT"" ""LEGEND_TEXT"" ""CIRC_WELD_TEXT"" ""LONG_SEAM_TEXT"" ""TITLE_BLOCK_TEXT"" ""HEAD_TITLE_TEXT"" ""HEAD_CLOCK_TEXT""))"
    Print #f, "                (setq count 0)"
    Print #f, "                (foreach item layers (setq count (+ count (SL_ResizeTextLayer item newH))))"
    Print #f, "              )"
    Print #f, "              ((= choice 16)"
    Print #f, "                (princ ""\nSelect TEXT or MTEXT objects: "")"
    Print #f, "                (setq ss (ssget (list (cons 0 ""TEXT,MTEXT""))))"
    Print #f, "                (setq count (if ss (sslength ss) 0))"
    Print #f, "                (SL_SetTextHeightInSelection ss newH)"
    Print #f, "              )"
    Print #f, "            )"
    Print #f, "            ;; Rebuild the right panel from the fixed legend bottom anchor."
    Print #f, "            ;; Legend samples scale with the text, summary lines reflow, and the heads/title move by measured added height."
    Print #f, "            (if (or (= choice 9) (= choice 15)) (SL_ReflowRightPanelForLegend oldLegendH newH))"
    Print #f, "            (if (or (= choice 12) (= choice 15)) (SL_ReflowTextStack ""TITLE_BLOCK_TEXT"" newH 1.75 nil))"
    Print #f, "            (command ""_.REGEN"")"
    Print #f, "            (princ (strcat ""\nUpdated "" (itoa count) "" text object(s) to height "" (rtos newH 2 3) "".""))"
    Print #f, "            (princ ""\nChoose another category, or enter 0 to exit."")"
    Print #f, "          )"
    Print #f, "        )"
    Print #f, "      )"
    Print #f, "      (T (princ ""\nInvalid option. Enter a number from 0 through 16.""))"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  (princ)"
    Print #f, ")"
    Print #f, ""
    Print #f, ";; ------------------------------------------------------------"
    Print #f, ";; NOZZLEWRAP - automatically wrap all shell nozzles centered on opposite rollout boundaries."
    Print #f, ";; Click directly on the two opposite vessel rectangle edges used for circumference wrapping."
    Print #f, ";; All CIRCLE entities on the NOZZLES layer whose centers fall on either boundary are processed."
    Print #f, ";; Also supports left/right boundaries when the rollout is rotated."
    Print #f, ";; ------------------------------------------------------------"
    Print #f, "(defun SL_ArcFromCircle (cdata ctr rad a1 a2 / ed item code)"
    Print #f, "  (setq ed (list (cons 0 ""ARC"") (cons 8 (cdr (assoc 8 cdata))) (cons 10 ctr) (cons 40 rad) (cons 50 a1) (cons 51 a2)))"
    Print #f, "  (foreach code (list 6 48 62 370 420)"
    Print #f, "    (setq item (assoc code cdata))"
    Print #f, "    (if item (setq ed (append ed (list item))))"
    Print #f, "  )"
    Print #f, "  (entmakex ed)"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_WrapCircleAtEdges (ent cdata ctr rad horizontal edge1 edge2 / src dst c1 c2 a1 a2 b1 b2 z)"
    Print #f, "  (setq z (if (caddr ctr) (caddr ctr) 0.0))"
    Print #f, "  (if horizontal"
    Print #f, "    (progn"
    Print #f, "      (if (<= (abs (- (cadr ctr) edge1)) (abs (- (cadr ctr) edge2)))"
    Print #f, "        (setq src edge1 dst edge2)"
    Print #f, "        (setq src edge2 dst edge1)"
    Print #f, "      )"
    Print #f, "      (setq c1 (list (car ctr) src z) c2 (list (car ctr) dst z))"
    Print #f, "      (if (< dst src)"
    Print #f, "        (setq a1 pi a2 (* 2.0 pi) b1 0.0 b2 pi)"
    Print #f, "        (setq a1 0.0 a2 pi b1 pi b2 (* 2.0 pi))"
    Print #f, "      )"
    Print #f, "    )"
    Print #f, "    (progn"
    Print #f, "      (if (<= (abs (- (car ctr) edge1)) (abs (- (car ctr) edge2)))"
    Print #f, "        (setq src edge1 dst edge2)"
    Print #f, "        (setq src edge2 dst edge1)"
    Print #f, "      )"
    Print #f, "      (setq c1 (list src (cadr ctr) z) c2 (list dst (cadr ctr) z))"
    Print #f, "      (if (> dst src)"
    Print #f, "        (setq a1 (- (/ pi 2.0)) a2 (/ pi 2.0) b1 (/ pi 2.0) b2 (* 1.5 pi))"
    Print #f, "        (setq a1 (/ pi 2.0) a2 (* 1.5 pi) b1 (- (/ pi 2.0)) b2 (/ pi 2.0))"
    Print #f, "      )"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  (entdel ent)"
    Print #f, "  (SL_ArcFromCircle cdata c1 rad a1 a2)"
    Print #f, "  (SL_ArcFromCircle cdata c2 rad b1 b2)"
    Print #f, "  T"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun c:NOZZLEWRAP ( / *error* oldOsmode p1 p2 dx dy horizontal edge1 edge2 tol ss i ent cdata ctr rad coord count)"
    Print #f, "  ;; Temporarily add Nearest object snap (OSMODE bit 512), preserving every existing snap mode."
    Print #f, "  (setq oldOsmode (getvar ""OSMODE""))"
    Print #f, "  (defun *error* (msg)"
    Print #f, "    (setvar ""OSMODE"" oldOsmode)"
    Print #f, "    (if (and msg (/= msg ""Function cancelled"") (/= msg ""quit / exit abort""))"
    Print #f, "      (princ (strcat ""\nNOZZLEWRAP error: "" msg))"
    Print #f, "    )"
    Print #f, "    (princ)"
    Print #f, "  )"
    Print #f, "  (setvar ""OSMODE"" (logior oldOsmode 512))"
    Print #f, "  (setq tol 0.01)"
    Print #f, "  (setq p1 (getpoint ""\nFIRST EDGE: Click the vessel rectangle TOP long edge. If the rollout is rotated, click the LEFT long edge: ""))"
    Print #f, "  (if p1 (setq p2 (getpoint ""\nSECOND EDGE: Click the OPPOSITE vessel rectangle BOTTOM long edge. If rotated, click the RIGHT long edge: "")))"
    Print #f, "  (cond"
    Print #f, "    ((or (null p1) (null p2)) (princ ""\nNOZZLEWRAP cancelled.""))"
    Print #f, "    (T"
    Print #f, "      (setq dx (abs (- (car p2) (car p1))) dy (abs (- (cadr p2) (cadr p1))))"
    Print #f, "      (if (and (< dx 0.000001) (< dy 0.000001))"
    Print #f, "        (princ ""\nThe two boundary points are too close together."")"
    Print #f, "        (progn"
    Print #f, "          (setq horizontal (> dy dx))"
    Print #f, "          (if horizontal"
    Print #f, "            (setq edge1 (cadr p1) edge2 (cadr p2))"
    Print #f, "            (setq edge1 (car p1) edge2 (car p2))"
    Print #f, "          )"
    Print #f, "          (setq ss (ssget ""_X"" (list (cons 0 ""CIRCLE"") (cons 8 ""NOZZLES""))))"
    Print #f, "          (setq count 0 i 0)"
    Print #f, "          (command ""_.UNDO"" ""_Begin"")"
    Print #f, "          (if ss"
    Print #f, "            (repeat (sslength ss)"
    Print #f, "              (setq ent (ssname ss i) i (1+ i) cdata (entget ent))"
    Print #f, "              (setq ctr (cdr (assoc 10 cdata)) rad (cdr (assoc 40 cdata)))"
    Print #f, "              (setq coord (if horizontal (cadr ctr) (car ctr)))"
    Print #f, "              (if (or (<= (abs (- coord edge1)) tol) (<= (abs (- coord edge2)) tol))"
    Print #f, "                (progn"
    Print #f, "                  (SL_WrapCircleAtEdges ent cdata ctr rad horizontal edge1 edge2)"
    Print #f, "                  (setq count (1+ count))"
    Print #f, "                )"
    Print #f, "              )"
    Print #f, "            )"
    Print #f, "          )"
    Print #f, "          (command ""_.UNDO"" ""_End"")"
    Print #f, "          (command ""_.REGEN"")"
    Print #f, "          (if (> count 0)"
    Print #f, "            (princ (strcat ""\nNOZZLEWRAP complete. "" (itoa count) "" nozzle(s) wrapped.""))"
    Print #f, "            (princ ""\nNo nozzle centers were found on the selected boundaries."")"
    Print #f, "          )"
    Print #f, "        )"
    Print #f, "      )"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  (setvar ""OSMODE"" oldOsmode)"
    Print #f, "  (princ)"
    Print #f, ")"
    Print #f, ""
    Print #f, ";; ------------------------------------------------------------"
    WriteObjectWrapLisp f
    WriteSectionViewportLisp f
    Print #f, ";; AXISBUILDER - master launcher for AxisBuilder commands."
    Print #f, ";; ------------------------------------------------------------"
    Print #f, "(defun SL_ScanMenuDisplay ()"
    Print #f, "  (princ ""\n========================================"")"
    Print #f, "  (princ ""\n              AXISBUILDER"")"
    Print #f, "  (princ ""\n========================================"")"
    Print #f, "  (princ ""\n  1  Generate Scan Layout"")"
    Print #f, "  (princ ""\n  2  Resize Generated Text"")"
    Print #f, "  (princ ""\n  3  Wrap Shell Nozzle"")"
    Print #f, "  (princ ""\n  4  Wrap Support/Object"")"
    Print #f, "  (princ ""\n  5  Create Letter-Size Section Sheets"")"
    Print #f, "  (princ ""\n  0  Exit"")"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_RunMenuCommand (fn label / result)"
    Print #f, "  ;; Trap command cancellation/errors so control returns to AXISBUILDER."
    Print #f, "  (setq result (vl-catch-all-apply fn nil))"
    Print #f, "  (if (vl-catch-all-error-p result)"
    Print #f, "    (princ (strcat ""\n"" label "" stopped: "" (vl-catch-all-error-message result)))"
    Print #f, "  )"
    Print #f, "  (princ)"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun c:AXISBUILDER ( / choice done)"
    Print #f, "  (setq done nil)"
    Print #f, "  (while (not done)"
    Print #f, "    (SL_ScanMenuDisplay)"
    Print #f, "    (initget 4)"
    Print #f, "    (setq choice (getint ""\nSelect an option [0-5] <0>: ""))"
    Print #f, "    (if (null choice) (setq choice 0))"
    Print #f, "    (cond"
    Print #f, "      ((= choice 0) (setq done T))"
    Print #f, "      ((= choice 1) (SL_RunMenuCommand 'c:SCANLAYOUT ""SCANLAYOUT""))"
    Print #f, "      ((= choice 2) (SL_RunMenuCommand 'c:TEXTRESIZE ""TEXTRESIZE""))"
    Print #f, "      ((= choice 3) (SL_RunMenuCommand 'c:NOZZLEWRAP ""NOZZLEWRAP""))"
    Print #f, "      ((= choice 4) (SL_RunMenuCommand 'c:OBJECTWRAP ""OBJECTWRAP""))"
    Print #f, "      ((= choice 5) (SL_RunMenuCommand 'c:SECTIONPAGES ""SECTIONPAGES""))"
    Print #f, "      (T (princ ""\nInvalid option. Enter 0, 1, 2, 3, 4, or 5.""))"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  (princ ""\nAXISBUILDER closed."")"
    Print #f, "  (princ)"
    Print #f, ")"
    Print #f, ""
    Print #f, ";; Backward-compatible alias for existing workflows."
    Print #f, "(defun c:SCANMENU () (c:AXISBUILDER))"
    Print #f, ""
    Print #f, "(defun SL_HatchRect (x y w h layer / k x1 y1 x2 y2 step)"
    Print #f, "  ;; Custom 45-degree line hatch. More reliable than interactive HATCH in scripts."
    Print #f, "  (setq step SL_HATCH_SPACING)"
    Print #f, "  (if (<= step 0.0) (setq step 2.5))"
    Print #f, "  (setq k (- h))"
    Print #f, "  (while (<= k w)"
    Print #f, "    (setq x1 (max 0.0 k))"
    Print #f, "    (setq y1 (- x1 k))"
    Print #f, "    (setq x2 (min w (+ h k)))"
    Print #f, "    (setq y2 (- x2 k))"
    Print #f, "    (if (> x2 x1)"
    Print #f, "      (SL_Line (+ x x1) (+ y y1) (+ x x2) (+ y y2) layer)"
    Print #f, "    )"
    Print #f, "    (setq k (+ k step))"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_FitTextHeight (w h txt / longSide shortSide byShort byLong th)"
    Print #f, "  ;; Smart text sizing: conservative sizing so labels stay inside scan boxes."
    Print #f, "  (setq longSide (max w h))"
    Print #f, "  (setq shortSide (min w h))"
    Print #f, "  ;; Limit by short side first, then reduce more for longer labels."
    Print #f, "  (setq byShort (* shortSide 0.22))"
    Print #f, "  (setq byLong (/ (* longSide 0.78) (* (max 1 (strlen txt)) 0.85)))"
    Print #f, "  (setq th (min byShort byLong))"
    Print #f, "  (if (< th 0.45) (setq th 0.45))"
    Print #f, "  th"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_LabelRect (x y w h txt outlineLayer hatchLayer / cx cy rot th)"
    Print #f, "  (setq cx (+ x (/ w 2.0)))"
    Print #f, "  (setq cy (+ y (/ h 2.0)))"
    Print #f, "  (setq rot (if (> h w) 90 0))"
    Print #f, "  (setq th (SL_FitTextHeight w h txt))"
    Print #f, "  (SL_Rect x y w h outlineLayer)"
    Print #f, "  (if (and (/= hatchLayer """") (= SL_HATCH_ENABLED ""YES""))"
    Print #f, "    (SL_HatchRect x y w h hatchLayer)"
    Print #f, "  )"
    Print #f, "  (SL_Text cx cy th rot txt outlineLayer)"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_MUTPoint (x y txt / lr)"
    Print #f, "  ;; Shell manual UT location: MUT ID text only at the recorded X/Y point."
    Print #f, "  (setq lr (SL_ReadableRot))"
    Print #f, "  (SL_Text x y 1.5 lr txt ""SHELL_MUT_TEXT"")"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_AddAvoidRect (x y w h)"
    Print #f, "  (setq SL_AVOID_RECTS (cons (list x y (+ x w) (+ y h)) SL_AVOID_RECTS))"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_BBox (cx cy tw th rot / hw hh)"
    Print #f, "  ;; Approximate text bounding box in logical drawing coordinates."
    Print #f, "  (if (= (abs rot) 90)"
    Print #f, "    (progn (setq hw (/ th 2.0)) (setq hh (/ tw 2.0)))"
    Print #f, "    (progn (setq hw (/ tw 2.0)) (setq hh (/ th 2.0)))"
    Print #f, "  )"
    Print #f, "  (list (- cx hw) (- cy hh) (+ cx hw) (+ cy hh))"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_Overlap (a b)"
    Print #f, "  (not (or (<= (nth 2 a) (nth 0 b)) (>= (nth 0 a) (nth 2 b)) (<= (nth 3 a) (nth 1 b)) (>= (nth 1 a) (nth 3 b))))"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_ClearBBox (bb / ok r)"
    Print #f, "  ;; Keep label inside vessel and outside registered objects."
    Print #f, "  (setq ok T)"
    Print #f, "  (if (or (< (nth 0 bb) 0.0) (< (nth 1 bb) 0.0) (> (nth 2 bb) SL_VESSEL_XLEN) (> (nth 3 bb) SL_VESSEL_YLEN)) (setq ok nil))"
    Print #f, "  (foreach r SL_AVOID_RECTS (if (SL_Overlap bb r) (setq ok nil)))"
    Print #f, "  ok"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_CircleSmart (x y dia txt mode layer / r th lr tw insideOK outsideNeeded candidates cand lx ly bb found leaderStartX leaderStartY)"
    Print #f, "  (setq r (/ dia 2.0))"
    Print #f, "  (setq mode (strcase mode))"
    Print #f, "  (if (= mode """") (setq mode ""AUTO""))"
    Print #f, "  (SL_SetLayer layer)"
    Print #f, "  (command ""CIRCLE"" (SL_pt (SL_tf_x x y) (SL_tf_y x y)) (rtos r 2 3))"
    Print #f, "  (setq lr (SL_ReadableRot))"
    Print #f, "  (setq th (max 1.6 (min 2.4 (* dia 0.22))))"
    Print #f, "  (setq tw (* (max 1 (strlen txt)) th 0.60))"
    Print #f, "  (setq insideOK (and (>= dia SL_MIN_NOZZLE_DIA) (< tw (* dia 0.75))))"
    Print #f, "  (setq outsideNeeded (or (= mode ""OUTSIDE"") (and (= mode ""AUTO"") (not insideOK)) (= SL_SMART_NOZZLES ""NO"")))"
    Print #f, "  (if (= mode ""INSIDE"") (setq outsideNeeded nil))"
    Print #f, "  (if (and (/= txt """") (not outsideNeeded))"
    Print #f, "    (SL_Text x y th lr txt layer)"
    Print #f, "    (if (/= txt """")"
    Print #f, "      (progn"
    Print #f, "        ;; Try positions: right, upper-right, lower-right, left, upper-left, lower-left, above, below."
    Print #f, "        (setq candidates (list"
    Print #f, "          (list (+ x r SL_NOZZLE_LEADER_LEN (/ tw 2.0)) y (+ x r) y)"
    Print #f, "          (list (+ x r SL_NOZZLE_LEADER_LEN (/ tw 2.0)) (+ y r SL_NOZZLE_LEADER_LEN) (+ x r) (+ y r))"
    Print #f, "          (list (+ x r SL_NOZZLE_LEADER_LEN (/ tw 2.0)) (- y r SL_NOZZLE_LEADER_LEN) (+ x r) (- y r))"
    Print #f, "          (list (- x r SL_NOZZLE_LEADER_LEN (/ tw 2.0)) y (- x r) y)"
    Print #f, "          (list (- x r SL_NOZZLE_LEADER_LEN (/ tw 2.0)) (+ y r SL_NOZZLE_LEADER_LEN) (- x r) (+ y r))"
    Print #f, "          (list (- x r SL_NOZZLE_LEADER_LEN (/ tw 2.0)) (- y r SL_NOZZLE_LEADER_LEN) (- x r) (- y r))"
    Print #f, "          (list x (+ y r SL_NOZZLE_LEADER_LEN (/ tw 2.0)) x (+ y r))"
    Print #f, "          (list x (- y r SL_NOZZLE_LEADER_LEN (/ tw 2.0)) x (- y r))"
    Print #f, "        ))"
    Print #f, "        (setq found nil)"
    Print #f, "        (foreach cand candidates"
    Print #f, "          (if (not found)"
    Print #f, "            (progn"
    Print #f, "              (setq lx (nth 0 cand))"
    Print #f, "              (setq ly (nth 1 cand))"
    Print #f, "              (setq bb (SL_BBox lx ly tw th lr))"
    Print #f, "              (if (SL_ClearBBox bb) (setq found cand))"
    Print #f, "            )"
    Print #f, "          )"
    Print #f, "        )"
    Print #f, "        (if (not found) (setq found (car candidates)))"
    Print #f, "        (setq lx (nth 0 found))"
    Print #f, "        (setq ly (nth 1 found))"
    Print #f, "        (setq leaderStartX (nth 2 found))"
    Print #f, "        (setq leaderStartY (nth 3 found))"
    Print #f, "        (SL_Line leaderStartX leaderStartY lx ly layer)"
    Print #f, "        (SL_Text lx ly th lr txt layer)"
    Print #f, "        (setq bb (SL_BBox lx ly tw th lr))"
    Print #f, "        (SL_AddAvoidRect (nth 0 bb) (nth 1 bb) (- (nth 2 bb) (nth 0 bb)) (- (nth 3 bb) (nth 1 bb)))"
    Print #f, "      )"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  ;; Register nozzle body after placing its label so the current circle does not block its own leader label."
    Print #f, "  (SL_AddAvoidRect (- x r) (- y r) dia dia)"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_Arrow (x1 y1 x2 y2 layer / dx dy len ux uy px py ah)"
    Print #f, "  ;; Draw line plus simple arrowhead."
    Print #f, "  (setq ah SL_ARROW_HEAD)"
    Print #f, "  (setq dx (- x2 x1))"
    Print #f, "  (setq dy (- y2 y1))"
    Print #f, "  (setq len (sqrt (+ (* dx dx) (* dy dy))))"
    Print #f, "  (if (> len 0.0001)"
    Print #f, "    (progn"
    Print #f, "      (setq ux (/ dx len))"
    Print #f, "      (setq uy (/ dy len))"
    Print #f, "      (setq px (- uy))"
    Print #f, "      (setq py ux)"
    Print #f, "      (SL_Line x1 y1 x2 y2 layer)"
    Print #f, "      (SL_Line x2 y2 (- x2 (* ah ux) (* 0.55 ah px)) (- y2 (* ah uy) (* 0.55 ah py)) layer)"
    Print #f, "      (SL_Line x2 y2 (+ (- x2 (* ah ux)) (* 0.55 ah px)) (+ (- y2 (* ah uy)) (* 0.55 ah py)) layer)"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_InchLabel (val)"
    Print #f, "  (strcat (rtos val 2 0) (chr 34))"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_ReadableRot ()"
    Print #f, "  (cond"
    Print #f, "    ((= SL_ORIENTATION ""Vertical"") 0)"
    Print #f, "    ((= SL_ORIENTATION ""Horizontal CW"") 90)"
    Print #f, "    ((= SL_ORIENTATION ""Horizontal CCW"") -90)"
    Print #f, "    (T 0)"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_RulerTextRotX ()"
    Print #f, "  ;; Keeps X-axis ruler inch numbers and direction label readable after orientation transform."
    Print #f, "  (cond"
    Print #f, "    ((= SL_ORIENTATION ""Vertical"") 0)"
    Print #f, "    ((= SL_ORIENTATION ""Horizontal CW"") 180)"
    Print #f, "    ((= SL_ORIENTATION ""Horizontal CCW"") 0)"
    Print #f, "    (T 0)"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_RulerTextRotY ()"
    Print #f, "  ;; Keeps Y-axis ruler inch numbers and direction label readable after orientation transform."
    Print #f, "  (cond"
    Print #f, "    ((= SL_ORIENTATION ""Vertical"") 90)"
    Print #f, "    ((= SL_ORIENTATION ""Horizontal CW"") 90)"
    Print #f, "    ((= SL_ORIENTATION ""Horizontal CCW"") -90)"
    Print #f, "    (T 90)"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_LabelArrowLength (txt h fixedLen / calc)"
    Print #f, "  ;; Keep arrow about the length of the direction wording."
    Print #f, "  (setq calc (* (strlen txt) h 0.60))"
    Print #f, "  (if (< calc 14.0) (setq calc 14.0))"
    Print #f, "  calc"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_RulerX (x0 y0 length spacing layer label / pos tick arrLen mid last)"
    Print #f, "  (setq pos 0.0)"
    Print #f, "  (setq last -999.0)"
    Print #f, "  (setq tick 3.0)"
    Print #f, "  (SL_Line x0 y0 (+ x0 length) y0 layer)"
    Print #f, "  (while (<= pos length)"
    Print #f, "    (SL_Line (+ x0 pos) y0 (+ x0 pos) (- y0 tick) layer)"
    Print #f, "    (SL_Text (+ x0 pos) (- y0 5.0) 1.8 (SL_RulerTextRotX) (SL_InchLabel pos) layer)"
    Print #f, "    (setq last pos)"
    Print #f, "    (setq pos (+ pos spacing))"
    Print #f, "  )"
    Print #f, "  ;; Add final dimension tick if length does not land on the selected spacing."
    Print #f, "  (if (> (- length last) 0.001)"
    Print #f, "    (progn"
    Print #f, "      (SL_Line (+ x0 length) y0 (+ x0 length) (- y0 tick) layer)"
    Print #f, "      (SL_Text (+ x0 length) (- y0 5.0) 1.8 (SL_RulerTextRotX) (SL_InchLabel length) layer)"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  (setq arrLen (SL_LabelArrowLength label 2.5 0.0))"
    Print #f, "  (setq mid (/ length 2.0))"
    Print #f, "  (SL_Text (+ x0 mid) (- y0 10.0) 2.5 (SL_RulerTextRotX) label layer)"
    Print #f, "  (SL_Arrow (- (+ x0 mid) (/ arrLen 2.0)) (- y0 15.5) (+ (+ x0 mid) (/ arrLen 2.0)) (- y0 15.5) layer)"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_RulerX_Top (x0 y0 length spacing layer label / pos tick arrLen mid last)"
    Print #f, "  ;; Visual top X ruler: ticks, inch numbers, label, and arrow stay above/outside the vessel."
    Print #f, "  (setq pos 0.0)"
    Print #f, "  (setq last -999.0)"
    Print #f, "  (setq tick 3.0)"
    Print #f, "  (SL_Line x0 y0 (+ x0 length) y0 layer)"
    Print #f, "  (while (<= pos length)"
    Print #f, "    (SL_Line (+ x0 pos) y0 (+ x0 pos) (+ y0 tick) layer)"
    Print #f, "    (SL_Text (+ x0 pos) (+ y0 5.0) 1.8 (SL_RulerTextRotX) (SL_InchLabel pos) layer)"
    Print #f, "    (setq last pos)"
    Print #f, "    (setq pos (+ pos spacing))"
    Print #f, "  )"
    Print #f, "  (if (> (- length last) 0.001)"
    Print #f, "    (progn"
    Print #f, "      (SL_Line (+ x0 length) y0 (+ x0 length) (+ y0 tick) layer)"
    Print #f, "      (SL_Text (+ x0 length) (+ y0 5.0) 1.8 (SL_RulerTextRotX) (SL_InchLabel length) layer)"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  (setq arrLen (SL_LabelArrowLength label 2.5 0.0))"
    Print #f, "  (setq mid (/ length 2.0))"
    Print #f, "  (SL_Text (+ x0 mid) (+ y0 10.0) 2.5 (SL_RulerTextRotX) label layer)"
    Print #f, "  (SL_Arrow (- (+ x0 mid) (/ arrLen 2.0)) (+ y0 15.5) (+ (+ x0 mid) (/ arrLen 2.0)) (+ y0 15.5) layer)"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_RulerY (x0 y0 length spacing layer label / pos tick arrLen mid last)"
    Print #f, "  (setq pos 0.0)"
    Print #f, "  (setq last -999.0)"
    Print #f, "  (setq tick 3.0)"
    Print #f, "  (SL_Line x0 y0 x0 (+ y0 length) layer)"
    Print #f, "  (while (<= pos length)"
    Print #f, "    (SL_Line x0 (+ y0 pos) (- x0 tick) (+ y0 pos) layer)"
    Print #f, "    (SL_Text (- x0 5.5) (+ y0 pos) 1.8 (SL_RulerTextRotY) (SL_InchLabel pos) layer)"
    Print #f, "    (setq last pos)"
    Print #f, "    (setq pos (+ pos spacing))"
    Print #f, "  )"
    Print #f, "  ;; Add final dimension tick if length does not land on the selected spacing."
    Print #f, "  (if (> (- length last) 0.001)"
    Print #f, "    (progn"
    Print #f, "      (SL_Line x0 (+ y0 length) (- x0 tick) (+ y0 length) layer)"
    Print #f, "      (SL_Text (- x0 5.5) (+ y0 length) 1.8 (SL_RulerTextRotY) (SL_InchLabel length) layer)"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  (setq arrLen (SL_LabelArrowLength label 2.5 0.0))"
    Print #f, "  (setq mid (/ length 2.0))"
    Print #f, "  (SL_Text (- x0 11.0) (+ y0 mid) 2.5 (SL_RulerTextRotY) label layer)"
    Print #f, "  (SL_Arrow (- x0 16.5) (- (+ y0 mid) (/ arrLen 2.0)) (- x0 16.5) (+ (+ y0 mid) (/ arrLen 2.0)) layer)"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_RulerY_Right (x0 y0 length spacing layer label / pos tick arrLen mid last)"
    Print #f, "  ;; Visual right Y ruler: ticks, inch numbers, label, and arrow stay right/outside the vessel."
    Print #f, "  (setq pos 0.0)"
    Print #f, "  (setq last -999.0)"
    Print #f, "  (setq tick 3.0)"
    Print #f, "  (SL_Line x0 y0 x0 (+ y0 length) layer)"
    Print #f, "  (while (<= pos length)"
    Print #f, "    (SL_Line x0 (+ y0 pos) (+ x0 tick) (+ y0 pos) layer)"
    Print #f, "    (SL_Text (+ x0 5.5) (+ y0 pos) 1.8 (SL_RulerTextRotY) (SL_InchLabel pos) layer)"
    Print #f, "    (setq last pos)"
    Print #f, "    (setq pos (+ pos spacing))"
    Print #f, "  )"
    Print #f, "  (if (> (- length last) 0.001)"
    Print #f, "    (progn"
    Print #f, "      (SL_Line x0 (+ y0 length) (+ x0 tick) (+ y0 length) layer)"
    Print #f, "      (SL_Text (+ x0 5.5) (+ y0 length) 1.8 (SL_RulerTextRotY) (SL_InchLabel length) layer)"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  (setq arrLen (SL_LabelArrowLength label 2.5 0.0))"
    Print #f, "  (setq mid (/ length 2.0))"
    Print #f, "  (SL_Text (+ x0 11.0) (+ y0 mid) 2.5 (SL_RulerTextRotY) label layer)"
    Print #f, "  (SL_Arrow (+ x0 16.5) (- (+ y0 mid) (/ arrLen 2.0)) (+ x0 16.5) (+ (+ y0 mid) (/ arrLen 2.0)) layer)"
    Print #f, ")"
    Print #f, ""
    Print #f, ""
    Print #f, ";; v4.4.3 dedicated Horizontal CW visual ruler functions."
    Print #f, ";; These keep Vertical behavior untouched while mirroring CW visual bottom/left rulers correctly."
    Print #f, "(defun SL_RulerX_CW_Left (x0 y0 length spacing layer label / pos tick arrLen mid last)"
    Print #f, "  ;; Logical X ruler becomes the visual left ruler in Horizontal CW."
    Print #f, "  ;; Tick marks are flipped toward the vessel; text stays outside and readable."
    Print #f, "  (setq pos 0.0)"
    Print #f, "  (setq last -999.0)"
    Print #f, "  (setq tick 3.0)"
    Print #f, "  (SL_Line x0 y0 (+ x0 length) y0 layer)"
    Print #f, "  (while (<= pos length)"
    Print #f, "    (SL_Line (+ x0 pos) y0 (+ x0 pos) (- y0 tick) layer)"
    Print #f, "    (SL_Text (+ x0 pos) (- y0 5.0) 1.8 (SL_RulerTextRotX) (SL_InchLabel pos) layer)"
    Print #f, "    (setq last pos)"
    Print #f, "    (setq pos (+ pos spacing))"
    Print #f, "  )"
    Print #f, "  (if (> (- length last) 0.001)"
    Print #f, "    (progn"
    Print #f, "      (SL_Line (+ x0 length) y0 (+ x0 length) (- y0 tick) layer)"
    Print #f, "      (SL_Text (+ x0 length) (- y0 5.0) 1.8 (SL_RulerTextRotX) (SL_InchLabel length) layer)"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  (setq arrLen (SL_LabelArrowLength label 2.5 0.0))"
    Print #f, "  (setq mid (/ length 2.0))"
    Print #f, "  (SL_Text (+ x0 mid) (- y0 10.0) 2.5 (SL_RulerTextRotX) label layer)"
    Print #f, "  (SL_Arrow (- (+ x0 mid) (/ arrLen 2.0)) (- y0 15.5) (+ (+ x0 mid) (/ arrLen 2.0)) (- y0 15.5) layer)"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_RulerY_CW_Bottom (x0 y0 length spacing layer label / pos tick arrLen mid last)"
    Print #f, "  ;; Logical Y ruler is placed at vesselXLen + rulerOffset so it becomes the visual bottom ruler in Horizontal CW."
    Print #f, "  ;; Ticks point toward vessel; numbers, direction label, and arrow stay below/outside the ruler."
    Print #f, "  (setq pos 0.0)"
    Print #f, "  (setq last -999.0)"
    Print #f, "  (setq tick 3.0)"
    Print #f, "  (SL_Line x0 y0 x0 (+ y0 length) layer)"
    Print #f, "  (while (<= pos length)"
    Print #f, "    (SL_Line x0 (+ y0 pos) (+ x0 tick) (+ y0 pos) layer)"
    Print #f, "    (SL_Text (+ x0 5.5) (+ y0 pos) 1.8 (SL_RulerTextRotY) (SL_InchLabel pos) layer)"
    Print #f, "    (setq last pos)"
    Print #f, "    (setq pos (+ pos spacing))"
    Print #f, "  )"
    Print #f, "  (if (> (- length last) 0.001)"
    Print #f, "    (progn"
    Print #f, "      (SL_Line x0 (+ y0 length) (+ x0 tick) (+ y0 length) layer)"
    Print #f, "      (SL_Text (+ x0 5.5) (+ y0 length) 1.8 (SL_RulerTextRotY) (SL_InchLabel length) layer)"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  (setq arrLen (SL_LabelArrowLength label 2.5 0.0))"
    Print #f, "  (setq mid (/ length 2.0))"
    Print #f, "  (SL_Text (+ x0 11.0) (+ y0 mid) 2.5 (SL_RulerTextRotY) label layer)"
    Print #f, "  (SL_Arrow (+ x0 16.5) (- (+ y0 mid) (/ arrLen 2.0)) (+ x0 16.5) (+ (+ y0 mid) (/ arrLen 2.0)) layer)"
    Print #f, ")"
    Print #f, ""
    Print #f, ";; v4.4.8 dedicated Horizontal CCW visual ruler functions."
    Print #f, ";; CCW mapping: logical X controls visual LEFT/RIGHT; logical Y controls visual TOP/BOTTOM."
    Print #f, "(defun SL_RulerX_CCW_Left (x0 y0 length spacing layer label / pos tick arrLen mid last)"
    Print #f, "  ;; Logical X ruler at y = vesselYLen + offset becomes the visual left ruler in Horizontal CCW."
    Print #f, "  ;; Ticks, numbers, label, and arrow stay outside the vessel."
    Print #f, "  (setq pos 0.0)"
    Print #f, "  (setq last -999.0)"
    Print #f, "  (setq tick 3.0)"
    Print #f, "  (SL_Line x0 y0 (+ x0 length) y0 layer)"
    Print #f, "  (while (<= pos length)"
    Print #f, "    (SL_Line (+ x0 pos) y0 (+ x0 pos) (+ y0 tick) layer)"
    Print #f, "    (SL_Text (+ x0 pos) (+ y0 5.0) 1.8 (SL_RulerTextRotX) (SL_InchLabel pos) layer)"
    Print #f, "    (setq last pos)"
    Print #f, "    (setq pos (+ pos spacing))"
    Print #f, "  )"
    Print #f, "  (if (> (- length last) 0.001)"
    Print #f, "    (progn"
    Print #f, "      (SL_Line (+ x0 length) y0 (+ x0 length) (+ y0 tick) layer)"
    Print #f, "      (SL_Text (+ x0 length) (+ y0 5.0) 1.8 (SL_RulerTextRotX) (SL_InchLabel length) layer)"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  (setq arrLen (SL_LabelArrowLength label 2.5 0.0))"
    Print #f, "  (setq mid (/ length 2.0))"
    Print #f, "  (SL_Text (+ x0 mid) (+ y0 10.0) 2.5 (SL_RulerTextRotX) label layer)"
    Print #f, "  (SL_Arrow (- (+ x0 mid) (/ arrLen 2.0)) (+ y0 15.5) (+ (+ x0 mid) (/ arrLen 2.0)) (+ y0 15.5) layer)"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_RulerY_CCW_Bottom (x0 y0 length spacing layer label / pos tick arrLen mid last)"
    Print #f, "  ;; Logical Y ruler at x = -offset becomes the visual bottom ruler in Horizontal CCW."
    Print #f, "  ;; Ticks, numbers, label, and arrow stay outside the vessel."
    Print #f, "  (setq pos 0.0)"
    Print #f, "  (setq last -999.0)"
    Print #f, "  (setq tick 3.0)"
    Print #f, "  (SL_Line x0 y0 x0 (+ y0 length) layer)"
    Print #f, "  (while (<= pos length)"
    Print #f, "    (SL_Line x0 (+ y0 pos) (- x0 tick) (+ y0 pos) layer)"
    Print #f, "    (SL_Text (- x0 5.5) (+ y0 pos) 1.8 (SL_RulerTextRotY) (SL_InchLabel pos) layer)"
    Print #f, "    (setq last pos)"
    Print #f, "    (setq pos (+ pos spacing))"
    Print #f, "  )"
    Print #f, "  (if (> (- length last) 0.001)"
    Print #f, "    (progn"
    Print #f, "      (SL_Line x0 (+ y0 length) (- x0 tick) (+ y0 length) layer)"
    Print #f, "      (SL_Text (- x0 5.5) (+ y0 length) 1.8 (SL_RulerTextRotY) (SL_InchLabel length) layer)"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  (setq arrLen (SL_LabelArrowLength label 2.5 0.0))"
    Print #f, "  (setq mid (/ length 2.0))"
    Print #f, "  (SL_Text (- x0 11.0) (+ y0 mid) 2.5 (SL_RulerTextRotY) label layer)"
    Print #f, "  (SL_Arrow (- x0 16.5) (- (+ y0 mid) (/ arrLen 2.0)) (- x0 16.5) (+ (+ y0 mid) (/ arrLen 2.0)) layer)"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_RulerY_CCW_Top (x0 y0 length spacing layer label / pos tick arrLen mid last)"
    Print #f, "  ;; Logical Y ruler at x = vesselXLen + offset becomes the visual top ruler in Horizontal CCW."
    Print #f, "  ;; Ticks, numbers, label, and arrow stay outside the vessel."
    Print #f, "  (setq pos 0.0)"
    Print #f, "  (setq last -999.0)"
    Print #f, "  (setq tick 3.0)"
    Print #f, "  (SL_Line x0 y0 x0 (+ y0 length) layer)"
    Print #f, "  (while (<= pos length)"
    Print #f, "    (SL_Line x0 (+ y0 pos) (+ x0 tick) (+ y0 pos) layer)"
    Print #f, "    (SL_Text (+ x0 5.5) (+ y0 pos) 1.8 (SL_RulerTextRotY) (SL_InchLabel pos) layer)"
    Print #f, "    (setq last pos)"
    Print #f, "    (setq pos (+ pos spacing))"
    Print #f, "  )"
    Print #f, "  (if (> (- length last) 0.001)"
    Print #f, "    (progn"
    Print #f, "      (SL_Line x0 (+ y0 length) (+ x0 tick) (+ y0 length) layer)"
    Print #f, "      (SL_Text (+ x0 5.5) (+ y0 length) 1.8 (SL_RulerTextRotY) (SL_InchLabel length) layer)"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  (setq arrLen (SL_LabelArrowLength label 2.5 0.0))"
    Print #f, "  (setq mid (/ length 2.0))"
    Print #f, "  (SL_Text (+ x0 11.0) (+ y0 mid) 2.5 (SL_RulerTextRotY) label layer)"
    Print #f, "  (SL_Arrow (+ x0 16.5) (- (+ y0 mid) (/ arrLen 2.0)) (+ x0 16.5) (+ (+ y0 mid) (/ arrLen 2.0)) layer)"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_Legend (x y / boxW boxH lr orient covTxt covLoc totalTxt orientTxt overlayTxt lineStep)"
    Print #f, "  ;; Compact legend with project summary lines. Orientation is simplified to Horizontal or Vertical for client-facing output."
    Print #f, "  (setq boxW 12.0)"
    Print #f, "  (setq boxH 7.0)"
    Print #f, "  (setq lineStep 3.1)"
    Print #f, "  (setq lr (SL_ReadableRot))"
    Print #f, "  (setq orient (strcase SL_ORIENTATION))"
    Print #f, "  (setq covTxt SL_COVERAGE_TEXT)"
    Print #f, "  (setq covLoc (strcase SL_COVERAGE_LOCATION))"
    Print #f, "  (setq totalTxt SL_LEGEND_TOTAL_SCANS_TEXT)"
    Print #f, "  (setq orientTxt SL_LEGEND_ORIENTATION_TEXT)"
    Print #f, "  (setq overlayTxt SL_LEGEND_OVERLAY_TEXT)"
    Print #f, "  (if (= orient ""VERTICAL"")"
    Print #f, "    (progn"
    Print #f, "      ;; Vertical rollout: AUT and MUT use one visual row and the same visual rectangle shape as horizontal rollouts."
    Print #f, "      (SL_Text (+ x 6.0) (+ y 25.0) 2.3 lr ""LEGEND"" ""LEGEND"")"
    Print #f, "      (if (= SL_HATCH_ENABLED ""YES"")"
    Print #f, "        (progn"
    Print #f, "          (SL_Rect x (+ y 8.0) boxH boxW ""LEGEND_SAMPLE"")"
    Print #f, "          (SL_HatchRect x (+ y 8.0) boxH boxW ""LEGEND_AUT_HATCH"")"
    Print #f, "          (SL_Text (+ x 3.5) (+ y 5.0) 2.0 lr ""AUT"" ""LEGEND"")"
    Print #f, "        )"
    Print #f, "      )"
    Print #f, "      (SL_Rect (+ x 8.0) (+ y 8.0) boxH boxW ""LEGEND_SAMPLE"")"
    Print #f, "      (SL_HatchRect (+ x 8.0) (+ y 8.0) boxH boxW ""LEGEND_MUT_HATCH"")"
    Print #f, "      (SL_Text (+ x 11.5) (+ y 5.0) 2.0 lr ""MUT"" ""LEGEND"")"
    Print #f, "    )"
    Print #f, "    (progn"
    Print #f, "      ;; Horizontal rollouts: boxes read side-by-side after the coordinate transform."
    Print #f, "      (if (= orient ""HORIZONTAL CCW"")"
    Print #f, "        (SL_Text (+ x 19.0) (+ y 9.0) 2.3 lr ""LEGEND"" ""LEGEND"")"
    Print #f, "        (SL_Text (- x 5.0) (+ y 6.0) 2.3 lr ""LEGEND"" ""LEGEND"")"
    Print #f, "      )"
    Print #f, "      (SL_Rect x y boxW boxH ""LEGEND_SAMPLE"")"
    Print #f, "      (SL_HatchRect x y boxW boxH ""LEGEND_MUT_HATCH"")"
    Print #f, "      (SL_Text (+ x 15.0) (+ y 3.5) 2.0 lr ""MUT"" ""LEGEND"")"
    Print #f, "      (if (= SL_HATCH_ENABLED ""YES"")"
    Print #f, "        (progn"
    Print #f, "          (SL_Rect x (+ y 8.0) boxW boxH ""LEGEND_SAMPLE"")"
    Print #f, "          (SL_HatchRect x (+ y 8.0) boxW boxH ""LEGEND_AUT_HATCH"")"
    Print #f, "          (SL_Text (+ x 15.0) (+ y 11.5) 2.0 lr ""AUT"" ""LEGEND"")"
    Print #f, "        )"
    Print #f, "      )"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  ;; Legend summary stack: Total Scans, Coverage, Orientation, Overlay."
    Print #f, "  (cond"
    Print #f, "    ((= orient ""VERTICAL"")"
    Print #f, "      (SL_TextLeft x (- y 1.5) 2.0 lr totalTxt ""LEGEND"")"
    Print #f, "      (if (and (> (strlen covTxt) 0) (= covLoc ""LEGEND"")) (SL_TextLeft x (- y 4.6) 2.0 lr covTxt ""LEGEND""))"
    Print #f, "      (SL_TextLeft x (- y 7.7) 2.0 lr orientTxt ""LEGEND"")"
    Print #f, "      (SL_TextLeft x (- y 10.8) 2.0 lr overlayTxt ""LEGEND"")"
    Print #f, "    )"
    Print #f, "    ((= orient ""HORIZONTAL CW"")"
    Print #f, "      (SL_TextLeft (+ x 21.5) y 2.0 lr totalTxt ""LEGEND"")"
    Print #f, "      (if (and (> (strlen covTxt) 0) (= covLoc ""LEGEND"")) (SL_TextLeft (+ x 24.6) y 2.0 lr covTxt ""LEGEND""))"
    Print #f, "      (SL_TextLeft (+ x 27.7) y 2.0 lr orientTxt ""LEGEND"")"
    Print #f, "      (SL_TextLeft (+ x 30.8) y 2.0 lr overlayTxt ""LEGEND"")"
    Print #f, "    )"
    Print #f, "    ((= orient ""HORIZONTAL CCW"")"
    Print #f, "      (SL_TextLeft (- x 6.5) (+ y 15.0) 2.0 lr totalTxt ""LEGEND"")"
    Print #f, "      (if (and (> (strlen covTxt) 0) (= covLoc ""LEGEND"")) (SL_TextLeft (- x 9.6) (+ y 15.0) 2.0 lr covTxt ""LEGEND""))"
    Print #f, "      (SL_TextLeft (- x 12.7) (+ y 15.0) 2.0 lr orientTxt ""LEGEND"")"
    Print #f, "      (SL_TextLeft (- x 15.8) (+ y 15.0) 2.0 lr overlayTxt ""LEGEND"")"
    Print #f, "    )"
    Print #f, "    (T"
    Print #f, "      (SL_TextLeft x (- y 1.5) 2.0 lr totalTxt ""LEGEND"")"
    Print #f, "      (if (and (> (strlen covTxt) 0) (= covLoc ""LEGEND"")) (SL_TextLeft x (- y 4.6) 2.0 lr covTxt ""LEGEND""))"
    Print #f, "      (SL_TextLeft x (- y 7.7) 2.0 lr orientTxt ""LEGEND"")"
    Print #f, "      (SL_TextLeft x (- y 10.8) 2.0 lr overlayTxt ""LEGEND"")"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_DashLine (x1 y1 x2 y2 dash gap layer / dx dy len ux uy pos segEnd)"
    Print #f, "  (setq dx (- x2 x1))"
    Print #f, "  (setq dy (- y2 y1))"
    Print #f, "  (setq len (sqrt (+ (* dx dx) (* dy dy))))"
    Print #f, "  (if (> len 0.0001)"
    Print #f, "    (progn"
    Print #f, "      (setq ux (/ dx len))"
    Print #f, "      (setq uy (/ dy len))"
    Print #f, "      (setq pos 0.0)"
    Print #f, "      (while (< pos len)"
    Print #f, "        (setq segEnd (min len (+ pos dash)))"
    Print #f, "        (SL_Line (+ x1 (* ux pos)) (+ y1 (* uy pos)) (+ x1 (* ux segEnd)) (+ y1 (* uy segEnd)) layer)"
    Print #f, "        (setq pos (+ pos dash gap))"
    Print #f, "      )"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_CircWeld (loc start stop vesselXLen label / x1 x2 mid)"
    Print #f, "  ;; Circumferential weld: Location is Y position. Line runs in X-axis direction."
    Print #f, "  (setq x1 (if (< start 0.0) 0.0 start))"
    Print #f, "  (setq x2 (if (< stop 0.0) vesselXLen stop))"
    Print #f, "  (SL_DashLine x1 loc x2 loc 4.0 2.5 ""CIRC_WELDS"")"
    Print #f, "  (if (/= label """") (SL_Text (- x2 3.0) loc 2.0 0 label ""CIRC_WELDS""))"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_LongSeam (loc start stop vesselYLen label / y1 y2 labelY)"
    Print #f, "  ;; Long seam: Location is X position. Line runs in Y-axis direction."
    Print #f, "  ;; Label is placed inside the vessel near the seam start instead of centered."
    Print #f, "  (setq y1 (if (< start 0.0) 0.0 start))"
    Print #f, "  (setq y2 (if (< stop 0.0) vesselYLen stop))"
    Print #f, "  (setq labelY (+ y1 6.0))"
    Print #f, "  (if (> labelY (- y2 2.0)) (setq labelY (+ y1 (/ (- y2 y1) 2.0))))"
    Print #f, "  (SL_DashLine loc y1 loc y2 4.0 2.5 ""LONG_SEAMS"")"
    Print #f, "  (if (/= label """") (SL_Text loc labelY 2.0 90 label ""LONG_SEAMS""))"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_Centerline (vesselXLen vesselYLen / cx)"
    Print #f, "  ;; Long-dash centerline, runs with Y-axis direction at vessel midpoint."
    Print #f, "  (setq cx (/ vesselXLen 2.0))"
    Print #f, "  (SL_DashLine cx 0.0 cx vesselYLen 8.0 5.0 ""CENTERLINE"")"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_TitleBlock (x y title component unit client inspector dte rev / lr lineH orient lines i tx ty)"
    Print #f, "  ;; Title block is placed outside the vessel. Line stacking is orientation-aware."
    Print #f, "  (setq lr (SL_ReadableRot))"
    Print #f, "  (setq lineH 3.4)"
    Print #f, "  (setq orient (strcase SL_ORIENTATION))"
    Print #f, "  (setq lines (list title component unit client inspector dte rev))"
    Print #f, "  (setq i 0)"
    Print #f, "  (foreach txt lines"
    Print #f, "    (if (/= txt """")"
    Print #f, "      (progn"
    Print #f, "        (cond"
    Print #f, "          ((= orient ""HORIZONTAL CW"") (setq tx (+ x (* i lineH))) (setq ty y))"
    Print #f, "          ((= orient ""HORIZONTAL CCW"") (setq tx (- x (* i lineH))) (setq ty y))"
    Print #f, "          (T (setq tx x) (setq ty (- y (* i lineH))))"
    Print #f, "        )"
    Print #f, "        (SL_TextLeft tx ty (if (= i 0) 2.4 1.8) lr txt ""TITLE_BLOCK"")"
    Print #f, "      )"
    Print #f, "    )"
    Print #f, "    (setq i (+ i 1))"
    Print #f, "  )"
    Print #f, ")"

    Print #f, "(defun SL_HeadVector (deg / rad sx sy)"
    Print #f, "  ;; Converts clock-position angle to logical vector based on vessel orientation."
    Print #f, "  ;; 0 degrees = 12 o'clock/top; 90 degrees = 3 o'clock/right."
    Print #f, "  (setq rad (* deg (/ pi 180.0)))"
    Print #f, "  (setq sx (sin rad))"
    Print #f, "  (setq sy (cos rad))"
    Print #f, "  (cond"
    Print #f, "    ((= SL_ORIENTATION ""Vertical"") (list sx sy))"
    Print #f, "    ((= SL_ORIENTATION ""Horizontal CW"") (list (- sy) sx))"
    Print #f, "    ((= SL_ORIENTATION ""Horizontal CCW"") (list sy (- sx)))"
    Print #f, "    (T (list (- sy) sx))"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_HeadLabelPoint (cx cy r / orient)"
    Print #f, "  ;; Returns a point visually above the head for the head title."
    Print #f, "  (setq orient (strcase SL_ORIENTATION))"
    Print #f, "  (cond"
    Print #f, "    ((= orient ""HORIZONTAL CW"") (list (- cx r 9.0) cy))"
    Print #f, "    ((= orient ""HORIZONTAL CCW"") (list (+ cx r 9.0) cy))"
    Print #f, "    (T (list cx (+ cy r 9.0)))"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_HeadClockRef (cx cy r / hv dx dy sx sy ex ey tx ty lr)"
    Print #f, "  ;; Shows a small 12 o'clock reference above the head when enabled."
    Print #f, "  (if (= (strcase SL_SHOW_HEAD_CLOCK_REF) ""YES"")"
    Print #f, "    (progn"
    Print #f, "      (setq hv (SL_HeadVector 0.0))"
    Print #f, "      (setq dx (nth 0 hv))"
    Print #f, "      (setq dy (nth 1 hv))"
    Print #f, "      (setq sx (+ cx (* (+ r 2.0) dx)))"
    Print #f, "      (setq sy (+ cy (* (+ r 2.0) dy)))"
    Print #f, "      (setq ex (+ cx (* (+ r 7.0) dx)))"
    Print #f, "      (setq ey (+ cy (* (+ r 7.0) dy)))"
    Print #f, "      (SL_Arrow sx sy ex ey ""HEADS"")"
    Print #f, "      (setq tx (+ cx (* (+ r 10.0) dx)))"
    Print #f, "      (setq ty (+ cy (* (+ r 10.0) dy)))"
    Print #f, "      (setq lr (SL_ReadableRot))"
    Print #f, "      (SL_Text tx ty 1.7 lr ""12"" ""HEAD_CLOCK_TEXT"")"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_HeadCrosshairs (cx cy r /)"
    Print #f, "  ;; Optional light crosshair reference through the head center."
    Print #f, "  (if (= (strcase SL_SHOW_HEAD_CENTERLINES) ""YES"")"
    Print #f, "    (progn"
    Print #f, "      (SL_DashLine (- cx r) cy (+ cx r) cy 3.0 2.5 ""HEADS"")"
    Print #f, "      (SL_DashLine cx (- cy r) cx (+ cy r) 3.0 2.5 ""HEADS"")"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_HeadView (cx cy dia label / r lr p)"
    Print #f, "  ;; Optional head view shown in the right-side panel."
    Print #f, "  (setq r (/ dia 2.0))"
    Print #f, "  (setq lr (SL_ReadableRot))"
    Print #f, "  (SL_SetLayer ""HEADS"")"
    Print #f, "  (command ""CIRCLE"" (SL_pt (SL_tf_x cx cy) (SL_tf_y cx cy)) (rtos r 2 3))"
    Print #f, "  (SL_HeadCrosshairs cx cy r)"
    Print #f, "  (SL_HeadClockRef cx cy r)"
    Print #f, "  (setq p (SL_HeadLabelPoint cx cy r))"
    Print #f, "  (SL_Text (nth 0 p) (nth 1 p) 2.3 lr label ""HEAD_TITLE_TEXT"")"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_HeadNozzle (hcX hcY headDia deg factor dia txt mode layer / hv dx dy r nozR x y th lr insideOK outsideNeeded sx sy ex ey tx ty)"
    Print #f, "  ;; Head nozzle placement. Clock position controls direction; radius factor controls distance from head center."
    Print #f, "  ;; The calculated point is the nozzle centerline penetration point."
    Print #f, "  (setq hv (SL_HeadVector deg))"
    Print #f, "  (setq dx (nth 0 hv))"
    Print #f, "  (setq dy (nth 1 hv))"
    Print #f, "  (setq r (/ headDia 2.0))"
    Print #f, "  (setq nozR (/ dia 2.0))"
    Print #f, "  (setq x (+ hcX (* r factor dx)))"
    Print #f, "  (setq y (+ hcY (* r factor dy)))"
    Print #f, "  (setq lr (SL_ReadableRot))"
    Print #f, "  (setq th (max 1.4 (min 2.2 (* dia 0.22))))"
    Print #f, "  (setq mode (strcase mode))"
    Print #f, "  (if (= mode """") (setq mode ""AUTO""))"
    Print #f, "  (SL_SetLayer layer)"
    Print #f, "  (command ""CIRCLE"" (SL_pt (SL_tf_x x y) (SL_tf_y x y)) (rtos nozR 2 3))"
    Print #f, "  ;; Head labels stay outside more aggressively than shell nozzles to keep head views clean."
    Print #f, "  (setq insideOK (and (>= dia (+ SL_MIN_NOZZLE_DIA 2.0)) (< (* (strlen txt) th 0.55) (* dia 0.65))))"
    Print #f, "  (setq outsideNeeded (or (= mode ""OUTSIDE"") (and (= mode ""AUTO"") (not insideOK))))"
    Print #f, "  (if (= mode ""INSIDE"") (setq outsideNeeded nil))"
    Print #f, "  (if (/= txt """")"
    Print #f, "    (if outsideNeeded"
    Print #f, "      (progn"
    Print #f, "        ;; Leader points outward from head center through nozzle location."
    Print #f, "        (setq sx (+ x (* nozR dx)))"
    Print #f, "        (setq sy (+ y (* nozR dy)))"
    Print #f, "        (setq ex (+ x (* (+ nozR SL_HEAD_NOZZLE_LEADER_LEN 4.0) dx)))"
    Print #f, "        (setq ey (+ y (* (+ nozR SL_HEAD_NOZZLE_LEADER_LEN 4.0) dy)))"
    Print #f, "        (setq tx (+ x (* (+ nozR SL_HEAD_NOZZLE_LEADER_LEN 8.0) dx)))"
    Print #f, "        (setq ty (+ y (* (+ nozR SL_HEAD_NOZZLE_LEADER_LEN 8.0) dy)))"
    Print #f, "        (SL_Line sx sy ex ey layer)"
    Print #f, "        (SL_Text tx ty th lr txt ""HEAD_NOZZLE_TEXT"")"
    Print #f, "      )"
    Print #f, "      (SL_Text x y th lr txt ""HEAD_NOZZLE_TEXT"")"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_HeadMUT (hcX hcY headDia deg factor txt layer / hv dx dy r x y lr)"
    Print #f, "  ;; Head manual UT location: MUT ID text only at the recorded clock/radius position."
    Print #f, "  (setq hv (SL_HeadVector deg))"
    Print #f, "  (setq dx (nth 0 hv))"
    Print #f, "  (setq dy (nth 1 hv))"
    Print #f, "  (setq r (/ headDia 2.0))"
    Print #f, "  (setq x (+ hcX (* r factor dx)))"
    Print #f, "  (setq y (+ hcY (* r factor dy)))"
    Print #f, "  (setq lr (SL_ReadableRot))"
    Print #f, "  (if (/= txt """") (SL_Text x y 1.5 lr txt ""HEAD_MUT_TEXT""))"
    Print #f, ")"
    Print #f, ""
    Print #f, ""
End Sub

'============================================================
' Version 3.0B.18 - Image Overlay Automation test: delete stale processed PNGs + log preprocess dims
' Adds stretched/rotated PNG preprocessing and a separate overlay LSP export.
' Standard naming: SCAN1 -> S1, .png/.jpg/.jpeg; processed output remains PNG.
'============================================================

Public Sub ExportAxisBuilderLSP()
    Dim wsSet As Worksheet, wsScan As Worksheet, wsImg As Worksheet
    Dim wsShell As Worksheet, wsInfo As Worksheet, wsHead As Worksheet
    Set wsSet = ThisWorkbook.Worksheets("Project Settings")
    Set wsScan = ThisWorkbook.Worksheets("Scan Import")
    Set wsImg = ThisWorkbook.Worksheets("Scan Images")
    Set wsShell = ThisWorkbook.Worksheets("Shell Features")
    Set wsInfo = ThisWorkbook.Worksheets("Drawing Information")
    Set wsHead = ThisWorkbook.Worksheets("Head Features")
    gCADPlatformOutput = SelectedCADPlatform()

    Dim projectName As String
    projectName = CleanFileName(CStr(GetSettingValue("Project Name", "Scan_Layout")))
    If Len(projectName) = 0 Then projectName = "Scan_Layout"

    If ThisWorkbook.Path = "" Then
        MsgBox "Please save the workbook first so the macro can find the project folder and image files.", vbExclamation, "Scan Layout Generator"
        Exit Sub
    End If

    'Generation safety gate: stop before image processing or any CDbl conversion
    'when OCR REVIEW text, missing required values, or other non-numeric data exists.
    If Not ValidateLayoutGenerationData(wsScan, wsShell, wsHead) Then Exit Sub

    Dim filePath As Variant
    filePath = Application.GetSaveAsFilename( _
        InitialFileName:=projectName & "_AxisBuilder_Master.lsp", _
        FileFilter:="AutoLISP Files (*.lsp), *.lsp", _
        Title:="Save " & CADPlatformDisplayName() & " AxisBuilder Master AutoLISP File")

    If filePath = False Then Exit Sub

    Dim orientation As String
    orientation = NormalizeVesselOrientation(CStr(GetSettingValue("Vessel Orientation", "Horizontal CW")))

    Dim vesselLength As Double, vesselHeight As Double, spacing As Double
    vesselLength = CDbl(GetSettingValue("Vessel Length", 144))
    vesselHeight = CDbl(GetSettingValue("Vessel Height", 151))
    spacing = CDbl(GetSettingValue("Ruler Spacing", 12))

    Dim showCoverage As String, coverageLocation As String, coverageText As String
    Dim legendTotalScansText As String, legendOrientationText As String, legendOverlayText As String
    showCoverage = UCase(Trim(CStr(GetSettingValue("Show Coverage Percentage", "YES"))))
    coverageLocation = UCase(Trim(CStr(GetSettingValue("Coverage Location", "Legend"))))
    If coverageLocation = "" Then coverageLocation = "LEGEND"
    coverageText = CoverageDisplayText(wsScan, vesselLength, vesselHeight)
    If showCoverage = "NO" Then coverageText = ""
    legendTotalScansText = TotalScansDisplayText(wsScan)
    legendOrientationText = LegendOrientationDisplayText(orientation)
    legendOverlayText = LegendOverlayDisplayText(True)

    Dim ppi As Double, rot As Double, pixelsPerUnit As Double, overlayScale As Double
    ppi = CDbl(GetSettingValue("Overlay Pixels Per Inch", 40))
    If ppi <= 0 Then ppi = 40
    pixelsPerUnit = CDbl(GetSettingValue("DraftSight Image Pixels Per Unit", 400))
    If pixelsPerUnit <= 0 Then pixelsPerUnit = 400
    overlayScale = pixelsPerUnit / ppi
    rot = 0 'Images are rotated/stretched during preprocessing in v3.0B.9.

    Dim imageFolder As String, processedFolderName As String, processedFolder As String
    imageFolder = Trim(CStr(GetSettingValue("Original Image Folder", "")))
    If imageFolder = "" Then imageFolder = Trim(CStr(GetSettingValue("Image Folder", "")))
    If imageFolder = "" Then imageFolder = ThisWorkbook.Path
    processedFolderName = Trim(CStr(GetSettingValue("Processed Image Folder", "Processed_Images")))
    If processedFolderName = "" Then processedFolderName = "Processed_Images"
    If InStr(1, processedFolderName, ":\", vbTextCompare) > 0 Or Left$(processedFolderName, 2) = "\\" Then
        processedFolder = processedFolderName
    Else
        processedFolder = CombinePath(imageFolder, processedFolderName)
    End If
    EnsureFolder processedFolder

    Application.ScreenUpdating = False
    SyncScanImagesFromScanImport wsScan, wsImg
    ResetValidationSummaryStats True
    If ValidationEnabled() Then
        'Use the shared image validator so generation failures also highlight the
        'exact Scan Images row, update its status, refresh the dashboard, and
        'write the missing scan IDs to Message Center.
        If Not SLG_ScanImages.ValidateCurrentScanImages(True, True, True) Then
            Application.ScreenUpdating = True
            Exit Sub
        End If
        If Not ValidatePhase1A(wsScan, True, imageFolder, wsImg) Then
            Application.ScreenUpdating = True
            Exit Sub
        End If
        If Not ValidatePhase1B(wsScan) Then
            Application.ScreenUpdating = True
            Exit Sub
        End If
    Else
        UpdateBasicValidationScanCount wsScan
    End If
    ProcessOverlayImages wsScan, wsImg, orientation, imageFolder, processedFolder, ppi, pixelsPerUnit
    Application.ScreenUpdating = True

    Dim f As Integer
    f = FreeFile
    Open CStr(filePath) For Output As #f

    Print #f, ";;; AxisBuilder v5.1 Stage 1 - One Generated Layered Drawing"
    Print #f, ";;; Generated from Excel on " & Format(Now, "yyyy-mm-dd hh:nn:ss")
    Print #f, ";;; Load in " & CADPlatformDisplayName() & " with APPLOAD/LOADAPPLICATION, then type AXISBUILDER."
    Print #f, ""

    WriteLispHeader f
    WriteOverlayLispFunctions f

    Print #f, "(setq SL_ORIENTATION " & LispStr(orientation) & ")"
    Print #f, "(setq SL_SECTION_PREFIX ""OVL-SEC-"")"
    Print #f, "(setq SL_HATCH_ENABLED " & LispStr(UCase(CStr(GetSettingValue("AUT Hatch Enabled", "YES")))) & ")"
    Print #f, "(setq SL_HATCH_SPACING " & LispNum(CDbl(GetSettingValue("AUT Hatch Scale", GetSettingValue("Hatch Scale", 2.5)))) & ")"
    Print #f, "(setq SL_HATCH_ANGLE " & LispNum(CDbl(GetSettingValue("AUT Hatch Angle", 45))) & ")"
    Print #f, "(setq SL_COVERAGE_TEXT " & LispStr(coverageText) & ")"
    Print #f, "(setq SL_COVERAGE_LOCATION " & LispStr(coverageLocation) & ")"
    Print #f, "(setq SL_LEGEND_TOTAL_SCANS_TEXT " & LispStr(legendTotalScansText) & ")"
    Print #f, "(setq SL_LEGEND_ORIENTATION_TEXT " & LispStr(legendOrientationText) & ")"
    Print #f, "(setq SL_LEGEND_OVERLAY_TEXT " & LispStr(legendOverlayText) & ")"
    Print #f, "(setq SL_OVERLAY_PPI " & LispNum(ppi) & ")"
    Print #f, "(setq SL_OVERLAY_SCALE " & LispNum(overlayScale) & ")"
    Print #f, "(setq SL_OVERLAY_ROTATION " & LispNum(rot) & ")"
    Print #f, "(setq SL_ARROW_HEAD " & LispNum(CDbl(GetSettingValue("Arrow Head Size", 3))) & ")"
    Print #f, "(setq SL_SMART_NOZZLES " & LispStr(UCase(CStr(GetSettingValue("Smart Nozzle Labels", "YES")))) & ")"
    Print #f, "(setq SL_MIN_NOZZLE_DIA " & LispNum(CDbl(GetSettingValue("Minimum Nozzle Inside Label Diameter", 8))) & ")"
    Print #f, "(setq SL_NOZZLE_LEADER_LEN " & LispNum(CDbl(GetSettingValue("Nozzle Leader Length", 6))) & ")"
    Print #f, "(setq SL_SHOW_HEAD_CENTERLINES " & LispStr(UCase(CStr(GetSettingValue("Show Head Centerlines", "NO")))) & ")"
    Print #f, "(setq SL_SHOW_HEAD_CLOCK_REF " & LispStr(UCase(Trim(CStr(GetSettingValue("Show Head Clock References", GetSettingValue("Show Head Clock Reference", "NO")))))) & ")"
    Print #f, "(setq SL_HEAD_NOZZLE_LEADER_LEN " & LispNum(CDbl(GetSettingValue("Head Nozzle Leader Length", 8))) & ")"
    Print #f, ""

    Dim showVessel As String, showWelds As String, showSupports As String, showNozzles As String, showRulers As String, showLegend As String, showTitle As String
    showVessel = UCase(CStr(GetSettingValue("Show Vessel On Overlay", "YES")))
    showWelds = UCase(CStr(GetSettingValue("Show Welds On Overlay", "YES")))
    showSupports = UCase(CStr(GetSettingValue("Show Supports On Overlay", "YES")))
    showNozzles = UCase(CStr(GetSettingValue("Show Nozzles On Overlay", "YES")))
    'The master drawing must contain the layout rulers even when the old
    'overlay-only setting hid them. Layer controls can hide them later.
    showRulers = UCase(CStr(GetSettingValue("Show Rulers", GetSettingValue("Show Ruler", "YES"))))
    showLegend = UCase(CStr(GetSettingValue("Show Legend On Overlay", "YES")))
    showTitle = UCase(CStr(GetSettingValue("Show Title Block On Overlay", "YES")))

    Dim showScanBordersOverlay As String, overlayImageFrame As Long
    showScanBordersOverlay = ShowScanBordersOnOverlayValue()
    overlayImageFrame = OverlayImageFrameValue(showScanBordersOverlay)

    Dim rulerOffset As Double, arrowHead As Double
    rulerOffset = CDbl(GetSettingValue("Ruler Offset", 2))
    arrowHead = CDbl(GetSettingValue("Arrow Head Size", 3))

    Dim xCard As String, yCard As String
    xCard = AxisDirectionText("X Axis Cardinal Direction", "X Axis Direction Text")
    yCard = AxisDirectionText("Y Axis Cardinal Direction", "Y Axis Direction Text")

    'Section sheet rulers require the same project settings in overlay output.
    Print #f, "(setq SL_RULER_SPACING " & LispNum(spacing) & ")"
    Print #f, "(setq SL_RULER_OFFSET " & LispNum(rulerOffset) & ")"
    Print #f, "(setq SL_X_AXIS_LABEL " & LispStr(AxisLabel("X AXIS DIRECTION", xCard)) & ")"
    Print #f, "(setq SL_Y_AXIS_LABEL " & LispStr(AxisLabel("Y AXIS DIRECTION", yCard)) & ")"
    WriteSectionPageSettings f, "YES", "YES"
    Print #f, ""

    Dim headMode As String, headSize As String, showHeadNozzles As String
    Dim head1Label As String, head2Label As String
    Dim headDia As Double, head1X As Double, head1Y As Double, head2X As Double, head2Y As Double
    headMode = UCase(Trim(CStr(GetSettingValue("Head View Mode", "NONE"))))
    headSize = UCase(Trim(CStr(GetSettingValue("Head View Size", "SMALL"))))
    showHeadNozzles = UCase(Trim(CStr(GetSettingValue("Show Head Nozzles", "YES"))))
    head1Label = UCase(Trim(CStr(GetSettingValue("Head 1 Label", "HEAD 1"))))
    head2Label = UCase(Trim(CStr(GetSettingValue("Head 2 Label", "HEAD 2"))))
    If headMode = "" Then headMode = "NONE"
    If headSize = "" Then headSize = "SMALL"
    headDia = HeadViewDiameter(headSize, vesselHeight)

    Dim legendX As Double, legendY As Double
    Call ComputeLegendPosition(orientation, vesselHeight, vesselLength, headDia, legendX, legendY)
    Call ComputeHeadCenters(orientation, vesselHeight, vesselLength, headDia, headMode, head1X, head1Y, head2X, head2Y)

    If IsAutoCADOutput() Then
        Print #f, "(defun c:SCANOVERLAY ( / *error* vesselXLen vesselYLen spacing oldOsmode oldCmdecho oldNomutt)"
    Else
        Print #f, "(defun c:SCANOVERLAY ( / vesselXLen vesselYLen spacing oldOsmode)"
    End If
    Print #f, "  ;; Prevent running object snaps from pulling generated geometry and images onto nearby corners."
    Print #f, "  (setq oldOsmode (getvar ""OSMODE""))"
    If IsAutoCADOutput() Then
        Print #f, "  ;; Reduce AutoCAD command-window and display overhead during generation."
        Print #f, "  (setq oldCmdecho (getvar ""CMDECHO"") oldNomutt (getvar ""NOMUTT""))"
        Print #f, "  (defun *error* (msg)"
        Print #f, "    (setvar ""OSMODE"" oldOsmode)"
        Print #f, "    (setvar ""NOMUTT"" oldNomutt)"
        Print #f, "    (setvar ""CMDECHO"" oldCmdecho)"
        Print #f, "    (if (and msg (/= msg ""Function cancelled"") (/= msg ""quit / exit abort""))"
        Print #f, "      (princ (strcat ""\nSCANOVERLAY error: "" msg))"
        Print #f, "    )"
        Print #f, "    (princ)"
        Print #f, "  )"
        Print #f, "  (setvar ""CMDECHO"" 0)"
        Print #f, "  (setvar ""NOMUTT"" 1)"
    End If
    Print #f, "  (setvar ""OSMODE"" 0)"
    Print #f, "  (SL_SetupLayers)"
    Print #f, "  (SL_SetupViewportLayers)"
    Print #f, "  (setvar ""UCSICON"" 0)"   ' Hide UCS icon (WCS workflow)
    Print #f, "  (setvar ""IMAGEFRAME"" " & CStr(overlayImageFrame) & ")"   ' Show Scan Borders On Overlay: Yes=1, No=0
    Print #f, "  (setq vesselXLen " & LispNum(vesselHeight) & ")"
    Print #f, "  (setq vesselYLen " & LispNum(vesselLength) & ")"
    Print #f, "  (setq spacing " & LispNum(spacing) & ")"
    Print #f, "  (setq SL_VESSEL_XLEN vesselXLen)"
    Print #f, "  (setq SL_VESSEL_YLEN vesselYLen)"
    Print #f, "  (setq SL_AVOID_RECTS nil)"
    Print #f, ""

    If showVessel = "YES" Then
        Print #f, "  ;; Vessel border"
        Print #f, "  (SL_Rect 0.0 0.0 vesselXLen vesselYLen ""VESSEL"")"
        If UCase(CStr(GetSettingValue("Show Centerline", "YES"))) = "YES" Then
            Print #f, "  (SL_Centerline vesselXLen vesselYLen)"
        End If
    End If

    Print #f, ""
    Print #f, "  ;; Layout scan geometry is generated with the images so the drawing only needs to be built once."
    Dim masterRow As Long, masterLastRow As Long
    Dim masterName As String
    Dim masterX As Double, masterY As Double, masterW As Double, masterH As Double
    masterLastRow = wsScan.Cells(wsScan.Rows.count, "A").End(xlUp).Row
    For masterRow = 3 To masterLastRow
        If Trim(CStr(wsScan.Cells(masterRow, "A").value)) <> "" Then
            If UCase(Trim(CStr(wsScan.Cells(masterRow, "L").value))) <> "NO" Then
                masterName = Trim(CStr(wsScan.Cells(masterRow, "A").value))
                masterX = CDbl(wsScan.Cells(masterRow, "B").value)
                masterY = CDbl(wsScan.Cells(masterRow, "D").value)
                masterW = CDbl(wsScan.Cells(masterRow, "F").value)
                masterH = CDbl(wsScan.Cells(masterRow, "G").value)
                Print #f, "  (SL_LabelRect " & LispNum(masterX) & " " & LispNum(masterY) & " " & LispNum(masterW) & " " & LispNum(masterH) & " " & LispStr(masterName) & " ""SCANS"" ""AUT_HATCH"")"
            End If
        End If
    Next masterRow

    Print #f, ""
    Print #f, "  ;; Scan image overlays. IMAGEFRAME follows Project Settings: Show Scan Borders On Overlay."
    Dim lastRow As Long, r As Long
    lastRow = wsImg.Cells(wsImg.Rows.count, "A").End(xlUp).Row
    For r = 3 To lastRow
        If Trim(CStr(wsImg.Cells(r, "A").value)) <> "" Then
            If UCase(Trim(CStr(wsImg.Cells(r, "D").value))) <> "NO" Then
                Dim scanName As String, procName As String, imgPath As String
                Dim sr As Long, xs As Double, ys As Double, w As Double, h As Double
                scanName = Trim(CStr(wsImg.Cells(r, "A").value))
                sr = FindScanRow(wsScan, scanName)
                If sr > 0 Then
                    xs = CDbl(wsScan.Cells(sr, "B").value)
                    ys = CDbl(wsScan.Cells(sr, "D").value)
                    w = CDbl(wsScan.Cells(sr, "F").value)
                    h = CDbl(wsScan.Cells(sr, "G").value)
                    procName = Trim(CStr(wsImg.Cells(r, "C").value))
                    If procName = "" Then procName = DefaultProcessedName(scanName)
                    imgPath = ToLispPath(CombinePath(processedFolder, procName))
                    Print #f, "  (SL_InsertFitImage " & LispNum(xs) & " " & LispNum(ys) & " " & LispNum(w) & " " & LispNum(h) & " " & LispStr(imgPath) & ")"
                    Print #f, "  (SL_AddAvoidRect " & LispNum(xs) & " " & LispNum(ys) & " " & LispNum(w) & " " & LispNum(h) & ")"
                End If
            End If
        End If
    Next r

    If showSupports = "YES" Then
        Print #f, ""
        Print #f, "  ;; Supports / structures"
        ' Supports and objects now read from Shell Features rows 49-68:
        ' A=Object ID, B=X Position, C=Y Position, D=Circ. Width, E=Length, F=Include.
        For r = 49 To 68
            If Trim(CStr(wsShell.Cells(r, "A").value)) <> "" Then
                If UCase(Trim(CStr(wsShell.Cells(r, "F").value))) <> "NO" Then
                    Print #f, "  (SL_LabelRect " & LispNum(CDbl(wsShell.Cells(r, "B").value)) & " " & LispNum(CDbl(wsShell.Cells(r, "C").value)) & " " & LispNum(CDbl(wsShell.Cells(r, "D").value)) & " " & LispNum(CDbl(wsShell.Cells(r, "E").value)) & " " & LispStr(CStr(wsShell.Cells(r, "A").value)) & " ""SUPPORTS"" """")"
                    Print #f, "  (SL_AddAvoidRect " & LispNum(CDbl(wsShell.Cells(r, "B").value)) & " " & LispNum(CDbl(wsShell.Cells(r, "C").value)) & " " & LispNum(CDbl(wsShell.Cells(r, "D").value)) & " " & LispNum(CDbl(wsShell.Cells(r, "E").value)) & ")"
                End If
            End If
        Next r
    End If

    If showNozzles = "YES" Then
        Print #f, ""
        Print #f, "  ;; Nozzles"
        PrintShellNozzleLispRows f
    End If

    Print #f, ""
    Print #f, "  ;; Shell MUT points - rows 71-90: A=MUT ID, B=X, C=Y, D=Min. T., E=Notes"
    For r = 71 To 90
        If Trim(CStr(wsShell.Cells(r, "A").value)) <> "" Then
            If IsNumeric(wsShell.Cells(r, "B").value) And IsNumeric(wsShell.Cells(r, "C").value) Then
                Print #f, "  (SL_MUTPoint " & LispNum(CDbl(wsShell.Cells(r, "B").value)) & " " & LispNum(CDbl(wsShell.Cells(r, "C").value)) & " " & LispStr(Trim(CStr(wsShell.Cells(r, "A").value))) & ")"
            End If
        End If
    Next r

    If showWelds = "YES" Then
        Print #f, ""
        Print #f, "  ;; Welds"
        Dim wID As String, wType As String, wLabel As String
        Dim wLoc As Double, wStart As Double, wStop As Double

        ' Circumferential welds now read from Shell Features rows 3-12:
        ' A=Weld ID, B=Y Position, C=Include, D=Label.
        For r = 3 To 12
            If Trim(CStr(wsShell.Cells(r, "A").value)) <> "" Then
                If UCase(Trim(CStr(wsShell.Cells(r, "C").value))) <> "NO" Then
                    wID = Trim(CStr(wsShell.Cells(r, "A").value))
                    wLoc = CDbl(wsShell.Cells(r, "B").value)
                    wStart = -1
                    wStop = -1
                    If UCase(CStr(GetSettingValue("Show Weld Labels", "YES"))) = "YES" And UCase(Trim(CStr(wsShell.Cells(r, "D").value))) = "YES" Then wLabel = wID Else wLabel = ""
                    Print #f, "  (SL_CircWeld " & LispNum(wLoc) & " " & LispNum(wStart) & " " & LispNum(wStop) & " vesselXLen " & LispStr(wLabel) & ")"
                End If
            End If
        Next r

        ' Long seams now read from Shell Features rows 15-24:
        ' A=Seam ID, B=X Position, C=Start Y, D=Stop Y, E=Include, F=Label.
        For r = 15 To 24
            If Trim(CStr(wsShell.Cells(r, "A").value)) <> "" Then
                If UCase(Trim(CStr(wsShell.Cells(r, "E").value))) <> "NO" Then
                    wID = Trim(CStr(wsShell.Cells(r, "A").value))
                    wLoc = CDbl(wsShell.Cells(r, "B").value)
                    If Trim(CStr(wsShell.Cells(r, "C").value)) = "" Then wStart = -1 Else wStart = CDbl(wsShell.Cells(r, "C").value)
                    If Trim(CStr(wsShell.Cells(r, "D").value)) = "" Then wStop = -1 Else wStop = CDbl(wsShell.Cells(r, "D").value)
                    If UCase(CStr(GetSettingValue("Show Weld Labels", "YES"))) = "YES" And UCase(Trim(CStr(wsShell.Cells(r, "F").value))) = "YES" Then wLabel = wID Else wLabel = ""
                    Print #f, "  (SL_LongSeam " & LispNum(wLoc) & " " & LispNum(wStart) & " " & LispNum(wStop) & " vesselYLen " & LispStr(wLabel) & ")"
                End If
            End If
        Next r
    End If

    If showRulers = "YES" Then
        Print #f, ""
        Print #f, "  ;; Optional rulers on overlay"
        PrintVisualBottomLeftRulers f, orientation, rulerOffset, AxisLabel("X AXIS DIRECTION", xCard), AxisLabel("Y AXIS DIRECTION", yCard)
    End If

    Print #f, ""
    Print #f, "  ;; Optional vessel reference indicators on overlay"
    PrintVesselReferenceLabels f, orientation, vesselHeight, vesselLength

    If headMode <> "NONE" Then
        Print #f, ""
        Print #f, "  ;; Optional head views"
        If ShouldShowHead(headMode, "HEAD 1") Then Print #f, "  (SL_HeadView " & LispNum(head1X) & " " & LispNum(head1Y) & " " & LispNum(headDia) & " " & LispStr(head1Label) & ")"
        If ShouldShowHead(headMode, "HEAD 2") Then Print #f, "  (SL_HeadView " & LispNum(head2X) & " " & LispNum(head2Y) & " " & LispNum(headDia) & " " & LispStr(head2Label) & ")"

        If showHeadNozzles = "YES" Then
            Print #f, ""
            Print #f, "  ;; Head nozzles - overlay right panel"
            Dim ovHr As Long, ovHLastRow As Long
            ovHLastRow = HeadNozzleLastRow(wsHead)
            For ovHr = 4 To ovHLastRow
                If Trim(CStr(wsHead.Cells(ovHr, "A").value)) <> "" Then
                    If UCase(Trim(CStr(wsHead.Cells(ovHr, "J").value))) <> "NO" Then
                        Dim ovHName As String, ovHNoz As String, ovHClock As String, ovHRadPos As String, ovHMode As String
                        Dim ovHDeg As Double, ovHFactor As Double, ovHDia As Double, ovHCX As Double, ovHCY As Double
                        ovHName = NormalizeHeadName(CStr(wsHead.Cells(ovHr, "A").value))
                        If ShouldShowHead(headMode, ovHName) Then
                            ovHNoz = Trim(CStr(wsHead.Cells(ovHr, "B").value))
                            ovHClock = Trim(CStr(wsHead.Cells(ovHr, "D").value))
                            ovHRadPos = UCase(Trim(CStr(wsHead.Cells(ovHr, "E").value)))
                            ovHFactor = RadiusFactor(ovHRadPos, wsHead.Cells(ovHr, "F").value)
                            ovHDia = CDbl(wsHead.Cells(ovHr, "C").value)
                            ovHMode = UCase(Trim(CStr(wsHead.Cells(ovHr, "I").value)))
                            If ovHMode = "" Then ovHMode = "AUTO"
                            ovHDeg = ClockPositionDegrees(ovHClock)
                            If ovHName = "HEAD 1" Then
                                ovHCX = head1X: ovHCY = head1Y
                            Else
                                ovHCX = head2X: ovHCY = head2Y
                            End If
                            Print #f, "  (SL_HeadNozzle " & LispNum(ovHCX) & " " & LispNum(ovHCY) & " " & LispNum(headDia) & " " & LispNum(ovHDeg) & " " & LispNum(ovHFactor) & " " & LispNum(ovHDia) & " " & LispStr(ovHNoz) & " " & LispStr(ovHMode) & " ""HEADS""" & ")"
                        End If
                    End If
                End If
            Next ovHr
        End If

        Dim ovHMRow As Long, ovHMFirstRow As Long, ovHMLastRow As Long
        ovHMFirstRow = HeadMUTFirstDataRow(wsHead)
        If ovHMFirstRow > 0 Then
            ovHMLastRow = wsHead.Cells(wsHead.Rows.count, "A").End(xlUp).Row
            Print #f, ""
            Print #f, "  ;; Head MUT points - overlay right panel"
            For ovHMRow = ovHMFirstRow To ovHMLastRow
                If Trim(CStr(wsHead.Cells(ovHMRow, "A").value)) <> "" And Trim(CStr(wsHead.Cells(ovHMRow, "B").value)) <> "" Then
                    If UCase(Trim(CStr(wsHead.Cells(ovHMRow, "H").value))) <> "NO" Then
                        Dim ovHMHead As String, ovHMID As String, ovHMClock As String, ovHMRadPos As String
                        Dim ovHMDeg As Double, ovHMFactor As Double, ovHMCX As Double, ovHMCY As Double
                        ovHMHead = NormalizeHeadName(CStr(wsHead.Cells(ovHMRow, "A").value))
                        If ShouldShowHead(headMode, ovHMHead) Then
                            ovHMID = Trim(CStr(wsHead.Cells(ovHMRow, "B").value))
                            ovHMClock = Trim(CStr(wsHead.Cells(ovHMRow, "C").value))
                            ovHMRadPos = UCase(Trim(CStr(wsHead.Cells(ovHMRow, "D").value)))
                            If ovHMRadPos = "" Then ovHMRadPos = "CENTER"
                            ovHMFactor = RadiusFactor(ovHMRadPos, wsHead.Cells(ovHMRow, "E").value)
                            ovHMDeg = ClockPositionDegrees(ovHMClock)
                            If ovHMHead = "HEAD 1" Then
                                ovHMCX = head1X: ovHMCY = head1Y
                            Else
                                ovHMCX = head2X: ovHMCY = head2Y
                            End If
                            Print #f, "  (SL_HeadMUT " & LispNum(ovHMCX) & " " & LispNum(ovHMCY) & " " & LispNum(headDia) & " " & LispNum(ovHMDeg) & " " & LispNum(ovHMFactor) & " " & LispStr(ovHMID) & " ""MUT_TEXT"")"
                        End If
                    End If
                End If
            Next ovHMRow
        End If
    End If

    If showLegend = "YES" Then
        Print #f, ""
        Print #f, "  (SL_Legend " & LispNum(legendX) & " " & LispNum(legendY) & ")"
    End If

    If showTitle = "YES" Then
        Print #f, ""
        Print #f, "  (SL_TitleBlock " & LispNum(TitleBlockX(orientation, legendX, legendY, vesselHeight, vesselLength, headDia)) & " " & LispNum(TitleBlockY(orientation, legendX, legendY, vesselHeight, vesselLength, headDia)) & " " & _
            LispStr(GetDrawingInfoValue("Drawing Title", "AUT COVERAGE MAP")) & " " & _
            LispStr("COMPONENT: " & GetDrawingInfoValue("Component", "")) & " " & _
            LispStr("UNIT: " & GetDrawingInfoValue("Unit", "")) & " " & _
            LispStr("CLIENT: " & GetDrawingInfoValue("Client", "")) & " " & _
            LispStr("INSPECTOR: " & GetDrawingInfoValue("Inspector", "")) & " " & _
            LispStr("DATE: " & GetDrawingInfoValue("Date", "")) & " " & _
            LispStr("REV: " & GetDrawingInfoValue("Revision", "")) & ")"
    End If

    Print #f, ""
    Print #f, "  (command ""ZOOM"" ""E"")"
    Print #f, "  (SL_OverlayView)"
    If IsAutoCADOutput() Then
        Print #f, "  ;; AutoCAD creates the usable viewport entity when Layout1 is activated."
        Print #f, "  ;; Activate it first, then move it to the dedicated non-print layer."
        Print #f, "  (SL_ActivateSheet ""Layout1"")"
    Else
        Print #f, "  ;; DraftSight creates the usable viewport entity when Sheet1 is activated."
        Print #f, "  ;; Activate it first, then move it to the dedicated non-print layer."
        Print #f, "  (SL_ActivateSheet ""Sheet1"")"
    End If
    Print #f, "  (SL_AssignCurrentSheetViewports)"
    Print #f, "  (command ""_.REGEN"")"
    Print #f, "  ;; Return to Model space after the Sheet1 viewport has been updated."
    Print #f, "  (setvar ""TILEMODE"" 1)"
    Print #f, "  (setvar ""OSMODE"" oldOsmode)"
    If IsAutoCADOutput() Then
        Print #f, "  (setvar ""NOMUTT"" oldNomutt)"
        Print #f, "  (setvar ""CMDECHO"" oldCmdecho)"
    End If
    Print #f, "  (princ ""\nAxisBuilder master drawing complete. Normal viewport is non-printing; Model space is active."")"
    Print #f, "  (princ)"
    Print #f, ")"
    Print #f, "(defun c:AXISDRAWING () (c:SCANOVERLAY))"
    Print #f, ""
    Print #f, ";; Layer visibility controls for the one-drawing AxisBuilder workflow."
    Print #f, "(defun SL_LayerOn (name) (command ""_.-LAYER"" ""_On"" name """"))"
    Print #f, "(defun SL_LayerOff (name) (command ""_.-LAYER"" ""_Off"" name """"))"
    Print #f, "(defun SL_LayoutView ()"
    Print #f, "  (SL_SetLayer ""0"")"
    Print #f, "  (SL_LayerOff ""SCAN_IMAGES"")"
    Print #f, "  (SL_LayerOn ""SCANS"")"
    Print #f, "  (SL_LayerOn ""SCAN_TEXT"")"
    Print #f, "  (SL_LayerOn ""AUT_HATCH"")"
    Print #f, "  (setvar ""IMAGEFRAME"" 0)"
    Print #f, "  (command ""_.REGEN"")"
    Print #f, "  (princ ""\nAxisBuilder Layout View active."")"
    Print #f, "  (princ)"
    Print #f, ")"
    Print #f, "(defun c:ABLAYOUT () (SL_LayoutView))"
    Print #f, ""
    Print #f, "(defun SL_OverlayView ()"
    Print #f, "  (SL_SetLayer ""0"")"
    Print #f, "  (SL_LayerOn ""SCAN_IMAGES"")"
    Print #f, "  (SL_LayerOff ""AUT_HATCH"")"
    Print #f, "  (SL_LayerOff ""SCAN_TEXT"")"
    Print #f, "  (SL_LayerOff ""SCANS"")"
    Print #f, "  (setvar ""IMAGEFRAME"" " & CStr(overlayImageFrame) & ")"
    Print #f, "  (command ""_.REGEN"")"
    Print #f, "  (princ ""\nAxisBuilder Overlay View active."")"
    Print #f, "  (princ)"
    Print #f, ")"
    Print #f, "(defun c:ABOVERLAY () (SL_OverlayView))"
    Print #f, ""
    Print #f, ";; Grouped visibility controls. Each group uses the first existing layer"
    Print #f, ";; as its state and then turns the complete group on or off together."
    Print #f, "(defun SL_LayerExists (name) (if (tblsearch ""LAYER"" name) T nil))"
    Print #f, "(defun SL_LayerIsOn (name / data color)"
    Print #f, "  (setq data (tblsearch ""LAYER"" name))"
    Print #f, "  (if data"
    Print #f, "    (progn (setq color (cdr (assoc 62 data))) (or (null color) (> color 0)))"
    Print #f, "    nil"
    Print #f, "  )"
    Print #f, ")"
    Print #f, "(defun SL_FirstExistingLayer (layers / found)"
    Print #f, "  (setq found nil)"
    Print #f, "  (while (and layers (null found))"
    Print #f, "    (if (SL_LayerExists (car layers)) (setq found (car layers)))"
    Print #f, "    (setq layers (cdr layers))"
    Print #f, "  )"
    Print #f, "  found"
    Print #f, ")"
    Print #f, "(defun SL_SetLayerGroup (layers turnOn / layerName)"
    Print #f, "  (SL_SetLayer ""0"")"
    Print #f, "  (foreach layerName layers"
    Print #f, "    (if (SL_LayerExists layerName)"
    Print #f, "      (if turnOn (SL_LayerOn layerName) (SL_LayerOff layerName))"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  (command ""_.REGEN"")"
    Print #f, ")"
    Print #f, "(defun SL_ToggleLayerGroup (label layers / stateLayer turnOn)"
    Print #f, "  (setq stateLayer (SL_FirstExistingLayer layers))"
    Print #f, "  (if stateLayer"
    Print #f, "    (progn"
    Print #f, "      (setq turnOn (not (SL_LayerIsOn stateLayer)))"
    Print #f, "      (SL_SetLayerGroup layers turnOn)"
    Print #f, "      (princ (strcat ""\n"" label (if turnOn "" shown."" "" hidden."")))"
    Print #f, "    )"
    Print #f, "    (princ (strcat ""\nNo "" label "" layers exist in this drawing.""))"
    Print #f, "  )"
    Print #f, "  (princ)"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun c:ABIMAGES () (SL_ToggleLayerGroup ""Scan images"" '(""SCAN_IMAGES"")))"
    Print #f, "(defun c:ABSCANS () (SL_ToggleLayerGroup ""Scan outlines and labels"" '(""SCANS"" ""SCAN_TEXT"")))"
    Print #f, "(defun c:ABHATCH () (SL_ToggleLayerGroup ""Scan hatching"" '(""AUT_HATCH"")))"
    Print #f, "(defun c:ABWELDS () (SL_ToggleLayerGroup ""Welds and weld labels"" '(""CIRC_WELDS"" ""LONG_SEAMS"" ""CIRC_WELD_TEXT"" ""LONG_SEAM_TEXT"")))"
    Print #f, "(defun c:ABNOZZLES () (SL_ToggleLayerGroup ""Shell nozzles"" '(""NOZZLES"" ""SHELL_NOZZLE_TEXT"")))"
    Print #f, "(defun c:ABOBJECTS () (SL_ToggleLayerGroup ""Supports and objects"" '(""SUPPORTS"" ""SUPPORT_TEXT"")))"
    Print #f, "(defun c:ABRULERS () (SL_ToggleLayerGroup ""Rulers and references"" '(""X_AXIS"" ""Y_AXIS"" ""X_RULER_TEXT"" ""Y_RULER_TEXT"")))"
    Print #f, "(defun c:ABHEADS () (SL_ToggleLayerGroup ""Head views"" '(""HEADS"" ""HEAD_NOZZLE_TEXT"" ""HEAD_MUT_TEXT"" ""HEAD_TITLE_TEXT"" ""HEAD_CLOCK_TEXT"")))"
    Print #f, "(defun c:ABINFO () (SL_ToggleLayerGroup ""Legend and title block"" '(""LEGEND"" ""LEGEND_SAMPLE"" ""LEGEND_AUT_HATCH"" ""LEGEND_MUT_HATCH"" ""LEGEND_TEXT"" ""TITLE_BLOCK"" ""TITLE_BLOCK_TEXT"")))"
    Print #f, ""
    Print #f, "(defun SL_VisibilityMenuDisplay ()"
    Print #f, "  (princ ""\n----------------------------------------"")"
    Print #f, "  (princ ""\n       AXISBUILDER VISIBILITY CONTROLS"")"
    Print #f, "  (princ ""\n----------------------------------------"")"
    Print #f, "  (princ ""\n  1  Show/Hide Scan Images"")"
    Print #f, "  (princ ""\n  2  Show/Hide Scan Outlines and Labels"")"
    Print #f, "  (princ ""\n  3  Show/Hide Scan Hatching"")"
    Print #f, "  (princ ""\n  4  Show/Hide Welds and Weld Labels"")"
    Print #f, "  (princ ""\n  5  Show/Hide Shell Nozzles"")"
    Print #f, "  (princ ""\n  6  Show/Hide Supports and Objects"")"
    Print #f, "  (princ ""\n  7  Show/Hide Rulers and References"")"
    Print #f, "  (princ ""\n  8  Show/Hide Head Views"")"
    Print #f, "  (princ ""\n  9  Show/Hide Legend and Title Block"")"
    Print #f, "  (princ ""\n  0  Back to Main Menu"")"
    Print #f, ")"
    Print #f, "(defun c:ABVISIBILITY ( / choice done)"
    Print #f, "  (setq done nil)"
    Print #f, "  (while (not done)"
    Print #f, "    (SL_VisibilityMenuDisplay)"
    Print #f, "    (initget 4)"
    Print #f, "    (setq choice (getint ""\nSelect visibility option [0-9] <0>: ""))"
    Print #f, "    (if (null choice) (setq choice 0))"
    Print #f, "    (cond"
    Print #f, "      ((= choice 0) (setq done T))"
    Print #f, "      ((= choice 1) (c:ABIMAGES))"
    Print #f, "      ((= choice 2) (c:ABSCANS))"
    Print #f, "      ((= choice 3) (c:ABHATCH))"
    Print #f, "      ((= choice 4) (c:ABWELDS))"
    Print #f, "      ((= choice 5) (c:ABNOZZLES))"
    Print #f, "      ((= choice 6) (c:ABOBJECTS))"
    Print #f, "      ((= choice 7) (c:ABRULERS))"
    Print #f, "      ((= choice 8) (c:ABHEADS))"
    Print #f, "      ((= choice 9) (c:ABINFO))"
    Print #f, "      (T (princ ""\nInvalid option. Enter a number from 0 through 9.""))"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  (princ)"
    Print #f, ")"
    Print #f, ""
    Print #f, ";; One-drawing AXISBUILDER launcher."
    Print #f, "(defun SL_ScanMenuDisplay ()"
    Print #f, "  (princ ""\n========================================"")"
    Print #f, "  (princ ""\n              AXISBUILDER"")"
    Print #f, "  (princ ""\n========================================"")"
    Print #f, "  (princ ""\n  1  Generate Master Drawing"")"
    Print #f, "  (princ ""\n  2  Layout View"")"
    Print #f, "  (princ ""\n  3  Overlay View"")"
    Print #f, "  (princ ""\n  4  Visibility Controls"")"
    Print #f, "  (princ ""\n  5  Resize Generated Text"")"
    Print #f, "  (princ ""\n  6  Wrap Shell Nozzle"")"
    Print #f, "  (princ ""\n  7  Wrap Support/Object"")"
    Print #f, "  (princ ""\n  8  Create Letter-Size Section Sheets"")"
    Print #f, "  (princ ""\n  0  Exit"")"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun c:AXISBUILDER ( / choice done)"
    Print #f, "  (setq done nil)"
    Print #f, "  (while (not done)"
    Print #f, "    (SL_ScanMenuDisplay)"
    Print #f, "    (initget 4)"
    Print #f, "    (setq choice (getint ""\nSelect command [0-8] <0>: ""))"
    Print #f, "    (if (null choice) (setq choice 0))"
    Print #f, "    (cond"
    Print #f, "      ((= choice 0) (setq done T))"
    Print #f, "      ((= choice 1) (SL_RunMenuCommand 'c:AXISDRAWING ""AXISDRAWING""))"
    Print #f, "      ((= choice 2) (SL_RunMenuCommand 'c:ABLAYOUT ""ABLAYOUT""))"
    Print #f, "      ((= choice 3) (SL_RunMenuCommand 'c:ABOVERLAY ""ABOVERLAY""))"
    Print #f, "      ((= choice 4) (SL_RunMenuCommand 'c:ABVISIBILITY ""ABVISIBILITY""))"
    Print #f, "      ((= choice 5) (SL_RunMenuCommand 'c:TEXTRESIZE ""TEXTRESIZE""))"
    Print #f, "      ((= choice 6) (SL_RunMenuCommand 'c:NOZZLEWRAP ""NOZZLEWRAP""))"
    Print #f, "      ((= choice 7) (SL_RunMenuCommand 'c:OBJECTWRAP ""OBJECTWRAP""))"
    Print #f, "      ((= choice 8) (SL_RunMenuCommand 'c:SECTIONPAGES ""SECTIONPAGES""))"
    Print #f, "      (T (princ ""\nInvalid option. Enter a number from 0 through 8.""))"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  (princ ""\nAXISBUILDER closed."")"
    Print #f, "  (princ)"
    Print #f, ")"
    Print #f, ""
    Print #f, ";; Backward-compatible alias for existing workflows."
    Print #f, "(defun c:SCANMENU () (c:AXISBUILDER))"
    Print #f, ""
    Print #f, "(princ ""\nAxisBuilder master drawing loaded. Type AXISBUILDER, or AXISDRAWING to generate directly."")"
    Print #f, "(princ)"

    Close #f
    WriteUtilityMessage "AXISBUILDER MASTER DRAWING GENERATED" & vbCrLf & vbCrLf & _
                        CADPlatformDisplayName() & " LSP:" & vbCrLf & CStr(filePath) & vbCrLf & vbCrLf & _
                        "Processed images:" & vbCrLf & processedFolder, "SUCCESS"
    WriteValidationWarningsToMessageCenter "AxisBuilder Master Drawing"
    MsgBox CADPlatformDisplayName() & " AxisBuilder Master LSP exported successfully:" & vbCrLf & CStr(filePath) & vbCrLf & vbCrLf & "Processed images saved to:" & vbCrLf & processedFolder, vbInformation, "AxisBuilder"
    ShowValidationSummaryIfEnabled "AxisBuilder Master Drawing"
End Sub

'Backward-compatible entry point during Stage 1 testing.
Public Sub ExportOverlayLSP()
    ExportAxisBuilderLSP
End Sub

Public Sub ExportBothCoverageAndOverlayLSP()
    Call ExportScanLayoutLSP
    Call ExportOverlayLSP
End Sub

Private Sub SyncScanImagesFromScanImport(ByVal wsScan As Worksheet, ByVal wsImg As Worksheet)
    'v4.6.0 Image Filename Override:
    'Rebuilds Scan Images from Scan Import before processing.
    'Column A follows the scan names on Scan Import.
    'Column B is now preserved by scan name when possible, allowing manual image filename overrides.
    '    Example: SCAN1 can use IMG_8472, IMG_8472.png, SouthShell.jpg, etc.
    '    If no prior/manual value exists, Column B falls back to the default S# behavior.
    'Column C is automatically set to the processed PNG name.
    'Column D is preserved by scan name when possible, so NO/YES choices are not lost.

    Dim oldImageName As Object
    Dim oldInclude As Object
    Set oldImageName = CreateObject("Scripting.Dictionary")
    Set oldInclude = CreateObject("Scripting.Dictionary")

    Dim r As Long, lastImgRow As Long, scanName As String
    Dim priorImageName As String
    lastImgRow = wsImg.Cells(wsImg.Rows.count, "A").End(xlUp).Row

    For r = 3 To lastImgRow
        scanName = Trim(CStr(wsImg.Cells(r, "A").value))
        If scanName <> "" Then
            priorImageName = Trim(CStr(wsImg.Cells(r, "B").value))
            If priorImageName <> "" Then oldImageName(UCase(scanName)) = priorImageName
            oldInclude(UCase(scanName)) = Trim(CStr(wsImg.Cells(r, "D").value))
        End If
    Next r

    If lastImgRow >= 3 Then
        wsImg.Range("A3:E" & lastImgRow).ClearContents
    End If

    Dim lastScanRow As Long, outRow As Long, includeVal As String, imageVal As String
    lastScanRow = wsScan.Cells(wsScan.Rows.count, "A").End(xlUp).Row
    outRow = 3

    For r = 3 To lastScanRow
        scanName = Trim(CStr(wsScan.Cells(r, "A").value))
        If scanName <> "" Then
            wsImg.Cells(outRow, "A").value = scanName

            imageVal = DefaultImageName(scanName)
            If oldImageName.Exists(UCase(scanName)) Then
                If Trim(CStr(oldImageName(UCase(scanName)))) <> "" Then imageVal = oldImageName(UCase(scanName))
            End If
            wsImg.Cells(outRow, "B").value = imageVal

            wsImg.Cells(outRow, "C").value = DefaultProcessedName(scanName)

            includeVal = "YES"
            If oldInclude.Exists(UCase(scanName)) Then
                If Trim(CStr(oldInclude(UCase(scanName)))) <> "" Then includeVal = oldInclude(UCase(scanName))
            End If
            wsImg.Cells(outRow, "D").value = includeVal
            wsImg.Cells(outRow, "E").ClearContents
            outRow = outRow + 1
        End If
    Next r
End Sub

Private Sub ProcessOverlayImages(ByVal wsScan As Worksheet, ByVal wsImg As Worksheet, ByVal orientation As String, ByVal imageFolder As String, ByVal processedFolder As String, ByVal ppi As Double, ByVal pixelsPerUnit As Double)
    Dim r As Long, lastRow As Long
    lastRow = wsImg.Cells(wsImg.Rows.count, "A").End(xlUp).Row

    For r = 3 To lastRow
        If Trim(CStr(wsImg.Cells(r, "A").value)) <> "" Then
            If UCase(Trim(CStr(wsImg.Cells(r, "D").value))) <> "NO" Then
                Dim scanName As String, imageName As String, processedName As String
                Dim sr As Long, srcPath As String, outPath As String
                Dim w As Double, h As Double, drawW As Double, drawH As Double
                Dim outW As Long, outH As Long, rotMode As String

                scanName = Trim(CStr(wsImg.Cells(r, "A").value))
                imageName = Trim(CStr(wsImg.Cells(r, "B").value))
                If imageName = "" Then imageName = DefaultImageName(scanName)
                processedName = Trim(CStr(wsImg.Cells(r, "C").value))
                If processedName = "" Then processedName = DefaultProcessedName(scanName)

                sr = FindScanRow(wsScan, scanName)
                If sr = 0 Then
                    wsImg.Cells(r, "E").value = "SCAN NOT FOUND"
                    GoTo NextImage
                End If

                srcPath = ResolveSourceImagePath(imageFolder, imageName)
                outPath = CombinePath(processedFolder, processedName)

                If srcPath = "" Then
                    wsImg.Cells(r, "E").value = "IMAGE NOT FOUND - checked .png, .jpg, .jpeg"
                    GoTo NextImage
                End If

                w = CDbl(wsScan.Cells(sr, "F").value)
                h = CDbl(wsScan.Cells(sr, "G").value)

                'v3.0B.12: TRANSFORMED-DIMENSION METHOD.
                'The overlay images must match the DRAWN scan rectangle after the horizontal rollout transform.
                'For Horizontal CW/CCW, the drawn rectangle's screen width follows scan height
                'and the drawn rectangle's screen height follows scan width.
                'Expected examples at PPI=40:
                'S1 23x10 -> 400x920 px
                'S2 14x20 -> 800x560 px
                'S3 23x12 -> 480x920 px
                'S4 28x18 -> 720x1120 px
                Select Case UCase(Trim(orientation))
                    Case "VERTICAL"
                        drawW = w: drawH = h: rotMode = "NONE"
                    Case "HORIZONTAL CCW"
                        'v3.0B.20 TEST: CCW uses original scan dimensions and no preprocess rotation.
                        'DraftSight handles orientation with insertion -y,x and rotation 90.
                        drawW = w: drawH = h: rotMode = "NONE"
                    Case Else
                        'v3.0B.17 TEST: Horizontal CW uses original scan dimensions,
                        'skips preprocess rotation. DraftSight Attach rotation remains -90.
                        drawW = w: drawH = h: rotMode = "NONE"
                End Select

                'Allow override from Project Settings if needed.
                Dim overrideRot As String
                overrideRot = UCase(Trim(CStr(GetSettingValue("Overlay Preprocess Rotation", "AUTO"))))
                If overrideRot <> "" And overrideRot <> "AUTO" Then rotMode = overrideRot

                'v3.0B.12: Generate each FIT image directly from the transformed scan rectangle size.
                'FIT dimensions = transformed scan dimensions × Overlay Pixels Per Inch.
                'DraftSight then uses one constant overlay scale for every image.
                outW = CLng(Application.Max(100, Round(drawW * ppi, 0)))
                outH = CLng(Application.Max(100, Round(drawH * ppi, 0)))

                'v3.0B.18 TEST/FIX: delete old processed output before resizing.
                'This prevents stale S4/S10/etc. images from being mistaken as successful new preprocess output.
                On Error Resume Next
                If Dir(outPath) <> "" Then Kill outPath
                On Error GoTo 0

                If ResizePngToFit(srcPath, outPath, outW, outH, rotMode, pixelsPerUnit) Then
                    wsImg.Cells(r, "E").value = "OK " & CStr(outW) & "x" & CStr(outH) & " px @ " & CStr(CLng(pixelsPerUnit)) & " dpi; rot=" & rotMode & "; scanWH=" & CStr(w) & "x" & CStr(h) & "; drawWH=" & CStr(drawW) & "x" & CStr(drawH)
                    wsImg.Cells(r, "C").value = processedName
                Else
                    wsImg.Cells(r, "E").value = "RESIZE FAILED; rot=" & rotMode & "; target=" & CStr(outW) & "x" & CStr(outH) & "; src=" & srcPath
                End If
            End If
        End If
NextImage:
    Next r
End Sub

Private Function ResizePngToFit(ByVal srcPath As String, ByVal outPath As String, ByVal outW As Long, ByVal outH As Long, ByVal rotMode As String, ByVal dpi As Double) As Boolean
    'v3.1 image processor reliability upgrade.
    'Primary path uses native Windows WIA COM objects instead of launching a visible/polled PowerShell process.
    'Fallback path uses hidden synchronous PowerShell only if WIA is unavailable on the workstation.
    On Error GoTo TryPowerShellFallback

    If Dir(srcPath) = "" Then
        ResizePngToFit = False
        Exit Function
    End If

    Call EnsureFolderExists(GetFolderFromPath(outPath))

    On Error Resume Next
    If Dir(outPath) <> "" Then Kill outPath
    On Error GoTo TryPowerShellFallback

    Dim img As Object, ip As Object, outImg As Object
    Set img = CreateObject("WIA.ImageFile")
    img.LoadFile srcPath

    Set ip = CreateObject("WIA.ImageProcess")

    'The validated overlay workflow uses no preprocess rotation. Rotation is handled in DraftSight.
    'These optional filters are retained only for Project Settings override testing.
    Select Case UCase(Trim(rotMode))
        Case "CW90", "90"
            ip.Filters.Add ip.FilterInfos("RotateFlip").FilterID
            Call SetWIAFilterProperty(ip.Filters(ip.Filters.count), "RotationAngle", 90)
        Case "CCW90", "-90"
            ip.Filters.Add ip.FilterInfos("RotateFlip").FilterID
            Call SetWIAFilterProperty(ip.Filters(ip.Filters.count), "RotationAngle", 270)
        Case "180"
            ip.Filters.Add ip.FilterInfos("RotateFlip").FilterID
            Call SetWIAFilterProperty(ip.Filters(ip.Filters.count), "RotationAngle", 180)
    End Select

    ip.Filters.Add ip.FilterInfos("Scale").FilterID
    Call SetWIAFilterProperty(ip.Filters(ip.Filters.count), "MaximumWidth", CLng(outW))
    Call SetWIAFilterProperty(ip.Filters(ip.Filters.count), "MaximumHeight", CLng(outH))
    Call SetWIAFilterProperty(ip.Filters(ip.Filters.count), "PreserveAspectRatio", False)

    Set outImg = ip.Apply(img)
    outImg.SaveFile outPath

    ResizePngToFit = ValidOutputPng(outPath)
    If Not ResizePngToFit Then GoTo TryPowerShellFallback
    Exit Function

TryPowerShellFallback:
    Err.Clear
    ResizePngToFit = ResizePngToFit_PowerShellHidden(srcPath, outPath, outW, outH, rotMode, dpi)
End Function

Private Sub SetWIAFilterProperty(ByVal filterObj As Object, ByVal propName As String, ByVal propValue As Variant)
    On Error Resume Next
    filterObj.Properties(propName).value = propValue
    On Error GoTo 0
End Sub

Private Function ValidOutputPng(ByVal outPath As String) As Boolean
    On Error GoTo BadFile
    If Dir(outPath) = "" Then
        ValidOutputPng = False
    ElseIf FileLen(outPath) <= 0 Then
        ValidOutputPng = False
    Else
        ValidOutputPng = True
    End If
    Exit Function
BadFile:
    ValidOutputPng = False
End Function

Private Function GetFolderFromPath(ByVal filePath As String) As String
    Dim n As Long
    n = InStrRev(filePath, Application.PathSeparator)
    If n > 0 Then
        GetFolderFromPath = Left$(filePath, n - 1)
    Else
        GetFolderFromPath = ""
    End If
End Function

Private Sub EnsureFolderExists(ByVal folderPath As String)
    If Len(folderPath) = 0 Then Exit Sub
    If Dir(folderPath, vbDirectory) = "" Then MkDir folderPath
End Sub

Private Function ResizePngToFit_PowerShellHidden(ByVal srcPath As String, ByVal outPath As String, ByVal outW As Long, ByVal outH As Long, ByVal rotMode As String, ByVal dpi As Double) As Boolean
    On Error GoTo FailResize

    'Fallback only. Runs hidden and waits synchronously, avoiding the old Exec polling loop and visible/orphaned terminals.
    Dim ps1 As String, cmd As String, qSrc As String, qOut As String, qRot As String
    ps1 = Environ$("TEMP") & Application.PathSeparator & "scan_layout_resize_png.ps1"

    Dim f As Integer
    f = FreeFile
    Open ps1 For Output As #f
    Print #f, "param([string]$src,[string]$out,[int]$w,[int]$h,[string]$rot,[int]$dpi)"
    Print #f, "Add-Type -AssemblyName System.Drawing"
    Print #f, "$img=[System.Drawing.Image]::FromFile($src)"
    Print #f, "$bmp=New-Object System.Drawing.Bitmap($w,$h)"
    Print #f, "$bmp.SetResolution($dpi,$dpi)"
    Print #f, "$g=[System.Drawing.Graphics]::FromImage($bmp)"
    Print #f, "$g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic"
    Print #f, "$g.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality"
    Print #f, "$g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::HighQuality"
    Print #f, "$g.Clear([System.Drawing.Color]::Transparent)"
    Print #f, "switch($rot.ToUpper()){"
    Print #f, "  'CW90' { $g.TranslateTransform($w,0); $g.RotateTransform(90); $g.DrawImage($img,0,0,$h,$w) }"
    Print #f, "  '90' { $g.TranslateTransform($w,0); $g.RotateTransform(90); $g.DrawImage($img,0,0,$h,$w) }"
    Print #f, "  'CCW90' { $g.TranslateTransform(0,$h); $g.RotateTransform(-90); $g.DrawImage($img,0,0,$h,$w) }"
    Print #f, "  '-90' { $g.TranslateTransform(0,$h); $g.RotateTransform(-90); $g.DrawImage($img,0,0,$h,$w) }"
    Print #f, "  '180' { $g.TranslateTransform($w,$h); $g.RotateTransform(180); $g.DrawImage($img,0,0,$w,$h) }"
    Print #f, "  default { $g.DrawImage($img,0,0,$w,$h) }"
    Print #f, "}"
    Print #f, "$g.Dispose(); $img.Dispose()"
    Print #f, "$dir=[System.IO.Path]::GetDirectoryName($out); if(!(Test-Path $dir)){ New-Item -ItemType Directory -Path $dir | Out-Null }"
    Print #f, "$bmp.Save($out,[System.Drawing.Imaging.ImageFormat]::Png)"
    Print #f, "$bmp.Dispose()"
    Close #f

    On Error Resume Next
    If Dir(outPath) <> "" Then Kill outPath
    On Error GoTo FailResize

    qSrc = Chr(34) & srcPath & Chr(34)
    qOut = Chr(34) & outPath & Chr(34)
    qRot = Chr(34) & rotMode & Chr(34)
    cmd = "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File " & Chr(34) & ps1 & Chr(34) & " " & qSrc & " " & qOut & " " & CStr(outW) & " " & CStr(outH) & " " & qRot & " " & CStr(CLng(dpi))

    Dim sh As Object
    Set sh = CreateObject("WScript.Shell")
    sh.Run cmd, 0, True

    ResizePngToFit_PowerShellHidden = ValidOutputPng(outPath)

    On Error Resume Next
    If Dir(ps1) <> "" Then Kill ps1
    On Error GoTo 0
    Exit Function

FailResize:
    ResizePngToFit_PowerShellHidden = False
End Function

Private Function GetOrCreateTempSheet() As Worksheet
    On Error Resume Next
    Set GetOrCreateTempSheet = ThisWorkbook.Worksheets("_ImageTemp")
    On Error GoTo 0
    If GetOrCreateTempSheet Is Nothing Then
        Set GetOrCreateTempSheet = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Worksheets(ThisWorkbook.Worksheets.count))
        GetOrCreateTempSheet.Name = "_ImageTemp"
    End If
End Function

Private Function FindScanRow(ByVal wsScan As Worksheet, ByVal scanName As String) As Long
    Dim f As Range
    Set f = wsScan.Columns("A").Find(What:=scanName, LookIn:=xlValues, LookAt:=xlWhole)
    If f Is Nothing Then
        FindScanRow = 0
    Else
        FindScanRow = f.Row
    End If
End Function

Private Function ResolveSourceImagePath(ByVal imageFolder As String, ByVal imageName As String) As String
    'Allows Scan Images column B to use either a full filename or a base name.
    'Accepted source extensions: .png, .jpg, .jpeg
    'Processed output remains PNG, so DraftSight/LSP behavior is unchanged.
    Dim candidate As String
    Dim baseName As String
    Dim ext As String
    Dim dotPos As Long

    imageName = Trim$(imageName)
    If imageName = "" Then
        ResolveSourceImagePath = ""
        Exit Function
    End If

    candidate = CombinePath(imageFolder, imageName)
    If Dir(candidate) <> "" Then
        ResolveSourceImagePath = candidate
        Exit Function
    End If

    dotPos = InStrRev(imageName, ".")
    If dotPos > 0 Then
        baseName = Left$(imageName, dotPos - 1)
    Else
        baseName = imageName
    End If

    ext = ".png"
    candidate = CombinePath(imageFolder, baseName & ext)
    If Dir(candidate) <> "" Then
        ResolveSourceImagePath = candidate
        Exit Function
    End If

    ext = ".jpg"
    candidate = CombinePath(imageFolder, baseName & ext)
    If Dir(candidate) <> "" Then
        ResolveSourceImagePath = candidate
        Exit Function
    End If

    ext = ".jpeg"
    candidate = CombinePath(imageFolder, baseName & ext)
    If Dir(candidate) <> "" Then
        ResolveSourceImagePath = candidate
        Exit Function
    End If

    ResolveSourceImagePath = ""
End Function

Private Function DefaultImageName(ByVal scanName As String) As String
    'Current baseline behavior:
    'SCAN1 -> S1, then ResolveSourceImagePath checks S1.png, S1.jpg, and S1.jpeg.
    DefaultImageName = "S" & ExtractScanNumber(scanName)
End Function

Private Function DefaultProcessedName(ByVal scanName As String) As String
    'Processed output remains PNG regardless of source format.
    DefaultProcessedName = "S" & ExtractScanNumber(scanName) & "_FIT_B12.png"
End Function

Private Function ExtractScanNumber(ByVal scanName As String) As String
    Dim i As Long, ch As String, out As String
    out = ""
    For i = 1 To Len(scanName)
        ch = Mid$(scanName, i, 1)
        If ch >= "0" And ch <= "9" Then out = out & ch
    Next i
    If out = "" Then out = scanName
    ExtractScanNumber = out
End Function

Private Function CombinePath(ByVal folder As String, ByVal fileName As String) As String
    If Right$(folder, 1) = "\" Or Right$(folder, 1) = "/" Then
        CombinePath = folder & fileName
    Else
        CombinePath = folder & Application.PathSeparator & fileName
    End If
End Function

Private Sub EnsureFolder(ByVal folderPath As String)
    If Dir(folderPath, vbDirectory) = "" Then MkDir folderPath
End Sub

Private Function ToLispPath(ByVal pathText As String) As String
    ToLispPath = Replace(pathText, "\", "/")
End Function

Private Sub WriteOverlayLispFunctions(ByVal f As Integer)
    If IsAutoCADOutput() Then
        Print #f, ";;; AutoCAD overlay image insertion helpers - validated exact-fit workflow"
        Print #f, "(defun SL_ImageBounds (ent / obj pmin pmax err)"
        Print #f, "  (vl-load-com) (setq obj (vlax-ename->vla-object ent))"
        Print #f, "  (setq err (vl-catch-all-apply 'vla-GetBoundingBox (list obj 'pmin 'pmax)))"
        Print #f, "  (if (vl-catch-all-error-p err) nil (list (vlax-safearray->list pmin) (vlax-safearray->list pmax)))"
        Print #f, ")"
        Print #f, "(defun SL_InsertFitImage (x y w h img / rot target ent b mn mx bw bh factor)"
        Print #f, "  (SL_SetLayer ""SCAN_IMAGES"")"
        Print #f, "  (cond"
        Print #f, "    ((= SL_ORIENTATION ""Vertical"") (setq rot 0.0 target (list x y 0.0)))"
        Print #f, "    ((= SL_ORIENTATION ""Horizontal CCW"") (setq rot 90.0 target (list (- (+ y h)) x 0.0)))"
        Print #f, "    (T (setq rot -90.0 target (list y (- (+ x w)) 0.0)))"
        Print #f, "  )"
        Print #f, "  (command ""_.-IMAGE"" ""_Attach"" img '(0.0 0.0 0.0) 1.0 rot)"
        Print #f, "  (setq ent (entlast) b (SL_ImageBounds ent) mn (car b) mx (cadr b) bw (- (car mx) (car mn)) bh (- (cadr mx) (cadr mn)))"
        Print #f, "  (setq factor (if (< (abs rot) 0.0001) (/ w bw) (/ w bh)))"
        Print #f, "  (command ""_.SCALE"" ent """" '(0.0 0.0 0.0) factor)"
        Print #f, "  (setq b (SL_ImageBounds ent) mn (car b))"
        Print #f, "  (command ""_.MOVE"" ent """" mn target)"
        Print #f, ")"
        Print #f, ""
        Exit Sub
    End If
    Print #f, ";;; Overlay image insertion helpers"
    Print #f, "(defun SL_OverlayLL (x y w h / p)"
    Print #f, "  ;; Lower-left insertion point after coordinate transform."
    Print #f, "  (cond"
    Print #f, "    ((= SL_ORIENTATION ""Vertical"") (SL_pt (SL_tf_x x y) (SL_tf_y x y)))"
    Print #f, "    ((= SL_ORIENTATION ""Horizontal CW"") (SL_pt (SL_tf_x (+ x w) y) (SL_tf_y (+ x w) y)))"
    Print #f, "    ((= SL_ORIENTATION ""Horizontal CCW"") (SL_pt (SL_tf_x x (+ y h)) (SL_tf_y x (+ y h))))"
    Print #f, "    (T (SL_pt (SL_tf_x x y) (SL_tf_y x y)))"
    Print #f, "  )"
    Print #f, ")"
    Print #f, ""
    Print #f, "(defun SL_InsertFitImage (x y w h img / ins sc rot)"
    Print #f, "  (SL_SetLayer ""SCAN_IMAGES"")"
    Print #f, "  ;; v3.0B.20 TEST: CCW overlay insert/rotation added."
    Print #f, "  ;; Confirmed working: Vertical = x,y rot 0; Horizontal CW = y,-x rot -90; sc = w."
    Print #f, "  ;; CCW test: insertion = -y,x; rot = 90; sc = w."
    Print #f, "  (setq sc w)"
    Print #f, "  (cond"
    Print #f, "    ((= SL_ORIENTATION ""Vertical"")"
    Print #f, "      (setq ins (strcat (rtos x 2 4) "","" (rtos y 2 4)))"
    Print #f, "      (setq rot ""0"")"
    Print #f, "    )"
    Print #f, "    ((= SL_ORIENTATION ""Horizontal CCW"")"
    Print #f, "      (setq ins (strcat (rtos (- y) 2 4) "","" (rtos x 2 4)))"
    Print #f, "      (setq rot ""90"")"
    Print #f, "    )"
    Print #f, "    (T"
    Print #f, "      (setq ins (strcat (rtos y 2 4) "","" (rtos (- x) 2 4)))"
    Print #f, "      (setq rot ""-90"")"
    Print #f, "    )"
    Print #f, "  )"
    Print #f, "  (command ""EDITIMAGE"" ""Attach"" img ins (rtos sc 2 8) rot)"
    Print #f, ")"
    Print #f, ""
End Sub


'============================================================
' Version 3.0B.6 - Image Folder Picker Helpers
' Run SetupScanLayoutButtons once after saving the workbook as XLSM
' and importing this module. It creates a clickable button on
' Project Settings for selecting the original image folder.
'============================================================

Public Sub SelectOriginalImageFolder()
    Dim folderPath As String
    Dim fd As FileDialog

    Set fd = Application.FileDialog(msoFileDialogFolderPicker)
    With fd
        .Title = "Select folder containing original scan images. Default prefix is set in Project Settings."
        .AllowMultiSelect = False
        If ThisWorkbook.Path <> "" Then .InitialFileName = ThisWorkbook.Path & "\"
        If .Show <> -1 Then Exit Sub
        folderPath = .SelectedItems(1)
    End With

    SetProjectSettingValue "Original Image Folder", folderPath

    If Trim(CStr(GetSettingValue("Processed Image Folder", ""))) = "" Then
        SetProjectSettingValue "Processed Image Folder", "Processed_Images"
    End If

    'Field-test fix: selecting a folder always restores the overlay naming convention.
    'Report photos named Scan 1, Scan 2, etc. are intentionally ignored.
    ResetScanImageNamesToOverlayDefaults

    WriteUtilityMessage "SCAN IMAGE FOLDER SELECTED" & vbCrLf & vbCrLf & _
                        folderPath & vbCrLf & vbCrLf & _
                        "Overlay filenames reset to S1, S2, S3...", "SUCCESS"

    MsgBox "Original Image Folder set to:" & vbCrLf & folderPath & vbCrLf & vbCrLf & _
           "Overlay filenames were reset to S1, S2, S3..." & vbCrLf & vbCrLf & _
           "Processed FIT images will be created in:" & vbCrLf & _
           folderPath & "\Processed_Images", vbInformation, "Scan Layout Generator"
End Sub

Private Sub ResetScanImageNamesToOverlayDefaults()
    Dim wsScan As Worksheet, wsImg As Worksheet
    Dim lastScanRow As Long, lastImgRow As Long
    Dim r As Long, outRow As Long
    Dim scanName As String, includeValue As String

    Set wsScan = ThisWorkbook.Worksheets("Scan Import")
    Set wsImg = ThisWorkbook.Worksheets("Scan Images")

    lastImgRow = wsImg.Cells(wsImg.Rows.count, "A").End(xlUp).Row
    If lastImgRow >= 3 Then wsImg.Range("A3:E" & lastImgRow).ClearContents

    lastScanRow = wsScan.Cells(wsScan.Rows.count, "A").End(xlUp).Row
    outRow = 3

    For r = 3 To lastScanRow
        scanName = Trim$(CStr(wsScan.Cells(r, "A").value))
        If Len(scanName) > 0 Then
            wsImg.Cells(outRow, "A").value = scanName
            wsImg.Cells(outRow, "B").value = DefaultImageName(scanName)
            wsImg.Cells(outRow, "C").value = DefaultProcessedName(scanName)
            includeValue = "YES"
            wsImg.Cells(outRow, "D").value = includeValue
            wsImg.Cells(outRow, "E").ClearContents
            outRow = outRow + 1
        End If
    Next r
End Sub

Private Sub WriteUtilityMessage(ByVal messageText As String, ByVal messageType As String)
    'Message Center is managed by SLG_MessageCenter.
    On Error Resume Next
    MC_WriteMessage messageText, messageType
    On Error GoTo 0
End Sub

Public Sub SetupScanLayoutButtons()
    Dim ws As Worksheet
    Dim shp As Shape

    Set ws = ThisWorkbook.Worksheets("Project Settings")


    On Error Resume Next
    ws.Shapes("btnSelectOriginalImageFolder").Delete
    On Error GoTo 0

    Set shp = ws.Shapes.AddShape(msoShapeRoundedRectangle, _
                                 ws.Range("D64").Left, ws.Range("D64").Top, _
                                 170, 30)
    With shp
        .Name = "btnSelectOriginalImageFolder"
        .TextFrame.Characters.Text = "Select Image Folder"
        .OnAction = "SelectOriginalImageFolder"
        .Fill.ForeColor.RGB = RGB(31, 78, 121)
        .line.ForeColor.RGB = RGB(31, 78, 121)
        .TextFrame.Characters.Font.Color = RGB(255, 255, 255)
        .TextFrame.Characters.Font.Bold = True
    End With

    MsgBox "Button created on Project Settings." & vbCrLf & _
           "Click 'Select Image Folder' to choose the folder containing original scan images. Scan Images column B is auto-filled as S1, S2, S3 and will find .png, .jpg, or .jpeg.", _
           vbInformation, "Scan Layout Generator"
End Sub


Private Sub EnsureProjectSettingExists(ByVal settingName As String, ByVal defaultValue As Variant)
    Dim ws As Worksheet
    Dim f As Range
    Dim lastRow As Long

    Set ws = ThisWorkbook.Worksheets("Project Settings")
    Set f = ws.Columns("A").Find(What:=settingName, LookIn:=xlValues, LookAt:=xlWhole, MatchCase:=False)

    If f Is Nothing Then
        lastRow = ws.Cells(ws.Rows.count, "A").End(xlUp).Row + 1
        ws.Cells(lastRow, "A").value = settingName
        ws.Cells(lastRow, "B").value = defaultValue
    ElseIf Trim(CStr(f.Offset(0, 1).value)) = "" Then
        f.Offset(0, 1).value = defaultValue
    End If
End Sub

Private Sub SetProjectSettingValue(ByVal settingName As String, ByVal settingValue As Variant)
    Dim ws As Worksheet
    Dim f As Range

    Set ws = ThisWorkbook.Worksheets("Project Settings")
    Set f = ws.Columns("A").Find(What:=settingName, LookIn:=xlValues, LookAt:=xlWhole, MatchCase:=False)

    If f Is Nothing Then
        MsgBox "Could not find setting: " & settingName, vbExclamation, "Scan Layout Generator"
    Else
        f.Offset(0, 1).value = settingValue
    End If
End Sub
'============================================================
' v4.7.0 Project Validation Dashboard
' Manual dashboard update macro for Project Settings page.
' Assign this macro to a worksheet button named CHECK PROJECT.
'============================================================
Public Sub CheckProjectStatus()
    On Error GoTo SafeFail

    Dim wsSet As Worksheet, wsScan As Worksheet, wsImg As Worksheet
    Set wsSet = ThisWorkbook.Worksheets("Project Settings")
    Set wsScan = ThisWorkbook.Worksheets("Scan Import")
    Set wsImg = ThisWorkbook.Worksheets("Scan Images")

    Dim projectStatus As String, projectNote As String
    Dim scanStatus As String, scanNote As String
    Dim imageStatus As String, imageNote As String
    Dim overlapStatus As String, overlapNote As String
    Dim overallStatus As String, overallNote As String

    EvaluateDashboardProjectData projectStatus, projectNote
    EvaluateDashboardScanData wsScan, scanStatus, scanNote
    EvaluateDashboardImageData wsScan, wsImg, imageStatus, imageNote
    EvaluateDashboardOverlapData wsScan, overlapStatus, overlapNote

    overallStatus = WorstDashboardStatus(projectStatus, scanStatus, imageStatus, overlapStatus)
    Select Case overallStatus
        Case "FAIL"
            overallNote = "ERRORS FOUND - correct failed items before generating."
        Case "WARN"
            overallNote = "WARNINGS PRESENT - review warning items before generating."
        Case Else
            overallNote = "READY TO GENERATE."
    End Select

    WriteProjectStatusDashboard wsSet, projectStatus, projectNote, scanStatus, scanNote, imageStatus, imageNote, overlapStatus, overlapNote, overallStatus, overallNote

    MsgBox "Project status check complete." & vbCrLf & vbCrLf & overallNote, _
           IIf(overallStatus = "FAIL", vbCritical, IIf(overallStatus = "WARN", vbExclamation, vbInformation)), _
           "Scan Layout Generator"
    Exit Sub

SafeFail:
    MsgBox "Project status check could not be completed." & vbCrLf & vbCrLf & _
           "Error: " & Err.description, vbCritical, "Scan Layout Generator"
End Sub

Private Sub EvaluateDashboardProjectData(ByRef statusOut As String, ByRef noteOut As String)
    Dim issues As String
    issues = ""

    If Not IsPositiveNumber(GetSettingValue("Vessel Length", "")) Then issues = issues & "Vessel Length; "
    If Not IsPositiveNumber(GetSettingValue("Vessel Height", "")) Then issues = issues & "Vessel Height; "

    Dim orientation As String
    orientation = UCase$(NormalizeVesselOrientation(CStr(GetSettingValue("Vessel Orientation", ""))))
    If orientation <> "VERTICAL" And orientation <> "HORIZONTAL CW" And orientation <> "HORIZONTAL CCW" Then
        issues = issues & "Vessel Orientation; "
    End If

    If issues = "" Then
        statusOut = "PASS"
        noteOut = "Required project settings are valid."
    Else
        statusOut = "FAIL"
        noteOut = "Check: " & Left$(issues, Len(issues) - 2)
    End If
End Sub

Private Sub EvaluateDashboardScanData(ByVal wsScan As Worksheet, ByRef statusOut As String, ByRef noteOut As String)
    Dim lastRow As Long, r As Long
    Dim scanCount As Long, failCount As Long, warnCount As Long
    Dim scanName As String
    Dim x1 As Variant, x2 As Variant, y1 As Variant, y2 As Variant
    Dim xStart As Double, xStop As Double, yStart As Double, yStop As Double

    lastRow = LastScanDataRow(wsScan)
    If lastRow < 3 Then lastRow = 3

    For r = 3 To lastRow
        If ScanRowHasData(wsScan, r) Then
            scanName = Trim(CStr(wsScan.Cells(r, "A").value))

            If scanName = "" Then
                'Missing scan names are generation-blocking.
                failCount = failCount + 1
            Else
                scanCount = scanCount + 1

                x1 = wsScan.Cells(r, "B").value
                x2 = wsScan.Cells(r, "C").value
                y1 = wsScan.Cells(r, "D").value
                y2 = wsScan.Cells(r, "E").value

                'Coordinate cells must be numeric. Missing/non-numeric values are generation-blocking.
                If Not IsNumeric(x1) Or Not IsNumeric(x2) Or Not IsNumeric(y1) Or Not IsNumeric(y2) Then
                    failCount = failCount + 1
                Else
                    xStart = CDbl(x1)
                    xStop = CDbl(x2)
                    yStart = CDbl(y1)
                    yStop = CDbl(y2)

                    'Zero-size scan regions are generation-blocking.
                    If xStart = xStop Then failCount = failCount + 1
                    If yStart = yStop Then failCount = failCount + 1

                    'Reversed coordinate pairs are auto-corrected by the main validation routine.
                    'They should show as WARN on the dashboard, not FAIL.
                    If xStart > xStop Then warnCount = warnCount + 1
                    If yStart > yStop Then warnCount = warnCount + 1
                End If
            End If
        End If
    Next r

    If scanCount = 0 Then
        statusOut = "FAIL"
        noteOut = "No scans found on Scan Import."
    ElseIf failCount > 0 Then
        statusOut = "FAIL"
        noteOut = CStr(failCount) & " generation-blocking scan issue(s) found."
        If warnCount > 0 Then noteOut = noteOut & " " & CStr(warnCount) & " coordinate warning(s) also found."
    ElseIf warnCount > 0 Then
        statusOut = "WARN"
        noteOut = CStr(warnCount) & " reversed coordinate pair(s) found. These will be automatically corrected during validation."
    Else
        statusOut = "PASS"
        noteOut = CStr(scanCount) & " scan(s) found with valid names and dimensions."
    End If
End Sub

Private Sub EvaluateDashboardImageData(ByVal wsScan As Worksheet, ByVal wsImg As Worksheet, ByRef statusOut As String, ByRef noteOut As String)
    Dim overlayEnabled As String
    overlayEnabled = UCase(Trim(CStr(GetSettingValue("Generate Overlay Drawing", "YES"))))

    If overlayEnabled = "NO" Then
        statusOut = "WARN"
        noteOut = "Overlay generation is disabled. Image check skipped."
        Exit Sub
    End If

    Dim imageFolder As String
    imageFolder = Trim(CStr(GetSettingValue("Original Image Folder", "")))
    If imageFolder = "" Then imageFolder = Trim(CStr(GetSettingValue("Image Folder", "")))
    If imageFolder = "" Then imageFolder = ThisWorkbook.Path

    If imageFolder = "" Or Not FolderExists(imageFolder) Then
        statusOut = "FAIL"
        noteOut = "Image folder missing or not found."
        Exit Sub
    End If

    On Error Resume Next
    SyncScanImagesFromScanImport wsScan, wsImg
    On Error GoTo 0

    Dim lastRow As Long, r As Long
    Dim scanName As String, imageName As String, imgPath As String
    Dim foundCount As Long, missingCount As Long

    lastRow = LastScanDataRow(wsScan)
    If lastRow < 3 Then lastRow = 3

    For r = 3 To lastRow
        If ScanRowHasData(wsScan, r) Then
            scanName = Trim(CStr(wsScan.Cells(r, "A").value))
            If scanName <> "" Then
                imageName = ImageNameForScan(wsImg, scanName)
                If imageName = "" Then imageName = DefaultImageName(scanName)
                imgPath = ResolveSourceImagePath(imageFolder, imageName)
                If imgPath = "" Then
                    missingCount = missingCount + 1
                Else
                    foundCount = foundCount + 1
                End If
            End If
        End If
    Next r

    If missingCount > 0 Then
        statusOut = "FAIL"
        noteOut = CStr(missingCount) & " image(s) missing. " & CStr(foundCount) & " image(s) found."
    ElseIf foundCount = 0 Then
        statusOut = "FAIL"
        noteOut = "No images found for overlay generation."
    Else
        statusOut = "PASS"
        noteOut = CStr(foundCount) & " image(s) found."
    End If
End Sub

Private Sub EvaluateDashboardOverlapData(ByVal wsScan As Worksheet, ByRef statusOut As String, ByRef noteOut As String)
    Dim overlapMode As String
    overlapMode = UCase(Trim(CStr(GetSettingValue("Overlap Detection", "WARN"))))
    If overlapMode = "" Then overlapMode = "WARN"

    If overlapMode = "OFF" Then
        statusOut = "WARN"
        noteOut = "Overlap Detection is OFF. Overlap check skipped."
        Exit Sub
    End If

    gValidationOverlapsDetected = 0
    Dim overlapReport As String
    overlapReport = BuildScanOverlapReport(wsScan)

    If overlapReport = "" Or gValidationOverlapsDetected = 0 Then
        statusOut = "PASS"
        noteOut = "No scan overlaps detected."
    ElseIf overlapMode = "BLOCK" Then
        statusOut = "FAIL"
        noteOut = CStr(gValidationOverlapsDetected) & " overlap pair(s) found. BLOCK mode will stop generation."
    Else
        statusOut = "WARN"
        noteOut = CStr(gValidationOverlapsDetected) & " overlap pair(s) found. WARN mode allows user override."
    End If
End Sub

Private Function WorstDashboardStatus(ByVal s1 As String, ByVal s2 As String, ByVal s3 As String, ByVal s4 As String) As String
    If s1 = "FAIL" Or s2 = "FAIL" Or s3 = "FAIL" Or s4 = "FAIL" Then
        WorstDashboardStatus = "FAIL"
    ElseIf s1 = "WARN" Or s2 = "WARN" Or s3 = "WARN" Or s4 = "WARN" Then
        WorstDashboardStatus = "WARN"
    Else
        WorstDashboardStatus = "PASS"
    End If
End Function

Private Sub WriteProjectStatusDashboard(ByVal ws As Worksheet, _
    ByVal projectStatus As String, ByVal projectNote As String, _
    ByVal scanStatus As String, ByVal scanNote As String, _
    ByVal imageStatus As String, ByVal imageNote As String, _
    ByVal overlapStatus As String, ByVal overlapNote As String, _
    ByVal overallStatus As String, ByVal overallNote As String)

    'Dashboard location is intentionally kept to the right of the existing Project Settings table.
    'If needed, move this range later by changing the anchor cell below.
    Dim anchor As Range
    Set anchor = ws.Range("E3")

    ws.Range("E3:F12").ClearContents
    ws.Range("E3:F12").Interior.Pattern = xlNone
    ws.Range("E3:F12").Font.Bold = False
    ws.Range("E3:F12").Font.Color = RGB(0, 0, 0)

    anchor.value = "PROJECT STATUS"
    anchor.Offset(0, 1).value = Format(Now, "yyyy-mm-dd hh:nn")
    ws.Range("E3:F3").Font.Bold = True

    ws.Range("E4").value = "Project Data"
    SetDashboardStatusCell ws.Range("F4"), projectStatus, projectNote

    ws.Range("E5").value = "Scans"
    SetDashboardStatusCell ws.Range("F5"), scanStatus, scanNote

    ws.Range("E6").value = "Images"
    SetDashboardStatusCell ws.Range("F6"), imageStatus, imageNote

    ws.Range("E7").value = "Overlaps"
    SetDashboardStatusCell ws.Range("F7"), overlapStatus, overlapNote

    ws.Range("E9").value = "OVERALL STATUS"
    ws.Range("E9:F9").Font.Bold = True
    SetDashboardStatusCell ws.Range("F9"), overallStatus, overallNote

    ws.Range("E11").value = "Notes"
    ws.Range("F11").value = overallNote
    ws.Range("F11").WrapText = True

    ws.Columns("E:F").AutoFit
End Sub

Private Sub SetDashboardStatusCell(ByVal targetCell As Range, ByVal statusText As String, ByVal noteText As String)
    targetCell.value = DashboardDisplayText(statusText)
    targetCell.Font.Bold = True
    targetCell.WrapText = True

    Select Case statusText
        Case "PASS"
            targetCell.Interior.Color = RGB(198, 239, 206)
            targetCell.Font.Color = RGB(0, 97, 0)
        Case "WARN"
            targetCell.Interior.Color = RGB(255, 235, 156)
            targetCell.Font.Color = RGB(156, 101, 0)
        Case Else
            targetCell.Interior.Color = RGB(255, 199, 206)
            targetCell.Font.Color = RGB(156, 0, 6)
    End Select

    On Error Resume Next
    targetCell.ClearComments
    targetCell.AddComment noteText
    targetCell.Comment.Visible = False
    On Error GoTo 0
End Sub

Private Function DashboardDisplayText(ByVal statusText As String) As String
    Select Case statusText
        Case "PASS"
            DashboardDisplayText = "PASS"
        Case "WARN"
            DashboardDisplayText = "WARN"
        Case Else
            DashboardDisplayText = "FAIL"
    End Select
End Function

' v5.1.1 Object Wrap - Keeps one SUPPORT_TEXT ID: larger wrapped piece wins; equal pieces follow the original starting corner.
' v5.1 Object Wrap - Added OBJECTWRAP for rectangular SUPPORTS geometry and assigned it to main menu option 7. SECTIONVIEWPORTS remains available as a manual command.
' v4.6.8 - Overlay output now calls PrintVesselReferenceLabels so cardinal/custom vessel reference indicators appear on overlay drawings.
' v4.6.9 - Vessel reference indicators are independent from ruler visibility on main layout and overlay; Show Vessel Reference Labels controls them.

' v4.6.58 - Legend sample geometry uses dedicated layers so scan hatches are never selected; right-panel movement is reversible when shrinking.
' v4.6.53 - TEXTRESIZE preserves the original fixed gap from the top of the summary text to the bottom of the AUT/MUT boxes.
' v4.6.51 - TEXTRESIZE positions the legend summary below the resized AUT/MUT samples using a text-height-based gap.
' v4.6.50 - TEXTRESIZE anchors AUT/MUT sample scaling at the sample geometry bottom-left corner so resizing grows upward and right without shifting into the shell.
' v4.6.48 - TEXTRESIZE scales legend samples from the bottom-center anchor so resizing does not shift the legend right.
' v4.6.46 - TEXTRESIZE selects only local legend geometry so vessel scan hatches are never scaled.
' v4.6.45 - TEXTRESIZE scales legend samples from the bottom anchor, reflows legend text, and moves heads/title by measured legend growth.
' v4.6.33 - TEXTRESIZE now proportionally reflows title-block and legend summary lines while keeping the lowest line anchored.
' v4.6.31 - Moved full NOZZLEWRAP instructions into the mandatory getpoint prompts for reliable DraftSight display.
' v4.6.30 - Clarified NOZZLEWRAP prompts to identify the exact vessel rectangle edges and selection order.
' v4.6.29 - NOZZLEWRAP now automatically wraps every shell nozzle centered on the two selected vessel boundaries.
' v4.6.26 - Added SCANMENU master DraftSight command launcher for SCANLAYOUT, TEXTRESIZE, and NOZZLEWRAP.
' v4.6.55 - Overlay LISP now uses the same launcher structure as Scan Layout, with option 1 calling SCANOVERLAY.




'============================================================
' GENERATION DATA VALIDATION
' Stops layout export before LISP creation if a required numeric
' field contains OCR REVIEW text, is blank, or is otherwise invalid.
' The exact cells are highlighted yellow and all errors are reported
' together in the Home Message Center.
'============================================================
Private Function ValidateLayoutGenerationData(ByVal wsScan As Worksheet, _
                                              ByVal wsShell As Worksheet, _
                                              ByVal wsHead As Worksheet) As Boolean
    Dim errorCount As Long
    Dim report As String
    Dim firstBad As Range
    Dim r As Long, lastRow As Long
    Dim firstRow As Long, sectionLast As Long
    Dim hLastRow As Long, hmFirstRow As Long, hmLastRow As Long
    Dim itemID As String, radiusPos As String

    report = "GENERATION BLOCKED" & vbCrLf & _
             "Fix the highlighted cells, then generate the Scan Layout again." & vbCrLf & vbCrLf

    'AUT scan rectangles.
    lastRow = wsScan.Cells(wsScan.Rows.count, "A").End(xlUp).Row
    For r = 3 To lastRow
        itemID = Trim$(CStr(wsScan.Cells(r, "A").value))
        If itemID <> "" And UCase$(Trim$(CStr(wsScan.Cells(r, "L").value))) <> "NO" Then
            ValidateRequiredNumber wsScan.Cells(r, "B"), "SCAN IMPORT", itemID, "X Position", errorCount, report, firstBad
            ValidateRequiredNumber wsScan.Cells(r, "D"), "SCAN IMPORT", itemID, "Y Position", errorCount, report, firstBad
            ValidateRequiredNumber wsScan.Cells(r, "F"), "SCAN IMPORT", itemID, "Width", errorCount, report, firstBad
            ValidateRequiredNumber wsScan.Cells(r, "G"), "SCAN IMPORT", itemID, "Height", errorCount, report, firstBad
        End If
    Next r

    'Circumferential welds.
    For r = 3 To 12
        itemID = Trim$(CStr(wsShell.Cells(r, "A").value))
        If itemID <> "" And UCase$(Trim$(CStr(wsShell.Cells(r, "C").value))) <> "NO" Then
            ValidateRequiredNumber wsShell.Cells(r, "B"), "CIRC WELDS", itemID, "Y Position", errorCount, report, firstBad
        End If
    Next r

    'Long seams. Start/Stop Y may be blank, but any entered value must be numeric.
    For r = 15 To 24
        itemID = Trim$(CStr(wsShell.Cells(r, "A").value))
        If itemID <> "" And UCase$(Trim$(CStr(wsShell.Cells(r, "E").value))) <> "NO" Then
            ValidateRequiredNumber wsShell.Cells(r, "B"), "LONG SEAMS", itemID, "X Position", errorCount, report, firstBad
            ValidateOptionalNumber wsShell.Cells(r, "C"), "LONG SEAMS", itemID, "Start Y", errorCount, report, firstBad
            ValidateOptionalNumber wsShell.Cells(r, "D"), "LONG SEAMS", itemID, "Stop Y", errorCount, report, firstBad
        End If
    Next r

    'Objects / supports.
    For r = 49 To 68
        itemID = Trim$(CStr(wsShell.Cells(r, "A").value))
        If itemID <> "" And UCase$(Trim$(CStr(wsShell.Cells(r, "F").value))) <> "NO" Then
            ValidateRequiredNumber wsShell.Cells(r, "B"), "OBJECTS", itemID, "X Position", errorCount, report, firstBad
            ValidateRequiredNumber wsShell.Cells(r, "C"), "OBJECTS", itemID, "Y Position", errorCount, report, firstBad
            ValidateRequiredNumber wsShell.Cells(r, "D"), "OBJECTS", itemID, "Circ. Width", errorCount, report, firstBad
            ValidateRequiredNumber wsShell.Cells(r, "E"), "OBJECTS", itemID, "Length", errorCount, report, firstBad
        End If
    Next r

    'Shell nozzles / circles - locate section dynamically.
    firstRow = FindSectionHeaderRow(wsShell, "SHELL NOZZLES")
    If firstRow = 0 Then firstRow = FindSectionHeaderRow(wsShell, "NOZZLES / CIRCLES")
    If firstRow = 0 Then firstRow = FindSectionHeaderRow(wsShell, "NOZZLES")
    If firstRow > 0 Then
        sectionLast = SectionLastRow(wsShell, firstRow + 1)
        For r = firstRow + 2 To sectionLast
            itemID = Trim$(CStr(wsShell.Cells(r, "A").value))
            If itemID <> "" And UCase$(Trim$(CStr(wsShell.Cells(r, "G").value))) <> "NO" Then
                ValidateRequiredNumber wsShell.Cells(r, "B"), "SHELL NOZZLES", itemID, "Diameter", errorCount, report, firstBad
                ValidateRequiredNumber wsShell.Cells(r, "C"), "SHELL NOZZLES", itemID, "X Position", errorCount, report, firstBad
                ValidateRequiredNumber wsShell.Cells(r, "D"), "SHELL NOZZLES", itemID, "Y Position", errorCount, report, firstBad
                ValidateOptionalNumberOrTOL wsShell.Cells(r, "E"), "SHELL NOZZLES", itemID, "Min T", errorCount, report, firstBad
            End If
        Next r
    End If

    'Shell MUT points.
    For r = 71 To 90
        itemID = Trim$(CStr(wsShell.Cells(r, "A").value))
        If itemID <> "" Then
            ValidateRequiredNumber wsShell.Cells(r, "B"), "SHELL MUT", itemID, "X Position", errorCount, report, firstBad
            ValidateRequiredNumber wsShell.Cells(r, "C"), "SHELL MUT", itemID, "Y Position", errorCount, report, firstBad
            ValidateOptionalNumber wsShell.Cells(r, "D"), "SHELL MUT", itemID, "Min T", errorCount, report, firstBad
        End If
    Next r

    'Head nozzles.
    hLastRow = HeadNozzleLastRow(wsHead)
    For r = 4 To hLastRow
        itemID = Trim$(CStr(wsHead.Cells(r, "B").value))
        If Trim$(CStr(wsHead.Cells(r, "A").value)) <> "" And itemID <> "" And _
           UCase$(Trim$(CStr(wsHead.Cells(r, "J").value))) <> "NO" Then
            ValidateRequiredNumber wsHead.Cells(r, "C"), "HEAD NOZZLES", itemID, "Diameter", errorCount, report, firstBad
            ValidateRequiredClock wsHead.Cells(r, "D"), "HEAD NOZZLES", itemID, "Clock Position", errorCount, report, firstBad
            radiusPos = UCase$(Trim$(CStr(wsHead.Cells(r, "E").value)))
            If radiusPos = "CUSTOM" Or radiusPos = "X" Then
                ValidateRequiredNumber wsHead.Cells(r, "F"), "HEAD NOZZLES", itemID, "Custom Radius", errorCount, report, firstBad
            Else
                ValidateOptionalNumber wsHead.Cells(r, "F"), "HEAD NOZZLES", itemID, "Custom Radius", errorCount, report, firstBad
            End If
            ValidateOptionalNumberOrTOL wsHead.Cells(r, "G"), "HEAD NOZZLES", itemID, "Min T", errorCount, report, firstBad
        End If
    Next r

    'Head MUT points.
    hmFirstRow = HeadMUTFirstDataRow(wsHead)
    If hmFirstRow > 0 Then
        hmLastRow = wsHead.Cells(wsHead.Rows.count, "A").End(xlUp).Row
        For r = hmFirstRow To hmLastRow
            itemID = Trim$(CStr(wsHead.Cells(r, "B").value))
            If Trim$(CStr(wsHead.Cells(r, "A").value)) <> "" And itemID <> "" And _
               UCase$(Trim$(CStr(wsHead.Cells(r, "H").value))) <> "NO" Then
                ValidateRequiredClock wsHead.Cells(r, "C"), "HEAD MUT", itemID, "Clock Position", errorCount, report, firstBad
                radiusPos = UCase$(Trim$(CStr(wsHead.Cells(r, "D").value)))
                If radiusPos = "CUSTOM" Or radiusPos = "X" Then
                    ValidateRequiredNumber wsHead.Cells(r, "E"), "HEAD MUT", itemID, "Custom Radius", errorCount, report, firstBad
                Else
                    ValidateOptionalNumber wsHead.Cells(r, "E"), "HEAD MUT", itemID, "Custom Radius", errorCount, report, firstBad
                End If
                ValidateOptionalNumber wsHead.Cells(r, "F"), "HEAD MUT", itemID, "Min T", errorCount, report, firstBad
            End If
        Next r
    End If

    If errorCount > 0 Then
        report = report & vbCrLf & "TOTAL ERRORS: " & CStr(errorCount)
        On Error Resume Next
        MC_WriteMessage report, "ERROR"
        On Error GoTo 0

        If Not firstBad Is Nothing Then
            firstBad.Worksheet.Activate
            firstBad.Select
        End If

        MsgBox "Scan Layout was not generated." & vbCrLf & _
               CStr(errorCount) & " highlighted error" & IIf(errorCount = 1, "", "s") & _
               " must be fixed before retrying.", _
               vbExclamation, "AxisBuilder"
        ValidateLayoutGenerationData = False
    Else
        ValidateLayoutGenerationData = True
    End If
End Function

Private Sub ValidateRequiredNumber(ByVal target As Range, ByVal sectionName As String, _
                                   ByVal itemID As String, ByVal fieldName As String, _
                                   ByRef errorCount As Long, ByRef report As String, _
                                   ByRef firstBad As Range)
    Dim valueText As String
    valueText = Trim$(CStr(target.value))

    If valueText = "" Then
        AddGenerationDataError target, sectionName, itemID, fieldName, "is blank", errorCount, report, firstBad
    ElseIf Not IsNumeric(target.value) Then
        AddGenerationDataError target, sectionName, itemID, fieldName, "is not numeric: " & valueText, errorCount, report, firstBad
    End If
End Sub

Private Sub ValidateOptionalNumber(ByVal target As Range, ByVal sectionName As String, _
                                   ByVal itemID As String, ByVal fieldName As String, _
                                   ByRef errorCount As Long, ByRef report As String, _
                                   ByRef firstBad As Range)
    Dim valueText As String
    valueText = Trim$(CStr(target.value))
    If valueText <> "" And Not IsNumeric(target.value) Then
        AddGenerationDataError target, sectionName, itemID, fieldName, "is not numeric: " & valueText, errorCount, report, firstBad
    End If
End Sub

Private Sub ValidateOptionalNumberOrTOL(ByVal target As Range, ByVal sectionName As String, _
                                        ByVal itemID As String, ByVal fieldName As String, _
                                        ByRef errorCount As Long, ByRef report As String, _
                                        ByRef firstBad As Range)
    Dim valueText As String
    valueText = Trim$(CStr(target.value))
    If valueText <> "" And UCase$(valueText) <> "TOL" And Not IsNumeric(target.value) Then
        AddGenerationDataError target, sectionName, itemID, fieldName, "is invalid: " & valueText, errorCount, report, firstBad
    End If
End Sub

Private Sub ValidateRequiredClock(ByVal target As Range, ByVal sectionName As String, _
                                  ByVal itemID As String, ByVal fieldName As String, _
                                  ByRef errorCount As Long, ByRef report As String, _
                                  ByRef firstBad As Range)
    Dim valueText As String
    valueText = Trim$(CStr(target.value))

    If valueText = "" Then
        AddGenerationDataError target, sectionName, itemID, fieldName, "is blank", errorCount, report, firstBad
    ElseIf InStr(1, UCase$(valueText), "REVIEW", vbTextCompare) > 0 Then
        AddGenerationDataError target, sectionName, itemID, fieldName, "requires review: " & valueText, errorCount, report, firstBad
    ElseIf Not IsNumeric(valueText) And InStr(1, valueText, ":", vbTextCompare) = 0 And _
           InStr(1, valueText, ChrW(176), vbTextCompare) = 0 Then
        AddGenerationDataError target, sectionName, itemID, fieldName, "is not a valid clock position: " & valueText, errorCount, report, firstBad
    End If
End Sub

Private Sub AddGenerationDataError(ByVal target As Range, ByVal sectionName As String, _
                                   ByVal itemID As String, ByVal fieldName As String, _
                                   ByVal reason As String, ByRef errorCount As Long, _
                                   ByRef report As String, ByRef firstBad As Range)
    errorCount = errorCount + 1
    target.Interior.Color = RGB(255, 255, 0)
    If firstBad Is Nothing Then Set firstBad = target

    report = report & "- " & sectionName & " / " & itemID & " / " & fieldName & _
             " " & reason & "." & vbCrLf
End Sub
