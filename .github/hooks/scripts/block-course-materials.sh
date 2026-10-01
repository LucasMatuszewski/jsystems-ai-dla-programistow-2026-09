#!/bin/bash
# preToolUse hook: deny any tool call that reads/searches/greps/globs or shells
# into the course-materials/ folder, or otherwise references it in arguments.
#
# Rationale (see AGENTS.md / CLAUDE.md): course-materials/ holds teaching
# examples (sample PRDs, ADRs, prompts) that must never be browsed, searched,
# or used to infer requirements/conventions during ordinary application work.
# Agents may only open a named file there when the user explicitly asks.
#
# Input: JSON on stdin -> { sessionId, timestamp, cwd, toolName, toolArgs }
# Output: JSON on stdout -> { permissionDecision: "allow" | "deny", permissionDecisionReason? }

set -euo pipefail

input="$(cat)"

# Fail open if jq is unavailable or input is malformed.
if ! command -v jq >/dev/null 2>&1; then
  echo '{"permissionDecision": "allow"}'
  exit 0
fi

if ! echo "$input" | jq -e . >/dev/null 2>&1; then
  echo '{"permissionDecision": "allow"}'
  exit 0
fi

tool_name=$(echo "$input" | jq -r '.toolName // empty')

candidates=()
case "$tool_name" in
  view|create|edit)
    path=$(echo "$input" | jq -r '.toolArgs.path // empty')
    [ -n "$path" ] && candidates+=("$path")
    ;;
  grep|glob)
    # paths may be a string or an array of strings
    while IFS= read -r p; do
      [ -n "$p" ] && candidates+=("$p")
    done < <(echo "$input" | jq -r '
      .toolArgs.paths as $p
      | if ($p == null) then empty
        elif ($p | type) == "array" then $p[]
        else $p
        end')
    ;;
  bash|powershell)
    command=$(echo "$input" | jq -r '.toolArgs.command // empty')
    [ -n "$command" ] && candidates+=("$command")
    ;;
  *)
    ;;
esac

for candidate in "${candidates[@]+"${candidates[@]}"}"; do
  if echo "$candidate" | grep -qi 'course-materials'; then
    reason="Blocked by repository policy: 'course-materials/' holds teaching examples only and must not be read, searched, or globbed during ordinary work (see AGENTS.md). Ask the user to name the exact file if it is genuinely needed."
    jq -nc --arg reason "$reason" '{permissionDecision: "deny", permissionDecisionReason: $reason}'
    exit 0
  fi
done

echo '{"permissionDecision": "allow"}'
