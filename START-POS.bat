@echo off
title House of Sadaya - POS
color 0b

:: Navigate to folder containing this script
cd /d "%~dp0"

echo ================================================================
echo          HOUSE OF SADAYA - BOUTIQUE POS SYSTEM
echo ================================================================
echo.

:: 1. Check if Node.js is installed
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Node.js is NOT installed on this laptop!
    echo.
    echo Opening https://nodejs.org in your browser right now...
    start https://nodejs.org
    echo.
    echo INSTRUCTIONS:
    echo  1. On the website, click the big green "LTS (Recommended)" button.
    echo  2. Install it by clicking "Next" - "Next" - "Finish".
    echo  3. After installation finishes, double-click START-POS.bat again.
    echo.
    echo ================================================================
    pause
    exit /b 1
)

echo [Step 1/3] Node.js is ready:
node -v

:: 2. Check and install dependencies on first run
if not exist "node_modules\" (
    echo.
    echo [Step 2/3] First-time setup detected: Installing server packages...
    echo (This only happens on the first run, takes about 1-2 minutes)
    call npm install
)

if not exist "client\node_modules\" (
    echo.
    echo [Step 2/3] Installing client packages...
    echo (Please wait 1-2 minutes)
    cd client
    call npm install
    cd ..
)

echo.
echo [Step 3/3] Starting House of Sadaya POS server...
start "House of Sadaya POS Engine" cmd /k "npm run dev"

echo Waiting 5 seconds for POS server to wake up...
timeout /t 5 >nul 2>&1

echo Opening House of Sadaya in your web browser...
start http://localhost:5173

echo.
echo ================================================================
echo   SUCCESS! HOUSE OF SADAYA POS IS NOW RUNNING!
echo   Open in browser: http://localhost:5173
echo.
echo   * Keep the "House of Sadaya POS Engine" window open while using the POS.
echo   * At the end of the day, you can close this window to stop the POS.
echo ================================================================
echo.
pause
