#!/bin/bash

OUTPUT_ZIP="chrome.zip"

cd "$(dirname "$0")"

for size in 16 48 128; do
  if [ ! -f "icons/icon${size}.png" ]; then
    echo "Error: icons/icon${size}.png is missing. Run 'npm install && npm run generate-icons' first."
    exit 1
  fi
done

rm -f "./${OUTPUT_ZIP}"

echo "Creating archive '${OUTPUT_ZIP}'..."

zip -r "${OUTPUT_ZIP}" \
  manifest.json \
  icons/ \
  src/ \
  -x "*.DS_Store" \
  -x "*/__pycache__/*" \
  -x "*.pyc"

if [ $? -eq 0 ]; then
  echo "Successfully created '${OUTPUT_ZIP}' in the project root directory."
  echo "Archive is ready for Chrome Web Store submission."
else
  echo "Error: Failed to create zip archive."
  exit 1
fi

echo "Build process completed."
