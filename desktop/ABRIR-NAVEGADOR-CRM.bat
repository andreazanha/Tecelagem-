@echo off
chcp 65001 >nul
title Big Tricot - Navegador CRM
cd /d "%~dp0"

echo ============================================
echo    BIG TRICOT - Navegador CRM (desktop)
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js nao encontrado.
  echo     Instale o Node.js LTS em: https://nodejs.org
  echo     Depois feche e abra este arquivo de novo.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\electron" (
  echo [1/2] Primeira vez: instalando o necessario. Pode demorar alguns minutos...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [X] Falha ao instalar. Verifique sua internet e tente de novo.
    pause
    exit /b 1
  )
)

echo [2/2] Abrindo o Big Tricot - Navegador CRM...
echo.
call npm start

echo.
echo (A janela do programa foi fechada.)
pause
