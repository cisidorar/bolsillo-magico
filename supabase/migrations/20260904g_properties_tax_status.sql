-- Situación tributaria de la propiedad: define qué cobros hay que seguir.
--
-- En Chile las dos cosas están enlazadas:
--   · Propiedad AFECTA a contribuciones → los derechos de aseo normalmente
--     vienen incluidos en el mismo giro trimestral del SII/TGR.
--   · Propiedad EXENTA (avalúo bajo el tramo) → no hay giro de contribuciones,
--     y la municipalidad cobra el aseo por separado, con sus propios giros.
--
-- Sin este dato el módulo no sabe si generar giros de aseo o no: a una
-- propiedad afecta le estaría inventando cobros que ya vienen en otro lado, y
-- a una exenta le estaría escondiendo una deuda real que se acumula.

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS contribuciones_status text
    CHECK (contribuciones_status IN ('afecto','exento')),
  ADD COLUMN IF NOT EXISTS aseo_billing text
    CHECK (aseo_billing IN ('included','separate','exempt'));
