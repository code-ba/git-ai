module.exports = {
  root: true,
  env: {
    node: true,
    es2021: true,
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
  },
  ignorePatterns: ['dist/', 'build/', 'node_modules/'],
  overrides: [
    {
      files: ['*.mts'],
      parser: '@typescript-eslint/parser',
      plugins: ['@typescript-eslint'],
      extends: ['plugin:@typescript-eslint/recommended'],
      rules: {
        // 与原 eslint:recommended 强度对齐：catch 参数允许不使用；显式 any 在 noImplicitAny 关闭的项目里放开
        '@typescript-eslint/no-unused-vars': ['error', { caughtErrors: 'none' }],
        '@typescript-eslint/no-explicit-any': 'off',
        'prefer-const': 'off',
      },
    },
  ],
};
