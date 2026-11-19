@echo off
title House of Sadaya POS
color 0b

:: Always run in the directory of this batch file
cd /d "%~dp0"

echo ================================================================
echo          HOUSE OF SADAYA - BOUTIQUE POS SYSTEM
echo ================================================================
echo.

:: 1. Check if Node.js is installed
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is NOT installed on this computer!
    echo.
    echo Opening https://nodejs.org in your browser right now...
    start https://nodejs.org
    echo.
    echo Please install the "LTS" version of Node.js.
    echo After the installation finishes, double-click START-POS.bat again.
    echo.
    echo ================================================================
    pause
    exit /b 1
)

echo [1/3] Node.js detected:
node -v

:: 2. Check and install production packages on first run
if not exist "node_modules\" (
    echo.
    echo [2/3] First-time setup: Installing required boutique packages...
    echo (This only happens on the first run, takes about 30-60 seconds)
    call npm install --omit=dev
)

:: 3. Start the POS Server directly on port 5173
echo.
echo [3/3] Starting House of Sadaya Boutique POS...
set PORT=5173

:: Open browser after 2 seconds in background
start "" cmd /c "timeout /t 2 >nul & start http://localhost:5173"

echo.
echo ================================================================
echo   HOUSE OF SADAYA POS IS NOW RUNNING!
echo   Store Address: http://localhost:5173
echo.
echo   * IMPORTANT: Keep this window open while using the POS.
echo   * When closing the store for the night, simply close this window.
echo ================================================================
echo.

node server/index.js

pause
