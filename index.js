const express = require("express");
const axios = require("axios");
const { google } = require("googleapis");
require("dotenv").config();

const app = express();
app.use(express.json());

// ENV variables (Railway বা .env)
const TOKEN = process.env.BOT_TOKEN;
const SHEET_ID = process.env.SHEET_ID;

const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;

// Google API Auth
const serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT);

const auth = new google.auth.GoogleAuth({
  credentials: serviceAccount,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});


// Read all movies
async function readMovies() {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "Movies!A:C"
  });

  return res.data.values;
}

// Add movie (write to sheet)
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

// Send Telegram Message
async function sendMessage(chatId, text) {
  await axios.post(`${TELEGRAM_API}/sendMessage`, {
    chat_id: chatId,
    text: text
  });
}

// Webhook Handler
app.post("/webhook", async (req, res) => {
  try {
    const msg = req.body.message;
    if (!msg) return res.sendStatus(200);

    const chatId = msg.chat.id;
    const text = msg.text || "";

    // Add Movie: add id link short_name
    if (text.startsWith("add ")) {
      const parts = text.split(" ");

      const id = parts[1];
      const link = parts[2];
      const shortName = parts.slice(3).join(" ");

      await appendMovie([id, shortName, link]);

      sendMessage(
        chatId,
        `✅ Movie Added!\nID: ${id}\nName: ${shortName}\nLink: ${link}`
      );

      return res.sendStatus(200);
    }

    // Deep-link Handler
    if (text.startsWith("/start")) {
      const param = text.split(" ")[1];

      if (param) {
        const rows = await readMovies();

        // Find the movie from Sheet
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

    res.sendStatus(200);

  } catch (err) {
    console.error("Error:", err);
    res.sendStatus(500);
  }
});

app.listen(3000, () => console.log("Bot Running on Port 3000"));

