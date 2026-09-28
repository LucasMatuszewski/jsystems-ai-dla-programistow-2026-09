Pracuj wyłącznie na syntetycznych plikach `course-materials/exercise-data/csv/complaints.csv` i `course-materials/exercise-data/csv/products.csv` z repozytorium kursowego. Otwórz tylko te wskazane materiały ćwiczeniowe. Nie łącz się z produkcyjną bazą ani zewnętrzną usługą.

Najpierw sprawdź nagłówki, liczbę wierszy, puste wartości, duplikaty `id` i powiązanie `complaints.product_id` z `products.id`. Zbuduj lokalną bazę SQLite lub użyj narzędzia, które już masz. Zapisz sposób importu bez zmieniania danych wejściowych.

Przygotuj zapytanie pokazujące liczbę reklamacji (`type=complaint`) według produktu i kategorii. Uwzględnij produkty bez reklamacji. Pokaż pełny SQL oraz wynik. Nie nazywaj liczby zgłoszeń "wskaźnikiem reklamacji", bo nie znamy liczby sprzedanych sztuk.

Zweryfikuj wynik drugim sposobem: niezależną agregacją w Pythonie albo innym zapytaniem SQL, nie kopią tego samego `SELECT`. Porównaj wyniki wiersz po wierszu. Dodaj test z nieistniejącym `product_id` i pokaż, czy kontrola integralności go wykrywa.

Zapisz `docs/analysis-report.md`: definicję metryki, zapytania, wyniki obu metod, rozbieżności i ograniczenia interpretacji. Przed edycją pokaż plan plików i testów; po pracy pokaż polecenia, wynik i diff.
