# Pola

PWA appareil photo : capture ou importe une image, place-la dans un cadre Polaroid réaliste avec un rendu film instantané, et exporte le résultat — polaroid seul ou format 4:5 (fond blanc ou noir) prêt pour Instagram.

## Fonctionnalités

- **Viseur live** : la prévisualisation caméra est déjà dans le cadre, avec le rendu du film sélectionné (approximation CSS temps réel).
- **Films** : 600, SX-70, Time Zero, Go, 669, N&B 667, Bleu (Reclaimed), Duochromes Bleu/Jaune/Rouge, Expiré — calibrés d'après le catalogue Polaroid et les caractéristiques documentées ; chaque preset combine voile des noirs et plafond des blancs par canal, croisement tonal, saturation, halation, grain et vignettage, appliqués pixel par pixel sur canvas.
- **Cadres photoréalistes** : Polaroid 600, Instax Mini et Instax Brut — de vrais scans à fenêtre transparente (`assets/frame-*.png`), la photo est composée sous l'alpha du scan. Géométries d'après les formats réels.
- **Réglages** : exposition (± 1,2 EV), contraste, saturation, grain et flou gaussien — repliés dans le pipeline film, aperçu rapide basse résolution pendant le glissement, rendu plein au relâchement. Saturation et grain s'initialisent sur le film choisi. Onglets Réglages / Fond 4:5.
- **Flash** : torche matérielle quand disponible (Android), sinon flash d'écran (plein blanc pendant la capture).
- **Déclencheur matériel** : sur l'écran de prise de vue, le bouton de volume (télécommandes Bluetooth / perches à selfie émettant Volume ±) et les touches Entrée / Espace déclenchent la capture — alternative mains libres au bouton à l'écran. (Le bouton de volume physique du téléphone reste intercepté par le navigateur sur Android et n'est pas transmis à la page.)
- **Animation de développement** après le déclenchement (respecte `prefers-reduced-motion`).
- **Fond 4:5 en collage** : en mode 4:5, un bouton **+** dans le coin supérieur droit de l'aperçu ajoute une photo de fond (recadrée « cover ») derrière le polaroid ; le **×** la retire. Le fond est conservé avec le tirage dans la galerie et restitué à l'export.
- **Export** : jeu de fichiers PNG haute résolution par tirage, identique partout dans l'app (bouton Télécharger de l'éditeur comme export de masse de la galerie) — l'original filtré non recadré (`-original`), le polaroid encadré, et la composition 2160 × 2700 (`-4-5`) uniquement si un fond 4:5 est activé. Chaque fichier est téléchargé individuellement.
- **Galerie** : chaque photo est conservée localement (IndexedDB) avec sa source pleine résolution et ses réglages — rééditable à tout moment ; sélection unitaire ou de masse, suppression avec confirmation, et export de masse qui re-rend chaque tirage en pleine résolution selon ses propres réglages (film, cadre, recadrage, light leak, fond 4:5) puis télécharge le jeu de fichiers **individuellement** dans le dossier Téléchargements de l'appareil — repris automatiquement par la sauvegarde Google Photos.
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
