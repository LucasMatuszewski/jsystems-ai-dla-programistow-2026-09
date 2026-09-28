# Problem ćwiczeniowy: porządkowanie zgłoszeń

Zespół otrzymuje syntetyczne zgłoszenia. Każde ma identyfikator i tytuł, a w późniejszym etapie także `blocked` oraz `severity`. Dwie proste funkcje pomagają uporządkować dane przed przeglądem przez człowieka.

## Kryteria akceptacji

- **D1:** `normalize_title` / `normalizeTitle` usuwa skrajne białe znaki, zamienia każdy ciąg białych znaków w środku na pojedynczą spację i odrzuca pusty wynik z błędem zawierającym słowo `title`.
- **D2:** `classify_priority` / `classifyPriority` zwraca `high`, gdy `blocked` jest prawdziwe **lub** `severity` wynosi `1`; w pozostałych podanych przypadkach zwraca `normal`.
- Funkcja podsumowania jest istniejącym, działającym przykładem. Nie zmieniaj jej bez potrzeby.

Granice: rozwiązanie działa lokalnie bez sieci i bez nowych zależności. Nie przetwarzamy realnych zgłoszeń, danych klientów ani kluczy. Testy w wybranej ścieżce są wykonywalną specyfikacją, nie kodem do osłabienia. Implementację akceptuje człowiek po obejrzeniu diffu.
