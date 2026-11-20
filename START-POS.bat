@echo off
title House of Sadaya Boutique POS
color 0b
cd /d "%~dp0"

echo ================================================================
echo          HOUSE OF SADAYA - BOUTIQUE POS SYSTEM
echo ================================================================
echo.

:: Step 1: Check Node.js
echo [1/3] Checking Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    color 0c
    echo.
    echo ****************************************************************
    echo  ERROR: Node.js is NOT installed on this computer!
    echo ****************************************************************
    echo.
    echo  The POS software requires Node.js to run.
    echo  Opening https://nodejs.org in your browser right now...
    start https://nodejs.org
    echo.
    echo  STEPS TO FIX:
    echo  1. On the website that just opened, click the green "LTS" button.
    echo  2. Download and run the installer (click Next until Finish).
    echo  3. After installation finishes, double-click START-POS.bat again.
    echo.
    echo ================================================================
    pause
    exit /b 1
)

echo       Node.js is installed:
node -v

:: Step 2: Check packages
echo.
echo [2/3] Checking store packages...
node -e "require('express')" >nul 2>&1
if %errorlevel% neq 0 (
    echo       First-time setup: Installing required boutique packages...
    echo       (This takes about 30 to 60 seconds, please wait...)
    call npm install --omit=dev
)
echo       Packages are ready!

:: Step 3: Launch
echo.
echo [3/3] Starting POS Server...
set PORT=5173

:: Open browser after 2 seconds
start "" cmd /c "timeout /t 2 >nul & start http://localhost:5173"

echo.
echo ================================================================
echo   HOUSE OF SADAYA POS IS NOW RUNNING!
echo   Store Address: http://localhost:5173
echo.
echo   *** DO NOT CLOSE THIS BLUE WINDOW! ***
echo   (Keep this window open or minimized while using the system.
echo    If you close this window, the store website will stop working.)
echo ================================================================
echo.

node server/index.js

:: If node exits, catch it and explain
echo.
color 0c
echo ================================================================
echo  The POS server has stopped.
echo ================================================================
pause
