/* eslint-env node */

export default {
  '*.{js,jsx,ts,tsx}': ['eslint --fix', 'prettier --write', () => 'pnpm type-check'],
  '*.{json,md,yml}': ['prettier --write'],
};
