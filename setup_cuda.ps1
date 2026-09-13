param(
    [string]$TorchIndexUrl = "https://download.pytorch.org/whl/cu128"
)

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
$venvPath = Join-Path $projectRoot ".venv"
$venvPython = Join-Path $venvPath "Scripts\python.exe"

Write-Host "[1/5] Kiem tra phien ban Python thich hop (3.10 - 3.12)..." -ForegroundColor Cyan
$pythonPath = $null
$supportedVersions = @("Python311", "Python310", "Python312")
foreach ($ver in $supportedVersions) {
    $p = Join-Path $env:LOCALAPPDATA "Programs\Python\$ver\python.exe"
    if (Test-Path -LiteralPath $p) {
        $pythonPath = $p
        break
    }
}

if ($null -eq $pythonPath) {
    # Thu tim kiem python trong PATH
    $p = Get-Command python.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
    if ($p) {
        $val = & $p -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
        if ($val -eq "3.10" -or $val -eq "3.11" -or $val -eq "3.12") {
            $pythonPath = $p
        }
    }
}

if ($null -eq $pythonPath) {
    throw "Khong tim thay Python 3.10, 3.11 hoac 3.12 (64-bit). Vui long cai dat mot trong cac phien ban nay."
}
Write-Host "Da phat hien Python phu hop tai: $pythonPath" -ForegroundColor Green

Write-Host "[2/5] Tao moi truong ao .venv..." -ForegroundColor Cyan
if (-not (Test-Path -LiteralPath $venvPython)) {
    & $pythonPath -m venv $venvPath
    if ($LASTEXITCODE -ne 0) { throw "Khong the tao .venv." }
}

Write-Host "[3/5] Cap nhat pip..." -ForegroundColor Cyan
& $venvPython -m pip install --upgrade pip wheel "setuptools<82"
if ($LASTEXITCODE -ne 0) { throw "Khong the cap nhat pip/setuptools/wheel." }

Write-Host "[4/5] Cai PyTorch CUDA va dependencies..." -ForegroundColor Cyan
& $venvPython -m pip install torch torchvision --index-url $TorchIndexUrl
if ($LASTEXITCODE -ne 0) { throw "Khong the cai PyTorch CUDA tu $TorchIndexUrl." }
& $venvPython -m pip install -r (Join-Path $projectRoot "requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "Khong the cai day du requirements.txt." }

# InsightFace declares the CPU onnxruntime distribution as a dependency. Keep
# its metadata for dependency resolution, but install GPU module files last.
& $venvPython -m pip install --force-reinstall --no-deps onnxruntime-gpu==1.23.2
if ($LASTEXITCODE -ne 0) { throw "Khong the cai lai ONNX Runtime GPU." }

Write-Host "[5/5] Xac minh GPU providers..." -ForegroundColor Cyan
& $venvPython -c "import torch; print('PyTorch:', torch.__version__); print('CUDA:', torch.cuda.is_available()); print('GPU:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'NONE')"
if ($LASTEXITCODE -ne 0) { throw "PyTorch CUDA verification failed." }
& $venvPython -c "import torch; import onnxruntime as ort; print('ONNX Runtime providers:', ort.get_available_providers()); assert 'CUDAExecutionProvider' in ort.get_available_providers(), 'InsightFace chua co CUDAExecutionProvider'"
if ($LASTEXITCODE -ne 0) { throw "ONNX Runtime CUDA verification failed." }

Write-Host "Hoan tat. Chay .\run_project.ps1 de khoi dong du an." -ForegroundColor Green
