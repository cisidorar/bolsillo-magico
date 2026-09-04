-- El arriendo lo paga el arrendatario, no la propietaria: property_charges
-- guardaba kind='rent' con responsible='owner' (heredado de cuando ese campo
-- solo se usaba para separar "sale de mi bolsillo" vs "no sale de mi
-- bolsillo" en los egresos). Con el arriendo eso nunca aplicó — es un
-- ingreso, nunca fue plata de la propietaria — pero al ser 'owner' aparecía
-- en la lista "Tuyos" en vez de "Del arrendatario", que es quien
-- efectivamente lo paga.
--
-- No afecta ningún cálculo financiero: property-summary.ts y
-- property-charges.ts filtran "por cobrar"/"deuda" por `direction`, no por
-- `responsible` — este cambio es puramente de categorización (en qué lista
-- aparece), no de montos.

UPDATE public.property_charges
SET responsible = 'tenant'
WHERE kind = 'rent' AND responsible = 'owner';
