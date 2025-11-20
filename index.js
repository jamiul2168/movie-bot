const express = require("express");
const axios = require("axios");
const { google } = require("googleapis");
require("dotenv").config();

const app = express();
app.use(express.json());

// ENV
const TOKEN = process.env.BOT_TOKEN;
const SHEET_ID = process.env.SHEET_ID;
const serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT);

const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;

// Google Sheet
const auth = new google.auth.GoogleAuth({
  credentials: serviceAccount,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

async function readMovies() {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "Movies!A:D"
  });

  return res.data.values;
}

async function appendMovie(row) {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "Movies!A:D",
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

app.post("/webhook", async (req, res) => {
  try {
    const update = req.body || {};
    const msg =
      update.message ||
      update.channel_post ||
      update.edited_message;

    if (!msg) return res.sendStatus(200);

    const chatId = msg.chat?.id;
    const text = msg.text || "";

    // Detect media: video OR document
    const media = msg.video || msg.document;

    //======== AUTO-ADD MOVIE ========//
    if (media) {
      const caption = msg.caption || "Untitled Movie";

      const movieId = "MOV" + Math.floor(10000 + Math.random() * 90000);
      const name = caption.split("\n")[0];
      const fileId = media.file_id;

      // build link (optional)
      let originChatId = null;
      let originMsgId = null;

      if (msg.forward_from_chat && msg.forward_from_message_id) {
        originChatId = msg.forward_from_chat.id;
        originMsgId = msg.forward_from_message_id;
      } else {
        originChatId = msg.chat.id;
        originMsgId = msg.message_id;
      }

      const cleanChatId = String(originChatId).replace("-100", "");
      const link = `https://t.me/c/${cleanChatId}/${originMsgId}`;

      // Save row: id, name, file_id, link
      await appendMovie([movieId, name, fileId, link]);

      await sendMessage(
        chatId,
        `✅ Movie Added Automatically!\nID: ${movieId}\nName: ${name}`
      );

      return res.sendStatus(200);
    }

    //======== DIRECT DOWNLOAD VIA /start ========//
    if (text.startsWith("/start")) {
      const param = text.split(" ")[1];

      if (param) {
        const rows = await readMovies();

        for (let i = 1; i < rows.length; i++) {
          if (rows[i][0] === param) {
            const name = rows[i][1];
            const fileId = rows[i][2];

            await sendMessage(chatId, `🎬 Sending your movie...\n${name}`);

            // detect if it is video or document
            const type = fileId.includes("BAAC") ? "video" : "document";

            if (type === "video") {
              await axios.post(`${TELEGRAM_API}/sendVideo`, {
                chat_id: chatId,
                video: fileId,
                caption: name
              });
            } else {
              await axios.post(`${TELEGRAM_API}/sendDocument`, {
                chat_id: chatId,
                document: fileId,
                caption: name
              });
            }

            return res.sendStatus(200);
          }
        }

        await sendMessage(chatId, "❌ Movie Not Found!");
        return res.sendStatus(200);
      }

      await sendMessage(chatId, "Send /start <MovieID>");
      return res.sendStatus(200);
    }

    return res.sendStatus(200);

  } catch (err) {
    console.error("Error:", err);
    return res.sendStatus(500);
  }
});

app.listen(3000, () => console.log("Bot Running on Port 3000"));
