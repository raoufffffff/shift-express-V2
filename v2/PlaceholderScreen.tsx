/** Écran v2 encore à construire : en-tête + note de ce qui y vivra. */
interface Props {
  eyebrow: string;
  title: string;
  summary: string;
  willHold: string[];
}

export function PlaceholderScreen({ eyebrow, title, summary, willHold }: Props) {
  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <header className="mb-6">
        <p className="se-eyebrow mb-1">{eyebrow}</p>
        <h1 className="text-3xl font-extrabold text-se-ink">{title}</h1>
        <p className="text-se-muted mt-2 max-w-2xl">{summary}</p>
      </header>
      <div className="bg-se-surface border border-se-line rounded-se p-6 shadow-se">
        <p className="se-eyebrow mb-3">À construire sur cet écran</p>
        <ul className="space-y-2">
          {willHold.map((item) => (
            <li key={item} className="flex gap-2 text-sm text-se-ink">
              <span className="text-se-muted">—</span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
