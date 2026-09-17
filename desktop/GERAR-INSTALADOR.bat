@echo off
chcp 65001 >nul
title Big Tricot - Gerar instalador (.exe)

REM ─────────────────────────────────────────────────────────────────────────
REM  Auto-elevar para ADMINISTRADOR.
REM  O electron-builder baixa o "winCodeSign", que contem LINKS SIMBOLICOS.
REM  Criar link simbolico no Windows exige privilegio de Administrador — sem
REM  isso da o erro "Cannot create symbolic link / o cliente nao tem o
REM  privilegio necessario". Rodando como Admin, isso resolve sozinho.
REM ─────────────────────────────────────────────────────────────────────────
net session >nul 2>nul
if not errorlevel 1 goto :admin_ok

echo.
echo  Este passo precisa de permissao de ADMINISTRADOR (so pra gerar o .exe).
echo  Vai aparecer uma janela do Windows pedindo permissao — clique em SIM.
echo.
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs" 2>nul
if errorlevel 1 (
  echo.
  echo [X] Nao consegui pedir permissao de Administrador automaticamente.
  echo     Clique com o botao DIREITO neste arquivo e escolha
  echo     "Executar como administrador".
  echo.
  pause
)
exit /b

:admin_ok
cd /d "%~dp0"

echo ================================================
echo    BIG TRICOT - Gerar instalador do Windows
echo    (rodando como Administrador)
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

if not "%CODE%"=="0" goto :falhou

echo.
echo ================================================
echo  [OK] PRONTO! O instalador esta em:
echo       %cd%\dist
echo  Procure um arquivo tipo:  Big Tricot Setup 0.1.0.exe
echo  De 2 cliques nele pra instalar (cria atalho na area de trabalho).
echo ================================================
echo.
pause
exit /b 0

:falhou
echo.
echo ==================== NAO DEU ====================
echo  [X] Falhou ao gerar o instalador. Codigo: %CODE%
echo.
echo  MAS voce ainda pode usar o programa sem instalador:
echo  abra a pasta:  %cd%\dist\win-unpacked
echo  e de 2 cliques em:  "Big Tricot.exe"
echo  (funciona igual; pra ter atalho, clique com o direito nele ->
echo   Enviar para -> Area de trabalho).
echo.
echo  Se quiser que eu resolva o instalador, tire um print desta tela
echo  inteira e me envie.
echo ================================================
echo.
pause
exit /b 1
