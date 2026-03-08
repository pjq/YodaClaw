#!/bin/bash
cd /home/pjq/clawd/YodaClaw
while true; do
  if ! pgrep -f "node dist/index.js" > /dev/null 2>&1; then
    echo "$(date): Starting YodaClaw..." >> /tmp/yodaclaw_watchdog.log
    node dist/index.js >> /tmp/yodaclaw.log 2>&1
    echo "$(date): YodaClaw exited with code $?" >> /tmp/yodaclaw_watchdog.log
  else
    echo "$(date): YodaClaw already running, waiting..." >> /tmp/yodaclaw_watchdog.log
  fi
  sleep 10
done
