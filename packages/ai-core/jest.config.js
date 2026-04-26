module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts", "**/?(*.)+(spec|test).ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", {}],
  },
  moduleFileExtensions: ["ts", "js", "json"],
  verbose: true,
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/**/__tests__/**",
  ],
};
