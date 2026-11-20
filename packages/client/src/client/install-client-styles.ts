import { CSS } from './styles.js';

export function installStyles(): () => void {
  if (typeof document === 'undefined') return () => {};
  const style = document.createElement('style');
  style.setAttribute('data-botharness', 'client');
  style.dataset.plugin = '@botharness/ui';
  style.dataset.pluginCss = '@botharness/ui/client.css';
  style.textContent = CSS;
  document.head.appendChild(style);
  return () => {
    style.remove();
  };
}
