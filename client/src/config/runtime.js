import { resolveRuntimeConfig } from './runtimeConfig';

const runtimeConfig = resolveRuntimeConfig(import.meta.env);
let loggedWarnings = false;

const logRuntimeWarnings = () => {
  if (loggedWarnings) {
    return;
  }

  runtimeConfig.warnings.forEach((warning) => {
    console.warn(`[runtime] ${warning}`);
  });

  loggedWarnings = true;
};

export const getApiBaseUrl = () => {
  logRuntimeWarnings();
  return runtimeConfig.apiBaseUrl;
};

export const getGoogleClientId = () => {
  logRuntimeWarnings();
  return runtimeConfig.googleClientId;
};
