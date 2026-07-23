# Pola

PWA appareil photo : capture ou importe une image, place-la dans un cadre Polaroid réaliste avec un rendu film instantané, et exporte le résultat — polaroid seul ou format 4:5 (fond blanc ou noir) prêt pour Instagram.

## Fonctionnalités

- **Viseur live** : la prévisualisation caméra est déjà dans le cadre, avec le rendu du film sélectionné (approximation CSS temps réel).
- **Films** : 600, SX-70, Time Zero, 669, N&B 667, Expiré — chaque preset combine courbes couleur par canal (lift/gamma/gain), saturation, halation, grain d'émulsion et vignettage, appliqués pixel par pixel sur canvas.
- **Cadres photoréalistes** : 600 Blanc, Instax Mini et Instax Brut utilisent de vrais scans à fenêtre transparente (`assets/frame-*.png`, la photo est composée sous l'alpha du scan) ; 600 Vieilli et 600 Noir sont synthétisés (fibre du papier par bruit multi-octaves, fenêtre embossée, usure des bords, auréoles). Géométries d'après les formats réels.
- **Animation de développement** après le déclenchement (respecte `prefers-reduced-motion`).
- **Export** : PNG haute résolution (polaroid seul) ou 2160 × 2700 (4:5), téléchargement ou partage natif (Web Share API).
- **PWA** : installable, hors-ligne (service worker), plein écran.

## Stack

Statique, zéro dépendance : HTML + CSS + JS modules. Tout le rendu est fait sur `<canvas>`.

## Développement local

```bash
python3 -m http.server 4173
```

Ouvre http://localhost:4173. La caméra nécessite HTTPS ou localhost.

## Marque

UI d'après le design Figma POLA BRAND : blanc, gris clair, orange `#FF872C`, formes arrondies. Logo (`assets/pola-logo.svg`) et icône du manifest (`icons/manifest-icon.svg`) fournis par le studio ; les PNG d'icônes sont rasterisés depuis ce SVG.

## Déploiement

Site statique — se déploie tel quel sur Vercel (aucune configuration).
