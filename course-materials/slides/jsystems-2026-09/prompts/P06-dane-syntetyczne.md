Pracuj wyłącznie na syntetycznych plikach z repozytorium kursowego: `course-materials/exercise-data/csv/complaints.csv` i `course-materials/exercise-data/csv/products.csv`. Otwórz tylko te wskazane materiały ćwiczeniowe; nie traktuj innych plików w `course-materials/` jako wymagań aplikacji. Nie używaj danych klientów ani produkcyjnych baz.

Najpierw pokaż nagłówki, liczbę wierszy i sposób połączenia `complaints.product_id` z `products.id`. Rozróżnij reklamacje (`type=complaint`) od zwrotów (`type=return`). Wybierz jedną ścieżkę:

- **SQL:** zbuduj lokalną bazę SQLite z tych CSV. Policz reklamacje według kategorii produktu. Pokaż zapytanie i wynik. Sprawdź go niezależnie w Pythonie lub ręcznie na próbce.
- **Python:** sprawdź brakujące wartości, duplikaty identyfikatorów i zgłoszenia bez odpowiadającego produktu. Napisz test funkcji liczącej reklamacje według kategorii, uwzględniając produkt bez zgłoszeń i błędny `product_id`. Pokaż czerwony test, najmniejszą implementację i zielony wynik.

Zapisz polecenia, wyniki i rozbieżności. Sama liczba reklamacji nie jest "wskaźnikiem reklamacji": w danych brakuje liczby sprzedanych sztuk.
