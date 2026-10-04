export type ThemeChoice = 'sistema' | 'chiaro' | 'scuro';

const KEY = 'salvadanaio:tema';

export function getTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'chiaro' || v === 'scuro') return v;
  } catch {
    /* storage non disponibile */
  }
  return 'sistema';
}

export function setTheme(choice: ThemeChoice) {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    /* storage non disponibile */
  }
  applyTheme(choice);
}

function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'sistema') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice === 'scuro' ? 'dark' : 'light');
}

export function applyStoredTheme() {
  applyTheme(getTheme());
}
