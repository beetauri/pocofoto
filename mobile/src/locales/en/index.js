import auth from './auth.js';
import camera from './camera.js';
import common from './common.js';
import errors from './errors.js';
import history from './history.js';
import notifications from './notifications.js';
import pairing from './pairing.js';
import profile from './profile.js';

export const englishResources = {
  common,
  auth,
  pairing,
  camera,
  history,
  profile,
  notifications,
  errors
};

export const namespaces = Object.keys(englishResources);
