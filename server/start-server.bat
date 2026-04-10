@echo off
title Protokoll Exchange Server
echo ================================================
echo  Protokoll Exchange Server (SvDocu)
echo ================================================
echo.

cd /d "%~dp0"

REM ---- Konfiguration ----
set EXCHANGE_DATA_DIR=K:\Sonstige\Docuframe-Exchange\data
set EXCHANGE_PORT=8080
set LOGFILE=server.log

REM ---- Pruefen ob EXE vorhanden ----
if not exist "protokoll-exchange.exe" (
    echo FEHLER: protokoll-exchange.exe nicht gefunden!
    pause
    goto :eof
)

REM ---- Pruefen ob schon laeuft ----
tasklist /FI "IMAGENAME eq protokoll-exchange.exe" 2>nul | find /I "protokoll-exchange.exe" >nul
if not errorlevel 1 (
    echo ACHTUNG: laeuft bereits! Erst stop-server.bat ausfuehren.
    pause
    goto :eof
)

REM ---- Firewall ----
netsh advfirewall firewall show rule name="ProtoExchange" >nul 2>&1
if errorlevel 1 (
    echo Firewall-Regel wird angelegt...
    netsh advfirewall firewall add rule name="ProtoExchange" dir=in action=allow protocol=tcp localport=%EXCHANGE_PORT%
)

REM ---- SSL-Zertifikat pruefen ----
if exist "cert.pem" (
    echo SSL: cert.pem gefunden - HTTPS aktiv
) else (
    echo SSL: Kein Zertifikat gefunden - HTTP-Modus (GPS blockiert)
    echo      Zum Erzeugen: python generate_cert.py
)

REM ---- Info ----
echo.
echo Datenverzeichnis: %EXCHANGE_DATA_DIR%
echo Port: %EXCHANGE_PORT%
echo Log: %LOGFILE%
echo.
echo Starte Server... Ausgabe geht in server.log
echo.
echo ------------------------------------------------
echo  Zum Stoppen: Ctrl+C oder stop-server.bat
echo ------------------------------------------------
echo.

REM ---- Server starten, stdout+stderr in Log UND Konsole ----
echo === Server-Start %date% %time% === > "%LOGFILE%"
echo EXCHANGE_DATA_DIR=%EXCHANGE_DATA_DIR% >> "%LOGFILE%"
echo EXCHANGE_PORT=%EXCHANGE_PORT% >> "%LOGFILE%"
echo. >> "%LOGFILE%"

protokoll-exchange.exe >> "%LOGFILE%" 2>&1
set EXIT_CODE=%ERRORLEVEL%

echo.
echo ================================================
echo  Server beendet (Exit-Code: %EXIT_CODE%)
echo ================================================
echo.
echo Letzte Zeilen aus server.log:
echo ------------------------------------------------
type "%LOGFILE%"
echo ------------------------------------------------
echo.

pause
