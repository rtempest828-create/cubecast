# MediaPipe-Modelle

Die Modelle werden mit der App ausgeliefert, damit zur Laufzeit kein Netzwerkzugriff nötig ist.

| Datei | Quelle | Lizenz |
|---|---|---|
| `face_landmarker.task` (float16, Version 1) | `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task` | Apache 2.0 |

| `pose_landmarker_lite.task` (float16, Version 1) | `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task` | Apache 2.0 |

SHA-256 `face_landmarker.task`: `64184E229B263107BC2B804C6625DB1341FF2BB731874B0BCC2FE6544E0BC9FF`
SHA-256 `pose_landmarker_lite.task`: `59929E1D1EE95287735DDD833B19CF4AC46D29BC7AFDDBBF6753C459690D574A`

Das Pose-Modell wird nur geladen, wenn „Arm-Tracking“ eingeschaltet ist.
