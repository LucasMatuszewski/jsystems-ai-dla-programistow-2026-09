# Community PR-Agent across Git platforms

Checked on **2 October 2026** against [release v0.47.0](https://github.com/The-PR-Agent/pr-agent/releases/tag/v0.47.0), source commit `8e5a9295973b24af4b70cafd0b660a230811ef9e`, and the published Docker manifests.

**Qodo and PR-Agent are separate products.** Qodo announced the community handover on 23 April 2026. The open-source project now lives at [The-PR-Agent/pr-agent](https://github.com/The-PR-Agent/pr-agent) under MIT; Qodo's commercial review platform continues separately. Old `qodo-ai/pr-agent` links redirect, but use the community repository and [community documentation](https://docs.pr-agent.ai/) for these examples. [Handover announcement](https://www.qodo.ai/blog/qodo-is-handing-pr-agent-over-to-the-community/).

For the complete comparison, deployment architecture, security, review quality, exercises and older-server compatibility, read the [AI-assisted pull requests and code reviews handbook](../../Research/ai-assisted-pull-requests-course-handbook.md).

## Examples and boundaries

| Git host | CI example | Provider | Credential variables |
|---|---|---|---|
| GitHub.com | [GitHub Actions](../github-actions/qodo-pr-agent-review.yml) | `github` | Action: `GITHUB_TOKEN`; CLI: `GITHUB__USER_TOKEN` |
| GitLab.com / Self-Managed | [GitLab CI](gitlab-ci.yml) | `gitlab` | `GITLAB__URL`, `GITLAB__PERSONAL_ACCESS_TOKEN` |
| Bitbucket Cloud | [Bitbucket Pipelines](bitbucket-pipelines.yml) | `bitbucket` | `BITBUCKET__AUTH_TYPE=bearer`, `BITBUCKET__BEARER_TOKEN` |
| Bitbucket Server / Data Center | [Jenkins](Jenkinsfile) or [portable launcher](review-pr.sh) | `bitbucket_server` | `BITBUCKET_SERVER__URL`, `BITBUCKET_SERVER__BEARER_TOKEN` |
| Azure Repos Git | [Azure Pipelines](azure-pipelines.yml) | `azure` | `AZURE_DEVOPS__ORG`, `AZURE_DEVOPS__PAT` |

The provider selects the Git API adapter; CI only launches it. GitLab requires **15.7+** and the MR `/diffs` API. Bitbucket Cloud and Server/DC have different URLs and credentials. Azure Repos Git requires target-branch **Build Validation**; YAML `pr:` does not trigger Azure Repos PR builds. Tools, summary comments, inline findings and suggestions have different support across providers. Start with a summary, then check the [provider matrix](https://docs.pr-agent.ai/overview/supported_platforms/) for the selected feature.

Every example requires **`REVIEW_MODEL`** (an approved, available `anthropic/<model>` ID) and a secured **`ANTHROPIC__KEY`**. GitHub instead uses repository variable `PR_AGENT_MODEL` and secret `ANTHROPIC_API_KEY`, mapped into PR-Agent's settings. Select a model available to your account; these examples do not assume access to a particular model. To use another model provider, replace the model identifier and credential configuration together using the [model guide](https://docs.pr-agent.ai/usage-guide/changing_a_model/). API billing is separate from a coding CLI subscription.

## What changed in the historical Qodo workflow

- The existing filename is preserved, but its title and runtime now identify community PR-Agent.
- Automatic runs use the versioned, digest-pinned **GitHub Action image**. The upstream `The-PR-Agent/pr-agent@v0.47.0` action references rolling `pragent/pr-agent:github_action`; pinning only its Git ref does not pin the container. This example pins both the runtime version and digest.
- `workflow_dispatch` now requires a PR number and invokes the **CLI** explicitly. The v0.47.0 action runner has no `workflow_dispatch` event handler, so a manual dispatch alone does not review a PR.
- `synchronize` uses the current push-trigger configuration with explicit commands. Automatic opening/reopening and maintainer comment commands use the action runner.
- Current spelling is `committable_code_suggestions`; the older `commitable_code_suggestions` alias is deprecated. Old settings absent from the current configuration, including suggestion checkboxes, wiki tracking and `suggestions_depth`, were removed. Commercial `/test` documentation is not a community-tool guarantee.
- GitHub uses `contents: read`, `issues: write` and `pull-requests: write`; description output is a comment, and restricted mode blocks elevated operations. No local checkout is required.

The manual GitHub job runs `review` only. Automatic GitHub runs also generate description comments and improvement suggestions. The other platform examples run `review`; add explicit `describe` or `improve` calls only after verifying the platform's support and permissions.

## Reproducible runtime

The CLI image is:

```text
pragent/pr-agent:0.47.0@sha256:7d98954c29289846a08faf00aaea0f1f1375b1676cd8a2ed303e0af07010af7a
```

The GitHub Action image is:

```text
pragent/pr-agent:0.47.0-github_action@sha256:31b9aac6ab067bada9a0c1b001d30ebc500ea4487e00a93c18c59b9ef5fa66db
```

These are multi-platform manifest digests inspected in the public registry on the date above. Recheck the release, changelog, dependency policy and digest when upgrading. A tag or GitHub Action image is not interchangeable with a CLI image: the CLI image has an entrypoint. These examples clear/override that entrypoint and run `python -m pr_agent.cli` from `/app`.

## Portable Docker launcher

[review-pr.sh](review-pr.sh) runs the same CLI from Jenkins, another CI system or a trusted local shell. It supports all five providers in the table, validates the configured Git service URL, requires a digest-pinned image and forwards credential variable names rather than values in command arguments.

Example non-secret configuration for Bitbucket Server/DC:

```bash
export PR_AGENT_IMAGE='pragent/pr-agent:0.47.0@sha256:7d98954c29289846a08faf00aaea0f1f1375b1676cd8a2ed303e0af07010af7a'
export GIT_PLATFORM=bitbucket_server
export BITBUCKET_SERVER__URL='https://bitbucket.example.com'
export PR_URL='https://bitbucket.example.com/projects/COURSE/repos/demo/pull-requests/7'
export REVIEW_MODEL='<approved-anthropic-model-id>'
# ANTHROPIC__KEY and BITBUCKET_SERVER__BEARER_TOKEN are injected by CI.
bash review-pr.sh review
```

`review`, `describe` and `improve` are CLI commands. `/review`, `/describe`, `/improve` and `/ask` are comment commands **only when an event listener is deployed**. GitLab/Bitbucket/Azure pipeline execution can publish comments, but it does not listen for slash commands in comments. Add an authenticated webhook service separately for that behavior. The GitHub workflow includes the `issue_comment` integration and limits its triggers to repository maintainers.

## Credentials and trusted execution

Use a dedicated bot. Grant API read and comment/label permissions for the enabled outputs. Writing a description, approving a PR, pushing a branch and merging are separate operations; do not grant them merely because the reviewer can comment. GitLab `CI_JOB_TOKEN` is not a general MR-comment write credential. Bitbucket examples use repository/HTTP access tokens; legacy app passwords are not a setup option.

Keep model fallbacks explicitly empty and enable `CONFIG__PROPAGATE_TOOL_ERRORS=true`. Failures and incomplete diffs must remain visible; an AI error does not prove that a PR has no defects. GitLab's manual job is advisory during the pilot.

Protect the pipeline definition, `.pr_agent.toml` on the default branch, model routing and prompts. A contributor who can edit a secret-bearing pipeline can exfiltrate its secrets even if the job has no checkout. The direct YAML examples are for an approved internal training repository; use a trusted external pipeline/template or webhook controller before accepting untrusted branches/forks. In Jenkins, the installed launcher and pipeline definition must come from trusted configuration, not a PR-provided Jenkinsfile. Do not disable TLS verification for self-managed hosts.

## Verification and first live run

Offline launcher tests:

```bash
python3 -m unittest discover -s course-materials/cicd-headless/pr-agent -p 'test_*.py' -v
```

The tests execute the real shell wrapper with a synthetic Docker executable and cover provider routing, CLI arguments, secret-name forwarding and rejection before execution. YAML syntax, current configuration keys and published image manifests were checked. **No authenticated live PR review has been performed by these checks.**

Before adoption, run one synthetic PR on each chosen host: confirm a comment appears; introduce and fix a real defect; rerun; inspect comment persistence, bot identity, diff coverage and error behavior. Separately test `describe`/`improve` and a comment-triggered run if enabled. Do not treat passing launcher tests as platform integration evidence.

## Primary sources

- [v0.47.0 action runner](https://github.com/The-PR-Agent/pr-agent/blob/v0.47.0/pr_agent/servers/github_action_runner.py), [configuration](https://github.com/The-PR-Agent/pr-agent/blob/v0.47.0/pr_agent/settings/configuration.toml), [Docker entrypoints](https://github.com/The-PR-Agent/pr-agent/blob/v0.47.0/docker/Dockerfile), [release image publishing](https://github.com/The-PR-Agent/pr-agent/blob/v0.47.0/.github/workflows/publish.yml)
- [GitHub integration](https://docs.pr-agent.ai/installation/github/), [CLI installation](https://docs.pr-agent.ai/installation/locally/)
- [GitLab integration](https://docs.pr-agent.ai/installation/gitlab/), [Bitbucket Cloud and Server/DC](https://docs.pr-agent.ai/installation/bitbucket/), [Azure DevOps integration](https://docs.pr-agent.ai/installation/azure/)
