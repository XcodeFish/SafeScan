/* eslint-env node */

export default {
  '*.{js,jsx,ts,tsx}': ['eslint --fix'],
  '*.{json,md,yml}': ['prettier --write'],
};
