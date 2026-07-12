const { notarize } = require('@electron/notarize');

// electron-builder calls this automatically after signing (see "afterSign" in
// package.json). If notarization credentials aren't set, we skip cleanly so
// local/dev builds still work without needing an Apple ID on hand.
exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  const hasApplePassword = process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID;
  const hasApiKey = process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER;

  if (!hasApplePassword && !hasApiKey) {
    console.log('Skipping notarization: no APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID '
      + 'or APPLE_API_KEY/APPLE_API_KEY_ID/APPLE_API_ISSUER env vars set. '
      + 'The app is still code-signed, just not notarized.');
    return;
  }

  console.log(`Notarizing ${appName} at ${appPath}...`);

  await notarize({
    appPath,
    ...(hasApplePassword
      ? {
          appleId: process.env.APPLE_ID,
          appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
          teamId: process.env.APPLE_TEAM_ID
        }
      : {
          appleApiKey: process.env.APPLE_API_KEY,
          appleApiKeyId: process.env.APPLE_API_KEY_ID,
          appleApiIssuer: process.env.APPLE_API_ISSUER
        })
  });

  console.log(`Notarization complete for ${appName}.`);
};
