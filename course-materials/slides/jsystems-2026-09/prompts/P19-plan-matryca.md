# Plan pracy nad aplikacją na podstawie PRD

Pracuję nad projektem opisanym w aktualnym PRD. Zapytaj mnie o ścieżkę do PRD i istniejących ADR-ów, jeśli ich nie podałem. Źródłem wymagań jest **aktualny PRD mojego projektu**, nie przykładowy prompt z materiałów kursowych. Jeśli pracuję nad grupową aplikacją do obsługi zwrotów i reklamacji elektroniki, pomiń funkcje opcjonalne usunięte z PRD podczas zajęć.

Najpierw ustal stan faktyczny. Przeczytaj wskazany przeze mnie PRD, istniejące ADR-y, wytyczne projektu, README i bieżący kod. Wskaż pliki, które rzeczywiście udało Ci się otworzyć, oraz polecenia uruchomienia i testów, które da się potwierdzić. Katalog `course-materials/` zawiera materiały dydaktyczne i przykłady; nie przeszukuj go ani nie traktuj jego PRD/ADR jako dokumentacji aplikacji, chyba że wskażę konkretny plik. Nie zakładaj, że projekt już działa ani że każdy uczestnik ma ten sam stan repozytorium.

Jeśli wybór bibliotek, architektury lub sposobu uruchomienia nie został jeszcze rozstrzygnięty, wypisz potrzebne decyzje. Sprawdź aktualną dokumentację oficjalną z datą lub wersją, porównaj rozsądne opcje i zaproponuj użycie zainstalowanej umiejętności `write-adr`. Oddziel fakty potwierdzone od założeń. Dla niezależnych decyzji zaproponuj oddzielne ADR-y; nie wymyślaj ich treści przed moją decyzją.

Przygotuj **plan, bez implementowania go teraz**. Podczas warsztatu chcemy przejść cały proces na jednym niewielkim fragmencie, bez obietnicy ukończenia całej aplikacji. Pokaż, jak użyłbyś trybu Plan, i czym różni się plan zapisany w zwykłej sesji: co możesz tam tylko opisać, a co wymaga mojej zgody przed edycją. Jeśli brakuje kluczowych danych, zadaj najpierw kilka konkretnych pytań zamiast zgadywać.

Zwróć:
1. Jednozdaniowy cel najbliższego fragmentu z PRD, zakres poza zadaniem i kryteria akceptacji możliwe do sprawdzenia.
2. Fazy: rozpoznanie stanu → ewentualne ADR → plan → test, który początkowo nie przechodzi → niewielka implementacja → testy i kontrola ręczna w przeglądarce, jeśli jest UI → pokaz grupie → poprawka rzeczywistego problemu → niezależny przegląd → pull request tylko dla gotowego fragmentu.
3. **Macierz zadań i zależności**. Dla każdego wiersza podaj: identyfikator, wynik, zależności, właściciela, pliki lub obszar własności, kryterium ukończenia, test albo inny dowód, punkt kontroli człowieka i możliwy następny krok. Oznacz, co da się robić równolegle, a co trzeba wykonać po kolei.
4. Propozycję delegowania wyłącznie niezależnych zadań. Porównaj jednego agenta z subagentami domyślnymi, doraźnymi i własnymi; dla każdego delegowanego zadania przygotuj krótki, wystarczający brief i granice plików. Nie zakładaj, że wszystkie rodzaje subagentów są dostępne w moim wydaniu Copilota. Wskaż ryzyko konfliktów przy wspólnym katalogu i kiedy osobne worktree lub sesje byłyby użyteczne, a kiedy zwiększają narzut.
5. Jeden wspólny sposób śledzenia stanu pracy w zespole (np. GitHub Issues, Jira, Linear albo Beads, jeśli już go używamy). Nie twórz równoległych źródeł prawdy bez potrzeby. Pokaż przekazanie zadania między agentami i sposób scalenia wyników przed testami całości.
6. Plan kontroli jakości: testy lokalne, kontrola działania aplikacji przez agenta i człowieka, przegląd zmian, reakcja na uwagi z code review, dokumentacja wyników. Oddziel wynik faktycznie sprawdzony od deklaracji agenta.
7. Plan awaryjny, jeśli zabraknie czasu, dostępu, przeglądarki lub kredytów AI: najmniejszy pokaz możliwy do wykonania z istniejącym kodem i jasny zapis pracy do dokończenia.

Zapisz plan jako dokument tylko w miejscu, które wskażę lub zatwierdzę. Poza tym dokumentem nie modyfikuj plików; nie implementuj funkcji, nie twórz gałęzi, issue ani pull requesta i nie uruchamiaj delegowanych agentów, dopóki nie przejrzę planu. Nie narzucaj z góry konkretnego języka, frameworka, liczby agentów ani nazw plików, których nie ma w projekcie. Na końcu wskaż trzy najważniejsze decyzje, które mam zatwierdzić przed rozpoczęciem pracy.
