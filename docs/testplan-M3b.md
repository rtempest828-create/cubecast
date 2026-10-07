# Manueller Testplan – M3b (Chibi-Modus)

Start: `npm run dev` → Bereich **Modell**, Karte **Chibi-Modus**.

| # | Schritt | Erwartung |
|---|---|---|
| 1 | Strg+K | Chibi-Version: großer Kopf, kurzer Körper, Füße am Boden; Kamera richtet sich neu aus |
| 2 | Strg+K erneut | Normale Version |
| 3 | Stufen Kind / Chibi / Super-Deformed | Proportionen ändern sich sichtbar, Teile bleiben verbunden |
| 4 | Regler Kopf/Körper/Arme/Beine | Stufe springt auf „Eigene Werte“, Änderung sofort sichtbar |
| 5 | Skin-Textur B / A+ / A | B: scharfe, gleich große Pixel; A+: Schultern, Hände, Füße vollständig; A: gestaucht |
| 6 | Kamera an: Kopf drehen, blinzeln, sprechen | Tracking wie im Normalmodus, Gesicht größer |
| 7 | Test-Zubehör (Fuchsohren, Schwanz, Headset) | Ohren/Headset wachsen mit dem Kopf, Schwanz bleibt am Körper, Physik schwingt |
| 8 | Figura-Avatar (z. B. Sternenfuchs) | Head-, Body-, Arm- und Bein-Gruppen folgen; Lua-Effekte laufen weiter |
| 9 | Beispiel-Fuchs: „huepfen“ abspielen | Sprunghöhe passt zur kleineren Figur |
| 10 | F12, Teil anklicken, Feinanpassung: Größe/Versatz/Drehpunkt | Nur dieses Teil (mit Kindern) ändert sich; „Anpassung entfernen“ setzt zurück |
| 11 | OBS-Ausgabe offen, umschalten | OBS zeigt Chibi, Bildausschnitt passt |
| 12 | App neu starten, gleichen Avatar laden | Chibi-Einstellungen sind noch da |
| 13 | Globales Tastenkürzel „Chibi-Modus an/aus“ | Umschalten auch, wenn Minecraft im Vordergrund ist |
