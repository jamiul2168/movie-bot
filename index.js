const express = require("express");
const axios = require("axios");
const { google } = require("googleapis");
require("dotenv").config();

const app = express();
app.use(express.json());

// ENV Variables
const TOKEN = process.env.BOT_TOKEN;
const SHEET_ID = process.env.SHEET_ID;

const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;

// Google Sheet Authentication
const serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT);

const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

// Read all movies from Sheet
async function readMovies() {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: "Movies!A:C"
    });

    return res.data.values;
}

// Add movie to Sheet
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

// Send Telegram message
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

        // =====================================
        // AUTO ADD MOVIE WHEN VIDEO FORWARDED
        // =====================================
        if (msg.video) {
            const messageId = msg.message_id;
            const caption = msg.caption || "Untitled Movie";

            // Auto ID
            const movieId = "MOV" + Math.floor(10000 + Math.random() * 90000);

            // Movie name: first line of caption
            const name = caption.split("\n")[0];

            // Create Telegram post link
            const link = `https://t.me/c/${chatId.toString().replace("-100", "")}/${messageId}`;

            // Add to Sheet
            await appendMovie([movieId, name, link]);

            await sendMessage(chatId, `✅ Movie Added Automatically!\nID: ${movieId}\nName: ${name}\nLink: ${link}`);
            return res.sendStatus(200);
        }

        // =====================================
        // MANUAL ADD MOVIE COMMAND
        // Format:
        // add id link name
        // =====================================
        if (text.startsWith("add ")) {
            const parts = text.split(" ");

            const id = parts[1];
            const link = parts[2];
            const name = parts.slice(3).join(" ");

            await appendMovie([id, name, link]);

            await sendMessage(chatId,
                `✅ Movie Added!\nID: ${id}\nName: ${name}\nLink: ${link}`
            );

            return res.sendStatus(200);
        }

        // =====================================
        // DEEP LINK HANDLER
        // /start MOVIEID
        // =====================================
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
        console.error("Bot Error:", err);
        return res.sendStatus(500);
    }
});

// Run server
app.listen(3000, () => console.log("Bot Running on Port 3000"));
