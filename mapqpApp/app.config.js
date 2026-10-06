const appJson = require('./app.json');

module.exports = () => ({
  ...appJson.expo,
  extra: {
      AUTHORITY: process.env.AUTHORITY,
      CLIENT_ID: process.env.CLIENT_ID,
      SERVER_IP: process.env.SERVER_IP,
      PORT: process.env.PORT,
    },
});
