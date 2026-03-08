#!/bin/bash
while true; do
  if ! pgrep -f "node dist/index.js" > /dev/null; then
    echo "$(date): YodaClaw not running, starting..." >> /tmp/yodaclaw_watchdog.log
    cd /home/pjq/clawd/YodaClaw && node dist/index.js >> /tmp/yodaclaw.log 2>&1 &
  fi
  sleep 30
done
