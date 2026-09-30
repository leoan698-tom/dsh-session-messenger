import tseslint from 'typescript-eslint';
export default tseslint.config(...tseslint.configs.recommended, {files:['tests/**/*.mjs'],rules:{'@typescript-eslint/no-explicit-any':'off'}});
