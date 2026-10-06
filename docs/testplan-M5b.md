# Manueller Testplan – M5b (Blockbench-Animationen)

Start: `npm run dev` → Bereich **Modell** → Avatar „Beispiel-Fuchs (Beispiel)“ laden → Bereich **Animationen**.

| # | Schritt | Erwartung |
|---|---|---|
| 1 | Bereich „Animationen“ ohne geladenen Figura-Avatar | Hinweis und Knopf „Zum Bereich Modell“ |
| 2 | Beispiel-Fuchs laden, Bereich „Animationen“ | Fünf Animationen: wedeln (Endlos), winken (Einmal, ersetzt Tracking), huepfen (Einmal), ohren_zucken (Endlos), nicken (Einmal, Ende halten) |
| 3 | „wedeln“ ▶ | Schweif schwingt gleichmäßig hin und her, Spitze leicht versetzt; Balken läuft immer wieder durch |
| 4 | „winken“ ▶ | Rechter Arm der Figur geht nach außen hoch, winkt zweimal, geht zurück; danach endet die Animation von selbst (▶ erscheint wieder) |
| 5 | Während „winken“ Arm-Tracking an (Bereich Körper & Physik) | Der Arm folgt währenddessen nur der Animation (Override), danach wieder dem Tracking |
| 6 | „huepfen“ ▶ | Figur hüpft weich (Bézier) hoch und landet, Ohren klappen dabei kurz nach außen |
| 7 | „ohren_zucken“ ▶ | Rechtes Ohr zuckt alle 3 Sekunden kurz (Stufe, kein weicher Übergang) |
| 8 | „nicken“ ▶ | Kopf neigt sich nach vorne und bleibt so (Ende halten); ■ setzt ihn zurück |
| 9 | ❚❚ während einer Animation, danach ▶ | Hält an der Stelle an, läuft dort weiter |
| 10 | ↺ | Beginnt sofort von vorn |
| 11 | „wedeln“ → Einstellungen → Tempo 2× / Stärke 50 % | Doppelt so schnell / halber Ausschlag |
| 12 | „wedeln“ → Wiederholung „Einmal“ | Läuft genau einmal |
| 13 | „wedeln“ → Auslöser „solange …“, Signal `mouth.smile`, Schwelle 0,6; Kamera an, lächeln | Schweif wedelt nur beim Lächeln |
| 14 | „huepfen“ → Auslöser „startet neu …“, Signal `mouth.open` | Jedes Mund-Öffnen löst einen Hüpfer aus |
| 15 | „wedeln“ → Autostart an, App neu starten, Avatar laden | Wedeln läuft sofort; alle Einstellungen sind noch da |
| 16 | Physik für Ohren/Schweif bestätigt („Alle Vorschläge bestätigen“), „huepfen“ | Ohren schwingen nach der Landung nach |
| 17 | Debug-Modus (F12) | HUD zeigt „Animationen: N von 5 aktiv“ |
| 18 | Anderen Avatar laden | Laufende Animationen des alten Avatars stoppen |
