# D2-02: issue → agent chmurowy → pull request

**Czas:** 90 min. **Cel:** zlecić ograniczone zadanie z jasnym kontraktem i przejrzeć wynik. Agent chmurowy GitHub i Agent w VS Code są osobnymi środowiskami.

## Punkt startowy

Po D1 dwa testy D2 nadal są czerwone. Przygotuj issue na podstawie [opisu problemu](../docs/problem-brief.md) i testów wybranego języka. Nie przekazuj prywatnych danych. Użycie agenta chmurowego wymaga uprawnienia i włączenia przez organizację; w planie Business może być domyślnie wyłączone.

## Zadanie

1. Utwórz issue w dostępnym repo ćwiczeniowym, jeśli prowadzący potwierdził dostęp. Opisz wejście, `high` dla `blocked` lub `severity == 1`, `normal` w pozostałym przypadku, jeden język, komendę testu i granice edycji.
2. Jeśli agent chmurowy jest dostępny, przypisz mu issue zgodnie z ustawieniami organizacji, poczekaj na draft PR i przejrzyj zmienione pliki, testy, log sesji i uprawnienia. Nie akceptuj automatycznie.
3. **Wariant lokalny:** jeśli nie ma dostępu do agenta chmurowego lub repo zdalnego, zapisz issue w `docs/issue-draft.md` w swojej kopii, wykonaj zadanie Agentem IDE na osobnym branchu i obejrzyj `git diff main...HEAD` jako odpowiednik review PR.

**Prompt/treść issue do skopiowania (D2-02 v1):**

```text
Tytuł: Syntetyczne zgłoszenia - klasyfikacja priorytetu
Cel: W wybranej ścieżce [Python/JavaScript] uzupełnij classify_priority/classifyPriority. Zwróć high, gdy blocked jest prawdziwe lub severity wynosi 1; w pozostałych przypadkach zwróć normal.
Kontekst: docs/problem-brief.md, .github/copilot-instructions.md i testy D2 wybranego języka.
Granice: zmień tylko plik produkcyjny wybranej ścieżki. Bez sieci, nowych zależności, danych realnych i edycji testów lub drugiego języka.
Weryfikacja: uruchom pełny zestaw testów wybranej ścieżki i git diff --check. W opisie PR pokaż wynik przed/po, listę plików, ryzyko i każdą decyzję wymagającą człowieka. Nie merge'uj PR.
```

**Dowód:** link do issue/PR lub lokalny issue i diff, wynik testów, własna decyzja o zmianie. **Gdy utkniesz:** przejdź na wariant lokalny bez czekania na zmianę polityki organizacji.
