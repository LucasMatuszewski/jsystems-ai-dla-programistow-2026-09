# D2-03: instrukcje, prompt files, custom agents, MCP i CLI

**Czas:** 90 min. **Cel:** wybrać najmniejszą konfigurację, która realnie pomaga zadaniu, i sprawdzić jej zasięg.

## Punkt startowy

Repo zawiera [instrukcje dla Copilot](../.github/copilot-instructions.md) i [plik prompta do review](../.github/prompts/review-ticket.prompt.md). Pierwszy plik opisuje repo szeroko; drugi dotyczy jednego powtarzalnego zadania. Nie zakładaj, że Copilot Chat w VS Code, GitHub.com, Copilot CLI i inne IDE obsługują identyczne pliki lub polityki.

## Zadanie

1. Otwórz oba pliki i sprawdź, czy odpowiadają stanowi wybranej ścieżki. W swojej kopii dopisz do instrukcji jedną rzecz, którą agent powinien wiedzieć o komendzie testów, a do prompta review jedno pytanie o osłabienie testu. Sprawdź diff i usuń duplikaty.
2. Wywołaj prompt review w obsługiwanej powierzchni i zapisz, czy agent rzeczywiście użył pliku. Jeśli nie, wklej jego pełną treść do chatu i zanotuj różnicę.
3. Jeśli Twoja powierzchnia Copilot obsługuje [projektowe custom agenty](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/create-custom-agents-in-your-ide?tool=vscode), utwórz w swojej kopii `.github/agents/ticket-review.agent.md` z frontmatter `name: ticket-review` i `description: Reviews synthetic ticket changes`, a w treści zapisz 3-5 zdań o roli, kryteriach i zakazie edycji. Sprawdź w interfejsie, czy agent jest widoczny i jakie ma narzędzia; użyj go tylko do odczytu diffu. Gdy brak wsparcia, zapisz tę samą treść jako `docs/agent-profile-draft.md` i porównaj z prompt file.
4. Sprawdź, czy organizacja dopuściła MCP i Copilot CLI. Jeśli tak, wybierz wyłącznie zatwierdzone źródło i wykonaj mały odczyt bez sekretów. Jeśli nie, opisz uprawnienia, które trzeba uzgodnić, i przeprowadź review w VS Code. Zwróć uwagę na zużycie AI Credits dla płatnych żądań w planie organizacji; nie podawaj kosztu pojedynczego ćwiczenia bez aktualnych danych.

**Prompt do skopiowania (D2-03 v1):**

```text
Przeczytaj .github/copilot-instructions.md, .github/prompts/review-ticket.prompt.md i docs/problem-brief.md. Nie edytuj kodu. Wskaż jedno repozytoryjne zalecenie, które powinno zostać w instrukcjach, jedno zadaniowe zalecenie, które należy do prompt file, i jedną sytuację, w której osobny custom agent byłby uzasadniony. Dla każdej pozycji podaj konkretny powód z tego repo. Następnie oceń, czy do przeglądu lokalnego diffu potrzebny jest MCP albo CLI; jeśli nie, zaproponuj prostszy test w VS Code. Nie twierdź, że masz dostęp do narzędzi lub polityk organizacji bez dowodu.
```

**Dowód:** diff konfiguracji, obserwacja działania prompta, krótka tabela zasięgu i uprawnień. **Gdy utkniesz:** użyj pełnego tekstu prompta ręcznie w Chat i zapisz ograniczenie środowiska.
