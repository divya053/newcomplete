-- 0006 — add the downloadable DXF artifact to generated drawings. Additive (Law #5).
ALTER TABLE drawings ADD COLUMN dxf LONGTEXT NULL AFTER svg;
