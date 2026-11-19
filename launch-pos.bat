@echo off
title House of Sadaya - POS Launcher
color 0b

:: Navigate to folder containing this script
cd /d "%~dp0"

echo ================================================================
echo          HOUSE OF SADAYA - BOUTIQUE POS SYSTEM
echo ================================================================
echo.

node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Node.js is NOT installed on this laptop!
    echo.
    echo Opening https://nodejs.org in your browser right now...
    start https://nodejs.org
    echo.
    echo Please install Node.js (LTS), then restart this file.
    echo ================================================================
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [First-Time Setup] Installing server dependencies...
    call npm install
)

if not exist "client\node_modules\" (
    echo [First-Time Setup] Installing client dependencies...
    cd client
    call npm install
    cd ..
)

echo Starting POS Server...
start "House of Sadaya POS Engine" cmd /k "npm run dev"

timeout /t 5 >nul 2>&1
start http://localhost:5173

echo.
echo ================================================================
echo   POS SYSTEM IS READY at http://localhost:5173
echo ================================================================
echo.
pause
