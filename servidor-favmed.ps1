# FAVMED local HTTP server - Windows PowerShell 5.1+
$ErrorActionPreference = "Stop"
$Port = 2222
$PortCandidates = @(2222)
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$DataFile = Join-Path $Root "fila.json"
$MediaFile = Join-Path $Root "midia.json"
$SlideshowDir = Join-Path $Root "midia-sala"
$DocumentsDir = Join-Path $Root "documentos-pacientes"
if (-not (Test-Path $DocumentsDir)) { New-Item -ItemType Directory -Path $DocumentsDir | Out-Null }
if (-not (Test-Path $SlideshowDir)) { New-Item -ItemType Directory -Path $SlideshowDir | Out-Null }
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
if (-not (Test-Path $DataFile)) { [System.IO.File]::WriteAllText($DataFile, "[]", $Utf8NoBom) }
if (-not (Test-Path $MediaFile)) { [System.IO.File]::WriteAllText($MediaFile, '{"url":""}', $Utf8NoBom) }
$listener = $null
foreach ($candidatePort in $PortCandidates) {
  $candidate = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $candidatePort)
  try {
    $candidate.Start()
    $listener = $candidate
    $Port = $candidatePort
    break
  } catch [System.Net.Sockets.SocketException] {
    $candidate.Stop()
  }
}
if ($null -eq $listener) {
  Write-Host "ERRO: a porta fixa 2222 não está disponível." -ForegroundColor Red
  Write-Host "Feche outra instância do FAVMED ou libere a porta 2222 e tente novamente."
  exit 1
}
try {
  Write-Host ""
  Write-Host "===============================================" -ForegroundColor Cyan
  Write-Host " FAVMED - Servidor da rede local" -ForegroundColor Cyan
  Write-Host "===============================================" -ForegroundColor Cyan
  Write-Host "Recepcao: http://127.0.0.1:$Port/"
  Write-Host "Tela sala de espera: http://127.0.0.1:$Port/sala"
  Write-Host "Painel do profissional: http://127.0.0.1:$Port/consultorio"
  Write-Host ""
  Write-Host "Enderecos para outros dispositivos:" -ForegroundColor Yellow
  $ip = $null
  # Usa somente o IPv4 da rota padrão ativa, evitando listar adaptadores virtuais
  # (por exemplo, WSL/Docker) como se fossem endereços da rede local.
  try {
    $route = Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction Stop |
      Where-Object { $_.NextHop -and $_.NextHop -ne "0.0.0.0" } |
      Sort-Object RouteMetric, InterfaceMetric |
      Select-Object -First 1
    if ($route) {
      $ip = Get-NetIPAddress -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 -ErrorAction Stop |
        Where-Object { $_.IPAddress -and $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
        Select-Object -ExpandProperty IPAddress -First 1
    }
  } catch { }
  if (-not $ip) {
    Write-Host "AVISO: nao consegui detectar o IPv4 principal da rede. Verifique se o computador esta conectado ao Wi-Fi ou cabo." -ForegroundColor Yellow
  } else {
    Write-Host ("Recepcao: http://{0}:{1}/" -f $ip, $Port)
    Write-Host ("Sala:     http://{0}:{1}/sala" -f $ip, $Port)
    Write-Host ("Profissional: http://{0}:{1}/consultorio" -f $ip, $Port)
  }
  # Abre automaticamente o sistema no navegador da recepcao.
  try { Start-Process ("http://127.0.0.1:{0}/" -f $Port) } catch { Write-Host "Abra manualmente o endereco local mostrado acima." -ForegroundColor Yellow }
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
      $requestTarget = $request[1]
      $path = $requestTarget.Split('?')[0]
      $contentLength = 0
      foreach ($line in $lines) { if ($line -match "(?i)^Content-Length:\s*(\d+)") { $contentLength = [int]$Matches[1] } }
      $bodyBytes = New-Object byte[] $contentLength
      $read = 0
      while ($read -lt $contentLength) {
        $n = $stream.Read($bodyBytes, $read, $contentLength - $read)
        if ($n -le 0) { break }
        $read += $n
      }
      $status = "200 OK"; $type = "text/plain; charset=utf-8"; $responseBytes = [byte[]]@()
      if ($path -eq "/api/slideshow" -and $method -eq "GET") {
        $items = @()
        foreach ($file in (Get-ChildItem -LiteralPath $SlideshowDir -File | Sort-Object Name)) {
          $ext = $file.Extension.ToLowerInvariant()
          $kind = if ($ext -in @(".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp")) { "image" } else { "video" }
          $items += @{ name = $file.Name; type = $kind; url = "/slideshow/" + [Uri]::EscapeDataString($file.Name) }
        }
        $jsonItems = ConvertTo-Json -InputObject @($items) -Compress -Depth 4
        $responseBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonItems); $type = "application/json; charset=utf-8"
      } elseif ($path -eq "/api/slideshow/upload" -and $method -eq "POST") {
        if ($contentLength -gt 524288000 -or $read -ne $contentLength) { $status = "413 Payload Too Large"; $responseBytes = [System.Text.Encoding]::UTF8.GetBytes('{"error":"Arquivo maior que 500 MB"}'); $type = "application/json; charset=utf-8" }
        else {
          try {
            $query = ""
            if ($requestTarget.Contains("?")) { $query = $requestTarget.Substring($requestTarget.IndexOf("?") + 1) }
            $rawName = ""
            foreach ($part in ($query -split "&")) { if ($part -match "^name=(.*)$") { $rawName = [Uri]::UnescapeDataString($Matches[1].Replace("+", " ")) } }
            $safeName = [System.IO.Path]::GetFileName($rawName)
            $ext = [System.IO.Path]::GetExtension($safeName).ToLowerInvariant()
            $allowed = @(".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".mp4", ".webm", ".ogg", ".mov", ".m4v")
            if ([string]::IsNullOrWhiteSpace($safeName) -or $safeName.Length -gt 180 -or $ext -notin $allowed -or $contentLength -le 0) { throw "Nome, extensão ou tamanho inválido" }
            $destination = Join-Path $SlideshowDir $safeName
            [System.IO.File]::WriteAllBytes($destination, $bodyBytes)
            $responseBytes = [System.Text.Encoding]::UTF8.GetBytes('{"ok":true}'); $type = "application/json; charset=utf-8"
          } catch { $status = "400 Bad Request"; $responseBytes = [System.Text.Encoding]::UTF8.GetBytes('{"error":"Arquivo inválido. Use JPG, PNG, GIF, WEBP, BMP, MP4, WEBM, OGG, MOV ou M4V; máximo 500 MB."}'); $type = "application/json; charset=utf-8" }
        }
      } elseif ($path.StartsWith("/slideshow/")) {
        try {
          $requestedName = [Uri]::UnescapeDataString($path.Substring("/slideshow/".Length))
          $safeName = [System.IO.Path]::GetFileName($requestedName)
          $filePath = Join-Path $SlideshowDir $safeName
          if ([string]::IsNullOrWhiteSpace($safeName) -or -not (Test-Path -LiteralPath $filePath -PathType Leaf)) { throw "Not found" }
          $ext = [System.IO.Path]::GetExtension($safeName).ToLowerInvariant()
          $mime = @{ ".jpg"="image/jpeg"; ".jpeg"="image/jpeg"; ".png"="image/png"; ".gif"="image/gif"; ".webp"="image/webp"; ".bmp"="image/bmp"; ".mp4"="video/mp4"; ".webm"="video/webm"; ".ogg"="video/ogg"; ".mov"="video/quicktime"; ".m4v"="video/mp4" }
          $type = $mime[$ext]
          if (-not $type) { throw "Unsupported media type" }
          $responseBytes = [System.IO.File]::ReadAllBytes($filePath)
        } catch { $status = "404 Not Found"; $responseBytes = [System.Text.Encoding]::UTF8.GetBytes("Not found") }
      } elseif ($path -eq "/api/media" -and $method -eq "GET") {
        $responseBytes = [System.IO.File]::ReadAllBytes($MediaFile); $type = "application/json; charset=utf-8"
      } elseif ($path -eq "/api/media" -and $method -eq "POST") {
        if ($contentLength -gt 16384 -or $read -ne $contentLength) { $status = "413 Payload Too Large"; $responseBytes = [System.Text.Encoding]::UTF8.GetBytes("Payload too large") }
        else {
          try {
            $media = ConvertFrom-Json -InputObject ([System.Text.Encoding]::UTF8.GetString($bodyBytes))
            if ($null -eq $media -or $media -is [System.Array] -or $null -eq $media.url) { throw "Expected media URL" }
            $mediaUrl = [string]$media.url
            if ($mediaUrl.Length -gt 2048) { throw "URL too long" }
            $savedMedia = @{ url = $mediaUrl } | ConvertTo-Json -Compress
            [System.IO.File]::WriteAllText($MediaFile, $savedMedia, $Utf8NoBom)
            $responseBytes = [System.Text.Encoding]::UTF8.GetBytes('{"ok":true}'); $type = "application/json; charset=utf-8"
          } catch { $status = "400 Bad Request"; $responseBytes = [System.Text.Encoding]::UTF8.GetBytes('{"error":"invalid media"}'); $type = "application/json; charset=utf-8" }
        }
      } elseif ($path -eq "/api/document" -and $method -eq "POST") {
        if ($contentLength -gt 15728640 -or $read -ne $contentLength) { $status = "413 Payload Too Large"; $responseBytes = [System.Text.Encoding]::UTF8.GetBytes('{"error":"PDF maior que 10 MB ou requisição inválida"}'); $type = "application/json; charset=utf-8" }
        else {
          try {
            $doc = ConvertFrom-Json -InputObject ([System.Text.Encoding]::UTF8.GetString($bodyBytes))
            if ($null -eq $doc -or [string]$doc.id -notmatch "^[A-Za-z0-9_-]{1,80}$" -or [string]::IsNullOrWhiteSpace([string]$doc.data)) { throw "Documento inválido" }
            $pdfBytes = [System.Convert]::FromBase64String([string]$doc.data)
            if ($pdfBytes.Length -gt 10485760 -or $pdfBytes.Length -lt 5 -or [System.Text.Encoding]::ASCII.GetString($pdfBytes, 0, 5) -ne "%PDF-") { throw "PDF inválido ou maior que 10 MB" }
            $docPath = Join-Path $DocumentsDir ([string]$doc.id + ".pdf")
            [System.IO.File]::WriteAllBytes($docPath, $pdfBytes)
            $responseBytes = [System.Text.Encoding]::UTF8.GetBytes('{"ok":true}'); $type = "application/json; charset=utf-8"
          } catch { $status = "400 Bad Request"; $responseBytes = [System.Text.Encoding]::UTF8.GetBytes('{"error":"PDF inválido. Envie um PDF de até 10 MB."}'); $type = "application/json; charset=utf-8" }
        }
      } elseif ($path.StartsWith("/documentos/") -and $method -eq "GET") {
        try {
          $docName = [Uri]::UnescapeDataString($path.Substring("/documentos/".Length))
          if ($docName -notmatch "^[A-Za-z0-9_-]{1,80}\.pdf$") { throw "Invalid document name" }
          $docPath = Join-Path $DocumentsDir $docName
          if (-not (Test-Path -LiteralPath $docPath -PathType Leaf)) { throw "Not found" }
          $responseBytes = [System.IO.File]::ReadAllBytes($docPath); $type = "application/pdf"
        } catch { $status = "404 Not Found"; $responseBytes = [System.Text.Encoding]::UTF8.GetBytes("Documento não encontrado") }
      } elseif ($path -eq "/api/state" -and $method -eq "GET") {
        $responseBytes = [System.IO.File]::ReadAllBytes($DataFile); $type = "application/json; charset=utf-8"
      } elseif ($path -eq "/api/state" -and $method -eq "POST") {
        # Merge por ID: uma tela desatualizada não deve apagar pacientes cadastrados em outra.
        if ($contentLength -gt 52428800 -or $read -ne $contentLength) { $status = "413 Payload Too Large"; $responseBytes = [System.Text.Encoding]::UTF8.GetBytes('{"error":"Fila maior que 50 MB ou requisição incompleta"}'); $type = "application/json; charset=utf-8" }
        else {
          $json = [System.Text.Encoding]::UTF8.GetString($bodyBytes)
          $tempFile = $null
          try {
            $trimmedJson = $json.TrimStart()
            $deletedIds = @()
            if ($trimmedJson.StartsWith("[")) {
              $incoming = @(ConvertFrom-Json -InputObject $json)
            } else {
              $payload = ConvertFrom-Json -InputObject $json
              if ($null -eq $payload -or $null -eq $payload.patients) { throw "Expected patient array or payload object" }
              $incoming = @($payload.patients)
              if ($null -ne $payload.deletedIds) { $deletedIds = @($payload.deletedIds | ForEach-Object { [string]$_ }) }
            }

            $current = @()
            if (Test-Path -LiteralPath $DataFile -PathType Leaf) {
              $existingJson = [System.IO.File]::ReadAllText($DataFile, [System.Text.Encoding]::UTF8)
              if (-not [string]::IsNullOrWhiteSpace($existingJson) -and $existingJson.TrimStart().StartsWith("[")) {
                $current = @(ConvertFrom-Json -InputObject $existingJson)
              }
            }
            $deletedSet = @{}
            foreach ($deletedId in $deletedIds) { if (-not [string]::IsNullOrWhiteSpace([string]$deletedId)) { $deletedSet[[string]$deletedId] = $true } }
            $byId = @{}
            $order = New-Object 'System.Collections.Generic.List[string]'
            foreach ($p in $current) {
              $id = [string]$p.id
              if ([string]::IsNullOrWhiteSpace($id) -or $deletedSet.ContainsKey($id)) { continue }
              if (-not $byId.ContainsKey($id)) { $order.Add($id) }
              $byId[$id] = $p
            }
            foreach ($p in $incoming) {
              if ($null -eq $p) { continue }
              $id = [string]$p.id
              if ([string]::IsNullOrWhiteSpace($id) -or $deletedSet.ContainsKey($id)) { continue }
              if ($byId.ContainsKey($id)) {
                $old = $byId[$id]
                $record = [ordered]@{}
                foreach ($prop in $old.PSObject.Properties) { $record[$prop.Name] = $prop.Value }
                foreach ($prop in $p.PSObject.Properties) {
                  if ($prop.Name -eq "serviceStates" -and $null -ne $prop.Value) {
                    $states = [ordered]@{}
                    if ($null -ne $record["serviceStates"]) {
                      foreach ($sp in $record["serviceStates"].PSObject.Properties) { $states[$sp.Name] = $sp.Value }
                    }
                    foreach ($sp in $prop.Value.PSObject.Properties) { $states[$sp.Name] = $sp.Value }
                    $record["serviceStates"] = $states
                  } else { $record[$prop.Name] = $prop.Value }
                }
                $byId[$id] = [pscustomobject]$record
              } else {
                $byId[$id] = $p
                $order.Add($id)
              }
            }
            $finalPatients = @()
            foreach ($id in $order) { if ($byId.ContainsKey($id)) { $finalPatients += $byId[$id] } }
            $savedJson = ConvertTo-Json -InputObject @($finalPatients) -Depth 50 -Compress
            $tempFile = $DataFile + ".tmp"
            [System.IO.File]::WriteAllText($tempFile, $savedJson, $Utf8NoBom)
            if (Test-Path -LiteralPath $DataFile -PathType Leaf) {
              Move-Item -LiteralPath $tempFile -Destination $DataFile -Force
            } else {
              [System.IO.File]::Move($tempFile, $DataFile)
            }
            $responseBytes = [System.Text.Encoding]::UTF8.GetBytes('{"ok":true,"count":' + $finalPatients.Count + '}'); $type = "application/json; charset=utf-8"
          } catch {
            $errorMessage = $_.Exception.Message
            Write-Host ("ERRO ao salvar fila (/api/state): " + $errorMessage) -ForegroundColor Red
            if ($null -ne $tempFile -and (Test-Path -LiteralPath $tempFile -PathType Leaf)) { Remove-Item -LiteralPath $tempFile -Force -ErrorAction SilentlyContinue }
            $errorJson = @{ error = "Não foi possível salvar a fila"; detail = $errorMessage } | ConvertTo-Json -Compress
            $status = "500 Internal Server Error"; $responseBytes = [System.Text.Encoding]::UTF8.GetBytes($errorJson); $type = "application/json; charset=utf-8"
          }
        }
      } elseif ($path -eq "/sala" -or $path -eq "/sala/" -or $path -eq "/sala-espera" -or $path -eq "/sala-espera/") {
        $responseBytes = [System.IO.File]::ReadAllBytes((Join-Path $Root "index.html")); $type = "text/html; charset=utf-8"
      } elseif ($path -eq "/" -or $path -eq "/index.html") {
        $responseBytes = [System.IO.File]::ReadAllBytes((Join-Path $Root "index.html")); $type = "text/html; charset=utf-8"
      } elseif ($path -eq "/consultorio" -or $path -eq "/consultorio.html") {
        $responseBytes = [System.IO.File]::ReadAllBytes((Join-Path $Root "consultorio.html")); $type = "text/html; charset=utf-8"
      } elseif ($path -eq "/logo-favmed.png" -and (Test-Path (Join-Path $Root "logo-favmed.png"))) {
        $responseBytes = [System.IO.File]::ReadAllBytes((Join-Path $Root "logo-favmed.png")); $type = "image/png"
      } elseif ($path -eq "/chamador.mp3" -and (Test-Path (Join-Path $Root "chamador.mp3"))) {
        $responseBytes = [System.IO.File]::ReadAllBytes((Join-Path $Root "chamador.mp3")); $type = "audio/mpeg"
      } elseif ($path -eq "/sala-espera") {
        $status = "302 Found"; $type = "text/plain; charset=utf-8"; $responseBytes = [System.Text.Encoding]::UTF8.GetBytes("Abra /sala")
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
