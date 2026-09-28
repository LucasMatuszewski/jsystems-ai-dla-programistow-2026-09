# D1-01: VS Code, Copilot i pierwszy diff

**Czas:** 60 min. **Cel:** potwierdzić środowisko i świadomie przyjąć jedną małą sugestię.

## Punkt startowy

Otwórz [opis problemu](../docs/problem-brief.md) oraz `practice/python/tickets.py` **albo** `practice/javascript/tickets.mjs`. Funkcja podsumowania działa. Dwie następne funkcje są celowo nieukończone. Uruchom `python3 scripts/check.py` dla Pythona (Windows: `py -3 scripts/check.py`) albo `node scripts/check.mjs` dla JavaScript; oczekiwane `Workshop files: OK`.

## Zadanie

1. Sprawdź, czy Copilot działa w VS Code i czy możesz przyjąć/odrzucić sugestię w wybranym języku. Wypróbuj zwykłe uzupełnienie oraz Next Edit Suggestions, jeśli jest dostępne w Twojej konfiguracji.
2. Dodaj jeden krótki komentarz obok `summarize_ticket` / `summarizeTicket`, opisujący istniejące zachowanie. Obejrzyj sugestię, popraw ją własnymi słowami i zapisz.
3. Uruchom testy wybranej ścieżki oraz `git diff --check` i `git diff`. Oczekiwany stan początkowy testów: 2 przechodzą, 4 nie przechodzą. Nie naprawiaj ich w tym ćwiczeniu.
4. Cofnij komentarz albo zachowaj go w swoim branchu, podając powód.

**Prompt do skopiowania (D1-01 v1):**

```text
Przeczytaj docs/problem-brief.md i plik tickets w wybranej przeze mnie ścieżce Python albo JavaScript. Nie zmieniaj kodu. Powiedz w dwóch zdaniach, co już działa, a co jest celowo niedokończone. Wskaż jeden bezpieczny komentarz do istniejącej funkcji podsumowania. Nie proponuj rozwiązania funkcji D1/D2 ani zmiany testów. Pokaż komendę sprawdzenia dla mojej ścieżki.
```

**Dowód:** wynik setup check, zrzut/obserwacja sugestii, jeden przejrzany diff. **Gdy utkniesz:** pokaż prowadzącemu dokładny komunikat logowania lub polecenia; ćwiczenie z kodem można wykonać bez sugestii, a funkcję przetestować ręcznie.
