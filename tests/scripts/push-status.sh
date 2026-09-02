#!/usr/bin/env bash
# Pushes a local JSON file into chabaug/sf-status via the GitHub Contents API.
# Usage: push-status.sh <local-file> <path-in-sf-status-repo>
# Requires STATUS_REPO_TOKEN (a token with repo:contents write on sf-status) in the environment.
set -euo pipefail

LOCAL_FILE="$1"
REMOTE_PATH="$2"
REPO="chabaug/sf-status"
API="https://api.github.com/repos/$REPO/contents/$REMOTE_PATH"

SHA=$(curl -s -H "Authorization: Bearer $STATUS_REPO_TOKEN" "$API" | jq -r '.sha // empty')
CONTENT_B64=$(base64 -w0 "$LOCAL_FILE")

if [ -n "$SHA" ]; then
  BODY=$(jq -n --arg msg "Update $REMOTE_PATH" --arg content "$CONTENT_B64" --arg sha "$SHA" \
    '{message:$msg, content:$content, sha:$sha}')
else
  BODY=$(jq -n --arg msg "Add $REMOTE_PATH" --arg content "$CONTENT_B64" \
    '{message:$msg, content:$content}')
fi

RESULT=$(curl -s -X PUT -H "Authorization: Bearer $STATUS_REPO_TOKEN" -H "Content-Type: application/json" -d "$BODY" "$API")
echo "$RESULT" | jq -r '.commit.sha // .message'
