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
  label?: string        // nom personnalisé (ex: "Prise cuisine plan de travail")
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
- Export du schéma : menu Fichier > Exporter en SVG/PNG/PDF, toujours pour tous les étages
  (pas seulement celui affiché) — un fichier par étage pour SVG/PNG, une seule PDF
  multi-pages (une page par étage) pour PDF/impression. Légende générée automatiquement par
  étage, ne listant que les types de composants réellement posés sur cet étage-là. Le PDF
  passe par la boîte de dialogue d'impression du navigateur, sans dépendance de génération PDF.

## Gestion multi-étages
- Un `floors.json` (ou tableau en dur) liste les étages : `{id, label, planPath}`.
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
    floors.js             # liste des étages + chargement des plans SVG
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
```

## Catalogue de composants initial (v1)
Prises (simple, double, étanche, + prises spécialisées plaque/four/lave-linge/
lave-vaisselle pour les circuits dédiés), points lumineux (plafonnier, applique, spot),
interrupteur simple, va-et-vient, poussoir, variateur, tableau électrique,
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
