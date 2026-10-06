# Manueller Testplan – M2 (Webcam + Kopf-Tracking)

Start: `npm run dev` → Bereich **Tracking**

| # | Schritt | Erwartung |
|---|---|---|
| 1 | „Kamera starten“ | Status „Startet …“, dann „Tracking läuft (Berechnung auf GPU)“, Vorschau zeigt dein Bild gespiegelt |
| 2 | Live-Werte ansehen | Bildrate Darstellung ≈ 60 FPS, Tracking ≈ Kamera-FPS (meist 30), Latenz < 50 ms, „Gesicht erkannt: ja“ |
| 3 | Kopf langsam nach links drehen (Spiegeln an) | Figur dreht den Kopf auf dem Bildschirm nach links, Yaw-Balken schlägt aus |
| 4 | Nicken (Kinn zur Brust) | Figur schaut nach unten |
| 5 | Kopf zur Schulter neigen | Figur neigt den Kopf zur selben Bildschirmseite |
| 6 | „Spiegeln“ ausschalten, Schritt 3 wiederholen | Figur dreht sich jetzt zur anderen Seite |
| 7 | Gerade hinsetzen, „Neutrale Pose setzen“ | Meldung „Neutrale Pose gesetzt.“, Figur schaut exakt geradeaus, Yaw/Pitch/Roll ≈ 0° |
| 8 | Glättung auf 100 %, Kopf schnell bewegen | Bewegung sehr ruhig, leicht verzögert |
| 9 | Glättung 0 %, Reaktion 100 % | Bewegung direkt, evtl. leichtes Zittern im Stillstand |
| 10 | Bewegungsstärke 200 % | Figur dreht den Kopf doppelt so weit (begrenzt auf natürliche Maximalwerte) |
| 11 | Aus dem Bild gehen bzw. Gesicht verdecken | Nach ca. 0,4 s kehrt der Kopf sanft zur Mitte zurück, „Gesicht erkannt: nein“ |
| 12 | Wieder ins Bild kommen | Kopf folgt wieder ohne Sprung |
| 13 | Andere Kamera in der Liste wählen (falls vorhanden) | Tracking startet mit der neuen Kamera neu |
| 14 | Kamera in einem anderen Programm öffnen (z. B. OBS), dann hier starten | Verständliche Meldung „wird gerade von einem anderen Programm verwendet“ |
| 15 | Kamerazugriff in Windows (Datenschutz → Kamera) für Desktop-Apps sperren, starten | Meldung mit Hinweis auf die Windows-Einstellung |
| 16 | USB-Kamera während des Trackings abziehen | Meldung „Die Kamera wurde getrennt.“, App läuft weiter |
| 17 | App neu starten | Gewählte Kamera und Regler-Einstellungen sind gespeichert |
| 18 | Tab wechseln (z. B. „Modell“) während das Tracking läuft | Kopf bewegt sich weiter |
