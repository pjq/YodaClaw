#!/bin/bash
# Start YodaClaw with starter info
STARTER=${1:-"Manual"}
cd /home/pjq/clawd/YodaClaw
STARTUP_BY="$STARTER" node dist/index.js "$STARTER" > /tmp/yodaclaw.log 2>&1 &
echo "YodaClaw started by $STARTER"
