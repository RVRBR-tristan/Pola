# Product

## Register

product

## Users

Tristan (designer, Studio Réverbère) et toute personne qui veut publier des photos à l'esthétique Polaroid sur Instagram. Contexte : téléphone en main, une seule main souvent, en train de shooter ou de reprendre une photo existante. Le travail à accomplir : capturer/importer → obtenir un polaroid crédible → exporter en 4:5 → publier.

## Product Purpose

Pola est une PWA appareil photo qui place une image dans un cadre Polaroid réaliste avec un rendu film instantané (courbes couleur, grain, vignettage, halation) et exporte soit le polaroid seul, soit un format 4:5 (fond blanc ou noir) prêt pour Instagram. Succès = le résultat passe pour un vrai scan de polaroid, en trois gestes.

## Brand Personality

Analogique, précis, chaleureux. Identité POLA (Figma « POLA BRAND ») : blanc, gris clair, orange #FF872C, formes très arrondies, logo cadre-polaroid en trait arrondi. Le chrome reste discret pour laisser la photo dominer. Le seul moment de délice assumé : le développement de la photo après le déclenchement.

## Anti-references

- Les apps « filtres vintage » criardes (badges, stickers, UI surchargée type retro-camera toys).
- Le skeuomorphisme intégral (fausse texture cuir, faux boîtier).
- Les filtres Instagram génériques : ici les presets simulent des films précis (600, SX-70, Time Zero…), pas des « moods ».

## Design Principles

1. **Le chrome est un viseur** : surfaces neutres (blanc, gris clair, chroma 0) pour que les couleurs de la photo restent justes. Un seul accent : l'orange POLA #FF872C.
2. **Trois gestes maximum** entre l'ouverture et l'export.
3. **Le réalisme vit dans l'image, pas dans l'UI** : textures, taches et grain appartiennent au polaroid rendu, jamais à l'interface.
4. **Un moment de magie, un seul** : l'animation de développement. Tout le reste est instantané (150–250 ms).

## Accessibility & Inclusion

Contraste ≥ 4.5:1 sur tout texte du chrome. Cibles tactiles ≥ 44 px. `prefers-reduced-motion` : le développement devient un fondu court. Fonctionne sans caméra (import fichier) et hors-ligne (PWA).
