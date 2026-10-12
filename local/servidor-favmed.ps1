# FAVMED local HTTP server - Windows PowerShell 5.1+
$ErrorActionPreference = "Stop"
$Port = 8080
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$DataFile = Join-Path $Root "fila.json"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
if (-not (Test-Path $DataFile)) { [System.IO.File]::WriteAllText($DataFile, "[]", $Utf8NoBom) }
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
try {
  $listener.Start()
  Write-Host ""
  Write-Host "===============================================" -ForegroundColor Cyan
  Write-Host " FAVMED - Servidor da rede local" -ForegroundColor Cyan
  Write-Host "===============================================" -ForegroundColor Cyan
  Write-Host "Recepcao: http://127.0.0.1:$Port/"
  Write-Host "Tela sala de espera: http://127.0.0.1:$Port/?painel=1"
  Write-Host ""
  Write-Host "Enderecos para outros dispositivos:" -ForegroundColor Yellow
  $ips = [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
    Where-Object { $_.OperationalStatus -eq "Up" -and $_.NetworkInterfaceType -ne "Loopback" } |
    ForEach-Object { $_.GetIPProperties().UnicastAddresses } |
    Where-Object { $_.Address.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and $_.Address.ToString() -notlike "169.254.*" } |
    ForEach-Object { $_.Address.ToString() } | Select-Object -Unique
  foreach ($ip in $ips) { Write-Host "Recepcao: http://${ip}:$Port/"; Write-Host "Sala:     http://${ip}:$Port/?painel=1" }
  Write-Host ""
  Write-Host "Mantenha esta janela aberta. Pressione Ctrl+C para encerrar." -ForegroundColor Green
  while ($listener.Server.IsBound) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $stream.ReadTimeout = 5000
      $headerList = New-Object 'System.Collections.Generic.List[byte]'
      $ending = 0
      while ($headerList.Count -lt 16384) {
        $b = $stream.ReadByte()
        if ($b -lt 0) { break }
        $headerList.Add([byte]$b)
        if (($ending -eq 0 -and $b -eq 13) -or ($ending -eq 2 -and $b -eq 13)) { $ending++ }
        elseif (($ending -eq 1 -and $b -eq 10) -or ($ending -eq 3 -and $b -eq 10)) { $ending++ }
        else { $ending = 0 }
        if ($ending -ge 4) { break }
      }
      if ($headerList.Count -eq 0) { continue }
      $headerText = [System.Text.Encoding]::ASCII.GetString($headerList.ToArray())
      $lines = $headerText -split "`r`n"
      $request = $lines[0] -split " "
      if ($request.Count -lt 2) { continue }
      $method = $request[0].ToUpperInvariant()
      $path = ($request[1] -split "?")[0]
      $contentLength = 0
      foreach ($line in $lines) { if ($line -match "^(?i)Content-Length:\s*(\d+)") { $contentLength = [int]$Matches[1] } }
      $bodyBytes = New-Object byte[] $contentLength
      $read = 0
      while ($read -lt $contentLength) {
        $n = $stream.Read($bodyBytes, $read, $contentLength - $read)
        if ($n -le 0) { break }
        $read += $n
      }
      $status = "200 OK"; $type = "text/plain; charset=utf-8"; $responseBytes = [byte[]]@()
      if ($path -eq "/api/state" -and $method -eq "GET") {
        $responseBytes = [System.IO.File]::ReadAllBytes($DataFile); $type = "application/json; charset=utf-8"
      } elseif ($path -eq "/api/state" -and $method -eq "POST") {
        if ($contentLength -gt 1048576 -or $read -ne $contentLength) { $status = "413 Payload Too Large"; $responseBytes = [System.Text.Encoding]::UTF8.GetBytes("Payload too large") }
        else {
          $json = [System.Text.Encoding]::UTF8.GetString($bodyBytes)
          try {
            $parsed = ConvertFrom-Json -InputObject $json
            if ($parsed -isnot [System.Array] -and $null -ne $parsed) { throw "Expected JSON array" }
            [System.IO.File]::WriteAllText($DataFile, $json, $Utf8NoBom)
            $responseBytes = [System.Text.Encoding]::UTF8.GetBytes('{"ok":true}'); $type = "application/json; charset=utf-8"
          } catch { $status = "400 Bad Request"; $responseBytes = [System.Text.Encoding]::UTF8.GetBytes('{"error":"invalid JSON"}'); $type = "application/json; charset=utf-8" }
        }
      } elseif ($path -eq "/" -or $path -eq "/index.html") {
        $responseBytes = [System.IO.File]::ReadAllBytes((Join-Path $Root "index.html")); $type = "text/html; charset=utf-8"
      } elseif ($path -eq "/logo-favmed.png" -and (Test-Path (Join-Path $Root "logo-favmed.png"))) {
        $responseBytes = [System.IO.File]::ReadAllBytes((Join-Path $Root "logo-favmed.png")); $type = "image/png"
      } elseif ($path -eq "/sala-espera") {
        $status = "302 Found"; $type = "text/plain; charset=utf-8"; $responseBytes = [System.Text.Encoding]::UTF8.GetBytes("Abra /?painel=1")
      } elseif ($path -eq "/favicon.ico") {
        $status = "204 No Content"; $responseBytes = [byte[]]@()
      } else {
        $status = "404 Not Found"; $responseBytes = [System.Text.Encoding]::UTF8.GetBytes("Not found")
      }
      $header = "HTTP/1.1 $status`r`nContent-Type: $type`r`nContent-Length: $($responseBytes.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n"
      if ($status -eq "302 Found") { $header += "Location: /?painel=1`r`n" }
      $header += "`r`n"
      $headBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
      $stream.Write($headBytes, 0, $headBytes.Length)
      if ($responseBytes.Length -gt 0) { $stream.Write($responseBytes, 0, $responseBytes.Length) }
      $stream.Flush()
    } catch {
      Write-Host ("Erro ao atender requisicao: " + $_.Exception.Message) -ForegroundColor Red
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
