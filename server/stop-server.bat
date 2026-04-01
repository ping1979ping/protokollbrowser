@echo off
echo ================================================
echo  Protokoll Exchange Server stoppen
echo ================================================
echo.

tasklist /FI "IMAGENAME eq protokoll-exchange.exe" 2>nul | find /I "protokoll-exchange.exe" >nul
if errorlevel 1 (
    echo Server laeuft nicht.
    pause
    goto :eof
)

echo Server wird gestoppt...
taskkill /IM protokoll-exchange.exe /F
if not errorlevel 1 (
    echo.
    echo Server erfolgreich gestoppt.
) else (
    echo.
    echo FEHLER: Konnte Server nicht stoppen.
    echo Versuche es als Administrator.
)

pause
