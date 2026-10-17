module.exports = {
  moduleFileExtensions: ["ts", "js"],
  coverageProvider: "v8",
  transform: {
    "^.+\\.(ts|tsx|mjs|js)$": [
      "@swc/jest",
      {
        jsc: {
          target: "es2020",
        },
      },
    ],
  },
  // archiver and marked (and their ESM-only dependency chains) must be transformed to CJS for jest
  transformIgnorePatterns: [
    "/node_modules/(?!archiver/|zip-stream/|compress-commons/|crc32-stream/|is-stream/|minimatch/|brace-expansion/|balanced-match/|marked/)",
  ],
  moduleNameMapper: {
    "^uuid$": "<rootDir>/src/__mocks__/uuid.ts",
  },
  testMatch: ["/**/src/**/*.spec.(ts|js)"],
  testEnvironment: "node",
};
