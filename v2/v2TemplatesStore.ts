/**
 * Modèles de shift — un besoin qu'on republie souvent (service du soir,
 * brunch du dimanche…), enregistré depuis « Publier une mission » et repris
 * d'un clic. En mémoire pour la maquette.
 */
import { create } from 'zustand';
import type { CoverageSystem } from '@/mocks/v2Missions';

export interface ShiftTemplate {
  id: string;
  name: string;
  departement: string;
  poste: string;
  establishment: string;
  start: string;
  end: string;
  required: number;
  langues: string[];
  logiciels: string[];
  consigne: string;
  system: CoverageSystem;
}

interface TemplatesState {
  templates: ShiftTemplate[];
  saveTemplate: (t: Omit<ShiftTemplate, 'id'>) => ShiftTemplate;
  removeTemplate: (id: string) => void;
}

export const useV2Templates = create<TemplatesState>((set) => ({
  templates: [
    {
      id: 'tpl-soir',
      name: 'Service du soir',
      departement: 'Restauration',
      poste: 'Serveur·se',
      establishment: 'Le Comptoir du Centre',
      start: '18:00',
      end: '23:30',
      required: 2,
      langues: ['Français'],
      logiciels: ['Zelty'],
      consigne: 'Tenue noire, rendez-vous 17:45 au bar.',
      system: 'cascade',
    },
    {
      id: 'tpl-brunch',
      name: 'Brunch du dimanche',
      departement: 'Cuisine',
      poste: 'Commis de cuisine',
      establishment: 'La Brasserie des Halles',
      start: '09:00',
      end: '15:00',
      required: 1,
      langues: ['Français'],
      logiciels: [],
      consigne: '',
      system: 'employe',
    },
  ],
  saveTemplate: (t) => {
    const tpl: ShiftTemplate = { ...t, id: `tpl-${Date.now()}` };
    set((s) => ({ templates: [...s.templates, tpl] }));
    return tpl;
  },
  removeTemplate: (id) => set((s) => ({ templates: s.templates.filter((t) => t.id !== id) })),
}));
