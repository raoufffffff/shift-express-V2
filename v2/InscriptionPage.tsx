/**
 * Inscription — l'entrée dans Shift Express. On crée son espace et on choisit
 * tout de suite comment on va l'utiliser (le mode), puis on arrive dans l'app.
 * Page pleine, hors de la coquille : c'est avant d'être connecté.
 */
import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { usageModes } from '@/mocks/v2Settings';
import type { UsageMode } from '@/mocks/v2Settings';
import { useV2Ui } from '@/stores/v2UiStore';

export function InscriptionPage() {
  const navigate = useNavigate();
  const { locale = 'fr' } = useParams();
  const setMode = useV2Ui((s) => s.setMode);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mode, setMode2] = useState<UsageMode>('complete');

  const submit = () => {
    setMode(mode);
    // Mock : on entre dans l'app. En vrai, création de compte puis Configuration.
    navigate(`/${locale}/v2`);
  };

  return (
    <div className="se-root min-h-screen bg-se-bg grid place-items-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <span className="font-display font-extrabold text-2xl tracking-tight text-se-ink">Shift Express</span>
          <p className="text-se-muted mt-1">Créez votre espace en une minute.</p>
        </div>

        <div className="bg-se-surface border border-se-line rounded-se shadow-se p-6 space-y-5">
          <label className="block">
            <span className="se-eyebrow block mb-1.5">Nom de l'établissement</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Le Comptoir du Centre"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="se-eyebrow block mb-1.5">Email professionnel</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@etablissement.fr"
              className={inputCls}
            />
          </label>

          <div>
            <p className="se-eyebrow mb-2">Comment allez-vous l'utiliser ?</p>
            <div className="space-y-2">
              {(['complete', 'freelance'] as UsageMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode2(m)}
                  className={`w-full text-left rounded-se border p-3 transition-colors ${
                    mode === m
                      ? 'border-se-blue ring-1 ring-se-blue bg-se-blue-wash/40'
                      : 'border-se-line hover:border-se-muted'
                  }`}
                >
                  <span className="font-semibold text-se-ink block">{usageModes[m].label}</span>
                  <span className="text-xs text-se-muted">{usageModes[m].blurb}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-se-muted mt-2">Vous pourrez changer de mode à tout moment dans Réglages.</p>
          </div>

          <button
            type="button"
            onClick={submit}
            className="w-full inline-flex items-center justify-center gap-1.5 py-3 rounded-se-sm text-sm font-semibold bg-se-blue text-white hover:bg-se-blue-ink"
          >
            Créer mon espace <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <p className="text-center text-sm text-se-muted mt-5">
          Déjà un compte ?{' '}
          <Link to={`/${locale}/v2`} className="font-semibold text-se-blue-ink hover:text-se-blue">
            Entrer dans mon espace
          </Link>
        </p>
      </div>
    </div>
  );
}

const inputCls =
  'w-full h-11 rounded-se-sm border border-se-line bg-se-surface px-3 text-sm text-se-ink focus:outline-none focus:border-se-blue';
