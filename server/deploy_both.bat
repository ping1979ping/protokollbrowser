@echo off
echo === Beide PWA-Versionen bauen (Master + Barrierefrei) ===
echo.

set REPO=%~dp0..
set APP=%REPO%\app
set PWA=%~dp0pwa

echo [1/6] Git: master-Version bauen...
cd /d "%APP%"
git stash
git checkout master

set VITE_BASE=server
call npm run build
if errorlevel 1 (
    echo FEHLER beim Master-Build!
    pause
    exit /b 1
)

echo [2/6] Altes pwa/ loeschen...
if exist "%PWA%" rmdir /s /q "%PWA%"
mkdir "%PWA%"

echo [3/6] Master-Build nach pwa/ kopieren...
xcopy /s /e /i /q "dist" "%PWA%"

echo [4/6] Git: layout-barrierefrei bauen...
git checkout layout-barrierefrei

set VITE_BASE=server
call npm run build
if errorlevel 1 (
    echo FEHLER beim Barrierefrei-Build!
    git checkout master
    git stash pop
    pause
    exit /b 1
)

echo [5/6] Barrierefrei-Build nach pwa/bf/ kopieren...
if exist "%PWA%\bf" rmdir /s /q "%PWA%\bf"
xcopy /s /e /i /q "dist" "%PWA%\bf"

echo [6/6] Startseite generieren...
(
echo ^<!DOCTYPE html^>
echo ^<html lang="de"^>
echo ^<head^>
echo ^<meta charset="UTF-8"^>
echo ^<meta name="viewport" content="width=device-width, initial-scale=1.0"^>
echo ^<title^>Protokoll-App — Versionswahl^</title^>
echo ^<style^>
echo   * { box-sizing: border-box; margin: 0; padding: 0; }
echo   body { font-family: -apple-system, system-ui, sans-serif; background: #F7F8FA; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
echo   .container { max-width: 400px; width: 100%%; padding: 24px; }
echo   h1 { color: #004899; font-size: 22px; text-align: center; margin-bottom: 8px; }
echo   p { color: #666; font-size: 14px; text-align: center; margin-bottom: 24px; }
echo   a { display: block; padding: 20px; margin-bottom: 12px; border-radius: 12px; text-decoration: none; font-size: 18px; font-weight: 600; text-align: center; }
echo   .standard { background: #004899; color: white; }
echo   .bf { background: #16a34a; color: white; font-size: 22px; padding: 28px; }
echo   .info { font-size: 12px; color: #999; text-align: center; margin-top: 16px; }
echo ^</style^>
echo ^</head^>
echo ^<body^>
echo ^<div class="container"^>
echo   ^<h1^>Protokoll-App^</h1^>
echo   ^<p^>Version zum Testen waehlen:^</p^>
echo   ^<a href="./bf/" class="bf"^>Barrierefrei (NEU)^</a^>
echo   ^<a href="./index.html" class="standard"^>Standard (aktuell)^</a^>
echo   ^<p class="info"^>Beide Versionen nutzen die gleichen Daten.^</p^>
echo ^</div^>
echo ^</body^>
echo ^</html^>
) > "%PWA%\auswahl.html"

echo.
echo === Fertig! ===
echo   Standard:     http://svdocu:8080/
echo   Barrierefrei: http://svdocu:8080/bf/
echo   Auswahl:      http://svdocu:8080/auswahl.html
echo.

git checkout master
git stash pop 2>nul
pause
