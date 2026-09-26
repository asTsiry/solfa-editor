import { useEffect, useRef } from 'react';
import type { JSX } from 'react';
import { Modal } from '@solfa/ui';

export type HelpDialogProps = {
  readonly open: boolean;
  readonly onClose: () => void;
};

const SHORTCUTS: readonly [string, string][] = [
  ['↑ / ↓', 'Monter ou descendre la note sélectionnée d’un degré'],
  ['Maj + ↑ / ↓', 'Monter ou descendre la note sélectionnée d’une octave'],
  ['Ctrl/Cmd + Z', 'Annuler la dernière modification'],
  ['Ctrl/Cmd + Maj + Z', 'Rétablir la modification annulée'],
  ['Échap', 'Fermer cette fenêtre ou annuler la syllabe en cours'],
  ['Tab', 'Passer au champ suivant'],
];

export function HelpDialog(props: HelpDialogProps): JSX.Element {
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (props.open) bodyRef.current?.scrollTo({ top: 0 });
  }, [props.open]);

  return (
    <Modal
      title="Aide — Solfa Editor"
      open={props.open}
      onClose={props.onClose}
      closeLabel="Fermer"
      wide
    >
      <div className="solfa-help" ref={bodyRef}>
        <h3>Principe</h3>
        <p>
          Solfa Editor est un éditeur de <strong>solfège à do mobile pour chœur</strong>
          : deux vues du même contenu, un texte de solfège à droite et une partition
          gravée à gauche. Une modification dans l&apos;une des vues met
          automatiquement l&apos;autre à jour.
        </p>
        <p>
          Le solfège est <em>mobile</em> : le nom d&apos;une note dépend de la
          tonalité, et <code>d</code> est toujours la tonique.
        </p>

        <h3>Le titre</h3>
        <p>
          <code>:title=</code> et <code>:subtitle=</code> écrivent l&apos;en-tête de
          la partition. Leur valeur va jusqu&apos;à la fin de la ligne, car un
          titre est un texte : <code>:title=Ave Maria</code>.
        </p>
        <p>
          Le titre est gravé une seule fois, centré au-dessus du premier système,
          et le sous-titre se place dessous en italique. À gauche, sous
          l&apos;en-tête, une ligne de tonalité indique la tonique avec son
          altération écrite en toutes lettres (<code>Do nat C</code>,{' '}
          <code>Fa dia F#</code>, <code>Si bem Bb</code>) puis le nombre de
          temps. Au-dessus de la
          partition, un champ permet de taper le titre directement sur la
          partition, et le bouton <code>+ Sous-titre</code> ajoute ou retire la
          deuxième ligne.
        </p>

        <h3>Les voix</h3>
        <p>
          Une <strong>mesure</strong> s&apos;écrit sur plusieurs lignes : une ligne
          par voix, puis une ligne de paroles. Toutes les voix partagent la
          <strong>même rythmique</strong>, il n&apos;y a donc qu&apos;une seule ligne
          de durées à écrire, la première.
        </p>
        <table>
          <tbody>
            <tr>
              <td>
                <code>:parts=...</code>
              </td>
              <td>
                Déclarer les voix : <code>:parts=Soprano:S:treble,Bass:B:bass</code>.
                Chaque entrée est <code>Nom:Lettre:clé</code>. Par défaut :
                Soprano, Alto, Ténor, Basse.
              </td>
            </tr>
            <tr>
              <td>
                <code>S:</code> <code>A:</code> <code>T:</code> <code>B:</code>
              </td>
              <td>Début d&apos;une ligne de voix</td>
            </tr>
            <tr>
              <td>
                <code>P:</code>
              </td>
              <td>
                Ligne de paroles, en bas. <code>Paroles</code>, <code>lyrics</code>{' '}
                et <code>words</code> sont acceptés aussi.
              </td>
            </tr>
            <tr>
              <td>
                <code>~</code>
              </td>
              <td>Reprendre la note précédente de cette voix</td>
            </tr>
            <tr>
              <td>
                <code>0</code>
              </td>
              <td>Silence</td>
            </tr>
            <tr>
              <td>
                <code>_</code>
              </td>
              <td>Dans les paroles : un temps sans syllabe</td>
            </tr>
          </tbody>
        </table>
        <p>
          Les marques de durée ne s&apos;écrivent que sur la première ligne de
          mesure ; les autres lignes doivent compter le même nombre de notes.
        </p>
        <p>
          Une mesure s&apos;ouvre avec un <code>|</code> seul sur sa ligne, et{' '}
          <strong>ses temps se séparent un par un</strong> : un <code>:</code>{' '}
          passe au temps suivant du même groupe, un <code>|</code> ouvre un
          nouveau groupe. Une simple espace ne suffit pas, car les petites
          barres de la gravure doivent être écrites. Le <code>:</code> ne se
          grave pas, le <code>|</code> se grave en petite barre, et toutes les
          voix d&apos;une mesure doivent regrouper leurs temps de la même façon.
        </p>
        <p>
          Le nombre de temps est affiché à titre indicatif : les temps
          s&apos;écrivent un par un, il ne les regroupe pas et ne les vérifie pas.
          Il se choisit dans la liste déroulante à gauche de la portée, sous le
          titre, à côté de la tonalité.
        </p>

        <h3>Les notes</h3>
        <table>
          <thead>
            <tr>
              <th>Écriture</th>
              <th>Signification</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>d r m f s l t</code>
              </td>
              <td>Degrés 1 à 7 de la gamme</td>
            </tr>
            <tr>
              <td>
                <code>,s</code> <code>s,</code>
              </td>
              <td>Descendre d&apos;une octave (la <code>,</code> se place avant ou après la lettre)</td>
            </tr>
            <tr>
              <td>
                <code>&apos;s</code> <code>s&apos;</code>
              </td>
              <td>Monter d&apos;une octave</td>
            </tr>
            <tr>
              <td>
                <code>f#</code> <code>bb</code>
              </td>
              <td>Altération accidentelle, propre à la note</td>
            </tr>
          </tbody>
        </table>

        <h3>Les durées</h3>
        <p>
          Une note vaut <strong>2 temps</strong> par défaut. Une durée commence par{' '}
          <code>!</code>, puis chaque <code>-</code> ajoute 2 temps et chaque{' '}
          <code>.</code> en ajoute 1 : <code>d!</code> = 2, <code>d!.</code> = 3,{' '}
          <code>d!-</code> = 4, <code>d!-. </code> = 5. Un <code>,</code> en tête
          vaut 1 temps et ne peut pas être prolongé. Un silence prend aussi une
          durée : <code>0!.</code> est un silence pointé.
        </p>
        <p>
          <strong>Attention :</strong> la virgule de demi-temps doit rester
          collée à la lettre. Ainsi <code>d ,r</code> se lit « d, puis r une
          octave plus bas » et non « d puis r valant 1,5 temps ».
        </p>

        <h3>La tonalité</h3>
        <table>
          <tbody>
            <tr>
              <td>
                <code>:do=C</code>
              </td>
              <td>Choisir la tonique (C, F#, Bb…)</td>
            </tr>
            <tr>
              <td>
                <code>:mode=major</code> <code>:mode=minor</code>
              </td>
              <td>Choisir le mode</td>
            </tr>
            <tr>
              <td>
                <code>|X:</code>
              </td>
              <td>Nouvelle section, <code>do = X</code>, mode majeur</td>
            </tr>
            <tr>
              <td>
                <code>|12:</code>
              </td>
              <td>Nouvelle section numérotée, sans changer de tonalité</td>
            </tr>
            <tr>
              <td>
                <code>|X:m</code>
              </td>
              <td>Nouvelle section en mode mineur</td>
            </tr>
            <tr>
              <td>
                <code>|</code>
              </td>
              <td>Ouvre une mesure, ou un groupe à l&apos;intérieur d&apos;une mesure</td>
            </tr>
            <tr>
              <td>
                <code>:</code>
              </td>
              <td>Sépare deux temps d&apos;un même groupe</td>
            </tr>
            <tr>
              <td>
                <code>:time=4/4</code>
              </td>
              <td>Nombre de temps, aussi écrit <code>:meter=</code></td>
            </tr>
            <tr>
              <td>
                <code>//</code>
              </td>
              <td>Commentaire jusqu&apos;à la fin de la ligne</td>
            </tr>
          </tbody>
        </table>
        <p>
          Un changement de tonalité ouvre une nouvelle section : c&apos;est la seule
          façon d&apos;écrire une tonique qui n&apos;est pas une des sept lettres du
          solfège.
        </p>

        <h3>Exemple</h3>
        <pre className="solfa-help-code">{`// Chœur à quatre voix
:do=C
:title=Ave Maria
:subtitle=pour chœur à quatre voix
:parts=Soprano:S:treble,Alto:A:alto,Tenor:T:treble8vb,Bass:B:bass
|
S: d! : r : m : f : s : l : t
A: 0 : m : f : s : l : t : d'
T: m : f : s : l : t : d' : r'
B: f : s : l : t : d' : r' : m
P: Ave : Ma : ri : a : _ : le : nos
|1:
S: d' : r' : m' : f' : s' : l' : t'
A: m' : f' : s' : l' : t' : d''
T: f' : s' : l' : t' : d'' : r''
B: s' : l' : t' : d'' : r'' : m''
P: Se_ : glori : fi : ca : ve : unt`}</pre>
        <p>
          Ici la première voix porte les durées : <code>d!</code> vaut 3 temps et
          les notes suivantes 2. L&apos;alto se tait au premier temps
          (<code>0</code>). Dans les paroles, <code>_</code> occupe un temps sans
          nouvelle syllabe, ce qui allonge la syllabe précédente.
        </p>

        <h3>Modifier une note</h3>
        <p>
          Cliquer sur une note gravée la sélectionne. La rangée de boutons sous la
          partition agit alors dessus : <code>▲</code> <code>▼</code> pour monter
          ou descendre d&apos;un degré, <code>▲8</code> <code>▼8</code> pour une
          octave, <code>♯</code> <code>♭</code> <code>♮</code> pour
          l&apos;altération (le bouton <code>♯ ♭ ♮</code> les fait défiler), et{' '}
          <strong>Parole</strong> pour écrire la syllabe. Les flèches du clavier
          font de même, avec <kbd>Maj</kbd> pour les octaves.
        </p>
        <p>
          Une syllabe se modifie directement sous les notes : cliquez-la, saisissez
          le texte, puis validez avec <kbd>Entrée</kbd> ou en cliquant ailleurs.
          <kbd>Échap</kbd> annule la saisie.
        </p>

        <h3>Les boutons</h3>
        <ul>
          <li>
            <strong>Aide</strong> : ouvre cette fenêtre.
          </li>
          <li>
            <strong>Annuler</strong> / <strong>Rétablir</strong> : annulation et
            rétablissement, valables pour les deux vues. Un mot tapé au clavier
            s&rsquo;annule en une seule fois ; un collage reste une étape à part.
          </li>
          <li>
            <strong>Enregistrer</strong> : ouvre cette fenêtre pour produire un PDF
            ou une image PNG.
          </li>
          <li>
            <strong>Charger</strong> : relit le dernier texte enregistré dans ce
            navigateur.
          </li>
        </ul>

        <h3>Raccourcis</h3>
        <table>
          <tbody>
            {SHORTCUTS.map(([keys, description]) => (
              <tr key={keys}>
                <td>
                  <kbd>{keys}</kbd>
                </td>
                <td>{description}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3>Bon à savoir</h3>
        <ul>
          <li>
            Cliquer sur une note gravée la sélectionne et affiche sa hauteur réelle
            (voix, tonalité et octave) dans la barre d&apos;état.
          </li>
          <li>
            Si le texte contient une erreur, la barre d&apos;état devient rouge et
            indique le problème, tandis que la dernière partition valide reste
            affichée.
          </li>
          <li>
            L&apos;export se fait depuis la partition, sans la sélection ni les
            surbrillances du survol.
          </li>
          <li>
            Une voix qui ne chante pas sur une mesure n&apos;est pas dessinée : les
            lignes se resserrent automatiquement. La lecture audio et les polices de
            partition SMuFL (Bravura) ne sont pas encore disponibles.
          </li>
        </ul>
      </div>
    </Modal>
  );
}
