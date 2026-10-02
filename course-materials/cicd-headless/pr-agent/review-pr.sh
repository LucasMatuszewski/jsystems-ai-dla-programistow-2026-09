#!/usr/bin/env bash
# Portable community PR-Agent launcher. Execute from trusted CI configuration.
set -euo pipefail

command_name="${1:-review}"
case "$command_name" in
  review|describe|improve) ;;
  *) printf 'Allowed commands: review, describe, improve\n' >&2; exit 2 ;;
esac

: "${PR_AGENT_IMAGE:?Set an approved digest-pinned PR-Agent CLI image}"
: "${GIT_PLATFORM:?Set github, gitlab, bitbucket, bitbucket_server or azure}"
: "${PR_URL:?Set the full PR URL from trusted job metadata}"
: "${REVIEW_MODEL:?Set an approved Anthropic model identifier}"
: "${ANTHROPIC__KEY:?Inject the Anthropic API key}"
if [[ ! "$PR_AGENT_IMAGE" =~ @sha256:[a-f0-9]{64}$ ]]; then
  printf 'PR_AGENT_IMAGE must end with @sha256:<64 hex characters>\n' >&2
  exit 2
fi

args=(run --rm --cap-drop ALL --security-opt no-new-privileges
  --env "CONFIG__GIT_PROVIDER=$GIT_PLATFORM"
  --env "CONFIG__MODEL=$REVIEW_MODEL"
  --env 'CONFIG__FALLBACK_MODELS=[]'
  --env 'CONFIG__RESTRICTED_MODE=true'
  --env 'CONFIG__PROPAGATE_TOOL_ERRORS=true'
  --env 'PR_REVIEWER__PERSISTENT_COMMENT=true'
  --env 'PR_REVIEWER__INLINE_KEY_ISSUES=false'
  --env 'PR_REVIEWER__NUM_MAX_FINDINGS=5'
  --env 'PR_DESCRIPTION__PUBLISH_DESCRIPTION_AS_COMMENT=true'
  --env ANTHROPIC__KEY --entrypoint python)

case "$GIT_PLATFORM" in
  github)
    : "${GITHUB__USER_TOKEN:?Inject a GitHub bot token}"
    server_url="https://github.com"
    args+=(--env GITHUB__USER_TOKEN)
    ;;
  gitlab)
    : "${GITLAB__URL:?Set the GitLab HTTPS base URL}"
    : "${GITLAB__PERSONAL_ACCESS_TOKEN:?Inject a GitLab bot token}"
    server_url="$GITLAB__URL"
    args+=(--env GITLAB__URL --env GITLAB__PERSONAL_ACCESS_TOKEN)
    ;;
  bitbucket)
    : "${BITBUCKET__BEARER_TOKEN:?Inject a Bitbucket Cloud repository access token}"
    server_url="https://bitbucket.org"
    args+=(--env 'BITBUCKET__AUTH_TYPE=bearer' --env BITBUCKET__BEARER_TOKEN)
    ;;
  bitbucket_server)
    : "${BITBUCKET_SERVER__URL:?Set the Bitbucket Server/Data Center HTTPS base URL}"
    : "${BITBUCKET_SERVER__BEARER_TOKEN:?Inject a Bitbucket HTTP access token}"
    server_url="$BITBUCKET_SERVER__URL"
    args+=(--env BITBUCKET_SERVER__URL --env BITBUCKET_SERVER__BEARER_TOKEN)
    ;;
  azure)
    : "${AZURE_DEVOPS__ORG:?Set the Azure DevOps organization URL}"
    : "${AZURE_DEVOPS__PAT:?Inject an Azure DevOps bot PAT}"
    server_url="$AZURE_DEVOPS__ORG"
    args+=(--env AZURE_DEVOPS__ORG --env AZURE_DEVOPS__PAT)
    ;;
  *) printf 'Unsupported provider\n' >&2; exit 2 ;;
esac

# Validate origin and optional server/org path before forwarding credentials.
python3 - "$server_url" "$PR_URL" <<'PY'
import sys
from urllib.parse import urlsplit
base, target = map(urlsplit, sys.argv[1:])
if (base.scheme != 'https' or target.scheme != 'https'
    or base.netloc != target.netloc or base.username or target.username
    or base.query or base.fragment or target.query or target.fragment
    or not target.path.startswith(base.path.rstrip('/') + '/')):
    sys.exit('PR URL must belong to the configured HTTPS Git service')
PY

# Forward secret variable names; no secret values appear in the command line.
docker "${args[@]}" "$PR_AGENT_IMAGE" -m pr_agent.cli --pr_url "$PR_URL" "$command_name"
