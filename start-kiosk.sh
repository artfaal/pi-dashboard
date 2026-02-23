#!/bin/bash
# Wait until the dashboard frontend is ready, then launch Chromium in kiosk mode
URL="http://localhost:3000"
MAX_WAIT=60
WAITED=0

echo "Waiting for $URL..."
until curl -sf "$URL" > /dev/null 2>&1; do
  if [ $WAITED -ge $MAX_WAIT ]; then
    echo "Timeout waiting for dashboard, starting anyway"
    break
  fi
  sleep 2
  WAITED=$((WAITED + 2))
done

echo "Dashboard ready after ${WAITED}s — launching Chromium kiosk"
exec /usr/bin/chromium \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --ozone-platform=wayland \
  --password-store=basic \
  --disable-features=DialMediaRouteProvider,Translate \
  --disable-session-crashed-bubble \
  --disable-restore-session-state \
  --check-for-update-interval=31536000 \
  "$URL"
