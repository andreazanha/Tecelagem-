@echo off
chcp 65001 >nul
title Big Tricot - Navegador CRM
cd /d "%~dp0"
set "CODE=0"

echo ============================================
echo    BIG TRICOT - Navegador CRM (desktop)
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js nao encontrado.
  echo     Instale o Node.js LTS em https://nodejs.org e abra este arquivo de novo.
  echo.
  pause
  exit /b 1
)

echo - Node : & node -v
echo - npm  : & call npm -v
echo - Pasta: %cd%
echo.

REM (1) Instala as dependencias se faltar.
if not exist "node_modules\electron\package.json" (
  echo [1/3] Instalando dependencias ^(1a vez, pode demorar alguns minutos^)...
  call npm install --no-audit --no-fund
  echo.
)

REM (2) Garante o BINARIO do Electron. O postinstall costuma ser bloqueado pelo
REM     allow-scripts, entao rodamos o proprio instalador do Electron na mao.
echo [2/3] Verificando o Electron...
if not exist "node_modules\electron\dist\electron.exe" (
  echo     Binario ausente ^(postinstall bloqueado^). Baixando o Electron agora...
  node "node_modules\electron\install.js"
  echo.
)

if not exist "node_modules\electron\dist\electron.exe" (
  set "CODE=99"
  echo [X] Nao consegui instalar o binario do Electron.
  echo     Tente rodar manualmente nesta pasta:  node node_modules\electron\install.js
  goto erro
)

REM (3) Inicia direto pelo binario (evita o npm start "engolir" erros).
echo [3/3] Abrindo o Big Tricot - Navegador CRM...
echo.
"node_modules\electron\dist\electron.exe" .
set "CODE=%errorlevel%"

if not "%CODE%"=="0" goto erro

echo.
echo (Programa fechado normalmente.)
echo.
pause
exit /b 0

:erro
echo.
echo ==================== DIAGNOSTICO ====================
echo Codigo de saida : %CODE%
echo Pasta atual     : %cd%
echo Node            : & node -v
echo npm             : & call npm -v
if exist "node_modules\electron\dist\electron.exe" (echo Electron.exe    : ENCONTRADO) else (echo Electron.exe    : NAO encontrado)
echo =====================================================
echo Tire um print desta tela inteira e me envie, por favor.
echo.
pause
exit /b 1
