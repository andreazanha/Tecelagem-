@echo off
chcp 65001 >nul
title Big Tricot - Gerar instalador (.exe)
cd /d "%~dp0"

echo ================================================
echo    BIG TRICOT - Gerar instalador do Windows
echo ================================================
echo.
echo Isso cria um instalador .exe (como qualquer programa).
echo Na 1a vez pode DEMORAR bastante (baixa ferramentas de build).
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js nao encontrado. Instale o LTS em https://nodejs.org e tente de novo.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\electron\package.json" (
  echo Instalando dependencias...
  call npm install --no-audit --no-fund
  echo.
)
if not exist "node_modules\electron\dist\electron.exe" (
  node "node_modules\electron\install.js"
)

echo Gerando o instalador... aguarde.
echo.
call npm run dist:win
set "CODE=%errorlevel%"

if not "%CODE%"=="0" (
  echo.
  echo [X] Falhou ao gerar o instalador. Codigo: %CODE%
  echo     Tire um print desta tela inteira e me envie.
  echo.
  pause
  exit /b 1
)

echo.
echo ================================================
echo  [OK] PRONTO! O instalador esta em:
echo       %cd%\dist
echo  Procure um arquivo tipo:  Big Tricot Setup 0.1.0.exe
echo  De 2 cliques nele pra instalar (cria atalho na area de trabalho).
echo ================================================
echo.
pause
