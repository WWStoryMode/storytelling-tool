// Pure helpers for the dashboard, kept out of the components so they can be tested

// The hub proxies {hub}/storytelling/* to the tool, so API calls are made relative to the page (NOTES.md §7)
export function apiUrl(location: { origin: string; pathname: string }, path: string, query: Record<string, string> = {}) {
    const base = location.pathname.replace(/\/+$/, "");
    const search = new URLSearchParams(query).toString();
    return `${location.origin}${base}${path}${search ? `?${search}` : ""}`;
}

// "2:05" for a Live vote, "23h 05m" for a Slow one
export function countdown(ms: number) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// Each choice's share of the votes, as a whole percentage for the bar widths
export function shares(tally: number[]) {
    const total = tally.reduce((sum, count) => sum + count, 0);
    return tally.map(count => total === 0 ? 0 : Math.round((count / total) * 100));
}

export function leading(tally: number[]) {
    const top = Math.max(0, ...tally);
    return tally.map(count => top > 0 && count === top);
}

export function progress(votesIn: number, quorum: number | null) {
    if (quorum !== null) return `${votesIn} of ${quorum} votes`;
    if (votesIn === 0) return "No votes yet";
    return `${votesIn} vote${votesIn === 1 ? "" : "s"}`;
}
