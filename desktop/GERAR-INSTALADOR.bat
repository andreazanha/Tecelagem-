@echo off
chcp 65001 >nul
title Big Tricot - Gerar instalador (.exe)
cd /d "%~dp0"

REM ─────────────────────────────────────────────────────────────────────────
REM  PROTECAO CONTRA LOOP: se este script foi reaberto por causa da elevacao,
REM  ele recebe o argumento "elevated" e NUNCA tenta elevar de novo. Assim, na
REM  pior das hipoteses, ele roda UMA vez sem admin — jamais fica em loop.
REM ─────────────────────────────────────────────────────────────────────────
if "%~1"=="elevated" goto :run

REM  Checa se ja esta como Administrador (fsutil exige admin e NAO depende de
REM  nenhum servico do Windows, entao e confiavel — diferente do "net session").
fsutil dirty query %SystemDrive% >nul 2>nul
if not errorlevel 1 goto :run

echo.
echo  Pra gerar o instalador .exe o Windows precisa de permissao de Administrador.
echo  Vai abrir uma janela pedindo permissao — clique em SIM.
echo  (Se voce clicar NAO, nada acontece: e so fechar e usar o ABRIR-NAVEGADOR-CRM.bat.)
echo.
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList 'elevated' -Verb RunAs" 2>nul
REM  Deu o pedido de elevacao (ou o usuario cancelou). De qualquer forma, este
REM  processo TERMINA aqui. Nao ha re-tentativa — sem loop.
exit /b 0

:run
echo ================================================
echo    BIG TRICOT - Gerar instalador do Windows
echo ================================================
echo.

REM  Confirma se realmente estamos com admin (pode ter clicado NAO na permissao).
fsutil dirty query %SystemDrive% >nul 2>nul
if errorlevel 1 (
  echo [!] Voce nao esta como Administrador (clicou NAO na permissao?).
  echo     Sem admin, o gerador costuma falhar no passo do "winCodeSign".
  echo.
  echo     Voce tem 2 opcoes:
  echo       1) Feche esta janela e use o ABRIR-NAVEGADOR-CRM.bat
  echo          (o programa abre normal, com todos os consertos).
  echo       2) Clique com o botao DIREITO neste arquivo e escolha
  echo          "Executar como administrador" pra tentar o instalador.
  echo.
  pause
  exit /b 1
)

echo (Rodando como Administrador — beleza.)
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
