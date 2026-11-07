/**
 * Ouvre la boîte d'impression du navigateur sur un document HTML complet
 * (cadre invisible) : « Enregistrer en PDF » donne le fichier. Même mécanique
 * que les factures et le planning.
 */
export function openPrint(html: string, title: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('title', title);
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  frame.srcdoc = html;
  const cleanup = () => frame.remove();
  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) return cleanup();
    win.addEventListener('afterprint', cleanup);
    // Laisse le temps aux polices et aux photos, puis ouvre la boîte d'impression.
    setTimeout(() => {
      win.focus();
      win.print();
    }, 250);
    // Si « afterprint » ne vient jamais (aperçu annulé), on nettoie quand même.
    setTimeout(cleanup, 120_000);
  };
  document.body.appendChild(frame);
}

export const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
