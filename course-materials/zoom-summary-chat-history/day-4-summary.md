# Podsumowanie — dzień 4

**Data:** 1 października 2026

## Szybkie podsumowanie

Spotkanie koncentrowało się na zaawansowanej pracy z agentami AI: konfiguracji subagentów, trybach headless, zarządzaniu sesjami oraz ograniczaniu kosztu i kontekstu. Łukasz pokazał narzędzia do koordynacji agentów i automatyzacji, a uczestnicy wymieniali się doświadczeniami z limitami oraz długimi zadaniami wykonywanymi przez agentów. Omówiono też hooki, pracę z wieloma sesjami, bezpieczeństwo zdalnego dostępu i rozwiązania open source.

## Omówione tematy

### Planowanie i kontekst

Omówiono plan wdrożenia liczący blisko 1000 linii i sposoby ograniczenia powtórzeń w dokumentacji, aby oszczędzać tokeny. Zwrócono uwagę na przekazywanie subagentom tylko potrzebnych informacji, pracę z polskimi znakami w promptach oraz korzystanie z Context7 przy szukaniu dokumentacji.

### Subagenci, kontekst i konfiguracja

Omówiono włączanie i wyłączanie skills na poziomie subagenta oraz konfigurację MCP. Wspomniano o potrzebie przekazywania agentom tylko potrzebnego kontekstu i ograniczania zbędnej dokumentacji. Pokazano dostęp do subagentów w Codex przez `/subagents` oraz konfigurację subagentów.

### Tryby headless i wznawianie sesji

Sprawdzono uruchamianie Claude Code w trybie headless w ramach subskrypcji. W czacie pojawiły się przykłady `claude -p`, `unset ANTHROPIC_API_KEY`, `claude --continue` i `claude --resume <id-sesji>`, a także `codex resume` i `codex exec`. Zaznaczono, że `claude --bare -p ...` korzysta z API / PAYG, a nie z subskrypcji OAuth.

### Zarządzanie agentami, sesjami i automatyzacją

Przedstawiono Herdr jako multiplexer dla agentów AI, Codex Agent Command Center jako odpowiednik Claude Agent View oraz Claude Agent Teams. Rozmawiano o hookach, w tym o hookach dla Copilota, i o różnych trybach pracy wielu agentów. Wśród narzędzi i materiałów pojawiły się również tmux, cmux, Termux, Termius, Zed oraz workflow Claude Code.

### Bezpieczeństwo i narzędzia infrastrukturalne

Udostępniono materiały o Tailscale jako prywatnym VPN i Cloudflare Tunnel do bezpiecznym udostępnianiu usług. Wspomniano też o Restic do backupów przyrostowych, Dolt jako bazie z funkcjami kontroli wersji oraz Copilot Studio.

### Doświadczenia uczestników

Uczestnicy porównywali limity, rozmiary planów i używane modele. Jeden z uczestników zgłosił, że jego zadanie QA zapętliło się, zużywało tokeny i osiągnęło około 20% postępu; po zmianie workerów na Lunę praca ruszyła sprawniej. Inny uczestnik opisał szybkie wyczerpywanie limitu pięciogodzinnego na planie za 20 USD.

## Ćwiczenie

Uczestnicy mieli dodać hook, utworzyć jeden zagnieżdżony plik `AGENTS.md` oraz zastanowić się nad skillem opartym na historii sesji lub problemie napotkanym podczas pracy z agentem.

## Dalsze kroki

### Prowadzący

- Udostępnić w repozytorium omawiane materiały szkoleniowe i dokumentację.
- Przeanalizować problem zapętlenia zadania QA i omówić sposoby unikania podobnych sytuacji.
- Kontynuować następnego dnia rozmowę o Code Review, chmurze, legacy, testach i dokumentacji.

### Nazwani uczestnicy

- Brak nierozliczonych działań przypisanych konkretnym uczestnikom.

### Wszyscy uczestnicy

- Wykonać ćwiczenie: dodać hook, dodać zagnieżdżony `AGENTS.md` i wybrać workflow lub problem jako punkt wyjścia do stworzenia skilla.
