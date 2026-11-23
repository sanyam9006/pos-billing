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
    echo ERROR: Node.js is NOT installed on this computer!
    echo Opening https://nodejs.org in your browser right now...
    start https://nodejs.org
    echo Please install Node.js from the website, then restart this file.
    pause
    exit /b 1
)

echo [1/3] Node.js is ready:
node -v

echo.
echo [2/3] Installing boutique packages...
call npm install --omit=dev

echo.
echo [3/3] Starting House of Sadaya Boutique POS...
set PORT=5173

start "" cmd /c "timeout /t 2 >nul & start http://localhost:5173"

echo.
echo ================================================================
echo   HOUSE OF SADAYA POS IS NOW RUNNING!
echo   Store Address: http://localhost:5173
echo   (Keep this window open while using the POS)
echo ================================================================
echo.

node server/index.js

pause
