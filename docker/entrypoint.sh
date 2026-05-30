#!/bin/sh
# Start as root only long enough to make the bind-mounted data dir writable by
# the unprivileged `node` user, then drop privileges and run the server as that
# user, so an app-level RCE never has root on the host volume.
set -e
mkdir -p /app/.data
chown -R node:node /app/.data 2>/dev/null || true
exec su-exec node:node node .output/server/index.mjs
