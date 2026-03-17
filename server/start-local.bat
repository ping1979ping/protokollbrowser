@echo off
echo ============================================
echo  Protokollbrowser Exchange Server (lokal)
echo ============================================
echo.

cd /d "%~dp0"

REM Firewall-Regel anlegen (braucht einmalig Admin-Rechte)
netsh advfirewall firewall show rule name="ProtoExchange" >nul 2>&1
if errorlevel 1 (
    echo Firewall-Regel wird angelegt (Port 8080)...
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
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo   http://%%a:8080
echo.

REM Server starten
if exist "dist\protokoll-exchange.exe" (
    echo Starte .exe ...
    set EXCHANGE_DATA_DIR=%~dp0data
    dist\protokoll-exchange.exe
) else if exist "venv\Scripts\python.exe" (
    echo Starte via venv/python ...
    set EXCHANGE_DATA_DIR=%~dp0data
    venv\Scripts\python.exe server.py
) else (
    echo FEHLER: Weder .exe noch venv gefunden!
    echo Baue erst die .exe oder erstelle ein venv.
    pause
    exit /b 1
)

pause
