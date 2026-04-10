@echo off
echo ================================================
echo  Port-Check fuer Exchange Server
echo ================================================
echo.

set PORT=8080

echo Pruefe Port %PORT%...
echo.

netstat -ano | findstr ":%PORT% " | findstr "LISTENING"
if not errorlevel 1 (
    echo.
    echo PORT %PORT% IST BELEGT! Details:
    echo.
    for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT% " ^| findstr "LISTENING"') do (
        echo PID: %%p
        tasklist /FI "PID eq %%p" /FO TABLE /NH
    )
    echo.
    echo Optionen:
    echo  1. Den Prozess oben beenden
    echo  2. Anderen Port in start-server.bat setzen
) else (
    echo Port %PORT% ist FREI - Server kann gestartet werden.
)

echo.
pause
