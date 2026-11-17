const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withAndroidApplicationId(config) {
  const applicationId = config.android?.package;
  if (!applicationId || !/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(applicationId)) {
    throw new Error('A valid expo.android.package is required');
  }
  return withAppBuildGradle(config, (mod) => {
    mod.modResults.contents = mod.modResults.contents.replace(
      /\bapplicationId\s+['"][^'"]+['"]/, `applicationId '${applicationId}'`
    );
    return mod;
  });
};
