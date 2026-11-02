import { fileURLToPath } from 'node:url';
import { renderArtwork } from './readme-art.mjs';
renderArtwork(fileURLToPath(new URL('../docs/assets/readme/pixel/', import.meta.url)));
