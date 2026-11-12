const { withAppBuildGradle } = require('expo/config-plugins');
const marker = '// mapqp-upload-signing';
const gradle = `
${marker}
def mapqpCredentialsFile = rootProject.file("../credentials.json")
if (mapqpCredentialsFile.exists()) {
    def upload = new groovy.json.JsonSlurper().parse(mapqpCredentialsFile).android.keystore
    android.signingConfigs {
        mapqpUpload {
            storeFile rootProject.file("../" + upload.keystorePath)
            storePassword upload.keystorePassword
            keyAlias upload.keyAlias
            keyPassword upload.keyPassword
        }
    }
    android.buildTypes.release.signingConfig = android.signingConfigs.mapqpUpload
} else if (System.getenv("EAS_BUILD") != "true") {
    gradle.taskGraph.whenReady { graph ->
        if (graph.allTasks.any { it.project == project && it.name.toLowerCase().contains("release") }) {
            throw new GradleException("Release signing is missing. Download credentials.json using eas credentials, or run npm run signing:android:init for a NEW app upload key.")
        }
    }
}
`;
module.exports = function withUploadSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    let source = mod.modResults.contents;
    if (!source.includes(marker)) {
      source = source.replace(/(release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/, '$1signingConfig null');
      source += gradle;
    }
    mod.modResults.contents = source;
    return mod;
  });
};
module.exports.gradle = gradle;
