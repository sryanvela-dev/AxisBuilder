# Fills a COPY of the v5.0 AxisBuilder workbook with a converted job, using Excel itself so the
# workbook's macros and digital signature stay intact. Called by convert-reference-jobs.ts.
#
# The plan (JSON) lists the ranges to clear (as New Project / Import AUT do) and the cells to write.
# Macros never run: AutomationSecurity = ForceDisable. Prints one JSON result line.

param([Parameter(Mandatory = $true)][string]$PlanPath)

$ErrorActionPreference = 'Stop'
$plan = Get-Content -Raw -Encoding UTF8 -LiteralPath $PlanPath | ConvertFrom-Json
$result = [ordered]@{ ok = $false; signedBefore = $null; signedAfter = $null; cellsWritten = 0; error = $null }
$xl = $null
$wb = $null

try {
    $xl = New-Object -ComObject Excel.Application
    $xl.Visible = $false
    $xl.DisplayAlerts = $false
    $xl.ScreenUpdating = $false
    $xl.EnableEvents = $false
    $xl.AutomationSecurity = 3   # msoAutomationSecurityForceDisable

    # UpdateLinks = 0, ReadOnly = false. The file is the converter's own copy of the template.
    $wb = $xl.Workbooks.Open($plan.output, 0, $false)
    $result.signedBefore = [bool]$wb.VBASigned
    $xl.Calculation = -4135      # xlCalculationManual while writing

    $protected = @()
    foreach ($name in $plan.sheets) {
        $ws = $wb.Worksheets.Item($name)
        if ($ws.ProtectContents) {
            $ws.Unprotect()
            $protected += $name
        }
    }

    foreach ($c in $plan.clear) {
        [void]$wb.Worksheets.Item($c.sheet).Range($c.range).ClearContents()
    }

    foreach ($w in $plan.writes) {
        $cell = $wb.Worksheets.Item($w.sheet).Range($w.cell)
        switch ($w.type) {
            'number' {
                if ($w.format) { $cell.NumberFormat = [string]$w.format }
                $cell.Value2 = [double]$w.value
            }
            'text' { $cell.Value2 = [string]$w.value }
            'textForce' {
                # Text format first, so "3:30" or "12" stays text (head clock cells).
                $cell.NumberFormat = '@'
                $cell.Value2 = [string]$w.value
            }
            'bool' { $cell.Value2 = [bool]$w.value }
            'formula' { $cell.FormulaR1C1 = [string]$w.value }
            default { throw "Unknown write type '$($w.type)' for $($w.sheet)!$($w.cell)" }
        }
        $result.cellsWritten++
    }

    foreach ($name in $protected) { $wb.Worksheets.Item($name).Protect() }
    $xl.Calculation = -4105      # xlCalculationAutomatic
    $xl.CalculateFull()
    $wb.Save()
    $result.signedAfter = [bool]$wb.VBASigned
    $result.ok = $true
}
catch {
    $result.error = $_.Exception.Message
}
finally {
    if ($wb) { $wb.Close($false) }
    if ($xl) { $xl.Quit() }
    if ($wb) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($wb) }
    if ($xl) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

$result | ConvertTo-Json -Compress
