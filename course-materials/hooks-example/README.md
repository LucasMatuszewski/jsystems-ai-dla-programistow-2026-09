# Hook blokujący sekrety: Copilot, Claude Code i Codex

Jeden skrypt, trzy narzędzia. Hook uruchamia się **przed każdym użyciem narzędzia** przez agenta i blokuje wywołanie, jeśli dotyczy pliku z sekretami: `.env`, `.env.local`, katalogu `secrets/`, prywatnego klucza SSH albo pliku `.pem`. Pliki `.env.example`, `.env.sample` i `.env.template` są dozwolone.

Wszystkie trzy narzędzia przekazują hookowi planowane wywołanie jako JSON na standardowym wejściu i traktują kod wyjścia `2` jako odmowę. Dlatego [block-secrets.sh](block-secrets.sh) działa w każdym z nich bez zmian. [block-secrets.ps1](block-secrets.ps1) to wersja dla Copilota na Windows.

## Instalacja

| Narzędzie | Skopiuj | Uwagi |
|---|---|---|
| GitHub Copilot CLI, cloud agent, VS Code | [copilot/block-secrets.json](copilot/block-secrets.json), `block-secrets.sh` i `block-secrets.ps1` do `.github/hooks/` | VS Code obsługuje hooki w wersji preview (`chat.useHooks`, domyślnie włączone) |
| Claude Code | [claude/settings.json](claude/settings.json) do `.claude/settings.json` (scal z istniejącym), `block-secrets.sh` do `.claude/hooks/` | na Windows hooki działają przez Git Bash |
| Codex | [codex/hooks.json](codex/hooks.json) do `.codex/hooks.json`, `block-secrets.sh` do `.codex/hooks/` | hooki projektu trzeba raz zatwierdzić komendą `/hooks` |

## Sprawdź, czy działa

Bez agenta, prosto w terminalu:

```bash
echo '{"toolName":"bash","toolArgs":{"command":"cat .env"}}' | bash .github/hooks/block-secrets.sh; echo "exit $?"
echo '{"toolName":"view","toolArgs":{"path":".env.example"}}' | bash .github/hooks/block-secrets.sh; echo "exit $?"
```

Pierwsze polecenie kończy się kodem `2` (zablokowane), drugie kodem `0`. Potem poproś agenta o odczytanie `.env` w repozytorium testowym: odpowie, że hook zablokował wywołanie, i poda powód.

## Czy hook reaguje tylko na zdarzenia?

Tak, ale zdarzenie `preToolUse` / `PreToolUse` obejmuje każde wywołanie narzędzia, a hook dostaje jego pełne argumenty: polecenie powłoki, ścieżkę pliku, wzorzec wyszukiwania. Filtrowanie odbywa się na trzech poziomach:

- **matcher** zawęża hook do wybranych narzędzi, np. `Bash|Read` (Claude Code, Codex, Copilot CLI; wyrażenie regularne na nazwie narzędzia),
- **`if`** w Claude Code zawęża hook do argumentów w składni reguł uprawnień, np. `"if": "Bash(git commit *)"` albo `"if": "Edit(pom.xml)"` (przykład w [.claude/settings.json](../../.claude/settings.json) tego repozytorium),
- **skrypt** sam sprawdza plik lub polecenie w otrzymanym JSON-ie, tak jak ten przykład.

Hook to kod, więc zadziała także tam, gdzie reguły `allow`/`deny` nie wystarczą: może sprawdzić treść zapisu, zmodyfikować argumenty albo zapisać log.

## Dokumentacja

- [Copilot: hooki](https://docs.github.com/en/copilot/concepts/agents/hooks) i [dokumentacja referencyjna](https://docs.github.com/en/copilot/reference/hooks-reference)
- [VS Code: hooki agenta](https://code.visualstudio.com/docs/copilot/customization/hooks)
- [Claude Code: hooki](https://code.claude.com/docs/en/hooks-guide)
- [Codex: hooki](https://developers.openai.com/codex/hooks)
