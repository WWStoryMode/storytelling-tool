import * as fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { createApp } from "./app";
import { configProblems } from "./config";
import { createStoryLoader } from "./download";
import { Game, type Post } from "./game";
import { createHubPoster } from "./hub";
import { loadStoryDir } from "./library";

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
  emoji: "📜",
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

configProblems(process.env).forEach(problem => console.warn(`Setup: ${problem}`));

// Timer closes, pauses and reminders have no incoming event to reply to, so they go through the hub's /api/send
function timerPoster(): Post {
  const { HUB_URL, HUB_SECRET } = process.env;
  if (HUB_URL && HUB_SECRET)
    return createHubPoster({ hubUrl: HUB_URL, secret: HUB_SECRET });

  return (roomId, messages) => console.log(`Timer message for ${roomId} (not sent: set HUB_URL and HUB_SECRET):`, messages);
}

// story add downloads attachments through the hub; story load fetches raw links directly
const loader = createStoryLoader({ hubUrl: process.env.HUB_URL?.trim() || null });

const game = new Game(loadStories(), { post: timerPoster(), loader });

// Set EVENT_LOG=events.jsonl to record story commands, reactions and redactions for `npm run replay`
const eventLog = process.env.EVENT_LOG?.trim() || null;
if (eventLog)
  console.log(`Recording story events to ${eventLog}`);

let server;

function start() {
  const app = createApp({ game, eventLog, dashboardHtml: path.resolve(__dirname, "../../web/dist/index.html") });

  server = app.listen(port);
  console.log(`Listening on port ${port}`);
  console.log(`Dashboard: http://localhost:${port}/?roomId=<room>, or through the hub's dashboard`);
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
