$ErrorActionPreference = 'Stop'
$leaseHandles = @()
try {
  $leasePaths = [Console]::ReadLine() | ConvertFrom-Json
  foreach ($leasePath in $leasePaths) {
    $leaseHandles += [System.IO.File]::Open($leasePath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
  }
  [Console]::WriteLine('LEASE_READY')
  [Console]::Out.Flush()
  $null = [Console]::ReadLine()
} catch {
  [Console]::Error.WriteLine('STABLE_INPUT_LEASE_FAILED')
  exit 1
} finally {
  foreach ($leaseHandle in $leaseHandles) { $leaseHandle.Dispose() }
}
