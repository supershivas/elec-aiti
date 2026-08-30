# CLAUDE.md

## Nature du projet
Éditeur graphique statique (pas de temps réel, pas de backend) permettant de placer des
composants électriques sur des plans d'étage et de tracer les liaisons entre eux.
Hébergement : GitHub Pages (site statique, aucune donnée serveur).

## Rendu
- **SVG natif**, pas de canvas 2D. Les plans fournis (`aiti-elec_RDC.svg`,
  `aiti-elec_1er étage.svg`) sont déjà vectoriels, même viewBox `0 0 1558 801.32` sur les
  deux étages, avec calques `murs` / `pieces` / `equipements`. **Échelle : 1 unité du
  viewBox = 1 cm réel** (ex: un évier de cuisine/sdb du plan fait ~50x60 unités).
  On les charge via `fetch` + injection inline dans un SVG hôte (pour pouvoir styler/masquer
  les calques si besoin). Le SVG hôte contient : calque plan de fond (readonly) + calque
  composants + calque liaisons.
  Avantages : sélection/déplacement/rotation natifs des symboles, zoom net à tout niveau,
  export vectoriel trivial, pas de dépendance lourde.
- Composants : les symboles de position (prises, interrupteurs, points lumineux) restent des
  pictogrammes conventionnels de taille fixe (non mis à l'échelle réelle). L'électroménager et
  le tableau électrique, eux, sont dimensionnés en cm réels (ex: four/plaque/lave-linge/
  lave-vaisselle 60x60, chauffe-eau 50x50, tableau 60x40) pour donner une idée fidèle de
  l'encombrement sur le plan.
- Tous les composants posés sont **rouges** par défaut (`--color-component`), pour bien se
  distinguer des traits du plan de fond ; le bleu accent reste réservé à la sélection.

## Stack UI
**Vanilla JS en modules ES**, pas de framework. Pas de bundler — fichiers servis tels quels
(compatible GitHub Pages). L'UI (palette de composants, panneau de propriétés, sélecteur
d'étage) reste gérable avec quelques modules bien séparés.

## Modèle de données
```js
// Un composant posé sur un plan
Component {
  id: string,
  type: string,        // 'prise', 'prise_double', 'point_lumineux', 'interrupteur_simple',
                        // 'va_et_vient', 'poussoir', 'variateur', 'tableau_electrique',
                        // 'electromenager_four', 'electromenager_plaque', 'vmc', ...
  floorId: string,      // 'rdc', '1er-etage'
  x: number, y: number, // coordonnées dans le repère du viewBox du plan (1558 x 801.32)
  rotation: number,     // degrés
  label?: string,       // nom personnalisé (ex: "Prise cuisine plan de travail")
  groupId?: string       // interrupteur double/triple... : voir "Groupement de composants
                         // Commandes", regroupe plusieurs composants sous un cadre commun
}

// Une liaison = un fil entre deux extrémités (composant ou nœud intermédiaire)
Liaison {
  id: string,
  floorId: string,
  type: 'simple' | 'va_et_vient' | 'alimentation' | 'commande',
  fromComponentId: string,
  toComponentId: string,
  points?: [{x,y}, ...], // tracé intermédiaire optionnel (coudes du fil)
  circuitId?: string      // regroupe plusieurs liaisons formant un même circuit logique
}
```
- Un va-et-vient (2 interrupteurs + 1 point lumineux) = 2 `Liaison` de type `va_et_vient`
  partageant le même `circuitId` (interrupteur1↔lumière, interrupteur2↔lumière), plutôt
  qu'une liaison à 3 extrémités. Plus simple à router/afficher, cohérent avec "un fil = 2 bouts".
- Sauvegarde : **JSON** (le seul format persistant possible sans backend). Auto-save en
  `localStorage` + export/import du projet complet (tous étages) via le menu Fichier, au
  format `.aiti` (JSON renommé), nommé `circuit-DDMMYYYY.aiti` (pas de compte, pas de sync).
  Le nom du fichier courant (affiché en bas à droite du plan) et le journal des modifications
  (`changeLog`, consultable au clic dessus) font partie de ce JSON : ils survivent au
  rechargement et se retrouvent tels quels en rouvrant le fichier ailleurs. Ni l'un ni l'autre
  n'est concerné par l'historique d'annulation (Store.snapshot/undo/redo) : ce sont des
  métadonnées de présentation/journalisation, pas le contenu du plan.
- Export du schéma : menu Fichier > Exporter en SVG/PNG/PDF, toujours pour tous les étages
  (pas seulement celui affiché) — un fichier par étage pour SVG/PNG, une seule PDF
  multi-pages (une page par étage) pour PDF/impression. Légende générée automatiquement par
  étage, ne listant que les types de composants réellement posés sur cet étage-là. Le PDF
  passe par la boîte de dialogue d'impression du navigateur, sans dépendance de génération PDF.

## Gestion multi-étages
- La liste des étages vit dans le Store (`state.floors`, persistée comme le reste en
  localStorage + `.aiti`), pas dans un fichier statique : menu Plan > Nouvel étage /
  Renommer / Supprimer (toujours au moins un étage). `floors.js` ne fournit plus que
  `defaultFloors`, le jeu de départ utilisé quand aucun projet n'est encore enregistré.
- Chaque étage a un `kind` : `imported` (plan de fond vectorisé à la main, `planPath` vers
  un SVG, lecture seule — RDC et 1er étage fournis avec le projet) ou `drawn` (étage créé
  dans l'appli, sans `planPath`, dont les murs sont dessinés directement — voir la section
  Dessin de plans ci-dessous).
- Les composants/liaisons sont scopés par `floorId`. On affiche un étage à la fois,
  sélecteur d'étage en haut de l'UI.
- Les liaisons ne traversent pas les étages : un fil reste toujours dans le `floorId`
  de ses deux extrémités.
- Un équipement physique unique peut être visible sur deux étages (ex: point lumineux
  de cage d'escalier commandé depuis le RDC et le 1er) : dans le panneau de propriétés,
  bouton "Ajouter aussi sur : [autre étage]" pose une copie liée (`linkedComponentId`
  mutuel) sur l'autre étage, avec sa propre position/rotation (le plan diffère), et
  peut ensuite être reliée à un interrupteur local via une liaison normale sur cet
  étage. "Aller à l'exemplaire lié" bascule d'étage et sélectionne le double ;
  "Dissocier" retire le lien sans supprimer les composants.

## Dessin de plans (étages "drawn")
- Objectif : pouvoir recréer un plan aussi complet que RDC/1er étage (murs, ouvertures,
  pièces) sur un étage créé dans l'appli. Les deux plans importés existants restent des
  images de fond figées, non éditables — pas de conversion prévue dans l'autre sens.
- **Murs (fait)** : `Wall { id, floorId, x1, y1, x2, y2, thicknessLeft, thicknessRight }`
  dans `state.js`, scopé par `floorId`. Le segment (x1,y1)-(x2,y2) est une ligne de
  référence, pas forcément le centre du mur : `thicknessLeft`/`thicknessRight` sont
  indépendantes (ex: mur extérieur avec `thicknessLeft: 0` dont toute l'épaisseur part
  vers l'extérieur en `thicknessRight`). "Côté 1"/"côté 2" = normale au segment ;
  un repère pointillé sur le plan indique le côté 1 quand le mur est sélectionné.
  Outil Murs (`js/editor/wallTool.js`) : clic-clic en chaîne (comme une polyligne),
  snap aux extrémités des murs existants et aux angles de 45° (`js/editor/wallSnapping.js`),
  Échap pour terminer la chaîne. Rendu/sélection/édition dans `js/editor/wallsLayer.js`
  (calque `#walls-layer`, avant le calque liaisons/composants) : glissé des extrémités
  (avec snap), glissé du mur entier, épaisseurs éditables dans le panneau de propriétés,
  bouton "Inverser les côtés". Un mur n'est pas restreint aux étages "drawn" (rien ne
  l'empêche techniquement sur un étage importé) mais c'est son usage principal.
  Deux murs dont une extrémité coïncide (à qq mm près, voir `wallJoints.js`) sont traités
  comme reliés par un même coin, sans notion de sommet partagé dans le modèle de données :
  la coïncidence des coordonnées fait foi. Un patch circulaire de la couleur des murs
  comble le vide entre leurs rectangles à la jointure. Cliquer une poignée d'extrémité sans
  glisser sélectionne ce coin (au lieu du mur) : les flèches du clavier le déplacent alors
  de 1cm (10cm avec Maj), et déplacent ensemble toutes les extrémités de murs qui y
  coïncident pour garder les murs connectés ; un glissé à la souris fait de même, avec un
  nouveau snap possible vers un autre coin existant.
- **Ouvertures (fait, bêta uniquement)** : `Opening { id, floorId, wallId, offset, width, type: 'porte' | 'fenetre' }`
  dans `state.js`, scopé par `floorId`. `offset` = distance depuis (x1,y1) du mur porteur.
  Découpe visuellement le mur porteur : `WallsLayer` scinde le rectangle du mur en
  segments pleins de part et d'autre de chaque ouverture (`js/editor/wallsLayer.js`,
  `renderOpening`/`buildWallSegmentShape`), et dessine le vantail + arc de débattement
  pointillé pour une porte (même convention que le composant "Porte" des plans importés,
  qui reste utile là où on ne peut pas creuser le mur), ou un simple remplissage de
  vitrage pour une fenêtre. Outil Ouvertures (`js/editor/openingTool.js`) : clic sur un
  mur pour y poser une ouverture centrée sur le point cliqué (position/largeur/type
  modifiables ensuite dans le panneau de propriétés). Bouton de mode et sélecteur de
  type présents uniquement dans `beta/index.html` (absents du DOM de l'appli principale,
  `main.js` s'y adapte via des vérifications de nullité) : le rendu des ouvertures reste
  disponible partout (import d'un projet créé en bêta), mais la pose est bêta seulement
  tant que la fonctionnalité n'a pas rejoint la version stable.
- **Pièces (fait, bêta uniquement)** : `RoomArea { id, floorId, points: [{x,y}, ...], label? }`
  dans `state.js`, scopé par `floorId` (nommé `rooms` côté Store). Polygone fermé tracé à
  la main (pas de détection automatique de boucle fermée à partir des murs : trop complexe
  pour la valeur ajoutée en v1), avec remplissage + label optionnel centré (centroïde des
  sommets). Outil Pièces (`js/editor/roomTool.js`) : clic-clic pose les sommets (aimantés
  aux extrémités des murs existants), reclic près du premier sommet (ou Entrée) referme le
  polygone et pose la pièce, Échap annule le tracé en cours — rien n'est enregistré tant
  que le polygone n'est pas fermé. Rendu/sélection/édition dans `js/editor/roomsLayer.js`
  (calque `#rooms-layer`, juste après le plan de fond, avant les murs — ceux-ci restent
  peints par-dessus le remplissage à leurs frontières et gardent la priorité de clic) :
  glissé de chaque sommet individuellement ou de la pièce entière, nom éditable dans le
  panneau de propriétés. Même principe bêta uniquement que les ouvertures : bouton de mode
  seulement dans `beta/index.html`, `main.js` s'y adapte via des vérifications de nullité,
  le rendu reste partagé.

## Comparaison de plans
Menu Fichier > Comparer avec un fichier (.aiti)... : charge un second fichier en mémoire
(`js/editor/diffLayer.js`), sans jamais toucher au Store ni au projet ouvert — pas de
fusion, juste un affichage superposé. Diff par étage (apparié par `floor.id`) et par
composant (apparié par `component.id`) : pertinent pour comparer deux versions sauvegardées
d'un même projet (ex: avant/après une série de modifs), pas deux projets sans rapport (les
id ne correspondraient à rien, tout apparaîtrait comme ajouté/supprimé). Composant présent
seulement dans le projet ouvert → ajouté (vert) ; seulement dans le fichier comparé →
supprimé (silhouette pointillée rouge à son ancien emplacement) ; présent dans les deux mais
position/rotation/type/nom différents → modifié (orange), avec un trait pointillé vers
l'ancienne position si déplacé. Bannière en haut de l'écran avec le décompte pour l'étage
affiché (ou un message si cet étage n'existe pas dans le fichier comparé) et un bouton pour
quitter la comparaison. Coupée automatiquement par "Nouveau projet"/"Ouvrir un projet" (la
comparaison n'aurait plus de sens contre un projet différent) ; jamais incluse dans les
exports (SVG/PNG/PDF).

## Design system
- `css/design-tokens.css` : variables CSS pour couleurs, espacements (grille base 4px :
  4/8/12/16/24/32/48px), typographie.
- Palette (ambiance "plan technique/bureau d'études") : fond très clair (quasi blanc/gris
  bleuté), traits du plan en gris foncé neutre, accent bleu pour la sélection, orange/ambre
  pour l'élément survolé, couleurs de liaison différenciées par type de circuit (ex: bleu =
  éclairage, vert = prises, rouge = tableau/alimentation).
- Centrage systématique en flex/grid, aucune valeur en dur hors tokens.

## Git & workflow
- **Toujours pousser directement sur `main`**, jamais de branche intermédiaire ni de PR,
  même si un outil/environnement propose par défaut une autre branche.
- Commits en français, convention `feat:` / `fix:` (+ `refactor:`, `chore:` si besoin).
- Jamais de force-push sans demande explicite.
- Avant chaque feature : résumer la compréhension + lister les cas limites avant de coder,
  sans élargir le scope de soi-même.

## Conventions de code
- Variables/fonctions en anglais, commentaires en français (uniquement si le "pourquoi"
  n'est pas évident).
- Pas de dépendance externe lourde sans justification explicite.

## Structure de dossiers proposée
```
/
  index.html
  css/
    design-tokens.css
    base.css
    editor.css
  js/
    main.js
    state.js              # store applicatif (composants, liaisons, étage courant)
    floors.js             # defaultFloors (jeu de départ ; la liste vivante est dans le Store)
    io/
      storage.js           # localStorage
      exportImport.js       # export/import JSON
    catalog/
      components.js         # catalogue des types de composants (data-driven)
      symbols/               # symboles SVG réutilisables (<symbol> dans <defs>)
    editor/
      stage.js              # pan/zoom, injection du plan, calques
      selection.js           # sélection/déplacement/rotation
      linking.js             # outil de tracé de liaisons
      propertiesPanel.js     # panneau propriétés du composant/liaison sélectionné
  plans/                    # les SVG de plans d'étage existants, déplacés ici
    aiti-elec_RDC.svg
    aiti-elec_1er étage.svg
  beta/
    index.html               # même appli, servie en /beta/ (voir "Version bêta" ci-dessous)
```

## Version bêta
- `beta/index.html` sert la même appli (mêmes `css/`, `js/` partagés, juste des chemins
  relatifs adaptés) sous un chemin séparé, avec un badge "Bêta" dans le bandeau. C'est le
  bac à sable où les prochaines phases du dessin de plans (ouvertures, pièces) se
  développent et se testent avant de rejoindre la version stable.
- Les fonctionnalités déjà livrées (murs, gestion des étages) restent aussi disponibles
  dans l'appli principale : la bêta n'est pas la seule à les avoir, elle sert juste de
  longueur d'avance pour la suite.
- `beta/plans/` est une **copie** de `plans/` (les plans RDC/1er étage ne changent
  quasiment jamais, dupliquer ces deux SVG est plus simple/robuste que faire dépendre leur
  résolution du module JS qui les charge — approche tentée puis abandonnée après une
  régression en prod, cf. historique git). `Stage.loadFloor` résout `planPath` normalement,
  relativement à la page HTML : toute nouvelle page qui réutilise l'appli doit donc avoir
  son propre `plans/` à côté d'elle.
- Stockage localStorage isolé par une clé dédiée (`elec-aiti:project:beta` vs
  `elec-aiti:project`, voir `state.js`) : même origine que la version stable (juste un
  sous-dossier), donc sans ça les deux partageraient le même projet.
- Lien réciproque dans le menu Plan des deux pages.

## Groupement de composants Commandes
Un interrupteur double/triple... n'est pas une entrée de catalogue par variante mais un
groupe : des composants de la famille Commandes (interrupteur simple, va-et-vient,
poussoir, variateur) partageant un `groupId`, avec l'entité de groupe elle-même
(`{ id, floorId, comment?, switchKind?, orientation? }`) dans `state.groups`. Panneau de
propriétés : bouton "Grouper avec un autre interrupteur" (clic-cible sur le plan, même
mécanique que "Ajouter une liaison") ; une fois groupé, "Ajouter un autre interrupteur au
groupe" (rejoint le même groupe), "Retirer du groupe", deux sélecteurs facultatifs — "Type
d'interrupteur" (ex: "Double allumage" pour un groupe de 2, "Triple allumage" pour 3, voir
`catalog/groupKinds.js`) et "Placement" (horizontal/vertical) — et un champ de note propre
au groupe. Un groupe de moins de 2 membres est automatiquement dissous (composant retiré ou
supprimé). Rendu (`ComponentsLayer.renderGroupRect`) : rectangle pointillé englobant les
centres des composants du groupe, sous les pictogrammes, avec une étiquette optionnelle
sous le cadre (`buildGroupKindLabel`) reprenant type/placement quand renseignés.

## Catalogue de composants initial (v1)
Prises (simple, double, étanche, + prises spécialisées plaque/four/lave-linge/
lave-vaisselle/convecteur/chauffe-eau/sèche-serviette pour les circuits dédiés), points
lumineux (plafonnier, applique, spot),
interrupteur simple, va-et-vient, poussoir, variateur, tableau électrique, prise de terre,
électroménager (four, plaque, lave-linge, lave-vaisselle, chauffe-eau/cumulus, convecteur
électrique, sèche-serviette, réfrigérateur), VMC, sanitaire (toilettes, lavabo — pas
électriques mais utiles comme repères d'encombrement), meuble personnalisé (taille/nom
libres, demandés à la pose).
Catalogue data-driven (`catalog/components.js`) : ajouter un type = ajouter une entrée +
un symbole, sans toucher au reste du code.

## Hors-scope explicite (v1)
- Pas de calcul de bilan de puissance, de sections de câble, de conformité NF C 15-100.
- Pas de multi-utilisateur / compte / sync serveur (site statique).
- Pas d'export PDF dédié (le SVG suffit en v1).
- Pas de liaisons graphiques inter-étages (voir "Gestion multi-étages" pour le mécanisme
  de composant lié qui couvre le besoin réel : même équipement visible sur deux étages).
- Pas d'undo/redo avancé en v1 (à évaluer plus tard si besoin).
