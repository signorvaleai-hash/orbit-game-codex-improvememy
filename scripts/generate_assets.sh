#!/usr/bin/env bash
set -euo pipefail

npx @capacitor/assets generate --android --pwa --assetPath ./assets --pwaManifestPath ./manifest.webmanifest --iconBackgroundColor '#07111F' --iconBackgroundColorDark '#07111F' --splashBackgroundColor '#07111F' --splashBackgroundColorDark '#07111F'

mkdir -p ./assets/icons
if [ -f './icons/icon-192.webp' ]; then
  sips -s format png './icons/icon-192.webp' --out './assets/icons/icon-192.png' >/dev/null
fi
if [ -f './icons/icon-512.webp' ]; then
  sips -s format png './icons/icon-512.webp' --out './assets/icons/icon-512.png' >/dev/null
fi

# Override manifest because capacitor-assets rewrites icon paths to ../icons.
cat > ./manifest.webmanifest <<'MANIFEST'
{
  "name": "Orbital Defense",
  "short_name": "Orbital",
  "description": "Arcade survival orbit defense game.",
  "start_url": "./index.html",
  "scope": "./",
  "display": "standalone",
  "background_color": "#07111F",
  "theme_color": "#050508",
  "orientation": "portrait",
  "icons": [
    {
      "src": "./assets/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "./assets/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
MANIFEST

echo 'Generated native assets and PWA PNG icons.'
