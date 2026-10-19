import "./App.css";
import { useEffect, useState } from "react";
import { type SessionView } from "../src/voting";
import { apiUrl, countdown, leading, progress, shares } from "./view";

type Story = { id: string; title: string; decisions: number; paths: number; endings: string[]; addedHere: boolean };

// SPEC: poll every two seconds, which is simpler than websockets and fast enough for a projector
const POLL_MS = 2000;
const NUMBERS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];

async function getJson<T>(path: string, query?: Record<string, string>): Promise<T> {
    const response = await fetch(apiUrl(window.location, path, query));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

// The room's session, refreshed every POLL_MS, with the gap between the server's clock and this screen's
function useSession(roomId: string | null) {
    const [state, setState] = useState<{ session: SessionView | null; offset: number } | null>(null);
    const [offline, setOffline] = useState(false);

    useEffect(() => {
        if (!roomId) return;
        let stopped = false;

        async function load() {
            try {
                const { now, session } = await getJson<{ now: number; session: SessionView | null }>("/api/sessions", { roomId: roomId! });
                if (stopped) return;
                setState({ session, offset: now - Date.now() });
                setOffline(false);
            } catch {
                if (!stopped) setOffline(true);
            }
        }

        load();
        const timer = setInterval(load, POLL_MS);
        return () => { stopped = true; clearInterval(timer); };
    }, [roomId]);

    return { state, offline };
}

function useNow(offset: number) {
    const [now, setNow] = useState(() => Date.now() + offset);
    useEffect(() => {
        setNow(Date.now() + offset);
        const timer = setInterval(() => setNow(Date.now() + offset), 250);
        return () => clearInterval(timer);
    }, [offset]);
    return now;
}

export default function App() {
    const roomId = new URLSearchParams(window.location.search).get("roomId");
    const { state, offline } = useSession(roomId);

    return <main>
        <header>
            <h1>Storytelling</h1>
            {offline && <p className="notice">Can't reach the tool. Retrying…</p>}
        </header>

        {!roomId && <>
            <p className="lead">Open this dashboard from the hub's dashboard, which picks the group for you.</p>
            <Library roomId={null} />
        </>}

        {roomId && state && (state.session
            ? <Live session={state.session} offset={state.offset} />
            : <>
                <p className="lead">No story is running in this group. Send <code>story start</code> in the chat to play one.</p>
                <Library roomId={roomId} />
            </>)}
    </main>;
}

function Live({ session, offset }: { session: SessionView; offset: number }) {
    const now = useNow(offset);

    return <>
        <section className="story">
            <p className="eyebrow">{session.title ?? session.storyId} · {session.mode === "live" ? "Live" : "Slow"}</p>
            {session.status === "ended"
                ? <Ended session={session} />
                : <Beat session={session} now={now} />}
        </section>
        <Path path={session.path} ended={session.status === "ended"} />
    </>;
}

function Beat({ session, now }: { session: SessionView; now: number }) {
    const bars = shares(session.tally);
    const top = leading(session.tally);

    return <>
        <h2>Decision {session.beatNumber}</h2>
        <p className="beat">{session.beatText}</p>

        <ol className="choices">
            {session.choices.map((choice, i) => <li key={i} className={top[i] ? "leading" : ""}>
                <div className="label">
                    <span className="number" aria-hidden>{NUMBERS[i]}</span>
                    <span>{choice}</span>
                    <span className="count">{session.tally[i]}</span>
                </div>
                <div className="bar"><div style={{ width: `${bars[i]}%` }} /></div>
            </li>)}
        </ol>

        <Status session={session} now={now} />
    </>;
}

function Status({ session, now }: { session: SessionView; now: number }) {
    if (session.status === "paused")
        return <p className="status">Paused: nobody voted in time. The next vote reopens it.</p>;

    if (session.status === "closing")
        return <p className="status">Counting the votes…</p>;

    return <div className="status">
        <span className="pill">{progress(session.votesIn, session.quorum)}</span>
        {session.closesAt !== null && <span className="pill">Closes in <strong>{countdown(session.closesAt - now)}</strong></span>}
        {session.remindAt !== null && <span className="pill quiet">Next reminder in {countdown(session.remindAt - now)}</span>}
    </div>;
}

function Ended({ session }: { session: SessionView }) {
    const scores = Object.entries(session.scores ?? {});

    return <>
        <h2>{session.ending ? `The end: ${session.ending}` : "Story ended early"}</h2>
        <p className="lead">{session.voterCount} {session.voterCount === 1 ? "person" : "people"} voted along the way.</p>
        {scores.length > 0 && <dl className="scores">
            {scores.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{String(value)}</dd></div>)}
        </dl>}
    </>;
}

function Path({ path, ended }: { path: string[]; ended: boolean }) {
    if (path.length === 0) return null;

    return <section>
        <h3>{ended ? "The group's path" : "The group's choices so far"}</h3>
        <ol className="path">
            {path.map((label, i) => <li key={i}>{label}</li>)}
        </ol>
    </section>;
}

// The shared stories, plus the ones this group added with story add or story load
function Library({ roomId }: { roomId: string | null }) {
    const [stories, setStories] = useState<Story[] | null>(null);

    useEffect(() => {
        getJson<Story[]>("/api/stories", roomId ? { roomId } : undefined).then(setStories).catch(() => setStories([]));
    }, [roomId]);

    if (!stories) return null;

    return <section>
        <h3>Stories you can play</h3>
        {stories.length === 0
            ? <p>The library is empty.</p>
            : <ul className="library">
                {stories.map(story => <li key={story.id}>
                    <strong>{story.title}</strong>
                    <span>{story.decisions} decisions · {story.endings.length} endings{story.addedHere ? " · added in this group" : ""}</span>
                    <code>story start {story.id}</code>
                </li>)}
            </ul>}
    </section>;
}
