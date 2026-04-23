@echo off
echo === PWA Build + Deploy nach GitHub Pages ===
echo.

cd /d "%~dp0..\app"

echo [1/3] PWA bauen (GitHub Pages mit base=/protokollbrowser/)...
REM VITE_BASE=pages noetig (Standard ist jetzt Server-Build './')
set VITE_BASE=pages
call npm run build
if errorlevel 1 (
    echo FEHLER beim Build!
    pause
    exit /b 1
)

echo [2/3] gh-pages Branch aktualisieren...
cd /d "%~dp0.."

REM Prüfen ob gh-pages Branch existiert
git rev-parse --verify gh-pages >nul 2>&1
if errorlevel 1 (
    echo gh-pages Branch existiert nicht, wird erstellt...
    git checkout --orphan gh-pages
    git rm -rf .
    xcopy /s /e /i /q "app\dist" "."
    git add -A
    git commit -m "Initial GitHub Pages deploy"
    git checkout master
    git push origin gh-pages
) else (
    echo gh-pages Branch wird aktualisiert...
    git checkout gh-pages
    REM Alte Dateien entfernen (ausser .git)
    for /f "delims=" %%i in ('dir /b /a-d 2^>nul') do if not "%%i"==".git" del "%%i"
    for /f "delims=" %%i in ('dir /b /ad 2^>nul') do if not "%%i"==".git" rmdir /s /q "%%i"
    xcopy /s /e /i /q "app\dist\*" "."
    git add -A
    git commit -m "Update GitHub Pages deploy"
    git checkout master
    git push origin gh-pages
)

echo.
echo [3/3] Fertig!
echo GitHub Pages wird unter /protokollbrowser/ verfuegbar sein.
pause
