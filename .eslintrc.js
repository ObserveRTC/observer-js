const projectRules = {
  'simple-import-sort/imports': 'error',
  'simple-import-sort/exports': 'error',
  'newline-per-chained-call': 'off',
  'max-params': 'off',
  'max-statements': 'off',
  'one-var': 'off',
  'no-extra-semi': 'error',
  'no-console': 'warn',
  'sort-imports': 'off',
  'max-len': [
    'error',
    {
      'code': 300,
      'ignoreUrls': true,
    },
  ],
  'semi': [
    'error',
    'never',
  ],
  'padded-blocks': [
    'error',
    'never',
  ],
  '@typescript-eslint/lines-between-class-members': 'off',
  '@typescript-eslint/no-parameter-properties': 'off',
  'object-curly-newline': [
    'error',
    {
      'ObjectExpression': { 'multiline': true, 'minProperties': 2 },
      'ObjectPattern': { 'multiline': true, 'minProperties': 2 },
      'ImportDeclaration': 'always',
      'ExportDeclaration': 'always'
    }
  ],
  'class-methods-use-this': 'off',
  '@typescript-eslint/prefer-readonly-parameter-types': 'off',
  '@typescript-eslint/explicit-module-boundary-types': 'off',
  '@typescript-eslint/no-explicit-any': 'off',
  '@typescript-eslint/explicit-member-accessibility': 'off',
  '@typescript-eslint/strict-boolean-expressions': 'off',
  'quotes': 'off',
  '@typescript-eslint/quotes': ['error', 'single'],
  '@typescript-eslint/semi': [
    'error',
    'never',
  ],
  '@typescript-eslint/no-type-alias': [
    'error',
    {
      'allowAliases': 'always',
    },
  ],
  'no-underscore-dangle': [
    'error',
    {
      'allowAfterThis': true,
    },
  ],
}
module.exports = {
  'root': true,
  'env': {
    'browser': true,
    'node': true,
    'es6': true,
  },
  'extends': [
    'eslint:recommended',
  ],
  'parser': '@typescript-eslint/parser',
  'overrides': [
    {
      'files': [
        '**/*.ts',
      ],
      'extends': [
        'eslint:all',
        'plugin:@typescript-eslint/all',
      ],
      rules: projectRules,
      'plugins': [
        '@typescript-eslint',
        'simple-import-sort'
      ],
      'parserOptions': {
        'project': [
          './tsconfig.json',
        ],
      },
    },
  ],
  'ignorePatterns': [
    'node_modules/*',
    'dist/*',
    '*.js',
  ],
}
