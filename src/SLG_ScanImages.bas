Attribute VB_Name = "SLG_ScanImages"
Option Explicit

'=============================================================
' Scan Layout Generator v4.7.2
' Select Scan Image Folder - customizable overlay image names
'
' Assign the Home button to:
'     SelectScanImageFolder
'
' What it does:
'   1. Opens a folder picker.
'   2. Saves the selected folder in the existing Image Folder
'      row on Project Settings.
'   3. Uses the Image File value on Scan Images for each scan.
'   4. Only defaults to S1, S2, S3, etc. when Image File is blank.
'   5. Supports custom names such as Scan 1, TankCourseA, IMG_8472, etc.
'   6. Preserves scan display names and Notes.
'   7. Updates the Home Message Center.
'   8. Calls RefreshProjectSummary when available.
'=============================================================

Private Const SHEET_PROJECT As String = "Project Settings"
Private Const SHEET_IMAGES As String = "Scan Images"
Private Const SHEET_HOME As String = "Home"

Public Sub SelectScanImageFolder()

    Dim folderPath As String
    Dim wsProject As Worksheet
    Dim wsImages As Worksheet
    Dim imageFolderCell As Range
    Dim scanHeader As Range
    Dim imageHeader As Range
    Dim statusHeader As Range
    Dim statusColumn As Long
    Dim lastRow As Long
    Dim rowNum As Long
    Dim scanName As String
    Dim expectedImage As String
    Dim linkedCount As Long
    Dim missingCount As Long
    Dim missingIDs As String
    Dim totalScans As Long
    Dim fileIndex As Object
    Dim priorCalc As XlCalculation
    Dim priorScreenUpdating As Boolean
    Dim priorEvents As Boolean

    On Error GoTo CleanFail

    Set wsProject = ThisWorkbook.Worksheets(SHEET_PROJECT)
    Set wsImages = ThisWorkbook.Worksheets(SHEET_IMAGES)

    folderPath = PickImageFolder()
    If Len(folderPath) = 0 Then Exit Sub

    Set imageFolderCell = FindValueCellByLabel(wsProject, "Image Folder")
    If imageFolderCell Is Nothing Then
        MsgBox "The Image Folder row could not be found on Project Settings.", _
               vbExclamation, "Scan Layout Generator"
        Exit Sub
    End If

    Set scanHeader = FindHeaderCell(wsImages, Array("Scan Name", "Scan ID", "Scan"))
    Set imageHeader = FindHeaderCell(wsImages, Array("Image File", "Image Filename", "Image Name"))
    Set statusHeader = FindHeaderCell(wsImages, Array("Status", "Image Status", "Link Status", "Review"))

    If scanHeader Is Nothing Or imageHeader Is Nothing Then
        MsgBox "The Scan Name or Image File header could not be found on Scan Images.", _
               vbExclamation, "Scan Layout Generator"
        Exit Sub
    End If

    If statusHeader Is Nothing Then
        statusColumn = 5
    Else
        statusColumn = statusHeader.Column
    End If

    priorCalc = Application.Calculation
    priorScreenUpdating = Application.ScreenUpdating
    priorEvents = Application.EnableEvents

    Application.ScreenUpdating = False
    Application.EnableEvents = False
    Application.Calculation = xlCalculationManual

    imageFolderCell.value = folderPath

    Set fileIndex = BuildImageIndex(folderPath)

    lastRow = wsImages.Cells(wsImages.Rows.count, scanHeader.Column).End(xlUp).Row

    For rowNum = scanHeader.Row + 1 To lastRow

        scanName = Trim$(CStr(wsImages.Cells(rowNum, scanHeader.Column).value))

        If Len(scanName) > 0 Then
            totalScans = totalScans + 1

            'Use the customizable Image File value entered on Scan Images.
            'Only fall back to S1, S2, S3, etc. when that cell is blank.
            expectedImage = ResolveExpectedImageName( _
                                scanName, _
                                CStr(wsImages.Cells(rowNum, imageHeader.Column).value), _
                                totalScans)

            'If the Image File cell was blank, show the default that was used.
            'Never overwrite a custom image name supplied by the user.
            If Len(Trim$(CStr(wsImages.Cells(rowNum, imageHeader.Column).value))) = 0 Then
                wsImages.Cells(rowNum, imageHeader.Column).value = expectedImage
            End If

            If fileIndex.Exists(NormalizeImageKey(RemoveFileExtension(expectedImage))) Then
                linkedCount = linkedCount + 1
                wsImages.Cells(rowNum, statusColumn).value = "LINKED"
                ClearImageReviewFormatting wsImages, rowNum, scanHeader.Column, imageHeader.Column, statusColumn
            Else
                missingCount = missingCount + 1
                If Len(missingIDs) > 0 Then missingIDs = missingIDs & ", "
                missingIDs = missingIDs & expectedImage
                wsImages.Cells(rowNum, statusColumn).value = "REVIEW: MISSING " & expectedImage
                ApplyImageReviewFormatting wsImages, rowNum, scanHeader.Column, imageHeader.Column, statusColumn
            End If
        End If
    Next rowNum

    MC_WriteMessage "Image folder selected: " & folderPath & vbCrLf & _
                    linkedCount & " of " & totalScans & _
                    " scan images found." & _
                    IIf(missingCount > 0, " " & missingCount & " require review." & vbCrLf & _
                       "Missing: " & missingIDs, ""), _
                    IIf(missingCount > 0, "REVIEW", "SUCCESS")

    TryRunMacro "RefreshProjectSummary"

    MsgBox linkedCount & " of " & totalScans & " scan images were found." & _
           IIf(missingCount > 0, vbCrLf & missingCount & " require review." & vbCrLf & _
              "Missing: " & missingIDs, ""), _
           IIf(missingCount = 0, vbInformation, vbExclamation), _
           "Scan Image Folder"

CleanExit:
    Application.Calculation = priorCalc
    Application.EnableEvents = priorEvents
    Application.ScreenUpdating = priorScreenUpdating
    Exit Sub

CleanFail:
    MC_WriteMessage "Image-folder selection failed: " & Err.description, "ERROR"
    MsgBox "The image-folder process could not be completed." & vbCrLf & _
           Err.description, vbCritical, "Scan Layout Generator"
    Resume CleanExit

End Sub

Public Function CountActuallyLinkedScanImages() As Long
    Dim wsProject As Worksheet, wsImages As Worksheet
    Dim imageFolderCell As Range, scanHeader As Range, imageHeader As Range
    Dim fileIndex As Object
    Dim folderPath As String, scanName As String, expectedImage As String
    Dim lastRow As Long, rowNum As Long, sequentialNumber As Long

    On Error GoTo CountFail

    Set wsProject = ThisWorkbook.Worksheets(SHEET_PROJECT)
    Set wsImages = ThisWorkbook.Worksheets(SHEET_IMAGES)
    Set imageFolderCell = FindValueCellByLabel(wsProject, "Original Image Folder")
    If imageFolderCell Is Nothing Then Set imageFolderCell = FindValueCellByLabel(wsProject, "Image Folder")
    Set scanHeader = FindHeaderCell(wsImages, Array("Scan Name", "Scan ID", "Scan"))
    Set imageHeader = FindHeaderCell(wsImages, Array("Image File", "Image Filename", "Image Name"))
    If imageFolderCell Is Nothing Or scanHeader Is Nothing Or imageHeader Is Nothing Then Exit Function

    folderPath = Trim$(CStr(imageFolderCell.value))
    If Len(folderPath) = 0 Then
        Set imageFolderCell = FindValueCellByLabel(wsProject, "Image Folder")
        If Not imageFolderCell Is Nothing Then folderPath = Trim$(CStr(imageFolderCell.value))
    End If
    If Len(folderPath) = 0 Then Exit Function
    Set fileIndex = BuildImageIndex(folderPath)

    lastRow = wsImages.Cells(wsImages.Rows.count, scanHeader.Column).End(xlUp).Row
    For rowNum = scanHeader.Row + 1 To lastRow
        scanName = Trim$(CStr(wsImages.Cells(rowNum, scanHeader.Column).value))
        If Len(scanName) > 0 Then
            sequentialNumber = sequentialNumber + 1
            expectedImage = ResolveExpectedImageName( _
                                scanName, _
                                CStr(wsImages.Cells(rowNum, imageHeader.Column).value), _
                                sequentialNumber)

            If fileIndex.Exists(NormalizeImageKey(RemoveFileExtension(expectedImage))) Then
                CountActuallyLinkedScanImages = CountActuallyLinkedScanImages + 1
            End If
        End If
    Next rowNum
    Exit Function

CountFail:
    CountActuallyLinkedScanImages = 0
End Function

Public Function ValidateCurrentScanImages(Optional ByVal activateFirstIssue As Boolean = True, _
                                          Optional ByVal writeMessage As Boolean = True, _
                                          Optional ByVal showDialog As Boolean = True) As Boolean
    Dim wsProject As Worksheet, wsImages As Worksheet
    Dim folderCell As Range, scanHeader As Range, imageHeader As Range, statusHeader As Range
    Dim fileIndex As Object
    Dim folderPath As String, scanName As String, imageName As String, imageKey As String
    Dim missingIDs As String
    Dim lastRow As Long, rowNum As Long, statusColumn As Long
    Dim totalCount As Long, linkedCount As Long, missingCount As Long, firstIssueRow As Long

    On Error GoTo ValidationFail

    Set wsProject = ThisWorkbook.Worksheets(SHEET_PROJECT)
    Set wsImages = ThisWorkbook.Worksheets(SHEET_IMAGES)
    Set folderCell = FindValueCellByLabel(wsProject, "Original Image Folder")
    If folderCell Is Nothing Then Set folderCell = FindValueCellByLabel(wsProject, "Image Folder")
    Set scanHeader = FindHeaderCell(wsImages, Array("Scan Name", "Scan ID", "Scan"))
    Set imageHeader = FindHeaderCell(wsImages, Array("Image File", "Image Filename", "Image Name"))
    Set statusHeader = FindHeaderCell(wsImages, Array("Status", "Image Status", "Link Status", "Review"))

    If folderCell Is Nothing Or scanHeader Is Nothing Or imageHeader Is Nothing Then GoTo ValidationFail
    If statusHeader Is Nothing Then
        statusColumn = 5
    Else
        statusColumn = statusHeader.Column
    End If
    folderPath = Trim$(CStr(folderCell.value))
    If Len(folderPath) = 0 Then
        Set folderCell = FindValueCellByLabel(wsProject, "Image Folder")
        If Not folderCell Is Nothing Then folderPath = Trim$(CStr(folderCell.value))
    End If

    If Len(folderPath) = 0 Then
        If writeMessage Then MC_WriteMessage "SCAN IMAGE VALIDATION" & vbCrLf & vbCrLf & _
                            "Image folder is missing.", "REVIEW"
        If showDialog Then MsgBox "The scan image folder is missing.", vbExclamation, "Scan Image Validation"
        Exit Function
    End If

    Set fileIndex = BuildImageIndex(folderPath)
    lastRow = wsImages.Cells(wsImages.Rows.count, scanHeader.Column).End(xlUp).Row

    For rowNum = scanHeader.Row + 1 To lastRow
        scanName = Trim$(CStr(wsImages.Cells(rowNum, scanHeader.Column).value))
        If Len(scanName) > 0 Then
            totalCount = totalCount + 1
            imageName = ResolveExpectedImageName( _
                            scanName, _
                            CStr(wsImages.Cells(rowNum, imageHeader.Column).value), _
                            totalCount)

            'If blank, write the S-number default that validation used.
            'Custom values are left exactly as entered.
            If Len(Trim$(CStr(wsImages.Cells(rowNum, imageHeader.Column).value))) = 0 Then
                wsImages.Cells(rowNum, imageHeader.Column).value = imageName
            End If

            imageKey = NormalizeImageKey(RemoveFileExtension(imageName))

            If fileIndex.Exists(imageKey) Then
                linkedCount = linkedCount + 1
                wsImages.Cells(rowNum, statusColumn).value = "LINKED"
                ClearImageReviewFormatting wsImages, rowNum, scanHeader.Column, imageHeader.Column, statusColumn
            Else
                missingCount = missingCount + 1
                If firstIssueRow = 0 Then firstIssueRow = rowNum
                If Len(missingIDs) > 0 Then missingIDs = missingIDs & ", "
                missingIDs = missingIDs & imageName
                wsImages.Cells(rowNum, statusColumn).value = "REVIEW: MISSING " & imageName
                ApplyImageReviewFormatting wsImages, rowNum, scanHeader.Column, imageHeader.Column, statusColumn
            End If
        End If
    Next rowNum

    If writeMessage Then
        MC_WriteMessage "SCAN IMAGE VALIDATION" & vbCrLf & vbCrLf & _
                        linkedCount & " of " & totalCount & " linked." & _
                        IIf(missingCount > 0, vbCrLf & missingCount & " require review." & vbCrLf & _
                           "Missing: " & missingIDs, ""), _
                        IIf(missingCount > 0, "REVIEW", "SUCCESS")
        TryRunMacro "RefreshProjectSummary"
    End If

    If missingCount > 0 Then
        If activateFirstIssue And firstIssueRow > 0 Then
            wsImages.Activate
            wsImages.Cells(firstIssueRow, imageHeader.Column).Select
        End If
        If showDialog Then
            MsgBox linkedCount & " of " & totalCount & " scan images are linked." & vbCrLf & _
                   missingCount & " require review." & vbCrLf & vbCrLf & _
                   "Missing: " & missingIDs, vbExclamation, "Scan Image Validation"
        End If
        ValidateCurrentScanImages = False
    Else
        ValidateCurrentScanImages = (totalCount > 0)
    End If
    Exit Function

ValidationFail:
    If writeMessage Then MC_WriteMessage "SCAN IMAGE VALIDATION FAILED" & vbCrLf & vbCrLf & _
                        Err.description, "ERROR"
    If showDialog Then MsgBox "Scan image validation could not be completed." & vbCrLf & _
                       Err.description, vbCritical, "Scan Image Validation"
    ValidateCurrentScanImages = False
End Function

Private Sub ApplyImageReviewFormatting(ByVal ws As Worksheet, ByVal rowNum As Long, _
                                       ByVal scanColumn As Long, ByVal imageColumn As Long, _
                                       ByVal statusColumn As Long)
    With Union(ws.Cells(rowNum, scanColumn), ws.Cells(rowNum, imageColumn), ws.Cells(rowNum, statusColumn))
        .Interior.Color = RGB(255, 235, 156)
        .Font.Color = RGB(156, 0, 6)
    End With
    ws.Cells(rowNum, statusColumn).Font.Bold = True
End Sub

Private Sub ClearImageReviewFormatting(ByVal ws As Worksheet, ByVal rowNum As Long, _
                                       ByVal scanColumn As Long, ByVal imageColumn As Long, _
                                       ByVal statusColumn As Long)
    Dim cell As Range
    For Each cell In Union(ws.Cells(rowNum, scanColumn), ws.Cells(rowNum, imageColumn), ws.Cells(rowNum, statusColumn)).Cells
        If cell.Interior.Color = RGB(255, 235, 156) Then cell.Interior.Pattern = xlNone
        If cell.Font.Color = RGB(156, 0, 6) Then cell.Font.ColorIndex = xlAutomatic
    Next cell
    ws.Cells(rowNum, statusColumn).Font.Bold = False
End Sub

Private Function PickImageFolder() As String

    Dim dialogBox As FileDialog

    Set dialogBox = Application.FileDialog(msoFileDialogFolderPicker)

    With dialogBox
        .Title = "Select Scan Image Folder"
        .AllowMultiSelect = False

        If Len(ThisWorkbook.Path) > 0 Then
            .InitialFileName = ThisWorkbook.Path & Application.PathSeparator
        End If

        If .Show = -1 Then
            PickImageFolder = .SelectedItems(1)
        End If
    End With

End Function

Private Function BuildImageIndex(ByVal folderPath As String) As Object

    Dim index As Object
    Dim fileSystem As Object
    Dim folderObject As Object
    Dim fileObject As Object
    Dim extension As String
    Dim baseName As String
    Dim normalizedName As String

    Set index = CreateObject("Scripting.Dictionary")
    index.CompareMode = vbTextCompare

    Set fileSystem = CreateObject("Scripting.FileSystemObject")
    Set folderObject = fileSystem.GetFolder(folderPath)

    For Each fileObject In folderObject.Files

        extension = LCase$(fileSystem.GetExtensionName(fileObject.Name))

        If extension = "png" Or extension = "jpg" Or extension = "jpeg" Then
            baseName = fileSystem.GetBaseName(fileObject.Name)
            normalizedName = NormalizeImageKey(baseName)

            'First file wins if duplicate normalized names exist.
            If Len(normalizedName) > 0 Then
                If Not index.Exists(normalizedName) Then
                    index.Add normalizedName, fileObject.Name
                End If
            End If
        End If
    Next fileObject

    Set BuildImageIndex = index

End Function




Private Function ResolveExpectedImageName(ByVal scanName As String, _
                                          ByVal configuredImageName As String, _
                                          ByVal sequentialNumber As Long) As String

    Dim result As String

    'The Image File column is authoritative when populated.
    result = Trim$(configuredImageName)

    'Backward-compatible default for blank Image File cells.
    If Len(result) = 0 Then
        result = ScanNumberAlias(scanName)
        If Len(result) = 0 Then result = "S" & CStr(sequentialNumber)
    End If

    ResolveExpectedImageName = result

End Function

Private Function NormalizeImageKey(ByVal value As String) As String

    Dim result As String

    result = UCase$(Trim$(value))
    result = Replace(result, " ", "")
    result = Replace(result, "-", "")
    result = Replace(result, "_", "")
    result = Replace(result, ".", "")
    result = Replace(result, "(", "")
    result = Replace(result, ")", "")

    NormalizeImageKey = result

End Function

Private Function ScanNumberAlias(ByVal scanName As String) As String

    Dim normalized As String
    Dim position As Long
    Dim numberPart As String
    Dim currentChar As String

    normalized = NormalizeImageKey(scanName)

    For position = 1 To Len(normalized)
        currentChar = Mid$(normalized, position, 1)

        If currentChar Like "#" Then
            numberPart = numberPart & currentChar
        End If
    Next position

    If Len(numberPart) > 0 Then
        ScanNumberAlias = "S" & CStr(CLng(numberPart))
    End If

End Function

Private Function RemoveFileExtension(ByVal fileName As String) As String

    Dim slashPosition As Long
    Dim dotPosition As Long
    Dim cleanName As String

    cleanName = Trim$(fileName)
    slashPosition = InStrRev(cleanName, Application.PathSeparator)

    If slashPosition > 0 Then
        cleanName = Mid$(cleanName, slashPosition + 1)
    End If

    dotPosition = InStrRev(cleanName, ".")

    If dotPosition > 1 Then
        cleanName = Left$(cleanName, dotPosition - 1)
    End If

    RemoveFileExtension = cleanName

End Function

Private Function FindValueCellByLabel(ByVal targetSheet As Worksheet, _
                                      ByVal labelText As String) As Range

    Dim foundCell As Range
    Dim searchRange As Range
    Dim candidate As Range

    Set searchRange = targetSheet.UsedRange

    Set foundCell = searchRange.Find(What:=labelText, _
                                     After:=searchRange.Cells(searchRange.Cells.count), _
                                     LookIn:=xlValues, _
                                     LookAt:=xlWhole, _
                                     SearchOrder:=xlByRows, _
                                     SearchDirection:=xlNext, _
                                     MatchCase:=False)

    If foundCell Is Nothing Then
        Set foundCell = searchRange.Find(What:="*" & labelText & "*", _
                                         After:=searchRange.Cells(searchRange.Cells.count), _
                                         LookIn:=xlValues, _
                                         LookAt:=xlPart, _
                                         SearchOrder:=xlByRows, _
                                         SearchDirection:=xlNext, _
                                         MatchCase:=False)
    End If

    If Not foundCell Is Nothing Then
        Set candidate = foundCell.Offset(0, 1)

        If candidate.MergeCells Then
            Set candidate = candidate.MergeArea.Cells(1, 1)
        End If

        Set FindValueCellByLabel = candidate
    End If

End Function

Private Function FindHeaderCell(ByVal targetSheet As Worksheet, _
                                ByVal possibleHeaders As Variant) As Range

    Dim header As Variant
    Dim foundCell As Range
    Dim searchRange As Range

    Set searchRange = targetSheet.UsedRange

    For Each header In possibleHeaders
        Set foundCell = searchRange.Find(What:=CStr(header), _
                                         After:=searchRange.Cells(searchRange.Cells.count), _
                                         LookIn:=xlValues, _
                                         LookAt:=xlWhole, _
                                         SearchOrder:=xlByRows, _
                                         SearchDirection:=xlNext, _
                                         MatchCase:=False)

        If Not foundCell Is Nothing Then
            Set FindHeaderCell = foundCell
            Exit Function
        End If
    Next header

End Function


Private Sub TryRunMacro(ByVal macroName As String)

    On Error Resume Next
    Application.Run "'" & ThisWorkbook.Name & "'!" & macroName
    On Error GoTo 0

End Sub
