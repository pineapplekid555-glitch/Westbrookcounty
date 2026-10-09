#!/usr/bin/env bash
# Usage: SERVER_KEY=wbk_... ./curl.sh
BASE=https://westbrookcounty.co.uk/api/v1
H="server-key: ${SERVER_KEY:?set SERVER_KEY first}"

curl -s "$BASE/server"                  -H "$H"; echo
curl -s "$BASE/server/players"          -H "$H"; echo
curl -s "$BASE/server/logs?limit=10"    -H "$H"; echo
curl -s -X POST "$BASE/server/command"  -H "$H" -H "Content-Type: application/json" \
     -d '{"command": ":h Hello from the API"}'; echo
