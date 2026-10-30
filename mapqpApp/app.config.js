const appJson = require('./app.json');

module.exports = () => ({
  ...appJson.expo,
  extra: {
      AUTHORITY: process.env.AUTHORITY || appJson.expo.extra.AUTHORITY,
      CLIENT_ID: process.env.CLIENT_ID || appJson.expo.extra.CLIENT_ID,
      SERVER_IP: process.env.SERVER_IP || appJson.expo.extra.SERVER_IP,
      PORT: process.env.PORT || appJson.expo.extra.PORT,
    },
});
