# UPDATES !!!

**Odpowiedzi na wszystkie pytania z kursu: [copilot-pytania.html](https://devpowers.com/szkolenia/futureskills/sii-github-copilot-2026-09/copilot-pytania.html)**

**Historia czatu z obu dni szkolenia**: [dzień 1 (26.09)](course-materials/zoom-summary-chat-history/day-1-chat-history.md) i [dzień 2 (27.09)](course-materials/zoom-summary-chat-history/day-2-chat-history.md) - wszystkie linki, polecenia i prompty udostępnione na czacie podczas zajęć, w kolejności chronologicznej.

Nowości z 28.09.2026, przygotowane po Waszych pytaniach z kursu:

- **Odpowiedzi na pytania z kursu**: [strona z odpowiedziami](https://devpowers.com/szkolenia/futureskills/sii-github-copilot-2026-09/copilot-pytania.html) i [slajd z podsumowaniem](https://devpowers.com/szkolenia/futureskills/sii-github-copilot-2026-09/Prezentacja_Dzien2.html#12). Agent Host i praca w WSL, git worktrees z pnpm, hooki, CI/CD, indeks kodu (semantic search) i Session Sync.
- **Hooki**: [jeden skrypt blokujący odczyt `.env`, kluczy SSH i `secrets/`](course-materials/hooks-example/) w Copilocie, Claude Code i Codex, z odpowiedzią, jak ograniczyć hook do wybranych plików i poleceń.
- **Agent w CI/CD**: [code review i security review każdego pull requestu](course-materials/cicd-headless/agent-review/) w Azure Pipelines, GitLab CI i Bitbucket Pipelines. Do wyboru Copilot, Claude Code, Codex albo OpenCode; wynik trafia do komentarza w PR i do zadania w Jira. Jeden klucz OpenRouter dla wszystkich agentów i gotowy obraz Dockera.
- **Nowe trendy**: Skills przez MCP i WebMCP ([slajd](https://devpowers.com/szkolenia/futureskills/sii-github-copilot-2026-09/Prezentacja_Dzien2.html#23)).
- **ADR z linkami do bibliotek**: [prompt ADR](course-materials/Prompt%20examples/ADR-generation-typescript-vercel-ai-sdk.md) z Chat SDK, OpenRouter Responses API i OpenRouter + Vercel AI SDK. Bez takich linków agent często wybiera starsze wzorce ([slajd](https://devpowers.com/szkolenia/futureskills/sii-github-copilot-2026-09/Prezentacja_Dzien2.html#3)).
- **Przywrócone konfiguracje agentów**: subagenci, komendy i ustawienia Claude Code ([.claude/](.claude/), [CLAUDE.md](CLAUDE.md)), konfiguracja i agenci Codex ([.codex/](.codex/)), [.mcp.json](.mcp.json), [przykładowy .bashrc](course-materials/.bashrc), [prompt do delegowania zadań innym agentom](course-materials/Prompt%20examples/Deletage-to-Codex-Agy-OpenCode-Grok.md) i [research o przechowywaniu danych przez OpenRouter w UE](course-materials/Research/OpenRouter%20EU%20data%20retention%20policy%20-%20Perplexity.md).
- **Uprawnienia Copilot CLI**: [skrypt startowy z listą poleceń zatwierdzanych i blokowanych automatycznie](course-materials/.copilot-example/).
- **Slajdy i materiały w repozytorium**: [course-materials/slides/sii-2026-09/](course-materials/slides/sii-2026-09/index.html), ta sama wersja co na [stronie kursu](https://devpowers.com/szkolenia/futureskills/sii-github-copilot-2026-09/). [Notatki kursowe](course-materials/Course%20Notes%20-%20AI%20in%20Programming.md) zawierają wszystkie powyższe tematy.
- **Poprawki**: skille nazywają się teraz `write-prd` i `write-adr`, jak w [EdukeyTeam/agent-toolbox](https://github.com/EdukeyTeam/agent-toolbox). `AGENTS.md` mówi agentom, żeby nie czytały `course-materials/` bez Twojej prośby.

---

# GitHub Copilot: warsztat programistyczny (2 dni)

Repozytorium uczestnika dla dwóch dni pracy z GitHub Copilot. Głównym projektem grupy jest aplikacja do obsługi zwrotów i reklamacji elektroniki, rozwijana według PRD uzgodnionego podczas zajęć. Możesz też pracować nad własnym pomysłem, stosując ten sam proces. Po PRD omów architekturę i biblioteki, zapisz decyzje w ADR, ułóż plan i zależności zadań, a potem implementuj, testuj i przeglądaj zmiany przed utworzeniem PR. Przykładowy prompt PRD w `course-materials/` nie zastępuje dokumentu poprawionego z grupą. Poniższe ścieżki Python i JavaScript to ćwiczenie zapasowe, gdy praca nad wybraną aplikacją jest zablokowana; zawierają syntetyczne dane, celowo niedokończone funkcje i testy opisujące oczekiwane zachowanie.

## Ćwiczenie zapasowe: zacznij w 5 minut

1. Jeśli prowadzący wybierze ćwiczenie zapasowe, sklonuj repozytorium i otwórz katalog w VS Code. Wybierz `practice/python/` albo `practice/javascript/`.
2. Uruchom `python3 scripts/check.py` dla Pythona (Windows: `py -3 scripts/check.py`) albo `node scripts/check.mjs` dla JavaScript. To sprawdzenie powinno przejść jeszcze przed wykonaniem ćwiczeń.
3. Uruchom testy wybranej ścieżki:

   ```bash
   python3 -m unittest discover -s practice/python -p '*_test.py'
   # albo
   node --test practice/javascript/tickets.test.mjs
   ```

   Stan początkowy: 2 testy przechodzą, 4 testy nie przechodzą. To zamierzone kryteria akceptacji dla dni 1 i 2. Python wymaga wersji 3.10+; JavaScript używa Node.js 20+ i wbudowanego `node:test`. Nie ma instalacji pakietów.
4. Otwórz [mapę ćwiczeń](exercises/README.md). Zrób pierwszy mały diff przed dłuższą prezentacją narzędzia.

## Mapa ćwiczenia zapasowego

| Dzień | Ćwiczenie | Wynik |
|---|---|---|
| 1 | [D1-01: start, uzupełnienia i pierwszy diff](exercises/D1-01-start.md) | Działające środowisko, świadomie przyjęta mała zmiana |
| 1 | [D1-02: Ask, Plan i kontekst](exercises/D1-02-context.md) | Krótki plan z plikami i kryterium testowym |
| 1 | [D1-03: Agent IDE, debug i testy](exercises/D1-03-agent.md) | Testy D1 zielone, diff po przeglądzie |
| 2 | [D2-01: publiczna umiejętność](exercises/D2-01-skill.md) | Zweryfikowana instalacja `write-adr` z publicznego źródła |
| 2 | [D2-02: issue, agent chmurowy i PR](exercises/D2-02-cloud.md) | PR lub lokalny odpowiednik, z ludzkim przeglądem |
| 2 | [D2-03: instrukcje, prompty, agent, MCP i CLI](exercises/D2-03-customize.md) | Uzasadniona konfiguracja i granice dostępu |
| 2 | [D2-04: pełny przepływ](exercises/D2-04-end-to-end.md) | Issue → plan → kod → testy → PR → review |

Przykładowy plan zegarowy dla ćwiczenia zapasowego 09:00-17:00 na każdy dzień obejmuje 45 minut przerw i 7 godzin 15 minut zajęć. W tym wariancie 315 z 435 minut zajęć przypada na samodzielną pracę lub pracę w parach (72,4%). To nie jest zapis faktycznego przebiegu zajęć nad aplikacją grupy. Szczegóły wariantu w [mapie ćwiczeń](exercises/README.md).

## Biblioteka dodatkowa

[Slajdy i materiały tego kursu](course-materials/slides/sii-2026-09/index.html) są też w repozytorium (kopia [strony kursu](https://devpowers.com/szkolenia/futureskills/sii-github-copilot-2026-09/)).

`course-materials/` zachowuje szeroką bibliotekę pełnych promptów, danych syntetycznych, checklist, przykładów konfiguracji i materiałów o innych agentach. To zasób do późniejszego czytania, nie lista narzędzi wymaganych na warsztacie. [Pełne prompty historyczne](course-materials/Prompt%20examples/) zachowano bez skracania; starsze twierdzenia o produktach, licencjach i komendach wymagają ponownego sprawdzenia. `practice/` i `exercises/` służą wyłącznie do ćwiczenia zapasowego. Podczas pracy z wybraną aplikacją agent nie powinien sam przeszukiwać `course-materials/`: zawarte tam PRD, ADR i instrukcje są przykładami, a nie wymaganiami tego projektu. Otwórz konkretny materiał dopiero wtedy, gdy go o to poprosisz.

W bibliotece znajdują się również **archiwalne materiały z lipcowego kursu JSystems o Claude Code**: [agenda](course-materials/course-agenda.md), [slajdy](course-materials/slides/claude-code-2026-07/), [scenariusze prowadzącego](course-materials/day-scripts/), [notatki](course-materials/Course%20Notes%20-%20AI%20in%20Programming.md), [ćwiczenia](course-materials/exercises/), [quiz](course-materials/quizzes/day-1-anonymous-ai-basics-quiz.md), [przykłady konfiguracji](course-materials/.claude-example/) i [słownik PDF](course-materials/AI%20dla%20Programist%C3%B3w%20-%20S%C5%82ownik%20przed%20szkoleniem.pdf). Zachowano je jako źródła do ponownego wykorzystania, **nie jako aktualną agendę ani konfigurację warsztatu SII**. Przykłady ustawień i skrypty należy dostosować i sprawdzić przed użyciem. `course-materials/exercise-data/hidden-patterns.md` jest archiwalnym kluczem trenerskim do danych syntetycznych.

[Przykład zgód dla GitHub Copilot CLI](course-materials/.copilot-example/README.md) pokazuje, jak automatycznie akceptować wybrane polecenia i odrzucać inne bez pytania.

## Granice

Używaj wyłącznie danych syntetycznych. Przed przekazaniem kontekstu agentowi sprawdź politykę organizacji i zakres dostępu. Przejrzyj każdy diff, wynik testów i uprawnienia proponowanych narzędzi. Repozytorium nie zawiera rozwiązania trenerskiego dla ćwiczenia zapasowego. Testów nie zmieniaj po to, by ukryć nieukończone zachowanie.

Możliwość użycia agenta chmurowego, MCP, Copilot CLI, funkcji bezpieczeństwa i pul AI Credits zależy od planu oraz ustawień organizacji; [D2-02](exercises/D2-02-cloud.md) ma lokalny wariant, jeśli dostęp nie jest włączony. Agent w IDE i agent chmurowy to osobne środowiska. Funkcje edytora mogą się różnić od CLI i od innych IDE. [Stan narzędzi i źródła](docs/tool-facts.md) wymagają ponownego sprawdzenia przed zajęciami.
