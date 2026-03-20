@echo off
echo === PWA Build + Deploy nach server/pwa/ ===
echo.

cd /d "%~dp0..\app"

echo [1/3] PWA bauen (Server-Build mit base=./)...
set VITE_BASE=server
call npm run build
if errorlevel 1 (
    echo FEHLER beim Build!
    pause
    exit /b 1
)

echo [2/3] Altes pwa/ loeschen...
if exist "%~dp0pwa" rmdir /s /q "%~dp0pwa"

echo [3/3] dist/ nach server/pwa/ kopieren...
xcopy /s /e /i /q "dist" "%~dp0pwa"

echo.
echo === Fertig! PWA liegt in server/pwa/ ===
echo Server starten mit: start-local.bat
pause
