@echo off
setlocal

set OUTPUT_ZIP=chrome.zip

cd /d "%~dp0"

if exist "%OUTPUT_ZIP%" (
  echo Removing existing archive...
  del "%OUTPUT_ZIP%"
)

echo Creating archive '%OUTPUT_ZIP%'...

powershell -Command "Compress-Archive -Path 'manifest.json', 'icons', 'src' -DestinationPath '%OUTPUT_ZIP%' -Force"

if %ERRORLEVEL% equ 0 (
  echo Successfully created '%OUTPUT_ZIP%' in the project root directory.
  echo Archive is ready for Chrome Web Store submission.
) else (
  echo Error: Failed to create zip archive.
  exit /b 1
)

echo Build process completed.
pause
