param([int]$Port = 8080)

$root = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()

Write-Host "Sundial Plaza game server started:" -ForegroundColor Green
Write-Host "http://localhost:$Port/LCC-Web-0.6.2/game/" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the server."

$mime = @{
  '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8';
  '.css'='text/css; charset=utf-8'; '.json'='application/json; charset=utf-8';
  '.wasm'='application/wasm'; '.png'='image/png'; '.jpg'='image/jpeg';
  '.jpeg'='image/jpeg'; '.lcc'='application/octet-stream'; '.lcc2'='application/octet-stream';
  '.sog'='application/octet-stream'; '.glb'='model/gltf-binary'; '.gltf'='model/gltf+json'
}

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = [System.IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 4096, $true)
      $requestLine = $reader.ReadLine()
      if (-not $requestLine) { continue }
      $headers = @{}
      while (($line = $reader.ReadLine()) -ne '') {
        $parts = $line -split ':', 2
        if ($parts.Count -eq 2) { $headers[$parts[0].Trim().ToLowerInvariant()] = $parts[1].Trim() }
      }

      $requestTarget = ($requestLine -split ' ')[1]
      $urlPath = [Uri]::UnescapeDataString(($requestTarget -split '\?')[0]).TrimStart('/')
      if ([string]::IsNullOrWhiteSpace($urlPath)) { $urlPath = 'LCC-Web-0.6.2/game/index.html' }
      $candidate = [IO.Path]::GetFullPath((Join-Path $root $urlPath))
      if (-not $candidate.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { throw 'Forbidden' }
      if (Test-Path -LiteralPath $candidate -PathType Container) { $candidate = Join-Path $candidate 'index.html' }

      if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        $body = [Text.Encoding]::UTF8.GetBytes('404 Not Found')
        $head = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
        $headBytes = [Text.Encoding]::ASCII.GetBytes($head)
        $stream.Write($headBytes, 0, $headBytes.Length); $stream.Write($body, 0, $body.Length)
        continue
      }

      $file = Get-Item -LiteralPath $candidate
      $start = 0L; $end = $file.Length - 1; $status = '200 OK'
      if ($headers.ContainsKey('range') -and $headers['range'] -match '^bytes=(\d+)-(\d*)') {
        $start = [long]$Matches[1]
        if ($Matches[2]) { $end = [Math]::Min([long]$Matches[2], $file.Length - 1) }
        $status = '206 Partial Content'
      }
      # Large scene assets must be transferred in bounded chunks. This keeps a
      # single non-Range request from monopolising this lightweight server.
      # LCC scene readers request subsequent ranges themselves. Standard GLB
      # loaders expect one complete response, so never truncate model files.
      if (-not $headers.ContainsKey('range') -and $file.Length -gt 8MB -and $file.Extension -notin @('.glb', '.gltf')) {
        $end = [Math]::Min($file.Length - 1, 8MB - 1)
        $status = '206 Partial Content'
      }
      $length = $end - $start + 1
      $ext = $file.Extension.ToLowerInvariant()
      $contentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $extra = if ($status.StartsWith('206')) { "Content-Range: bytes $start-$end/$($file.Length)`r`n" } else { '' }
      $cache = if ($ext -in @('.html', '.js', '.css')) { "Cache-Control: no-store, no-cache, must-revalidate`r`n" } else { '' }
      $head = "HTTP/1.1 $status`r`nContent-Type: $contentType`r`nContent-Length: $length`r`nAccept-Ranges: bytes`r`nAccess-Control-Allow-Origin: *`r`n${cache}${extra}Connection: close`r`n`r`n"
      $headBytes = [Text.Encoding]::ASCII.GetBytes($head)
      $stream.Write($headBytes, 0, $headBytes.Length)

      $fileStream = [IO.File]::OpenRead($candidate)
      try {
        $fileStream.Seek($start, [IO.SeekOrigin]::Begin) | Out-Null
        $buffer = New-Object byte[] 65536
        $remaining = $length
        while ($remaining -gt 0) {
          $chunkSize = [int][Math]::Min([long]$buffer.Length, $remaining)
          $read = $fileStream.Read($buffer, 0, $chunkSize)
          if ($read -le 0) { break }
          $stream.Write($buffer, 0, $read); $remaining -= $read
        }
      } finally { $fileStream.Dispose() }
    } catch {
      Write-Warning $_.Exception.Message
    } finally {
      $client.Dispose()
    }
  }
} finally {
  $listener.Stop()
}
