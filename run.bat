@echo off
chcp 65001 >nul
cd /d "%~dp0"
title PDF Editor

where python >nul 2>nul
if errorlevel 1 (
  echo [!] Chua cai Python. Tai tai https://www.python.org/downloads/
  echo     Khi cai nho tick o "Add python.exe to PATH".
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo Dang tao moi truong ao .venv ...
  python -m venv .venv
  if errorlevel 1 ( pause & exit /b 1 )
)

if not exist ".venv\installed.flag" (
  echo Dang cai thu vien - lan dau mat vai phut ...
  ".venv\Scripts\python.exe" -m pip install --upgrade pip
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
  if errorlevel 1 (
    echo [!] Cai thu vien that bai. Kiem tra ket noi mang roi chay lai.
    pause
    exit /b 1
  )
  echo ok> ".venv\installed.flag"
)

rem HOST=0.0.0.0: cho phep cac may khac trong mang noi bo truy cap
rem (doi thanh 127.0.0.1 neu chi muon dung tren may nay)
set HOST=0.0.0.0
echo.
echo  PDF Editor dang chay. Dong cua so nay de tat.
echo.
".venv\Scripts\python.exe" app.py
pause
