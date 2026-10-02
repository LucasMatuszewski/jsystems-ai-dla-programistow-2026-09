# Podsumowanie — dzień 5

**Data:** 2 października 2026

## Szybkie podsumowanie

Ostatni dzień szkolenia obejmował aktualizacje narzędzi AI, code review i CI/CD, lokalne oraz hostowane modele, a także pracę z kontekstem multimodalnym. Łukasz udostępnił materiały i przykłady konfiguracji, a uczestnicy rozmawiali o tym, jak nowe modele zmieniają zachowanie promptów i agentów. Omówiono też rolę agentów w pracy programistycznej, bezpieczeństwo automatyzacji oraz środowiska Linux i Windows.

## Omówione tematy

### Aktualizacje agentów, harnessów i promptów

Udostępniono informacje o OpenAI Dots, Grok Bot, web crawlerach, nowych benchmarkach SWE i aktualizacjach Codexu. Omówiono role orkiestratora agentów, administratora IT i eksperta domenowego. Hubert opisał przypadek, w którym nagłówek „Implementation” w PRD skłonił agenta do rozpoczęcia implementacji. Łukasz zwrócił uwagę, że prompty i skills trzeba ponownie dostrajać po aktualizacjach modeli; wspomniał również o skrypcie flagującym słowa, które powodują niepożądane działania.

### Narzędzia programistyczne, code review i CI/CD

Przedstawiono konfigurację Claude’a z różnymi modelami i providerami, pracę headless oraz Codex Cloud. Udostępniono materiały o GitLab CLI, MCP i REST API, GitLab CI/CD, code review w Codexie i GitHub Copilot oraz narzędziach CodeRabbit i Qodo. Pokazano też MCP dla Jira, Cloudflare i Bitbucket.

### Modele lokalne i hosting

Omówiono Ollama i LM Studio do uruchamiania modeli lokalnie, w tym na telefonach. Wśród modeli i materiałów pojawiły się LFM 2, LFM 2.5 Thinking, Gemma 4 oraz Qwen 3.8. Pokazano pomiar szybkości `gemma4:e2b` oraz podział obciążenia między CPU i GPU. Omówiono serwowanie większej liczbie użytkowników przez vLLM lub serwer llama.cpp, a także Unsloth do hostingu, trenowania, fine-tuningu i adapterów LoRA.

Rozważano koszty wynajmu GPU (Cerebrium i Modal) oraz urządzenia do lokalnego inference, m.in. AMD Radeon AI Pro, Ryzen AI Halo, Minisforum i NVIDIA DGX Spark. Udostępniono rankingi modeli open source oraz wskazano 32 GB VRAM lub pamięci współdzielonej jako punkt odniesienia dla rozważanych zastosowań.

### Kontekst, obrazy i praca na dużych repozytoriach

Rozmawiano o wykorzystaniu screenshotów i innych danych wizualnych oraz o kompresji obrazów i dużych baz kodu w celu ograniczania zużycia kontekstu. Udostępniono materiały o Repomix i przekazywaniu agentom kontekstu całego repozytorium. W ćwiczeniu uczestnicy mieli stworzyć możliwie wierny klon strony Allegro i porównać go ze screenshotem.

### Środowiska pracy i bezpieczeństwo

Udostępniono narzędzia do budowania interfejsów (v0, Lovable, Bolt i Replit), materiały o emulacji Androida w AI Studio oraz przykład modernizacji aplikacji Java FTP. Pod koniec spotkania Artur pytał o Omarchy i porównywał swoje dotychczasowe doświadczenia z systemami Debian-like. Łukasz pokazał także Omarchy i Omakub. Wspomniano o ryzyku narzędzi computer-use z szerokim dostępem.

## Dalsze kroki

### Prowadzący

- Zaktualizować materiały szkoleniowe o najnowsze badania, benchmarki i modele lokalne w weekend.
- Dodać do Confluence skill dotyczący konfiguracji tokenów i opisów endpointów oraz udostępnić go publicznie w weekend.
- Zaktualizować skills do code review i CI/CD, usuwając nieaktualne fragmenty i dostosowując je do nowych wersji modeli.

### Nazwani uczestnicy

- **Jakub:** uwzględniać testy ręczne obok automatycznych; zbadać problem wyboru licencji i modelu w kodzie, w razie potrzeby z pomocą prowadzącego.
- **Artur:** zbadać lokalne modele i ocenić ich opłacalność w projektach firmowych; przetestować nowy sposób pracy z subagentami i podzielić proces na mniejsze kroki.

### Wszyscy uczestnicy

- Wypełnić ankietę po szkoleniu.
