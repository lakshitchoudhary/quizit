@echo off
setlocal DisableDelayedExpansion
echo Quizit! local AI setup
echo Checks Ollama, downloads qwen3.5:4b if missing, and configures sign-in startup.
echo No account or API key is needed. Have your Extension ID ready from Preferences.
echo.
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0scripts\Setup-Windows.ps1" %*
if errorlevel 1 (
  echo.
  echo Setup did not finish. Read the message above and README.md.
  pause
  exit /b 1
)
echo.
pause
