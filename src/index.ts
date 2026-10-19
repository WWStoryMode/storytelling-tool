import express from "express";
import * as fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { Game } from "./game";
import { loadStoryDir } from "./library";
import { sessionView } from "./voting";

try {
  process.loadEnvFile();
} catch {
  // no .env file; rely on the real environment
}

const port = Number(process.env.PORT) || 5049;

const moduleRegistration = {
  id: "storytelling",
  uuid: uuidv4(),
  url: process.env.PUBLIC_URL || `http://localhost:${port}`, // ngrok URL, never localhost, when registering with the hub
  emoji: "📖",
  introduction: "Send 'story start' to play a story together, then vote on each choice by reacting 1️⃣ 2️⃣ 3️⃣. The most votes decides what happens next. 'story help' lists commands.",
  title: "Storytelling",
  description: "Branching stories the whole group plays by voting with reactions",
  secret: process.env.HUB_SECRET,
  event_types: [
    "m.room.message",
    "m.reaction",
    "m.room.redaction"
  ]
}

function generateRegistrationFile() {
  fs.writeFileSync(`./${moduleRegistration.id}.json`, JSON.stringify(moduleRegistration));
}

function loadStories() {
  const { stories, rejected } = loadStoryDir(path.resolve(__dirname, "../../stories"));

  rejected.forEach(({ file, problems }) => console.warn(`Skipped stories/${file}:\n  ${problems.join("\n  ")}`));
  console.log(`Loaded ${stories.length} stories: ${stories.map(story => story.id).join(", ")}`);

  return stories;
}

// Timer closes have no incoming event to reply to. Phase 4 posts them through the hub's /api/send; until then they are logged.
const game = new Game(loadStories(), {
  post: (roomId, messages) => console.log(`Timer message for ${roomId} (not sent yet):`, messages),
});

let server;

async function start() {

  const app = express();
  app.use(express.json());

  app.get("/", async (req, res) => {
    const htmlPath = path.resolve(__dirname, "../../web/dist/index.html")

    res.sendFile(htmlPath);
  })

  app.post("/", async (req, res) => {
    const { event, botUserId } = req.body ?? {};
    if (!event) {
      res.send({ success: true });
      return;
    }

    try {
      const messages = game.handle(event, botUserId);
      // Logs the event type only: chat content and senders stay out of the logs
      console.log(`${event.type} in ${event.room_id}: ${messages.length} message(s)`);

      if (messages.length === 0)
        res.send({ success: true });
      else
        res.send({ success: true, response: messages.length === 1 ? messages[0] : messages });
    } catch (err) {
      console.error(`Couldn't handle ${event.type} in ${event.room_id}:`, err);
      res.send({ success: true });
    }
  });

  app.get("/api/stories", async (req, res) => {
    res.send(game.stories.map(({ json, ...story }) => story));
  })

  // The dashboard is opened per room through the hub, as /storytelling?roomId=…
  app.get("/api/sessions", async (req, res) => {
    const { roomId } = req.query;
    if (typeof roomId !== "string") {
      res.status(400).send({ success: false, message: "roomId is required" });
      return;
    }

    const session = game.session(roomId);
    res.json(session ? sessionView(session) : null);
  })

  server = app.listen(port);
  console.log(`Listening on port ${port}`);
};

generateRegistrationFile();
start();

process.on('SIGINT', function () {
  if (server)
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
})
