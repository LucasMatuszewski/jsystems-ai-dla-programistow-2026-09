import "server-only";
import type { PolicyReference } from "../../lib/contracts/policy";

export type PolicyScenario = "complaint" | "return";
export type PolicyResourceErrorCode = "POLICY_CONFIGURATION_ERROR" | "POLICY_VERSION_UNAVAILABLE";
export class PolicyResourceError extends Error {
  constructor(public readonly code: PolicyResourceErrorCode) {
    super(code);
    this.name = "PolicyResourceError";
  }
}
export interface PolicyRegistration {
  readonly scenario: PolicyScenario;
  readonly version: string;
  readonly digest: string;
  readonly fileName: string;
  readonly sourceUrl: string;
  readonly retrievedAt: string;
  readonly originalRetrievedAt: string;
  readonly language: "pl";
  readonly characters: number;
  readonly headings: readonly PolicyReference[];
}

const sourceUrl = "https://allegro.pl/regulaminy/polityka-reklamacji-i-zwrotow-na-allegro-m0mreg1YkCG";
const originalRetrievedAt = "2026-09-30T09:15:03.305782+00:00";
const retrievedAt = "2026-09-30T09:15:03.305782Z";
function registration(value: PolicyRegistration): PolicyRegistration {
  for (const heading of value.headings) Object.freeze(heading);
  Object.freeze(value.headings);
  return Object.freeze(value);
}
const complaint = registration({
  scenario: "complaint", version: "d69c7b039d520f8e449fc290611bdc2e003bebac87a28b99489c0493737b141a", digest: "d69c7b039d520f8e449fc290611bdc2e003bebac87a28b99489c0493737b141a",
  fileName: "complaints.d69c7b039d520f8e449fc290611bdc2e003bebac87a28b99489c0493737b141a.html", sourceUrl, retrievedAt, originalRetrievedAt, language: "pl", characters: 5627,
  headings: [
  {
    "headingId": "reklamowanie-towaru-jakie-masz-mozliwosci",
    "title": "Reklamowanie towaru - jakie masz możliwości",
    "url": "https://allegro.pl/regulaminy/polityka-reklamacji-i-zwrotow-na-allegro-m0mreg1YkCG#reklamowanie-towaru-jakie-masz-mozliwosci"
  },
  {
    "headingId": "czas-na-poinformowanie-sprzedajacego-w-przypadku-niezgodnosci-towaru-z-umowa",
    "title": "Czas na poinformowanie sprzedającego w przypadku niezgodności towaru z umową",
    "url": "https://allegro.pl/regulaminy/polityka-reklamacji-i-zwrotow-na-allegro-m0mreg1YkCG#czas-na-poinformowanie-sprzedajacego-w-przypadku-niezgodnosci-towaru-z-umowa"
  },
  {
    "headingId": "przebieg-reklamacji",
    "title": "Przebieg reklamacji",
    "url": "https://allegro.pl/regulaminy/polityka-reklamacji-i-zwrotow-na-allegro-m0mreg1YkCG#przebieg-reklamacji"
  },
  {
    "headingId": "odeslanie-reklamowanego-towaru-do-sprzedajacego",
    "title": "Odesłanie reklamowanego towaru do sprzedającego",
    "url": "https://allegro.pl/regulaminy/polityka-reklamacji-i-zwrotow-na-allegro-m0mreg1YkCG#odeslanie-reklamowanego-towaru-do-sprzedajacego"
  }
]
});
const returnPolicy = registration({
  scenario: "return", version: "ab8a4d4c9242ed12345ac38782cba7a793417acc386ed694d23f98ca699870d6", digest: "ab8a4d4c9242ed12345ac38782cba7a793417acc386ed694d23f98ca699870d6",
  fileName: "returns.ab8a4d4c9242ed12345ac38782cba7a793417acc386ed694d23f98ca699870d6.html", sourceUrl, retrievedAt, originalRetrievedAt, language: "pl", characters: 21373,
  headings: [
  {
    "headingId": "rezygnacja-z-zakupu-odstapienie-od-umowy-bez-podania-przyczyny-jakie-masz-mozliwosci",
    "title": "Rezygnacja z zakupu (odstąpienie od umowy bez podania przyczyny) - jakie masz możliwości",
    "url": "https://allegro.pl/regulaminy/polityka-reklamacji-i-zwrotow-na-allegro-m0mreg1YkCG#rezygnacja-z-zakupu-odstapienie-od-umowy-bez-podania-przyczyny-jakie-masz-mozliwosci"
  },
  {
    "headingId": "anulowanie-zakupu",
    "title": "Anulowanie zakupu",
    "url": "https://allegro.pl/regulaminy/polityka-reklamacji-i-zwrotow-na-allegro-m0mreg1YkCG#anulowanie-zakupu"
  },
  {
    "headingId": "warunki-zwrotu-odstapienia-od-umowy-kto-i-kiedy-moze-zwrocic-przedmiot",
    "title": "Warunki zwrotu (odstąpienia od umowy) – kto i kiedy może zwrócić przedmiot",
    "url": "https://allegro.pl/regulaminy/polityka-reklamacji-i-zwrotow-na-allegro-m0mreg1YkCG#warunki-zwrotu-odstapienia-od-umowy-kto-i-kiedy-moze-zwrocic-przedmiot"
  },
  {
    "headingId": "kto-ma-prawo-zwrocic-zakup-odstapic-od-umowy",
    "title": "Kto ma prawo zwrócić zakup (odstąpić od umowy)",
    "url": "https://allegro.pl/regulaminy/polityka-reklamacji-i-zwrotow-na-allegro-m0mreg1YkCG#kto-ma-prawo-zwrocic-zakup-odstapic-od-umowy"
  },
  {
    "headingId": "sprzedajacy-moze-odmowic-przyjecia-zwrotu-jesli",
    "title": "Sprzedający może odmówić przyjęcia zwrotu, jeśli:",
    "url": "https://allegro.pl/regulaminy/polityka-reklamacji-i-zwrotow-na-allegro-m0mreg1YkCG#sprzedajacy-moze-odmowic-przyjecia-zwrotu-jesli"
  },
  {
    "headingId": "czas-na-poinformowanie-sprzedajacego-i-nadanie-przesylki",
    "title": "Czas na poinformowanie sprzedającego i nadanie przesyłki",
    "url": "https://allegro.pl/regulaminy/polityka-reklamacji-i-zwrotow-na-allegro-m0mreg1YkCG#czas-na-poinformowanie-sprzedajacego-i-nadanie-przesylki"
  },
  {
    "headingId": "poinformuj-sprzedajacego-o-zwrocie",
    "title": "Poinformuj sprzedającego o zwrocie",
    "url": "https://allegro.pl/regulaminy/polityka-reklamacji-i-zwrotow-na-allegro-m0mreg1YkCG#poinformuj-sprzedajacego-o-zwrocie"
  },
  {
    "headingId": "ile-masz-czasu-na-nadanie-przesylki-zwrotnej",
    "title": "Ile masz czasu na nadanie przesyłki zwrotnej",
    "url": "https://allegro.pl/regulaminy/polityka-reklamacji-i-zwrotow-na-allegro-m0mreg1YkCG#ile-masz-czasu-na-nadanie-przesylki-zwrotnej"
  },
  {
    "headingId": "zwrot-przesylki",
    "title": "Zwrot przesyłki",
    "url": "https://allegro.pl/regulaminy/polityka-reklamacji-i-zwrotow-na-allegro-m0mreg1YkCG#zwrot-przesylki"
  },
  {
    "headingId": "dostepne-sposoby-i-koszty-nadania-przesylki",
    "title": "Dostępne sposoby i koszty nadania przesyłki",
    "url": "https://allegro.pl/regulaminy/polityka-reklamacji-i-zwrotow-na-allegro-m0mreg1YkCG#dostepne-sposoby-i-koszty-nadania-przesylki"
  },
  {
    "headingId": "pakowanie-przesylki-zwrotnej",
    "title": "Pakowanie przesyłki zwrotnej",
    "url": "https://allegro.pl/regulaminy/polityka-reklamacji-i-zwrotow-na-allegro-m0mreg1YkCG#pakowanie-przesylki-zwrotnej"
  },
  {
    "headingId": "uszkodzenie-zwracanego-towaru",
    "title": "Uszkodzenie zwracanego towaru",
    "url": "https://allegro.pl/regulaminy/polityka-reklamacji-i-zwrotow-na-allegro-m0mreg1YkCG#uszkodzenie-zwracanego-towaru"
  },
  {
    "headingId": "zwrot-wplaty-przez-sprzedajacego",
    "title": "Zwrot wpłaty przez sprzedającego",
    "url": "https://allegro.pl/regulaminy/polityka-reklamacji-i-zwrotow-na-allegro-m0mreg1YkCG#zwrot-wplaty-przez-sprzedajacego"
  },
  {
    "headingId": "ile-czasu-ma-sprzedajacy-na-zwrocenie-ci-kosztow-zamowienia-w-ramach-niniejszej-polityki-reklamacji-i-zwrotow",
    "title": "Ile czasu ma sprzedający na zwrócenie Ci kosztów zamówienia w ramach niniejszej Polityki reklamacji i zwrotów",
    "url": "https://allegro.pl/regulaminy/polityka-reklamacji-i-zwrotow-na-allegro-m0mreg1YkCG#ile-czasu-ma-sprzedajacy-na-zwrocenie-ci-kosztow-zamowienia-w-ramach-niniejszej-polityki-reklamacji-i-zwrotow"
  },
  {
    "headingId": "w-jaki-sposob-sprzedajacy-zwroci-ci-wplate",
    "title": "W jaki sposób sprzedający zwróci Ci wpłatę",
    "url": "https://allegro.pl/regulaminy/polityka-reklamacji-i-zwrotow-na-allegro-m0mreg1YkCG#w-jaki-sposob-sprzedajacy-zwroci-ci-wplate"
  },
  {
    "headingId": "jaka-kwote-zwroci-ci-sprzedajacy-w-ramach-niniejszej-polityki-reklamacji-i-zwrotow",
    "title": "Jaką kwotę zwróci Ci sprzedający w ramach niniejszej Polityki reklamacji i zwrotów",
    "url": "https://allegro.pl/regulaminy/polityka-reklamacji-i-zwrotow-na-allegro-m0mreg1YkCG#jaka-kwote-zwroci-ci-sprzedajacy-w-ramach-niniejszej-polityki-reklamacji-i-zwrotow"
  },
  {
    "headingId": "zwroty-zagraniczne-dotyczy-tylko-allegropl",
    "title": "Zwroty zagraniczne – dotyczy tylko allegro.pl",
    "url": "https://allegro.pl/regulaminy/polityka-reklamacji-i-zwrotow-na-allegro-m0mreg1YkCG#zwroty-zagraniczne-dotyczy-tylko-allegropl"
  }
]
});

// Retain old version entries when adding a new current snapshot.
export const POLICY_REGISTRY = Object.freeze({
  complaint: Object.freeze({ currentVersion: complaint.version, versions: Object.freeze({ [complaint.version]: complaint }) }),
  return: Object.freeze({ currentVersion: returnPolicy.version, versions: Object.freeze({ [returnPolicy.version]: returnPolicy }) }),
});
export function getPolicyRegistration(scenario: PolicyScenario, version?: string): PolicyRegistration {
  if (scenario !== "complaint" && scenario !== "return") throw new PolicyResourceError("POLICY_CONFIGURATION_ERROR");
  const entry = POLICY_REGISTRY[scenario];
  const selected = version === undefined ? entry.currentVersion : version;
  if (!Object.hasOwn(entry.versions, selected)) {
    throw new PolicyResourceError(version === undefined ? "POLICY_CONFIGURATION_ERROR" : "POLICY_VERSION_UNAVAILABLE");
  }
  return entry.versions[selected];
}
