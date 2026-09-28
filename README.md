# AI dla programistów - od pomysłu do MVP (JSystems)

**Materiały szkoleniowe: [devpowers.com/szkolenia/jsystems/ai-dla-programistow-2026-09](https://devpowers.com/szkolenia/jsystems/ai-dla-programistow-2026-09/)**

- [Agenda i wszystkie materiały](https://devpowers.com/szkolenia/jsystems/ai-dla-programistow-2026-09/agenda.html)
- [Slajdy: Dzień 1](https://devpowers.com/szkolenia/jsystems/ai-dla-programistow-2026-09/Prezentacja_Dzien1.html) · [Dzień 2](https://devpowers.com/szkolenia/jsystems/ai-dla-programistow-2026-09/Prezentacja_Dzien2.html)
- [Biblioteka promptów](https://devpowers.com/szkolenia/jsystems/ai-dla-programistow-2026-09/prompty.html) · [Ćwiczenia](https://devpowers.com/szkolenia/jsystems/ai-dla-programistow-2026-09/cwiczenia.html) · [Checklisty](https://devpowers.com/szkolenia/jsystems/ai-dla-programistow-2026-09/checklisty.html) · [Słownik AI](https://devpowers.com/szkolenia/jsystems/ai-dla-programistow-2026-09/slownik-ai.html)
- [Wyniki ankiety przed szkoleniem](https://devpowers.com/szkolenia/jsystems/ai-dla-programistow-2026-09/raport-przed.html) · [Odpowiedzi na pytania z kursu](https://devpowers.com/szkolenia/jsystems/ai-dla-programistow-2026-09/pytania.html) (uzupełniamy po każdym dniu)

---

Repozytorium uczestnika szkolenia [JSystems](https://jsystems.pl) (28.09-02.10.2026, online, 09:00-16:00). Przez pięć dni przechodzimy pełny cykl wytwarzania oprogramowania z agentami AI: od pomysłu i wymagań (PRD), przez decyzje architektoniczne (ADR), plan, implementację i testy, po code review, bezpieczeństwo i CI/CD.

Głównym agentem warsztatu jest **OpenAI Codex CLI**, a te same koncepcje pokazujemy także w **Claude Code** i **GitHub Copilot**. Możesz pracować w swoim stosie (np. C# / .NET, Java, Python); przykład prowadzącego powstaje w TypeScript.

Głównym projektem grupy jest aplikacja do obsługi zwrotów i reklamacji elektroniki, rozwijana według PRD uzgodnionego podczas zajęć. Możesz też pracować nad własnym pomysłem, stosując ten sam proces. Po PRD omów architekturę i biblioteki, zapisz decyzje w ADR, ułóż plan i zależności zadań, a potem implementuj, testuj i przeglądaj zmiany przed utworzeniem PR. Przykładowy prompt PRD w `course-materials/` nie zastępuje dokumentu poprawionego z grupą.

Poniższe ścieżki Python i JavaScript to ćwiczenie zapasowe, gdy praca nad wybraną aplikacją jest zablokowana; zawierają syntetyczne dane, celowo niedokończone funkcje i testy opisujące oczekiwane zachowanie.

## Ćwiczenie zapasowe: zacznij w 5 minut

1. Jeśli prowadzący wybierze ćwiczenie zapasowe, sklonuj repozytorium i otwórz katalog w VS Code. Wybierz `practice/python/` albo `practice/javascript/`.
2. Uruchom `python3 scripts/check.py` dla Pythona (Windows: `py -3 scripts/check.py`) albo `node scripts/check.mjs` dla JavaScript. To sprawdzenie powinno przejść jeszcze przed wykonaniem ćwiczeń.
3. Uruchom testy wybranej ścieżki:

   ```bash
   python3 -m unittest discover -s practice/python -p '*_test.py'
   # albo
   node --test practice/javascript/tickets.test.mjs
   ```

   Stan początkowy: 2 testy przechodzą, 4 testy nie przechodzą. To zamierzone kryteria akceptacji. Python wymaga wersji 3.10+; JavaScript używa Node.js 20+ i wbudowanego `node:test`. Nie ma instalacji pakietów.
4. Otwórz [mapę ćwiczeń](exercises/README.md). Zrób pierwszy mały diff przed dłuższą prezentacją narzędzia.

## Mapa ćwiczenia zapasowego

| Blok | Ćwiczenie | Wynik |
|---|---|---|
| 1 | [D1-01: start, uzupełnienia i pierwszy diff](exercises/D1-01-start.md) | Działające środowisko, świadomie przyjęta mała zmiana |
| 1 | [D1-02: Ask, Plan i kontekst](exercises/D1-02-context.md) | Krótki plan z plikami i kryterium testowym |
| 1 | [D1-03: Agent IDE, debug i testy](exercises/D1-03-agent.md) | Testy zielone, diff po przeglądzie |
| 2 | [D2-01: publiczna umiejętność](exercises/D2-01-skill.md) | Zweryfikowana instalacja `write-adr` z publicznego źródła |
| 2 | [D2-02: issue, agent chmurowy i PR](exercises/D2-02-cloud.md) | PR lub lokalny odpowiednik, z ludzkim przeglądem |
| 2 | [D2-03: instrukcje, prompty, agent, MCP i CLI](exercises/D2-03-customize.md) | Uzasadniona konfiguracja i granice dostępu |
| 2 | [D2-04: pełny przepływ](exercises/D2-04-end-to-end.md) | Issue → plan → kod → testy → PR → review |

Bloki 1 i 2 to dwa etapy tego samego przepływu; na pięciodniowym szkoleniu rozkładamy je na więcej dni wraz z projektem grupy. Szczegóły wariantu w [mapie ćwiczeń](exercises/README.md).

## Biblioteka dodatkowa

`course-materials/` zawiera szeroką bibliotekę pełnych promptów, danych syntetycznych, checklist, przykładów konfiguracji i materiałów o innych agentach. To zasób do późniejszego czytania, nie lista narzędzi wymaganych na warsztacie. [Pełne prompty historyczne](course-materials/Prompt%20examples/) zachowano bez skracania; starsze twierdzenia o produktach, licencjach i komendach wymagają ponownego sprawdzenia. `practice/` i `exercises/` służą wyłącznie do ćwiczenia zapasowego. Podczas pracy z wybraną aplikacją agent nie powinien sam przeszukiwać `course-materials/`: zawarte tam PRD, ADR i instrukcje są przykładami, a nie wymaganiami tego projektu. Otwórz konkretny materiał dopiero wtedy, gdy go o to poprosisz.

W bibliotece znajdują się również **archiwalne materiały z lipcowego kursu JSystems o Claude Code**: [agenda](course-materials/course-agenda.md), [slajdy](course-materials/slides/claude-code-2026-07/), [scenariusze prowadzącego](course-materials/day-scripts/), [notatki](course-materials/Course%20Notes%20-%20AI%20in%20Programming.md), [ćwiczenia](course-materials/exercises/), [quiz](course-materials/quizzes/day-1-anonymous-ai-basics-quiz.md), [przykłady konfiguracji](course-materials/.claude-example/) i [słownik PDF](course-materials/AI%20dla%20Programist%C3%B3w%20-%20S%C5%82ownik%20przed%20szkoleniem.pdf). Zachowano je jako źródła do ponownego wykorzystania, **nie jako aktualną agendę ani konfigurację tego warsztatu**. Przykłady ustawień i skrypty należy dostosować i sprawdzić przed użyciem. `course-materials/exercise-data/hidden-patterns.md` jest archiwalnym kluczem trenerskim do danych syntetycznych.

Warto zacząć od: [promptu PRD](course-materials/Prompt%20examples/PRD-electronics-returns-complains-app.md) i [promptu ADR](course-materials/Prompt%20examples/ADR-generation-typescript-vercel-ai-sdk.md) z linkami do bibliotek (Chat SDK, OpenRouter Responses API, Vercel AI SDK), [jednego skryptu blokującego odczyt `.env`, kluczy SSH i `secrets/`](course-materials/hooks-example/) w Copilocie, Claude Code i Codex, oraz [agenta code review w CI/CD](course-materials/cicd-headless/agent-review/) - Azure Pipelines, GitLab CI, Bitbucket Pipelines, Jenkins i GitHub Actions, z wynikiem w komentarzu PR i zadaniu w Jira.

## Granice

Używaj wyłącznie danych syntetycznych. Przed przekazaniem kontekstu agentowi sprawdź politykę organizacji i zakres dostępu. Przejrzyj każdy diff, wynik testów i uprawnienia proponowanych narzędzi. Repozytorium nie zawiera rozwiązania trenerskiego dla ćwiczenia zapasowego. Testów nie zmieniaj po to, by ukryć nieukończone zachowanie.

Możliwość użycia agenta chmurowego, MCP, CLI i pul AI Credits zależy od planu oraz ustawień organizacji; [D2-02](exercises/D2-02-cloud.md) ma lokalny wariant, jeśli dostęp nie jest włączony. Agent w IDE i agent chmurowy to osobne środowiska. Funkcje edytora mogą się różnić od CLI i od innych IDE. [Stan narzędzi i źródła](docs/tool-facts.md) wymagają ponownego sprawdzenia przed zajęciami.
