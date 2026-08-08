# CLAUDE.md

## Nature du projet
Éditeur graphique statique (pas de temps réel, pas de backend) permettant de placer des
composants électriques sur des plans d'étage et de tracer les liaisons entre eux.
Hébergement : GitHub Pages (site statique, aucune donnée serveur).

## Rendu
- **SVG natif**, pas de canvas 2D. Les plans fournis (`aiti-elec_RDC.svg`,
  `aiti-elec_1er étage.svg`) sont déjà vectoriels, même viewBox `0 0 1558 801.32` sur les
  deux étages, avec calques `murs` / `pieces` / `equipements`.
  On les charge via `fetch` + injection inline dans un SVG hôte (pour pouvoir styler/masquer
  les calques si besoin). Le SVG hôte contient : calque plan de fond (readonly) + calque
  composants + calque liaisons.
  Avantages : sélection/déplacement/rotation natifs des symboles, zoom net à tout niveau,
  export vectoriel trivial, pas de dépendance lourde.

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
  `localStorage` + bouton export/import de fichier `.json` (pas de compte, pas de sync).
- Export image du schéma final : le SVG produit est déjà exportable tel quel (clic droit
  "enregistrer" ou bouton "exporter en SVG"), pas besoin de lib de rendu PDF/PNG en v1.

## Gestion multi-étages
- Un `floors.json` (ou tableau en dur) liste les étages : `{id, label, planPath}`.
- Les composants/liaisons sont scopés par `floorId`. On affiche un étage à la fois,
  sélecteur d'étage en haut de l'UI.
- Les liaisons ne traversent pas les étages en v1 (une colonne montante tableau→tableau
  entre étages n'est pas modélisée comme liaison graphique, juste comme deux tableaux
  indépendants). À revoir si besoin réel.

## Design system
- `css/design-tokens.css` : variables CSS pour couleurs, espacements (grille base 4px :
  4/8/12/16/24/32/48px), typographie.
- Palette (ambiance "plan technique/bureau d'études") : fond très clair (quasi blanc/gris
  bleuté), traits du plan en gris foncé neutre, accent bleu pour la sélection, orange/ambre
  pour l'élément survolé, couleurs de liaison différenciées par type de circuit (ex: bleu =
  éclairage, vert = prises, rouge = tableau/alimentation).
- Centrage systématique en flex/grid, aucune valeur en dur hors tokens.

## Git & workflow
- Push direct sur `main`.
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
Prises (simple, double, étanche), points lumineux (plafonnier, applique, spot),
interrupteur simple, va-et-vient, poussoir, variateur, tableau électrique,
électroménager (four, plaque, lave-linge, lave-vaisselle, chauffe-eau), VMC.
Catalogue data-driven (`catalog/components.js`) : ajouter un type = ajouter une entrée +
un symbole, sans toucher au reste du code.

## Hors-scope explicite (v1)
- Pas de calcul de bilan de puissance, de sections de câble, de conformité NF C 15-100.
- Pas de multi-utilisateur / compte / sync serveur (site statique).
- Pas d'export PDF dédié (le SVG suffit en v1).
- Pas de liaisons inter-étages.
- Pas d'undo/redo avancé en v1 (à évaluer plus tard si besoin).
