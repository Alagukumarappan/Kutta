const { withAndroidManifest } = require('expo/config-plugins');

// Samsung's Game Launcher (and equivalents on other OEM skins) auto-collects
// apps into its own "Games" folder purely by reading this manifest
// attribute — there's no separate registration step, and nothing else in
// this app declares it, so Kutta was never once being picked up by it. The
// modern attribute is `android:appCategory="game"` on the <application> tag
// (Android 8+, ApplicationInfo.CATEGORY_GAME); `android:isGame` is the
// pre-8.0 predecessor, deprecated since API 30 but still checked by some
// older OEM launcher heuristics, so both are set for the widest coverage.
module.exports = function withGameCategory(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:appCategory'] = 'game';
      application.$['android:isGame'] = 'true';
    }
    return config;
  });
};
