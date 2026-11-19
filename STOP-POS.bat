@echo off
title House of Sadaya - Stop POS
color 0c

echo ================================================================
echo          CLOSING HOUSE OF SADAYA POS SYSTEM
echo ================================================================
echo.

:: Kill node processes running on ports 3001 and 5173
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3001" ^| find "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| find ":5173" ^| find "LISTENING"') do taskkill /F /PID %%a >nul 2>&1

echo POS background services have been stopped safely.
echo Have a great day!
timeout /t 3 >nul
exit /b 0
