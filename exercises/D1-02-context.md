# D1-02: Ask, Plan i dobry kontekst

**Czas:** 90 min. **Cel:** uzyskać ograniczony plan dla zachowania D1 przed edycją.

## Punkt startowy

Przeczytaj [opis problemu](../docs/problem-brief.md), `.github/copilot-instructions.md` i testy wybranego języka. Uruchom testy; dwie asercje `D1` powinny nie przejść. Pozostałe dwa błędy dotyczą D2.

## Zadanie

1. W trybie Ask poproś o opis obecnego zachowania i nazwij asercję, która je obala.
2. W trybie Plan poproś o plan najwyżej trzech kroków, ograniczony do `normalize_title` / `normalizeTitle` w jednym języku. Nie akceptuj planu, który zmienia testy, dodaje zależności lub dotyka drugiego języka.
3. Przed wykonaniem popraw prompt tak, by zawierał konkretne wejście, wynik i wyjątek dla pustego tytułu. Zapisz własną decyzję o granicach zmiany.

**Prompt do skopiowania (D1-02 v1):**

```text
Pracuję tylko w jednej ścieżce: [Python/JavaScript]. Przeczytaj docs/problem-brief.md, .github/copilot-instructions.md, plik tickets i odpowiadające mu testy. W trybie planowania, bez edycji plików, opisz obecny wynik dwóch testów D1. Zaproponuj maksymalnie trzy małe kroki dla normalizacji tytułu: ciągi białych znaków w środku mają stać się jedną spacją, a pusty wynik ma zgłaszać błąd ze słowem title. Nazwij dokładny plik do zmiany, komendę testu, jedno ryzyko i jedno pytanie lub założenie. Nie zmieniaj testów, drugiej ścieżki ani zachowania D2.
```

**Dowód:** plan z plikiem, kryterium i komendą; zanotowana decyzja człowieka. **Gdy utkniesz:** przeczytaj sam nazwy i asercje dwóch testów D1, a potem poproś Ask tylko o wyjaśnienie jednego błędu.
