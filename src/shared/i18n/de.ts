/**
 * Deutsche UI-Texte. Weitere Sprachen: Datei mit denselben Schlüsseln anlegen und in
 * `index.ts` registrieren. Platzhalter in geschweiften Klammern, z. B. {name}.
 */
export const de = {
  'app.title': 'Minecraft VTuber',

  'tab.model': 'Modell',
  'tab.tracking': 'Tracking',
  'tab.face': 'Gesicht & Emotionen',
  'tab.physics': 'Physik',
  'tab.output': 'Ausgabe',
  'tab.settings': 'Einstellungen',
  'placeholder.comingSoon': 'Dieser Bereich wird in Meilenstein {milestone} gebaut.',

  'model.section.load': 'Skin laden',
  'model.dropHint': 'Skin-PNG hierher ziehen oder klicken, um eine Datei zu wählen',
  'model.playerName': 'Spielername',
  'model.playerNamePlaceholder': 'z. B. Notch',
  'model.loadPlayer': 'Laden',
  'model.loading': 'Lädt …',
  'model.downloadNote': 'Lädt den Skin über die Mojang-API. Das ist der einzige Netzwerkzugriff der App.',
  'model.section.current': 'Aktueller Skin',
  'model.source.placeholder': 'Platzhalter-Skin',
  'model.source.file': 'Datei: {name}',
  'model.source.player': 'Spieler: {name}',
  'model.info.size': '{width} × {height} px',
  'model.info.legacy': 'Altes 64×32-Format (automatisch konvertiert)',
  'model.info.hd': 'HD-Skin (Faktor {scale})',
  'model.section.type': 'Modelltyp',
  'model.type.auto': 'Automatisch (erkannt: {detected})',
  'model.type.classic': 'Classic – Steve, 4 px breite Arme',
  'model.type.slim': 'Slim – Alex, 3 px breite Arme',
  'model.type.name.classic': 'Classic',
  'model.type.name.slim': 'Slim',
  'model.section.layers': 'Ebenen',
  'model.outerLayer': 'Zweite Ebene anzeigen (Hut, Jacke, Ärmel, Hosenbeine)',

  'viewport.hint': 'Linke Maustaste: drehen · Rechte Maustaste: verschieben · Mausrad: zoomen',
  'drop.overlay': 'Loslassen, um den Skin zu laden',
  'toast.skinLoaded': 'Skin geladen.',
  'toast.close': 'Schließen',

  'error.skin.decode': 'Die Datei ist kein gültiges PNG-Bild ({reason}).',
  'error.skin.size': 'Ungültige Skin-Größe {width} × {height} px. Erwartet wird 64 × 64 oder 64 × 32 (bzw. ein Vielfaches für HD-Skins).',
  'error.skin.notPng': 'Bitte eine PNG-Datei verwenden.',
  'error.skin.unknown': 'Der Skin konnte nicht geladen werden.',
  'error.download.invalid-name': 'Ungültiger Spielername. Erlaubt sind 1–16 Zeichen: Buchstaben, Ziffern und _.',
  'error.download.not-found': 'Diesen Spieler gibt es nicht.',
  'error.download.no-skin': 'Dieser Spieler nutzt einen Standard-Skin. Standard-Skins können nicht geladen werden.',
  'error.download.rate-limited': 'Zu viele Anfragen an Mojang. Bitte kurz warten und erneut versuchen.',
  'error.download.network': 'Keine Verbindung zu den Mojang-Servern.',
  'error.download.bad-response': 'Unerwartete Antwort der Mojang-Server.',
  'error.download.too-large': 'Die heruntergeladene Datei ist zu groß.',
  'error.file.too-large': 'Die Datei ist zu groß (max. 5 MB).',
  'error.file.read-failed': 'Die Datei konnte nicht gelesen werden.',
  'error.webgl': '3D-Darstellung nicht möglich: WebGL ist nicht verfügbar.',

  'dialog.openSkin.title': 'Skin öffnen',
  'dialog.openSkin.filter': 'PNG-Bilder'
} as const
