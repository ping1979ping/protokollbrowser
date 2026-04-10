@echo off
echo ================================================
echo  SSL-Zertifikat erzeugen
echo ================================================
echo.

cd /d "%~dp0"

if exist "cert.pem" (
    echo cert.pem existiert bereits!
    echo Zum Ueberschreiben: python generate_cert.py --force
    pause
    goto :eof
)

if exist "generate-cert.exe" (
    generate-cert.exe
) else (
    where python >nul 2>&1
    if errorlevel 1 (
        echo FEHLER: Weder generate-cert.exe noch Python gefunden!
        pause
        goto :eof
    )
    python generate_cert.py
)

echo.
if exist "cert.pem" (
    echo Fertig! Server jetzt mit start-server.bat neu starten.
) else (
    echo FEHLER: Zertifikat konnte nicht erzeugt werden.
)
echo.
pause
