@echo off
title Desinstalar Ponte Tecelagem (automatica)

echo ============================================================
echo   Remover a execucao automatica da Ponte Tecelagem
echo ============================================================
echo.

net session >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Rode como ADMINISTRADOR.
  echo   Clique com o botao DIREITO neste arquivo e escolha
  echo   "Executar como administrador".
  echo.
  pause
  exit /b 1
)

echo  Removendo a tarefa agendada "TecelagemPonte"...
schtasks /Delete /TN "TecelagemPonte" /F >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [AVISO] A tarefa "TecelagemPonte" nao existia (ou ja foi removida).
) else (
  echo.
  echo  [OK] Pronto. A ponte NAO roda mais sozinha.
  echo  Se quiser, volte a usar o start.bat para rodar manualmente.
)
echo.
pause
