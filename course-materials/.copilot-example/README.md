# Uprawnienia GitHub Copilot CLI — przykład

Uruchom z katalogu repozytorium:

```powershell
& .\course-materials\.copilot-example\start-copilot.ps1
```

Na Linux/macOS:

```bash
bash course-materials/.copilot-example/start-copilot.sh
```

Przykład automatycznie zatwierdza cztery polecenia do przeglądania zmian i historii Git (`status`, `diff`, `log`, `show`). Odrzuca bez pytania m.in. `git push`, `git reset`, `git clean` oraz zapis plików `.env`. Pozostałe działania nie dostają dodatkowej zgody z tego przykładu; Copilot stosuje zwykłe reguły i wcześniej zapisane decyzje. Reguły obowiązują tylko w sesji uruchomionej tym skryptem. Możesz przekazać własne argumenty do `copilot` po nazwie skryptu.

To **reguły zgód CLI**, a nie izolacja procesu. Nie traktuj ich jako ochrony sekretów przed dowolnym poleceniem powłoki. Dla pracy bez nadzoru użyj także [piaskownicy Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/overview#use-sandboxing) albo odizolowanego środowiska.

Składnia Copilota to `shell(git status:*)`, a nie składnia Claude Code `Bash(git status:*)`. Copilot CLI obecnie nie obsługuje współdzielonych list `allow`/`deny` w `.github/copilot/settings.json`: nieznane klucze repozytorium są ignorowane. Lokalny `~/.copilot/permissions-config.json` zapisuje tylko zatwierdzenia przypisane do bezwzględnej ścieżki repozytorium; nie obsługuje reguł odmowy ani przenośnej konfiguracji dla zespołu. Dlatego przykład używa flag `--allow-tool` i `--deny-tool` przy starcie.

Sprawdzone z Copilot CLI 1.0.88: `git status --short` wykonał się bez pytania, a `git push --help` został odrzucony przed uruchomieniem.

Źródła: [reguły narzędzi](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/allowing-tools), [zakres ustawień i zapisanych zgód](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference), [składnia poleceń](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference).
