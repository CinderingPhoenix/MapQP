const appJson = require('./app.json');

module.exports = () => ({
  ...appJson.expo,
  extra: {
    ...appJson.expo.extra,
    AUTHORITY: process.env.AUTHORITY,
    CLIENT_ID: process.env.CLIENT_ID,
  },
});
