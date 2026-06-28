@echo off
title ZapChat v2
color 0A
echo.
echo  ================================
echo    ZapChat v2 - Starting up...
echo  ================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  ERROR: Node.js not found.
    echo  Download from https://nodejs.org (LTS version)
    pause & exit /b 1
)

echo  Installing backend...
cd /d "%~dp0backend"
call npm install --silent 2>nul

echo  Installing frontend...
cd /d "%~dp0frontend"
call npm install --silent 2>nul

echo  Starting backend on port 3001...
cd /d "%~dp0backend"
start "ZapChat Backend" /min cmd /c "node src/index.js"
timeout /t 2 /nobreak >nul

echo  Starting frontend on port 5173...
cd /d "%~dp0frontend"
start "ZapChat Frontend" /min cmd /c "npm run dev"
timeout /t 3 /nobreak >nul

echo.
echo  ================================
echo    ZapChat is running!
echo.
echo    Open: http://localhost:5173
echo.
echo    To share publicly:
echo    Use VS Code Ports tab - forward
echo    ports 5173 and 3001, set both
echo    to Public visibility.
echo.
echo    OTPs are printed in the backend
echo    terminal window (minimised).
echo  ================================
echo.
start http://localhost:5173
pause
