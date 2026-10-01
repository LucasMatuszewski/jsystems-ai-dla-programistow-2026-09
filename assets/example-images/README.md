# Przykładowe obrazy do testów E2E i recenzji ręcznej

Prawdziwe, deterministyczne pliki graficzne dla aplikacji kursowej (obsługa zwrotów i
reklamacji elektroniki). Służą jako załączniki do formularza zgłoszenia: testy E2E
(Playwright `setInputFiles`) i recenzja ręczna wgrywają je takimi, jakie są. Agent NIE
generuje obrazów sam ani nie tworzy białych plików zastępczych, tylko używa plików z tego
katalogu. Wszystkie mają rozmiar 640x480 px i pasek z identyfikatorem na dole, dzięki
czemu model wizyjny potwierdzi, że widzi właściwy plik. Wygenerowano je skryptem w PIL,
bez AI, więc każde regenerowane uruchomienie daje ten sam wynik.

| Plik | Co przedstawia |
| --- | --- |
| `warranty-receipt-001.png` | Paragon fiskalny za laptop Nexon X15, zakup 2026-03-14, gwarancja 24 miesiące |
| `warranty-receipt-002.png` | Paragon fiskalny za słuchawki SonicWave ANC 700, zakup 2026-04-02, gwarancja 24 miesiące |
| `product-photo-nexon-x15.png` | Zdjęcie produktu: laptop Nexon X15, stan neutralny |
| `return-photo-nexon-x15-undamaged.png` | Zdjęcie do zwrotu: laptop Nexon X15, zielona etykieta "STAN: BEZ USZKODZEŃ" |
| `defect-photo-nexon-x15-screen.png` | Zdjęcie do reklamacji: laptop Nexon X15 z pękniętym ekranem |
| `defect-photo-aurix-probook-14-keyboard.png` | Zdjęcie do reklamacji: laptop Aurix ProBook 14 z uszkodzoną klawiaturą (brak klawisza) |
| `product-photo-pixelon-p9-pro.png` | Zdjęcie produktu: smartfon Pixelon P9 Pro, stan neutralny |
| `defect-photo-pixelon-p9-pro-screen.png` | Zdjęcie do reklamacji: smartfon Pixelon P9 Pro z pękniętą szybą |
| `defect-photo-sonicwave-anc-700.png` | Zdjęcie do reklamacji: słuchawki SonicWave ANC 700 z pękniętym pałąkiem |

Nazwy produktów są spójne z katalogiem syntetycznych danych w
`course-materials/exercise-data/` (plik `csv/products.csv` i karty w `kb/`), więc zdjęcia
można łączyć z zamówieniami i zgłoszeniami z bazy ćwiczeniowej.

## Sposób użycia w testach

Ścieżkę podawaj względem katalogu głównego repozytorium, na przykład
`assets/example-images/defect-photo-nexon-x15-screen.png`. Test E2E scenariusza
reklamacji wgrywa plik z "defect-photo" w nazwie, a scenariusza zwrotu plik
`return-photo-nexon-x15-undamaged.png`; paragony służą do scenariuszy sprawdzania
gwarancji. Jeśli aplikacja wymaga plików JPG, wykonaj konwersję lokalnie
(`convert plik.png plik.jpg`) i nie commituj zbędnych kopii.
