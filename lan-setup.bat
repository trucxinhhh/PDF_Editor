@echo off
rem ================================================================
rem  Mo tuong lua Windows cho cong 5000 de cac may khac trong
rem  mang noi bo (LAN) truy cap duoc PDF Editor.
rem  Chi can chay 1 lan tren may chay PDF Editor.
rem ================================================================
chcp 65001 >nul
set PORT=5000
set RULE=PDF Editor (TCP %PORT%)

net session >nul 2>&1
if errorlevel 1 (
  echo Can quyen Administrator. Dang yeu cau quyen...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo.
echo [1/3] Mo tuong lua cho cong %PORT% ...
netsh advfirewall firewall delete rule name="%RULE%" >nul 2>&1
netsh advfirewall firewall add rule name="%RULE%" dir=in action=allow protocol=TCP localport=%PORT% profile=private,domain >nul
if errorlevel 1 (
  echo     [!] Khong tao duoc rule tuong lua.
) else (
  echo     OK - da cho phep ket noi vao cong %PORT% trong mang Private/Domain.
)

echo.
echo [2/3] Kiem tra loai mang ...
powershell -NoProfile -Command "if (Get-NetConnectionProfile | Where-Object NetworkCategory -eq 'Public') { exit 1 } else { exit 0 }"
if errorlevel 1 (
  echo     Mang hien tai dang de che do PUBLIC - Windows se chan cac may khac.
  choice /M "    Chuyen mang nay sang PRIVATE (mang tin cay o nha/cong ty)"
  if errorlevel 2 (
    echo     Bo qua. Cac may khac co the KHONG truy cap duoc.
  ) else (
    powershell -NoProfile -Command "Get-NetConnectionProfile | Where-Object NetworkCategory -eq 'Public' | Set-NetConnectionProfile -NetworkCategory Private"
    echo     OK - da chuyen sang Private.
  )
) else (
  echo     OK - mang dang o che do Private/Domain.
)

echo.
echo [3/3] Dia chi de cac may khac trong mang noi bo truy cap:
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.InterfaceAlias -notmatch 'vEthernet|WSL|Loopback|VirtualBox|VMware' } | ForEach-Object { '     http://' + $_.IPAddress + ':%PORT%   (' + $_.InterfaceAlias + ')' }"

echo.
echo Xong. Hay chac chan PDF Editor dang chay (docker compose up -d hoac run.bat),
echo roi mo dia chi tren bang trinh duyet o may khac.
echo.
echo Muon dong lai tuong lua sau nay:
echo     netsh advfirewall firewall delete rule name="%RULE%"
echo.
pause
