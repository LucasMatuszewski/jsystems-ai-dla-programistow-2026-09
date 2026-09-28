# Start Copilot CLI in this repository with a small set of pre-approved read-only commands.
# Other commands still ask for approval; denied commands are rejected without a prompt.
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$toolRules = @(
    '--allow-tool=shell(git status:*)'
    '--allow-tool=shell(git diff:*)'
    '--allow-tool=shell(git log:*)'
    '--allow-tool=shell(git show:*)'
    '--deny-tool=shell(git push:*)'
    '--deny-tool=shell(git reset:*)'
    '--deny-tool=shell(git clean:*)'
    '--deny-tool=shell(env:*)'
    '--deny-tool=shell(printenv:*)'
    '--deny-tool=shell(ssh:*)'
    '--deny-tool=shell(scp:*)'
    '--deny-tool=shell(curl:*)'
    '--deny-tool=shell(wget:*)'
    '--deny-tool=write(.env)'
    '--deny-tool=write(.env.local)'
)

Push-Location $repoRoot
try {
    & copilot @toolRules @args
} finally {
    Pop-Location
}
