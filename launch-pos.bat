@echo off
setlocal

:: Indian Boutique POS Launcher for Windows
:: Auto-detects project directory based on .bat location
cd /d "%~dp0"

echo ========================================================
echo   Launching Aura Fashion Boutique POS System...
echo ========================================================

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in PATH.
    echo Please install Node.js (v18+) from https://nodejs.org
    pause
    exit /b 1
)

:: Check if backend health endpoint is active
curl -s http://localhost:3001/api/health >nul 2>nul
if %errorlevel% neq 0 (
    echo Starting POS Server and Web Interface...
    start /min "Aura POS Engine" cmd /c "npm run dev"
    
    :: Wait up to 10 seconds for backend to start
    set count=0
    :wait_loop
    timeout /t 1 /nobreak >nul
    curl -s http://localhost:3001/api/health >nul 2>nul
    if %errorlevel% equ 0 goto ready
    set /a count+=1
    if %count% geq 10 goto ready
    goto wait_loop
)

:ready
timeout /t 1 /nobreak >nul
echo POS System is ready! Opening in your browser...

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
