const express = require("express");
const axios = require("axios");
const { google } = require("googleapis");
require("dotenv").config();

const app = express();
app.use(express.json());

//============ ENV VARIABLES ============//
const TOKEN = process.env.BOT_TOKEN;
const SHEET_ID = process.env.SHEET_ID;
const serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT);

const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;

//============ GOOGLE SHEET SETUP ============//
const auth = new google.auth.GoogleAuth({
  credentials: serviceAccount,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

async function readMovies() {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "Movies!A:C"
  });

  return res.data.values;
}

async function appendMovie(row) {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "Movies!A:C",
    valueInputOption: "RAW",
    requestBody: { values: [row] }
  });
}

async function sendMessage(chatId, text) {
  await axios.post(`${TELEGRAM_API}/sendMessage`, {
    chat_id: chatId,
    text: text
  });
}

//============ WEBHOOK HANDLER ============//
app.post("/webhook", async (req, res) => {
  try {
    const update = req.body || {};

    // message, channel_post, edited_message সব ধরবে
    const msg =
      update.message ||
      update.channel_post ||
      update.edited_message ||
      update.forward_origin;

    if (!msg) return res.sendStatus(200);

    const chatId = msg.chat?.id;
    const text = msg.text || "";
    
    //=========== DETECT MEDIA ===========//
    const media =
      msg.video ||
      msg.document || 
      (msg.photo && msg.photo[msg.photo.length - 1]); // largest photo

    //=========== AUTO ADD WHEN FORWARDED MEDIA ===========//
    if (media) {
      const caption = msg.caption || msg.text || "Untitled Movie";

      // Auto ID
      const movieId = "MOV" + Math.floor(10000 + Math.random() * 90000);

      // Movie Name = first line of caption
      const name = caption.split("\n")[0];

      // Determine Original Post Link
      let originChatId = null;
      let originMsgId = null;

      if (msg.forward_from_chat && msg.forward_from_message_id) {
        originChatId = msg.forward_from_chat.id;
        originMsgId = msg.forward_from_message_id;
      } else if (msg.chat && String(msg.chat.id).startsWith("-100")) {
        originChatId = msg.chat.id;
        originMsgId = msg.message_id;
      } else {
        originChatId = msg.chat.id;
        originMsgId = msg.message_id;
      }

      const cleanChatId = String(originChatId).replace("-100", "");
      const link = `https://t.me/c/${cleanChatId}/${originMsgId}`;

      await appendMovie([movieId, name, link]);

      try {
        await sendMessage(
          chatId,
          `✅ Movie Added Automatically!\nID: ${movieId}\nName: ${name}\nLink: ${link}`
        );
      } catch (e) {
        console.error("Failed to send reply:", e);
      }

      return res.sendStatus(200);
    }

    //=========== MANUAL ADD ===========//
    if (text.startsWith("add ")) {
      const parts = text.split(" ");
      const id = parts[1];
      const link = parts[2];
      const name = parts.slice(3).join(" ");

      await appendMovie([id, name, link]);

      await sendMessage(
        chatId,
        `✅ Movie Added!\nID: ${id}\nName: ${name}\nLink: ${link}`
      );

      return res.sendStatus(200);
    }

    //=========== DEEP LINK ===========//
    if (text.startsWith("/start")) {
      const param = text.split(" ")[1];

      if (param) {
        const rows = await readMovies();

        for (let i = 1; i < rows.length; i++) {
          if (rows[i][0] === param) {
            await sendMessage(
              chatId,
              `🎬 ${rows[i][1]}\n🔗 ${rows[i][2]}`
            );
            return res.sendStatus(200);
          }
        }

        await sendMessage(chatId, "❌ Movie Not Found!");
        return res.sendStatus(200);
      }

      await sendMessage(chatId, "🎬 Welcome to Movie Bot!");
      return res.sendStatus(200);
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    return res.sendStatus(500);
  }
});

//============ START SERVER ============//
app.listen(3000, () => console.log("Bot Running on Port 3000"));
