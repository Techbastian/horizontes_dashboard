// Linter mínimo, con un objetivo concreto: atrapar variables que no existen.
//
// El build NO sirve de red de seguridad para esto: `tsc` solo valida los `.ts`
// (los `.jsx` no se revisan) y Vite empaqueta sin comprobar identificadores. Una
// variable inexistente dentro de JSX compila en verde y revienta en el navegador
// con la pantalla en blanco. Ya pasó: `asistenciaSinCargar` se usó en
// FormationPage sin declararse como prop y tumbó toda la página.
//
//   npm run lint
//
// A propósito NO se activan reglas de estilo: el objetivo es que `lint` sea una
// señal de "esto se rompe", no una lista de opiniones sobre el formato.
import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'src/counter.ts', 'src/main.ts'] },

  // Frontend: React con runtime automático de JSX (no hace falta importar React).
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react },
    rules: {
      ...js.configs.recommended.rules,
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Sin esto, ESLint no ve que `<KPICard/>` usa `KPICard` y reporta como
      // "no usados" todos los componentes importados: 68 falsos positivos que
      // ahogarían los errores de verdad.
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
    },
  },

  // Scripts ETL: Node.
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
];
