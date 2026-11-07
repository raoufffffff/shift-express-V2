/**
 * Numéro lisible d'une mission, affiché dans sa fenêtre (« n° 4821 »).
 * Les identifiants techniques (m-complete, new-1793…) ne se montrent pas :
 * on en dérive un numéro stable à quatre chiffres, en attendant le vrai
 * numéro attribué par le serveur.
 */
export function missionRef(id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `n° ${1000 + (h % 9000)}`;
}
