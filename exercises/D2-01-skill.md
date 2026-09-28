# D2-01: publiczna umiejętność `write-adr`

**Czas:** 60 min. **Cel:** zainstalować umiejętność ze znanego źródła i użyć jej do małej decyzji projektowej.

## Punkt startowy

Publiczne repozytorium EdukeyTeam/agent-toolbox zawiera umiejętności `write-prd`, `write-adr` i `create-design-system`. Nazwy sprawdź ponownie podczas warsztatu. Materiał źródłowy: [publiczne EdukeyTeam/agent-toolbox](https://github.com/EdukeyTeam/agent-toolbox). Nie kopiuj folderu umiejętności ręcznie.

## Zadanie

1. W katalogu **tymczasowej kopii** projektu uruchom:

   ```bash
   npx --yes skills@latest add EdukeyTeam/agent-toolbox --list
   npx --yes skills@latest add EdukeyTeam/agent-toolbox --skill write-adr --agent github-copilot -y
   ```

2. Potwierdź pochodzenie i zawartość `.agents/skills/write-adr/SKILL.md` oraz `skills-lock.json`. W swojej konfiguracji sprawdź rzeczywistą ścieżkę instalacji i dostępność umiejętności w Copilot Chat.
3. Poproś o krótkie ADR: czy funkcja priorytetu ma używać prostych reguł deterministycznych, czy usługi modelowej? Podaj przypadek syntetycznych zgłoszeń, brak sieci i testowalność jako kontekst. Zapisz decyzję w kopii ćwiczeniowej, bez wklejania tekstu umiejętności do repo.

**Prompt do skopiowania (D2-01 v1):**

```text
Użyj zainstalowanej umiejętności write-adr, jeśli jest dostępna w tej powierzchni Copilot. Kontekst: docs/problem-brief.md oraz testy D2 dla syntetycznych zgłoszeń. Decyzja: deterministyczne reguły lokalne czy wywołanie usługi modelowej dla klasyfikacji priorytetu? Ograniczenia: dwa dni warsztatu, praca offline bez kluczy, wynik powtarzalny w Pythonie i JavaScript, człowiek zatwierdza kod. Przygotuj krótki ADR z kontekstem, rozważonymi opcjami, decyzją, konsekwencjami i sposobem weryfikacji. Nie implementuj kodu. Jeśli umiejętność nie jest widoczna, powiedz to wprost i użyj zwykłego prompta z tym samym kontekstem.
```

**Dowód:** nazwa, ścieżka i wynik instalatora, krótki ADR, obserwacja aktywacji. **Gdy utkniesz:** wykonaj polecenia w nowym pustym katalogu i sprawdź dostęp instalatora do GitHub; decyzję można zapisać ręcznie, gdy agent nie obsługuje umiejętności.
