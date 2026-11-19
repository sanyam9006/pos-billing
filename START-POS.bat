@echo off
title House of Sadaya - POS Launcher
color 0b

:: Navigate to folder containing this batch script
cd /d "%~dp0"

echo ================================================================
echo          HOUSE OF SADAYA - BOUTIQUE POS SYSTEM
echo ================================================================
echo.

:: 1. Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed on this laptop!
    echo.
    echo Please install Node.js (v18 or higher) from:
    echo https://nodejs.org/
    echo.
    echo After installing, restart this file.
    echo ================================================================
    pause
    exit /b 1
)

:: 2. First-Time Setup: Check if node_modules exist
if not exist "node_modules\" (
    echo [FIRST RUN] Installing backend dependencies... Please wait 1-2 minutes.
    call npm install
)

if not exist "client\node_modules\" (
    echo [FIRST RUN] Installing frontend dependencies... Please wait 1-2 minutes.
    cd client
    call npm install
    cd ..
)

echo.
echo [1/2] Starting POS server and billing engine...

:: 3. Start backend and frontend concurrently
start /min "House of Sadaya POS Server" cmd /c "npm run dev"

echo [2/2] Waiting for server to initialize...

:: Wait up to 10 seconds for backend to respond
set count=0
:wait_loop
timeout /t 1 /nobreak >nul
curl -s http://localhost:3001/api/config >nul 2>nul
if %errorlevel% equ 0 goto ready
set /a count+=1
if %count% geq 10 goto ready
goto wait_loop

:ready
timeout /t 1 /nobreak >nul
echo.
echo ================================================================
echo   POS SYSTEM IS READY! Opening House of Sadaya in your browser...
echo   URL: http://localhost:5173
echo ================================================================

:: Open Chrome in kiosk/app mode if installed, otherwise default browser
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app=http://localhost:5173
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app=http://localhost:5173
) else if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:5173
) else (
    start http://localhost:5173
)

exit /b 0
