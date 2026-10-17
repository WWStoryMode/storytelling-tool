import express from "express";
import * as fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import handleMessage, { assignRole } from "./messages";
import handleReaction, { removeRole } from "./reactions";
import { getPseudoState } from "./pseudoState";

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

let server;

async function start() {

  const app = express();
  app.use(express.json());

  app.get("/", async (req, res) => {
    const htmlPath = path.resolve(__dirname, "../../web/dist/index.html")

    res.sendFile(htmlPath);
  })

  app.post("/", async (req, res) => {
    const { event, botUserId } = req.body;

    console.log(event)
    let response = {};

    if (event.type === "m.room.message")
      response = await handleMessage(event, botUserId);

    if (event.type === "m.reaction")
      response = await handleReaction(event, botUserId);

    console.log(response)

    res.send({ success: true, response });
  });

  app.get("/api/state", async (req, res) => {
    const { roomId } = req.query;

    const state = await getPseudoState(roomId as string);

    res.send(state || { assignedRoles: [] });
  })

  app.post("/api/role", async (req, res) => {
    const { roomId } = req.query;
    const { personName, roleName } = req.body;

    await assignRole(personName, roomId as string, roleName);

    res.send({ success: true })
  })

  app.delete("/api/role", async (req, res) => {
    const { roomId, roleId } = req.query;

    await removeRole(roomId as string, roleId as string);

    res.send({ success: true });
  })

  server = app.listen(port);
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