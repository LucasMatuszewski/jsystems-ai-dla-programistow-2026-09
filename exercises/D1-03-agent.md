# D1-03: Agent IDE, debugowanie i testy

**Czas:** 165 min w dwóch blokach. **Cel:** wdrożyć tylko zachowanie D1, sprawdzić testy i diff.

## Punkt startowy

Funkcja `normalize_title` / `normalizeTitle` zwraca jedynie przycięty tytuł. Testy D1 są czerwone. Funkcja priorytetu należy do dnia 2. Uruchom testy wybranej ścieżki i zachowaj dokładny wynik sprzed zmiany.

## Zadanie

1. Przekaż Agentowi IDE plan z D1-02. Ogranicz edycję do pliku produkcyjnego jednego języka.
2. Poproś o jeden mały slice, uruchom testy, przeczytaj błąd, a potem dopiero kolejny slice.
3. Sprawdź, czy testy D1 są zielone, a testy D2 pozostają czerwone. Obejrzyj `git diff --check` oraz pełny `git diff`; odrzuć zbędne zmiany.
4. Przejrzyj nazwy, obsługę białych znaków i treść błędu. Zapisz, co przyjąłeś i dlaczego.

**Prompt do skopiowania (D1-03 v1):**

```text
Wykonaj pierwszy mały slice planu dla D1 w wybranej ścieżce [Python/JavaScript]. Kontekst: docs/problem-brief.md, .github/copilot-instructions.md, plik tickets i testy D1. Zmieniaj tylko produkcyjny plik tickets w tej ścieżce. Cel: normalizacja tytułu ma spełnić dwie asercje D1, bez nowych zależności. Nie zmieniaj testów, funkcji priorytetu ani drugiego języka. Najpierw pokaż krótki plan i wynik testu przed zmianą. Po każdej małej zmianie uruchom testy wybranej ścieżki. Na końcu pokaż dokładny wynik, diff, ryzyko i decyzję, którą musi podjąć człowiek. Nie commituj automatycznie.
```

**Oczekiwany wynik:** 4 testy przechodzą, 2 testy D2 nie przechodzą. **Dowód:** zapis komendy, wyniku i przeglądu diffu. **Gdy utkniesz:** wróć do jednego testu D1; poproś Ask o wyjaśnienie różnicy między oczekiwanym a rzeczywistym wynikiem bez edycji.
