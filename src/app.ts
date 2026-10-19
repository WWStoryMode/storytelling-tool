import express from "express";
import * as fs from "fs";
import { appendEvent, forLog } from "./eventLog";
import { type Game } from "./game";
import { sessionView } from "./voting";

// The HTTP routes, apart from startup, so they can be tested on a spare port

export function createApp(options: { game: Game; dashboardHtml: string; eventLog: string | null }) {
  const { game, dashboardHtml, eventLog } = options;
  const app = express();
  app.use(express.json());

  app.get("/", async (req, res) => {
    if (!fs.existsSync(dashboardHtml)) {
      res.status(503).type("text").send("The dashboard hasn't been built yet. Run npm run build-web, then reload.");
      return;
    }
    res.sendFile(dashboardHtml);
  })

  app.post("/", async (req, res) => {
    const { event, botUserId } = req.body ?? {};
    if (!event) {
      res.send({ success: true });
      return;
    }

    try {
      const logged = eventLog ? forLog(event, botUserId) : null;
      if (eventLog && logged)
        appendEvent(eventLog, { receivedAt: Date.now(), botUserId, event: logged });

      const messages = await game.handle(event, botUserId);
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

  // With roomId, the stories that group added come after the shared ones
  app.get("/api/stories", async (req, res) => {
    const { roomId } = req.query;
    res.send(game.library(typeof roomId === "string" ? roomId : null).map(({ json, ...story }) => story));
  })

  // The dashboard is opened per room through the hub, as /storytelling?roomId=…
  // `now` lets it count down on the server's clock rather than the viewer's
  app.get("/api/sessions", async (req, res) => {
    const { roomId } = req.query;
    if (typeof roomId !== "string") {
      res.status(400).send({ success: false, message: "roomId is required" });
      return;
    }

    const session = game.session(roomId);
    res.json({ now: Date.now(), session: session ? sessionView(session) : null });
  })

  return app;
}
