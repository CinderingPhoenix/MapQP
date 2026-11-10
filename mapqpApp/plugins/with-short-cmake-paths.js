const { withProjectBuildGradle } = require('expo/config-plugins');

const marker = '// mapqp-short-cmake-object-paths';
const gradle = `
${marker}
// Force CMake to hash long source paths before they reach Windows Ninja.
subprojects { subproject ->
  ["com.android.application", "com.android.library"].each { androidPlugin ->
    subproject.plugins.withId(androidPlugin) {
      subproject.extensions.getByName("androidComponents").finalizeDsl { android ->
        if (androidPlugin == "com.android.application") {
          android.externalNativeBuild.cmake.buildStagingDirectory = new File(rootProject.projectDir, "../../.cxx").canonicalFile
        }
        def cmakeArguments = android.defaultConfig.externalNativeBuild.cmake.arguments
        cmakeArguments.removeAll { it.startsWith("-DCMAKE_OBJECT_PATH_MAX=") }
        cmakeArguments.add("-DCMAKE_OBJECT_PATH_MAX=250")
      }
    }
  }
}
`;

module.exports = function withShortCmakePaths(config) {
  return withProjectBuildGradle(config, (mod) => {
    // Expo's root plugin can eagerly configure :app, so register callbacks first.
    const contents = mod.modResults.contents.replace(
      /\/\/ mapqp-short-cmake-object-paths\r?\n[\s\S]*?^}/m, ""
    );
    const anchor = 'apply plugin: "expo-root-project"';
    if (!contents.includes(anchor)) throw new Error('Expo root Gradle plugin anchor not found');
    mod.modResults.contents = contents.replace(anchor, gradle + "\n" + anchor);
    return mod;
  });
};
module.exports.gradle = gradle;
