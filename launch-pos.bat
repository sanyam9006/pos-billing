@echo off
title House of Sadaya POS
color 0b

cd /d "%~dp0"

echo ================================================================
echo          HOUSE OF SADAYA - BOUTIQUE POS SYSTEM
echo ================================================================
echo.

node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is NOT installed on this computer!
    echo.
    echo Opening https://nodejs.org in your browser right now...
    start https://nodejs.org
    echo Please install Node.js (LTS), then restart this file.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo Installing required boutique packages...
    call npm install --omit=dev
)

echo Starting House of Sadaya Boutique POS...
set PORT=5173

start "" cmd /c "timeout /t 2 >nul & start http://localhost:5173"

echo.
echo ================================================================
echo   POS SYSTEM IS READY at http://localhost:5173
echo   (Keep this window open while using the POS)
echo ================================================================
echo.

node server/index.js

pause
