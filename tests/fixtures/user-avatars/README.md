# Eigene Beispiel-Avatare

Lege hier Figura-Avatare ab, die getestet werden sollen – jeweils als eigener Ordner
(z. B. `tests/fixtures/user-avatars/fuchs/` mit `avatar.json`, `.bbmodel`, `.lua`, `.png`).

Der Inhalt dieses Ordners wird **nicht** ins Git übernommen (siehe `.gitignore`), weil Avatare
fremde Inhalte enthalten können. Ab Meilenstein M5 lädt ein automatischer Smoke-Test jeden Avatar
hier und listet Warnungen zu nicht unterstützten Funktionen auf.
