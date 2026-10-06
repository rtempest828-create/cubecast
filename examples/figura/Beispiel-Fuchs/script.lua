-- Beispiel-Fuchs: blendet den normalen Minecraft-Körper aus und wedelt dauerhaft.
-- (Lua läuft in der VTuber-App ab Meilenstein M5c.)
vanilla_model.PLAYER:setVisible(false)
animations.model.wedeln:play()
