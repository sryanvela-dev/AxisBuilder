Attribute VB_Name = "SLG_ScanImages"
Option Explicit

'=============================================================
' Scan Layout Generator v4.7.2
' Select Scan Image Folder - automatic scan photo matching
'
' Assign the Home button to:
'     SelectScanImageFolder
' (Project Settings "Select Image Folder" runs the same flow
'  through SLG_Utilities.SelectOriginalImageFolder.)
'
' What it does:
'   1. Opens a folder picker.
'   2. Lists the .png / .jpg / .jpeg files in the folder and
'      matches them to scans by number (SCAN01, Scan 1 -> 1).
'   3. Files are grouped by naming pattern (S1 -> "S#",
'      Scan 1 -> "Scan #"). If more than one pattern matches,
'      asks once which to use, then only asks about leftovers.
'   4. Asks before replacing Image File names that differ.
'   5. Stores the full filename (S1.png) in Image File and marks
'      LINKED only when the generator will find that file.
'   6. Cancel at any prompt changes nothing.
'   7. Preserves scan names, Include and Notes.
'   8. Updates the Home Message Center and Project Summary.
'=============================================================

Private Const SHEET_PROJECT As String = "Project Settings"
Private Const SHEET_IMAGES As String = "Scan Images"
Private Const SHEET_HOME As String = "Home"
Private Const PROMPT_TITLE As String = "Scan Image Folder"
Private Const MAX_PATTERN_CHOICES As Long = 9
Private Const MAX_FILE_CHOICES As Long = 9

Public Sub SelectScanImageFolder()

    Dim folderPath As String
    Dim wsProject As Worksheet
    Dim wsImages As Worksheet
    Dim imageFolderCell As Range
    Dim scanHeader As Range
    Dim imageHeader As Range
    Dim statusHeader As Range
    Dim processedHeader As Range
    Dim statusColumn As Long
    Dim processedColumn As Long
    Dim lastRow As Long
    Dim rowNum As Long
    Dim i As Long
    Dim j As Long
    Dim k As Long

    'Scans, read into memory first
    Dim scanCount As Long
    Dim scanRows() As Long
    Dim scanNames() As String
    Dim scanNums() As Long
    Dim oldImages() As String
    Dim newImages() As String
    Dim scanSkipped() As Boolean

    'Image files in the folder
    Dim fileSystem As Object
    Dim folderObject As Object
    Dim fileObject As Object
    Dim extension As String
    Dim baseName As String
    Dim startPos As Long
    Dim groupLen As Long
    Dim fileCount As Long
    Dim noDigitFiles As Long
    Dim fileNames() As String
    Dim fileNums() As Long
    Dim filePatterns() As String

    'Naming patterns
    Dim patternIndex As Object
    Dim patternNumbers As Object
    Dim patternCount As Long
    Dim patternNames() As String
    Dim patternScans() As Long
    Dim patternExamples() As String
    Dim patternOrder() As Long
    Dim coveringCount As Long
    Dim chosenPattern As String
    Dim keyText As String
    Dim swapValue As Long

    'Prompts
    Dim promptText As String
    Dim choice As Long
    Dim candidates() As String
    Dim candidateCount As Long
    Dim chosenCount As Long
    Dim oldPath As String
    Dim newPath As String
    Dim conflictCount As Long
    Dim conflictText As String
    Dim conflictAnswer As VbMsgBoxResult
    Dim keepExisting As Boolean

    'Results
    Dim finalImage As String
    Dim matchedCount As Long
    Dim missingCount As Long
    Dim skippedCount As Long
    Dim missingIDs As String
    Dim summaryText As String

    Dim priorCalc As XlCalculation
    Dim priorScreenUpdating As Boolean
    Dim priorEvents As Boolean

    priorCalc = Application.Calculation
    priorScreenUpdating = Application.ScreenUpdating
    priorEvents = Application.EnableEvents

    On Error GoTo CleanFail

    Set wsProject = ThisWorkbook.Worksheets(SHEET_PROJECT)
    Set wsImages = ThisWorkbook.Worksheets(SHEET_IMAGES)

    Set imageFolderCell = FindImageFolderCell(wsProject)
    If imageFolderCell Is Nothing Then
        MsgBox "The Original Image Folder row could not be found on Project Settings.", _
               vbExclamation, "Scan Layout Generator"
        Exit Sub
    End If

    Set scanHeader = FindHeaderCell(wsImages, Array("Scan Name", "Scan ID", "Scan"))
    Set imageHeader = FindHeaderCell(wsImages, Array("Image File", "Image Filename", "Image Name"))
    Set statusHeader = FindHeaderCell(wsImages, Array("Status", "Image Status", "Link Status", "Review"))
    Set processedHeader = FindHeaderCell(wsImages, Array("Processed Image", "Processed Image File", "Processed Name"))

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

    If processedHeader Is Nothing Then
        processedColumn = 3
    Else
        processedColumn = processedHeader.Column
    End If

    folderPath = PickImageFolder()
    If Len(folderPath) = 0 Then Exit Sub

    '--- 1. Read the scans (column A is never renamed) ---
    lastRow = wsImages.Cells(wsImages.Rows.count, scanHeader.Column).End(xlUp).Row
    If lastRow < scanHeader.Row Then lastRow = scanHeader.Row

    ReDim scanRows(0 To lastRow - scanHeader.Row)
    ReDim scanNames(0 To lastRow - scanHeader.Row)
    ReDim scanNums(0 To lastRow - scanHeader.Row)
    ReDim oldImages(0 To lastRow - scanHeader.Row)
    ReDim newImages(0 To lastRow - scanHeader.Row)
    ReDim scanSkipped(0 To lastRow - scanHeader.Row)

    For rowNum = scanHeader.Row + 1 To lastRow
        If Len(Trim$(CStr(wsImages.Cells(rowNum, scanHeader.Column).value))) > 0 Then
            scanCount = scanCount + 1
            scanRows(scanCount) = rowNum
            scanNames(scanCount) = Trim$(CStr(wsImages.Cells(rowNum, scanHeader.Column).value))
            scanNums(scanCount) = SLG_Utilities.ScanNumberFromName(scanNames(scanCount))
            oldImages(scanCount) = Trim$(CStr(wsImages.Cells(rowNum, imageHeader.Column).value))
        End If
    Next rowNum

    '--- 2. List the image files and their number / pattern ---
    Set fileSystem = CreateObject("Scripting.FileSystemObject")
    Set folderObject = fileSystem.GetFolder(folderPath)

    ReDim fileNames(0 To folderObject.Files.count)
    ReDim fileNums(0 To folderObject.Files.count)
    ReDim filePatterns(0 To folderObject.Files.count)

    For Each fileObject In folderObject.Files
        extension = LCase$(fileSystem.GetExtensionName(fileObject.Name))
        If extension = "png" Or extension = "jpg" Or extension = "jpeg" Then
            baseName = fileSystem.GetBaseName(fileObject.Name)
            If FirstDigitGroup(baseName, startPos, groupLen) Then
                If fileCount < UBound(fileNames) Then
                    fileCount = fileCount + 1
                    fileNames(fileCount) = fileObject.Name
                    fileNums(fileCount) = SLG_Utilities.ScanNumberFromName(baseName)
                    filePatterns(fileCount) = Left$(baseName, startPos - 1) & "#" & Mid$(baseName, startPos + groupLen)
                End If
            Else
                noDigitFiles = noDigitFiles + 1
            End If
        End If
    Next fileObject

    '--- 3. Group files by pattern; count the scans each pattern covers ---
    Set patternIndex = CreateObject("Scripting.Dictionary")
    patternIndex.CompareMode = vbTextCompare
    Set patternNumbers = CreateObject("Scripting.Dictionary")
    patternNumbers.CompareMode = vbTextCompare

    ReDim patternNames(0 To fileCount)
    ReDim patternScans(0 To fileCount)
    ReDim patternExamples(0 To fileCount)

    For i = 1 To fileCount
        If Not patternIndex.Exists(filePatterns(i)) Then
            patternCount = patternCount + 1
            patternIndex.Add filePatterns(i), patternCount
            patternNames(patternCount) = filePatterns(i)
            patternExamples(patternCount) = fileNames(i)
        End If
        keyText = filePatterns(i) & "|" & CStr(fileNums(i))
        If Not patternNumbers.Exists(keyText) Then patternNumbers.Add keyText, True
    Next i

    For j = 1 To patternCount
        For i = 1 To scanCount
            If scanNums(i) >= 0 Then
                If patternNumbers.Exists(patternNames(j) & "|" & CStr(scanNums(i))) Then
                    patternScans(j) = patternScans(j) + 1
                End If
            End If
        Next i
    Next j

    'Patterns that cover at least one scan, most scans first.
    ReDim patternOrder(0 To patternCount)
    For j = 1 To patternCount
        If patternScans(j) > 0 Then
            coveringCount = coveringCount + 1
            patternOrder(coveringCount) = j
        End If
    Next j

    For i = 1 To coveringCount - 1
        For j = i + 1 To coveringCount
            If patternScans(patternOrder(j)) > patternScans(patternOrder(i)) Then
                swapValue = patternOrder(i)
                patternOrder(i) = patternOrder(j)
                patternOrder(j) = swapValue
            End If
        Next j
    Next i

    '--- 4. Pick the pattern (one prompt only when there is a real choice) ---
    If coveringCount = 1 Then
        chosenPattern = patternNames(patternOrder(1))
    ElseIf coveringCount > 1 Then
        k = coveringCount
        If k > MAX_PATTERN_CHOICES Then k = MAX_PATTERN_CHOICES

        promptText = "The image files use more than one naming pattern (# = scan number)." & vbCrLf & _
                     "Which one should be used?" & vbCrLf & vbCrLf
        For i = 1 To k
            j = patternOrder(i)
            promptText = promptText & i & ")  " & ShortText(patternNames(j), 24) & "  -  " & _
                         patternScans(j) & " scan" & IIf(patternScans(j) = 1, "", "s") & _
                         ", e.g. " & ShortText(patternExamples(j), 24) & vbCrLf
        Next i
        promptText = promptText & vbCrLf & "Enter 1-" & k & ". Cancel = stop, nothing is changed."

        choice = AskForChoice(promptText, 1, k)
        If choice < 0 Then GoTo CancelExit
        chosenPattern = patternNames(patternOrder(choice))
    End If

    '--- 5. Match each scan; ask only about leftovers ---
    ReDim candidates(0 To fileCount)

    For i = 1 To scanCount
        If scanNums(i) >= 0 And fileCount > 0 Then

            'Files in the chosen pattern with this scan's number.
            chosenCount = 0
            For j = 1 To fileCount
                If fileNums(j) = scanNums(i) And StrComp(filePatterns(j), chosenPattern, vbTextCompare) = 0 Then
                    chosenCount = chosenCount + 1
                    candidates(chosenCount) = fileNames(j)
                End If
            Next j
            candidateCount = chosenCount

            'None in the chosen pattern: offer every file with this number.
            If candidateCount = 0 Then
                For j = 1 To fileCount
                    If fileNums(j) = scanNums(i) Then
                        candidateCount = candidateCount + 1
                        candidates(candidateCount) = fileNames(j)
                    End If
                Next j
            End If

            If candidateCount = 1 And chosenCount = 1 Then
                newImages(i) = candidates(1)
            ElseIf candidateCount > 0 Then

                'An existing Image File that already points at one of the candidates is kept.
                If Len(oldImages(i)) > 0 Then
                    oldPath = SLG_Utilities.ResolveSourceImagePath(folderPath, oldImages(i))
                    If Len(oldPath) > 0 Then
                        For j = 1 To candidateCount
                            If StrComp(oldPath, SLG_Utilities.ResolveSourceImagePath(folderPath, candidates(j)), vbTextCompare) = 0 Then
                                newImages(i) = candidates(j)
                                Exit For
                            End If
                        Next j
                    End If
                End If

                If Len(newImages(i)) = 0 Then
                    k = candidateCount
                    If k > MAX_FILE_CHOICES Then k = MAX_FILE_CHOICES

                    promptText = "Scan " & scanNames(i) & ": " & _
                                 IIf(chosenCount > 1, "several files match.", _
                                     "no file in the """ & ShortText(chosenPattern, 30) & """ pattern.") & vbCrLf & _
                                 "Pick the image file to use:" & vbCrLf & vbCrLf
                    For j = 1 To k
                        promptText = promptText & j & ")  " & ShortText(candidates(j), 40) & vbCrLf
                    Next j
                    promptText = promptText & vbCrLf & "0 = skip this scan.  Cancel = stop, nothing is changed."

                    choice = AskForChoice(promptText, 0, k)
                    If choice < 0 Then GoTo CancelExit
                    If choice = 0 Then
                        scanSkipped(i) = True
                    Else
                        newImages(i) = candidates(choice)
                    End If
                End If
            End If
        End If
    Next i

    '--- 6. Ask once before replacing Image File names that differ ---
    For i = 1 To scanCount
        If Len(newImages(i)) > 0 And Len(oldImages(i)) > 0 Then
            oldPath = SLG_Utilities.ResolveSourceImagePath(folderPath, oldImages(i))
            newPath = SLG_Utilities.ResolveSourceImagePath(folderPath, newImages(i))
            If StrComp(oldPath, newPath, vbTextCompare) <> 0 Then
                conflictCount = conflictCount + 1
                If conflictCount <= 5 Then
                    conflictText = conflictText & "  " & ShortText(scanNames(i), 20) & ":  " & _
                                   ShortText(oldImages(i), 30) & " -> " & ShortText(newImages(i), 30) & vbCrLf
                End If
            End If
        End If
    Next i

    If conflictCount > 0 Then
        If conflictCount > 5 Then conflictText = conflictText & "  ..." & vbCrLf
        conflictAnswer = MsgBox(conflictCount & " scan" & IIf(conflictCount = 1, " already has", "s already have") & _
                                " an Image File name that differs from the folder match. Replace " & _
                                IIf(conflictCount = 1, "it", "them") & "?" & vbCrLf & vbCrLf & _
                                conflictText & vbCrLf & _
                                "Yes = replace, No = keep existing, Cancel = stop.", _
                                vbYesNoCancel + vbQuestion, PROMPT_TITLE)
        If conflictAnswer = vbCancel Then GoTo CancelExit
        keepExisting = (conflictAnswer = vbNo)
    End If

    '--- 7. Write everything to the sheet ---
    Application.ScreenUpdating = False
    Application.EnableEvents = False
    Application.Calculation = xlCalculationManual

    imageFolderCell.value = folderPath

    For i = 1 To scanCount
        rowNum = scanRows(i)

        If Len(newImages(i)) > 0 And keepExisting And Len(oldImages(i)) > 0 Then
            If StrComp(SLG_Utilities.ResolveSourceImagePath(folderPath, oldImages(i)), _
                       SLG_Utilities.ResolveSourceImagePath(folderPath, newImages(i)), vbTextCompare) <> 0 Then
                newImages(i) = ""
            End If
        End If

        If Len(newImages(i)) > 0 Then
            wsImages.Cells(rowNum, imageHeader.Column).value = newImages(i)
            finalImage = newImages(i)
        Else
            finalImage = oldImages(i)
        End If

        If Len(Trim$(CStr(wsImages.Cells(rowNum, processedColumn).value))) = 0 Then
            wsImages.Cells(rowNum, processedColumn).value = SLG_Utilities.DefaultProcessedName(scanNames(i))
        End If

        If Len(finalImage) > 0 And Len(SLG_Utilities.ResolveSourceImagePath(folderPath, finalImage)) > 0 Then
            If Not scanSkipped(i) Then matchedCount = matchedCount + 1
            wsImages.Cells(rowNum, statusColumn).value = "LINKED"
            ClearImageReviewFormatting wsImages, rowNum, scanHeader.Column, imageHeader.Column, statusColumn
        Else
            If Not scanSkipped(i) Then
                missingCount = missingCount + 1
                If Len(missingIDs) > 0 Then missingIDs = missingIDs & ", "
                missingIDs = missingIDs & scanNames(i)
            End If
            If Len(finalImage) > 0 Then
                wsImages.Cells(rowNum, statusColumn).value = "REVIEW: MISSING " & finalImage
            ElseIf scanNums(i) < 0 Then
                wsImages.Cells(rowNum, statusColumn).value = "REVIEW: MISSING (no number in scan name)"
            Else
                wsImages.Cells(rowNum, statusColumn).value = "REVIEW: MISSING " & SLG_Utilities.DefaultImageName(scanNames(i))
            End If
            ApplyImageReviewFormatting wsImages, rowNum, scanHeader.Column, imageHeader.Column, statusColumn
        End If

        If scanSkipped(i) Then skippedCount = skippedCount + 1
    Next i

    Application.Calculation = priorCalc
    Application.EnableEvents = priorEvents
    Application.ScreenUpdating = priorScreenUpdating

    '--- 8. Report ---
    summaryText = matchedCount & " of " & scanCount & " matched, " & _
                  missingCount & " missing, " & skippedCount & " skipped."
    If missingCount > 0 Then summaryText = summaryText & vbCrLf & "Missing: " & missingIDs
    If noDigitFiles > 0 Then summaryText = summaryText & vbCrLf & _
                                           noDigitFiles & " image file" & IIf(noDigitFiles = 1, "", "s") & _
                                           " without a number ignored."

    MC_WriteMessage "Image folder selected: " & folderPath & vbCrLf & summaryText, _
                    IIf(missingCount > 0 Or skippedCount > 0, "REVIEW", "SUCCESS")

    TryRunMacro "RefreshProjectSummary"

    MsgBox summaryText, _
           IIf(missingCount = 0 And skippedCount = 0, vbInformation, vbExclamation), _
           PROMPT_TITLE

CleanExit:
    Application.Calculation = priorCalc
    Application.EnableEvents = priorEvents
    Application.ScreenUpdating = priorScreenUpdating
    Exit Sub

CancelExit:
    MC_WriteMessage "Image-folder selection cancelled. Scan Images was not changed.", "REVIEW"
    GoTo CleanExit

CleanFail:
    Application.Calculation = priorCalc
    Application.EnableEvents = priorEvents
    Application.ScreenUpdating = priorScreenUpdating
    MC_WriteMessage "Image-folder selection failed: " & Err.description, "ERROR"
    MsgBox "The image-folder process could not be completed." & vbCrLf & _
           Err.description, vbCritical, "Scan Layout Generator"
    Resume CleanExit

End Sub

Public Function CountActuallyLinkedScanImages() As Long
    Dim wsProject As Worksheet, wsImages As Worksheet
    Dim scanHeader As Range, imageHeader As Range
    Dim folderPath As String, scanName As String, expectedImage As String
    Dim lastRow As Long, rowNum As Long

    On Error GoTo CountFail

    Set wsProject = ThisWorkbook.Worksheets(SHEET_PROJECT)
    Set wsImages = ThisWorkbook.Worksheets(SHEET_IMAGES)
    Set scanHeader = FindHeaderCell(wsImages, Array("Scan Name", "Scan ID", "Scan"))
    Set imageHeader = FindHeaderCell(wsImages, Array("Image File", "Image Filename", "Image Name"))
    If scanHeader Is Nothing Or imageHeader Is Nothing Then Exit Function

    folderPath = GetImageFolderPath(wsProject)
    If Len(folderPath) = 0 Then Exit Function

    lastRow = wsImages.Cells(wsImages.Rows.count, scanHeader.Column).End(xlUp).Row
    For rowNum = scanHeader.Row + 1 To lastRow
        scanName = Trim$(CStr(wsImages.Cells(rowNum, scanHeader.Column).value))
        If Len(scanName) > 0 Then
            expectedImage = ResolveExpectedImageName( _
                                scanName, _
                                CStr(wsImages.Cells(rowNum, imageHeader.Column).value))

            If Len(SLG_Utilities.ResolveSourceImagePath(folderPath, expectedImage)) > 0 Then
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
    Dim scanHeader As Range, imageHeader As Range, statusHeader As Range
    Dim folderPath As String, scanName As String, imageName As String
    Dim missingIDs As String
    Dim lastRow As Long, rowNum As Long, statusColumn As Long
    Dim totalCount As Long, linkedCount As Long, missingCount As Long, firstIssueRow As Long

    On Error GoTo ValidationFail

    Set wsProject = ThisWorkbook.Worksheets(SHEET_PROJECT)
    Set wsImages = ThisWorkbook.Worksheets(SHEET_IMAGES)
    Set scanHeader = FindHeaderCell(wsImages, Array("Scan Name", "Scan ID", "Scan"))
    Set imageHeader = FindHeaderCell(wsImages, Array("Image File", "Image Filename", "Image Name"))
    Set statusHeader = FindHeaderCell(wsImages, Array("Status", "Image Status", "Link Status", "Review"))

    If scanHeader Is Nothing Or imageHeader Is Nothing Then GoTo ValidationFail
    If statusHeader Is Nothing Then
        statusColumn = 5
    Else
        statusColumn = statusHeader.Column
    End If
    folderPath = GetImageFolderPath(wsProject)

    If Len(folderPath) = 0 Then
        If writeMessage Then MC_WriteMessage "SCAN IMAGE VALIDATION" & vbCrLf & vbCrLf & _
                            "Image folder is missing.", "REVIEW"
        If showDialog Then MsgBox "The scan image folder is missing.", vbExclamation, "Scan Image Validation"
        Exit Function
    End If

    lastRow = wsImages.Cells(wsImages.Rows.count, scanHeader.Column).End(xlUp).Row

    For rowNum = scanHeader.Row + 1 To lastRow
        scanName = Trim$(CStr(wsImages.Cells(rowNum, scanHeader.Column).value))
        If Len(scanName) > 0 Then
            totalCount = totalCount + 1
            imageName = ResolveExpectedImageName( _
                            scanName, _
                            CStr(wsImages.Cells(rowNum, imageHeader.Column).value))

            'If blank, write the S-number default that validation used.
            'Custom values are left exactly as entered.
            If Len(Trim$(CStr(wsImages.Cells(rowNum, imageHeader.Column).value))) = 0 Then
                wsImages.Cells(rowNum, imageHeader.Column).value = imageName
            End If

            'LINKED means the generator will find this exact file.
            If Len(SLG_Utilities.ResolveSourceImagePath(folderPath, imageName)) > 0 Then
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

Private Function AskForChoice(ByVal promptText As String, _
                              ByVal minValue As Long, _
                              ByVal maxValue As Long) As Long

    'Returns the number entered (minValue..maxValue), or -1 on Cancel.
    'Anything else asks again.
    Dim answer As String
    Dim shownPrompt As String

    shownPrompt = promptText

    Do
        answer = InputBox(shownPrompt, PROMPT_TITLE)
        If StrPtr(answer) = 0 Then
            AskForChoice = -1
            Exit Function
        End If

        answer = Trim$(answer)
        If Len(answer) > 0 And Len(answer) <= 3 And Not answer Like "*[!0-9]*" Then
            If CLng(answer) >= minValue And CLng(answer) <= maxValue Then
                AskForChoice = CLng(answer)
                Exit Function
            End If
        End If

        shownPrompt = "Please enter a number from " & minValue & " to " & maxValue & "." & _
                      vbCrLf & vbCrLf & promptText
    Loop

End Function

Private Function FirstDigitGroup(ByVal textValue As String, _
                                 ByRef startPos As Long, _
                                 ByRef groupLen As Long) As Boolean

    'Finds the first contiguous digit group (same rule as SLG_Utilities.ScanNumberFromName).
    Dim position As Long
    Dim currentChar As String

    startPos = 0
    groupLen = 0

    For position = 1 To Len(textValue)
        currentChar = Mid$(textValue, position, 1)

        If currentChar >= "0" And currentChar <= "9" Then
            If startPos = 0 Then startPos = position
            groupLen = groupLen + 1
        ElseIf startPos > 0 Then
            Exit For
        End If
    Next position

    FirstDigitGroup = (startPos > 0 And groupLen <= 9)

End Function

Private Function ShortText(ByVal textValue As String, ByVal maxLength As Long) As String

    'Keeps prompt lines short so InputBox / MsgBox text stays under the size limit.
    If Len(textValue) > maxLength Then
        ShortText = Left$(textValue, maxLength - 3) & "..."
    Else
        ShortText = textValue
    End If

End Function

Private Function ResolveExpectedImageName(ByVal scanName As String, _
                                          ByVal configuredImageName As String) As String

    Dim result As String

    'The Image File column is authoritative when populated.
    result = Trim$(configuredImageName)

    'Same default as the generator for blank Image File cells (SCAN01 -> S1).
    If Len(result) = 0 Then result = SLG_Utilities.DefaultImageName(scanName)

    ResolveExpectedImageName = result

End Function

Private Function FindImageFolderCell(ByVal targetSheet As Worksheet) As Range

    'Exact labels only: "Original Image Folder", then "Image Folder" (older workbooks).
    Dim folderCell As Range

    Set folderCell = FindValueCellByLabel(targetSheet, "Original Image Folder")
    If folderCell Is Nothing Then Set folderCell = FindValueCellByLabel(targetSheet, "Image Folder")

    Set FindImageFolderCell = folderCell

End Function

Private Function GetImageFolderPath(ByVal targetSheet As Worksheet) As String

    'Folder value; uses "Image Folder" when "Original Image Folder" is blank.
    Dim folderCell As Range
    Dim folderPath As String

    Set folderCell = FindValueCellByLabel(targetSheet, "Original Image Folder")
    If Not folderCell Is Nothing Then folderPath = Trim$(CStr(folderCell.value))

    If Len(folderPath) = 0 Then
        Set folderCell = FindValueCellByLabel(targetSheet, "Image Folder")
        If Not folderCell Is Nothing Then folderPath = Trim$(CStr(folderCell.value))
    End If

    GetImageFolderPath = folderPath

End Function

Private Function FindValueCellByLabel(ByVal targetSheet As Worksheet, _
                                      ByVal labelText As String) As Range

    'Exact (whole-cell, case-insensitive) label match; the value is the cell to its right.
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
