const { pathsToModuleNameMapper } = require("ts-jest");
const { compilerOptions } = require("./tsconfig.json");

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ["<rootDir>/src/**/*.test.ts"],
  moduleNameMapper: {
    ...pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>/' }),
    "\\.txt$": "<rootDir>/tests/text.cjs",
    "\\.module\\.css$": "<rootDir>/tests/styles.cjs",
    "\\.(png|svg)$": "<rootDir>/tests/asset.cjs"
  },
  modulePaths: ["<rootDir>"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: { ...compilerOptions, jsx: "react-jsx", isolatedModules: true } }]
  }
};
