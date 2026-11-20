@echo off
title House of Sadaya Boutique POS
color 0b
cd /d "%~dp0"

echo ================================================================
echo          HOUSE OF SADAYA - BOUTIQUE POS SYSTEM
echo ================================================================
echo.

node -v >nul 2>&1
if %errorlevel% neq 0 (
    color 0c
    echo.
    echo ERROR: Node.js is NOT installed on this computer!
    echo Opening https://nodejs.org in your browser right now...
    start https://nodejs.org
    echo Please install Node.js (LTS), then restart this file.
    pause
    exit /b 1
)

node -e "require('express')" >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing required boutique packages...
    call npm install --omit=dev
)

set PORT=5173
start "" cmd /c "timeout /t 2 >nul & start http://localhost:5173"

echo ================================================================
echo   HOUSE OF SADAYA POS IS NOW RUNNING!
echo   Store Address: http://localhost:5173
echo   (Keep this window open or minimized while using the system)
echo ================================================================
echo.

node server/index.js

color 0c
echo ================================================================
echo  The POS server has stopped.
echo ================================================================
pause
