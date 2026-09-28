# D2-04: pełny przepływ i decyzja człowieka

**Czas:** 75 min. **Cel:** zakończyć wybrany track od issue do review i demo.

## Punkt startowy

Issue z D2-02 opisuje zachowanie priorytetu. Testy D1 powinny być zielone po dniu 1, testy D2 czerwone do chwili implementacji. Wersja źródłowa repo nadal pozostaje ćwiczeniowym starterem.

## Zadanie

1. Otwórz issue, zapisz 3-5 kroków planu i sprawdź, czy obejmuje tylko wybrany język.
2. Wprowadź implementację małymi zmianami, uruchom pełny zestaw testów oraz `git diff --check`.
3. Otwórz PR w zatwierdzonym repo ćwiczeniowym albo przygotuj lokalny branch i diff. Uruchom prompt z `.github/prompts/review-ticket.prompt.md`; sprawdź jego ustalenia samodzielnie.
4. Odrzuć lub popraw błędne sugestie. Zademonstruj jedno wejście `high` i jedno `normal`, a potem zapisz decyzję o akceptacji z wynikiem testów.

**Prompt do skopiowania (D2-04 v1):**

```text
Pracuję nad issue o klasyfikacji priorytetu w ścieżce [Python/JavaScript]. Przeczytaj docs/problem-brief.md, .github/copilot-instructions.md, issue i testy wybranego języka. Najpierw podaj krótki plan z granicą plików i kryterium akceptacji. Następnie wykonaj jeden mały slice w pliku produkcyjnym bez edycji testów i bez nowych zależności. Uruchom pełny zestaw testów wybranej ścieżki i git diff --check. Na końcu pokaż wynik przed/po, diff, ryzyko i propozycję opisu PR. Nie wysyłaj kodu ani nie merge'uj bez mojego przeglądu.
```

**Oczekiwany wynik:** 6 z 6 testów wybranego języka zielonych, czysty `git diff --check`, przegląd bez otwartych blokujących uwag. **Gdy utkniesz:** wróć do dokładnie jednego czerwonego testu i poproś o wyjaśnienie, nie o cały nowy patch.
