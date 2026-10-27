@echo off
setlocal enabledelayedexpansion
title Instalar Ponte Tecelagem (rodar sozinha)

echo ============================================================
echo   PONTE TECELAGEM - deixar rodando sozinha (automatica)
echo ============================================================
echo.
echo  Este instalador faz a ponte rodar a cada 2 minutos, em
echo  segundo plano, mesmo depois de reiniciar o PC - sem precisar
echo  deixar nenhuma janela aberta.
echo.

REM ---- 1) Precisa ser Administrador ----
net session >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Rode como ADMINISTRADOR.
  echo   Feche esta janela, clique com o botao DIREITO neste arquivo
  echo   e escolha "Executar como administrador".
  echo.
  pause
  exit /b 1
)

REM ---- 2) Esta pasta deve ser a da ponte (tem o sync.js) ----
set "PASTA=%~dp0"
if "%PASTA:~-1%"=="\" set "PASTA=%PASTA:~0,-1%"
if not exist "%PASTA%\sync.js" (
  echo [ERRO] Nao achei o arquivo sync.js nesta pasta:
  echo        %PASTA%
  echo.
  echo  Coloque este instalador DENTRO da pasta da ponte
  echo  ^(a mesma onde estao o sync.js e o config.json^) e rode de novo.
  echo.
  pause
  exit /b 1
)

REM ---- 3) Achar o node.exe ----
set "NODE="
for /f "delims=" %%i in ('where node 2^>nul') do if not defined NODE set "NODE=%%i"
if not defined NODE (
  echo [ERRO] Node.js nao encontrado neste PC.
  echo  Instale o Node.js LTS em https://nodejs.org e rode este instalador de novo.
  echo.
  pause
  exit /b 1
)

echo  Pasta da ponte : %PASTA%
echo  Node.js        : !NODE!
echo.

REM ---- 4) Criar o arquivo que roda UMA passada da ponte ----
set "RODAR=%PASTA%\rodar-ponte.bat"
>  "%RODAR%" echo @echo off
>> "%RODAR%" echo cd /d "%%~dp0"
>> "%RODAR%" echo "!NODE!" sync.js --once ^> "%%~dp0ponte-log.txt" 2^>^&1
if not exist "%RODAR%" (
  echo [ERRO] Nao consegui criar o arquivo rodar-ponte.bat.
  echo.
  pause
  exit /b 1
)

REM ---- 5) Registrar a Tarefa Agendada: a cada 2 min, como SYSTEM, apos reiniciar tambem ----
echo  Criando a tarefa agendada "TecelagemPonte"...
schtasks /Create /TN "TecelagemPonte" /TR "\"%RODAR%\"" /SC MINUTE /MO 2 /RU SYSTEM /RL HIGHEST /F >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ERRO] Nao consegui criar a tarefa agendada.
  echo  Confirme que abriu como administrador e tente de novo.
  echo.
  pause
  exit /b 1
)

REM ---- 6) Rodar uma vez agora pra ja comecar ----
schtasks /Run /TN "TecelagemPonte" >nul 2>nul

echo.
echo ============================================================
echo   [OK] PRONTO!
echo   A ponte agora roda SOZINHA a cada 2 minutos, em segundo
echo   plano, inclusive depois de reiniciar o PC.
echo ============================================================
echo.
echo  IMPORTANTE:
echo   - Nao precisa mais abrir o start.bat (pode nem usar mais).
echo   - Se o start.bat estiver aberto agora, pode fechar a janela.
echo.
echo  Para CONFERIR se esta rodando: espere uns 2-3 minutos e abra o arquivo
echo  "ponte-log.txt" que vai aparecer aqui nesta pasta. Ele mostra o resultado
echo  da ultima execucao (deve terminar com "fim (--once)").
echo.
echo  Para gerenciar: abra o "Agendador de Tarefas" do Windows e procure
echo  por "TecelagemPonte".
echo.
pause
