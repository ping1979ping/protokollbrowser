@echo off
echo ============================================
echo  Protokollbrowser Exchange Server (lokal)
echo ============================================
echo.

cd /d "%~dp0"

REM Firewall-Regel anlegen (braucht einmalig Admin-Rechte)
netsh advfirewall firewall show rule name="ProtoExchange" >nul 2>&1
if errorlevel 1 (
    echo Firewall-Regel wird angelegt (Port 8080^)...
    netsh advfirewall firewall add rule name="ProtoExchange" dir=in action=allow protocol=tcp localport=8080
    if errorlevel 1 (
        echo.
        echo HINWEIS: Firewall-Regel konnte nicht angelegt werden.
        echo Bitte einmalig als Administrator ausfuehren!
        echo.
    )
)

REM IP-Adresse anzeigen
echo.
echo Deine IP-Adressen (fuer iPhone-Zugriff):
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set "ip=%%a"
    setlocal enabledelayedexpansion
    set "ip=!ip: =!"
    echo   http://!ip!:8080
    endlocal
)
echo.

REM Datenverzeichnis setzen (Standard: data\ neben server.py)
REM Fuer Exchange-Server auf K: (SvDocu) stattdessen:
REM   set EXCHANGE_DATA_DIR=K:\Sonstige\Docuframe-Exchange\data
set EXCHANGE_DATA_DIR=%~dp0data

REM Port (Standard: 8080, auf SvDocu: 80)
REM   set EXCHANGE_PORT=80
set EXCHANGE_PORT=8080

REM Server starten
if exist "dist\protokoll-exchange.exe" (
    echo Starte .exe ...
    dist\protokoll-exchange.exe
    goto :end
)
if exist "venv\Scripts\python.exe" (
    echo Starte via venv/python ...
    venv\Scripts\python.exe server.py
    goto :end
)
echo FEHLER: Weder .exe noch venv gefunden!
echo Baue erst die .exe oder erstelle ein venv.

:end
pause
