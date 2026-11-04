@echo off
title Catamaran Beach Restaurant POS - Silent Printing Launcher
echo ===================================================
echo   CATAMARAN BEACH RESTAURANT POS
echo   Starting Silent 58mm Thermal Printing Mode...
echo ===================================================
echo.

rem Launch Google Chrome in Silent Kiosk Printing mode (Bypasses Chrome Print Preview)
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing --app=http://localhost:5175
    exit
)

if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --kiosk-printing --app=http://localhost:5175
    exit
)

rem Fallback to Microsoft Edge
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk-printing --app=http://localhost:5175
    exit
)

echo Browser not found. Opening default browser...
start http://localhost:5175
