@echo off
echo ============================================
echo  Protokollbrowser Exchange Server
echo  Installation auf Fileserver
echo ============================================
echo.

REM Zielverzeichnis (anpassen!)
set INSTALL_DIR=K:\projekte\docuframe-exchange
set EXE_NAME=protokoll-exchange.exe

echo Zielverzeichnis: %INSTALL_DIR%
echo.

REM Verzeichnisse anlegen
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%INSTALL_DIR%\data\export" mkdir "%INSTALL_DIR%\data\export"
if not exist "%INSTALL_DIR%\data\import" mkdir "%INSTALL_DIR%\data\import"
if not exist "%INSTALL_DIR%\data\archive" mkdir "%INSTALL_DIR%\data\archive"

REM EXE kopieren
copy /Y "%~dp0dist\%EXE_NAME%" "%INSTALL_DIR%\%EXE_NAME%"

REM Start-Script erstellen
(
echo @echo off
echo cd /d "%INSTALL_DIR%"
echo set EXCHANGE_DATA_DIR=%INSTALL_DIR%\data
echo echo Server startet auf http://0.0.0.0:8080
echo echo Beenden mit Ctrl+C
echo "%INSTALL_DIR%\%EXE_NAME%"
echo pause
) > "%INSTALL_DIR%\start-server.bat"

echo.
echo ============================================
echo  Installation abgeschlossen!
echo.
echo  Zum Starten: %INSTALL_DIR%\start-server.bat
echo  Oder als Windows-Dienst registrieren:
echo    sc create ProtoExchange binPath= "%INSTALL_DIR%\%EXE_NAME%"
echo ============================================
echo.
pause
