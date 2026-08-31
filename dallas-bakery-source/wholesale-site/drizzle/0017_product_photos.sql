-- Give each bread its own photograph.
--
-- Every product row was seeded with the same placeholder, /images/case.jpg, so
-- the buyer app and the signed-in catalog showed one identical picture of a
-- cardboard case for all four breads. A buyer choosing between Classic,
-- Natural, Whole Wheat and Sesame had nothing to look at that told them apart.
--
-- These four files ship in wholesale-site/public/images/ and are built by
-- scripts/build-product-images.py.
--
-- Only rows still holding the placeholder are touched, so a photo the owner
-- has already chosen in /admin is never overwritten by this migration.

UPDATE `products` SET `image_url` = '/images/classic-barbari.webp'
  WHERE `sku` = 'WS-BARBARI-25' AND `image_url` = '/images/case.jpg';

UPDATE `products` SET `image_url` = '/images/natural-barbari.webp'
  WHERE `sku` = 'WS-NATURAL-25' AND `image_url` = '/images/case.jpg';

UPDATE `products` SET `image_url` = '/images/whole-wheat-barbari.webp'
  WHERE `sku` = 'WS-WHEAT-25' AND `image_url` = '/images/case.jpg';

UPDATE `products` SET `image_url` = '/images/sesame-barbari.webp'
  WHERE `sku` = 'WS-SESAME-25' AND `image_url` = '/images/case.jpg';
