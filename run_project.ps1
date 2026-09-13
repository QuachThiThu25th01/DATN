# Launch script for Backend and Mobile - VERSION 13 (3 EXPLICIT OPTIONS)
Write-Host "=====================================" -ForegroundColor Green
Write-Host "     FOCUS SYSTEM - STABLE START     " -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green

# 1. Self-Fix Network & Firewall (Requires Admin if not already set)
Write-Host "[*] Configuring Network & Firewall for Mobile Access..." -ForegroundColor Gray
try {
    # Set Wi-Fi to Private to allow local connections
    Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private -ErrorAction SilentlyContinue
    
    # Open ports for Expo (8081) and Backend (5000)
    New-NetFirewallRule -DisplayName "Expo Metro Bundle" -Direction Inbound -LocalPort 8081 -Protocol TCP -Action Allow -Force -ErrorAction SilentlyContinue
    New-NetFirewallRule -DisplayName "Backend Flask API" -Direction Inbound -LocalPort 5000 -Protocol TCP -Action Allow -Force -ErrorAction SilentlyContinue
} catch {
    Write-Host "[!] Note: Could not auto-configure firewall (Needs Admin). But don't worry, proceeding..." -ForegroundColor Yellow
}

# 2. Detect Wi-Fi IP
$wifiIP = Get-NetIPAddress -InterfaceAlias "Wi-Fi" -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty IPAddress
if ($null -eq $wifiIP) {
    $wifiIP = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike "*VMware*" -and $_.InterfaceAlias -notlike "*Loopback*" -and $_.InterfaceAlias -notlike "*VirtualBox*" } | Select-Object -First 1 -ExpandProperty IPAddress
}

if ($wifiIP) { 
    Write-Host "[*] Detected IP: $wifiIP" -ForegroundColor Green
} else {
    $wifiIP = "192.168.137.1" # default fallback
}

# HOI NGUOI DUNG CHON 3 CACH KET NOI (ASCII ONLY DE TRANH LOI FONT)
Write-Host ""
Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host " CHON MANG KET NOI EXPO CHO DIEN THOAI (DANH CHO LUC LAM BAI / BAO VE)   " -ForegroundColor Cyan
Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host "[1] Cach 1: Dung mang Wi-Fi chung (Truong / Nha)" -ForegroundColor White
Write-Host "    -> Ca Laptop va Dien thoai cung bat chung 1 mang Wi-Fi." -ForegroundColor Gray
Write-Host "[2] Cach 2: Dung mang du lieu 4G/5G phat Hotspot" -ForegroundColor White
Write-Host "    -> Dien thoai bat 4G/5G va phat Wi-Fi (Hotspot) cho Laptop bat." -ForegroundColor Gray
Write-Host "[3] Cach 3: Che do duong ham Internet (--tunnel)" -ForegroundColor White
Write-Host "    -> Dien thoai xai 4G/5G doc lap, khong phat Hotspot cho Laptop." -ForegroundColor Gray
Write-Host "=========================================================================" -ForegroundColor Cyan

$choice = Read-Host "Nhap lua chon cua ban (1, 2 hoac 3, mac dinh la 1)"
if ($choice -eq "3") {
    $mode = "tunnel"
    Write-Host "`n[*] Ban da chon Cach 3: Che do Tunnel (--tunnel)" -ForegroundColor Yellow
} elseif ($choice -eq "2") {
    $mode = "lan"
    Write-Host "`n[*] Ban da chon Cach 2: Dung mang du lieu phat Hotspot" -ForegroundColor Green
    Write-Host "IP hien tai cua Laptop (do Hotspot cap) la: $wifiIP" -ForegroundColor Yellow
    $customIP = Read-Host "Nhan Enter de dung IP nay, hoac nhap IP khac neu can"
    if (![string]::IsNullOrWhiteSpace($customIP)) {
        $wifiIP = $customIP.Trim()
        Write-Host "[*] Da doi sang IP: $wifiIP" -ForegroundColor Green
    }
    $env:REACT_NATIVE_PACKAGER_HOSTNAME = $wifiIP
} else {
    $mode = "lan"
    Write-Host "`n[*] Ban da chon Cach 1: Dung mang Wi-Fi chung" -ForegroundColor Green
    Write-Host "IP Wi-Fi hien tai la: $wifiIP" -ForegroundColor Yellow
    $customIP = Read-Host "Nhan Enter de dung IP nay, hoac nhap IP khac neu can"
    if (![string]::IsNullOrWhiteSpace($customIP)) {
        $wifiIP = $customIP.Trim()
        Write-Host "[*] Da doi sang IP: $wifiIP" -ForegroundColor Green
    }
    $env:REACT_NATIVE_PACKAGER_HOSTNAME = $wifiIP
}

# 3. Clean up ports
Write-Host "`n[1/3] Cleaning up ports 5000 and 8081..." -ForegroundColor Gray
$ports = @(5000, 8081)
foreach ($port in $ports) {
    $proc = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($proc) {
        Stop-Process -Id $proc.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

# 4. Start Backend in new window (Persistent)
Write-Host "[2/3] Starting Backend Server..." -ForegroundColor Yellow
$currentDir = (Get-Location).Path
$pythonPath = Join-Path $currentDir ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $pythonPath)) {
    $fallbackVenv = "D:\New folder\.venv\Scripts\python.exe"
    if (Test-Path -LiteralPath $fallbackVenv) {
        $pythonPath = $fallbackVenv
        Write-Host "[*] Tu dong su dung moi truong GPU CUDA: $pythonPath" -ForegroundColor Green
    } else {
        $pythonPath = "C:\Users\PC\AppData\Local\Programs\Python\Python310\python.exe"
        Write-Host "[*] Su dung Python he thong: $pythonPath" -ForegroundColor Yellow
    }
}
$env:PYTHONPATH = $currentDir
$env:FOCUS_FP16 = "1"
$env:FOCUS_YOLO_SIZE = "512"
$env:FOCUS_FACE_MESH_SIZE = "256"
$env:FOCUS_FACE_MESH_INTERVAL = "3"
$env:FOCUS_PHONE_DETECT_INTERVAL = "10"
$env:FOCUS_JPEG_QUALITY = "82"
$env:YOLO_CONFIG_DIR = (Join-Path $currentDir ".runtime")
$env:EXPO_ROUTER_DISABLE_RN_NAVIGATION_CHECK = "1"

$logDir = Join-Path $currentDir "logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
Start-Process -FilePath $pythonPath `
    -ArgumentList "backend/main.py" `
    -WorkingDirectory $currentDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDir "backend.stdout.log") `
    -RedirectStandardError (Join-Path $logDir "backend.stderr.log")

# 5. Tu dong cap nhat IP vao constants/api.ts neu chon LAN
if ($mode -eq "lan") {
    $apiFile = "mobile\constants\api.ts"
    if (Test-Path $apiFile) {
        try {
            $content = Get-Content $apiFile -Raw
            $content = $content -replace "export const DEFAULT_LAN_IP = .*;", "export const DEFAULT_LAN_IP = '$wifiIP';"
            Set-Content $apiFile $content
            Write-Host "[*] Da tu dong cap nhat DEFAULT_LAN_IP = '$wifiIP' vao file mobile/constants/api.ts!" -ForegroundColor Green
        } catch {
            Write-Host "[!] Khong the tu dong sua file api.ts, vui long kiem tra thu cong." -ForegroundColor Yellow
        }
    }
}

# 6. Start Expo
Write-Host "[3/3] Starting Expo App..." -ForegroundColor Yellow
Write-Host "-------------------------------------" -ForegroundColor Gray
if ($mode -eq "tunnel") {
    Write-Host "LUU Y KHI DUNG TUNNEL:" -ForegroundColor Yellow
    Write-Host "- Dien thoai tai App qua Internet nen se mat thoi gian hon mot chu." -ForegroundColor White
    Write-Host "- De App goi duoc API Backend (port 5000), ban can mo them Terminal chay lenh: ngrok http 5000" -ForegroundColor Cyan
    Write-Host "- Sau do copy link ngrok dan vao bien API_HOST / BASE_URL trong file mobile/constants/api.ts nhe!" -ForegroundColor Cyan
    cd mobile
    npx expo start --tunnel --port 8081
} else {
    Write-Host "SUCCESS! Moi cau hinh da hoan tat." -ForegroundColor Cyan
    Write-Host "Vui long quet ma QR tu dien thoai ket noi chung mang/Hotspot voi IP: $wifiIP" -ForegroundColor Green
    cd mobile
    npx expo start -c --port 8081
}
