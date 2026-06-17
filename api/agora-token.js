const { RtcTokenBuilder, RtcRole } = require("agora-token");

module.exports = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { channel } = req.query;
  if (!channel) return res.status(400).json({ error: "channel required" });

  const appId   = process.env.REACT_APP_AGORA_APP_ID;
  const appCert = process.env.AGORA_APP_CERTIFICATE;
  if (!appId || !appCert) return res.status(500).json({ error: "Agora not configured" });

  const now    = Math.floor(Date.now() / 1000);
  const expire = now + 7200; // 2-hour token; uid=0 allows any user to join

  const token = RtcTokenBuilder.buildTokenWithUid(
    appId, appCert, channel, 0, RtcRole.PUBLISHER, expire, expire
  );

  res.json({ token });
};
