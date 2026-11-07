/**
 * Accueil de la v2 : le Planning, quel que soit le mode d'usage. En Freelance
 * uniquement, le planning se présente pareil mais ne propose que la
 * publication aux auto-entrepreneurs (pas de placement direct, pas de cascade).
 */
import { PlanningPage } from './PlanningPage';

export function HomeRoute() {
  return <PlanningPage />;
}
