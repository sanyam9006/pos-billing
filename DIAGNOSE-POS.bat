@echo off
title House of Sadaya - System Diagnostic
color 0e
cd /d "%~dp0"

echo ================================================================
echo         HOUSE OF SADAYA - SYSTEM DIAGNOSTIC CHECK
echo ================================================================
echo.

echo 1. Checking Node.js runtime...
node -v >nul 2>&1
if %errorlevel% equ 0 (
    echo    [OK] Node.js is installed:
    node -v
) else (
    echo    [FAILED] Node.js is NOT installed!
    echo    Please download and install Node.js (LTS) from https://nodejs.org
)

echo.
echo 2. Checking npm package manager...
call npm -v >nul 2>&1
if %errorlevel% equ 0 (
    echo    [OK] npm is installed:
    call npm -v
) else (
    echo    [FAILED] npm is NOT found!
)

echo.
echo 3. Checking store database (pos.db)...
if exist "pos.db" (
    echo    [OK] pos.db exists.
) else (
    echo    [FAILED] pos.db is missing!
)

echo.
echo 4. Checking required server libraries...
node -e "require('express'); console.log('   [OK] Express library is working');" 2>nul
if %errorlevel% neq 0 (
    echo    [FAILED] Express library is not installed yet.
    echo    Installing now... Please wait...
    call npm install --omit=dev
)

echo.
echo 5. Testing database connection...
node -e "const db = require('./server/db'); const p = db.prepare('SELECT count(*) as c FROM products').get(); console.log('   [OK] Database connected! Total products: ' + p.c);" 2>nul
if %errorlevel% neq 0 (
    echo    [FAILED] Database connection failed!
)

echo.
echo ================================================================
echo Diagnostic complete!
echo If any step shows [FAILED], take a photo of this screen.
echo ================================================================
echo.
pause
