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

$ErrorActionPreference = 'Stop'

function Write-Allow {
    Write-Output '{"permissionDecision":"allow"}'
    exit 0
}

function Write-Deny([string]$reason) {
    $payload = @{ permissionDecision = 'deny'; permissionDecisionReason = $reason }
    Write-Output ($payload | ConvertTo-Json -Compress)
    exit 0
}

try {
    $raw = [Console]::In.ReadToEnd()
    $data = $raw | ConvertFrom-Json -ErrorAction Stop
}
catch {
    # Malformed/empty input: fail open (don't block the user on a parsing bug).
    Write-Allow
}

$toolName = [string]$data.toolName
$toolArgs = $data.toolArgs

# Regex matches "course-materials" as a path segment or substring, case-insensitive,
# with either slash direction (Windows backslashes or POSIX forward slashes).
$pattern = 'course-materials'

function Test-Blocked([string]$text) {
    if ([string]::IsNullOrWhiteSpace($text)) { return $false }
    return $text -imatch $pattern
}

# Collect every string value worth inspecting, depending on the tool shape.
$candidates = New-Object System.Collections.Generic.List[string]

switch -Regex ($toolName) {
    '^(view)$' {
        if ($toolArgs.path) { $candidates.Add([string]$toolArgs.path) }
    }
    '^(grep|glob)$' {
        if ($toolArgs.paths) {
            if ($toolArgs.paths -is [System.Collections.IEnumerable] -and -not ($toolArgs.paths -is [string])) {
                foreach ($p in $toolArgs.paths) { $candidates.Add([string]$p) }
            } else {
                $candidates.Add([string]$toolArgs.paths)
            }
        }
    }
    '^(bash|powershell)$' {
        if ($toolArgs.command) { $candidates.Add([string]$toolArgs.command) }
    }
    '^(create|edit)$' {
        if ($toolArgs.path) { $candidates.Add([string]$toolArgs.path) }
    }
    default {
        # Other tools (web_fetch, web_search, task, ask_user, update_todo, etc.)
        # are out of scope for this guard.
    }
}

foreach ($candidate in $candidates) {
    if (Test-Blocked $candidate) {
        Write-Deny "Blocked by repository policy: 'course-materials/' holds teaching examples only and must not be read, searched, or globbed during ordinary work (see AGENTS.md). Ask the user to name the exact file if it is genuinely needed."
    }
}

Write-Allow
