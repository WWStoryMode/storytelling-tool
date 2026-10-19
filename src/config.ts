// Startup checks on .env, so a setup mistake shows in the terminal rather than as silence in the chat

export function configProblems(env: Record<string, string | undefined>) {
    const problems: string[] = [];
    const publicUrl = env.PUBLIC_URL?.trim();

    if (!publicUrl)
        problems.push("PUBLIC_URL isn't set, so storytelling.json points at localhost and the hub can't reach the tool. Set it to your ngrok https:// URL.");
    else if (/localhost|127\.0\.0\.1/i.test(publicUrl))
        problems.push(`PUBLIC_URL is ${publicUrl}; the hub can't reach localhost. Set it to your ngrok https:// URL.`);
    else if (!/^https:\/\//i.test(publicUrl))
        problems.push(`PUBLIC_URL is ${publicUrl}; use the https:// address ngrok gives you.`);

    if (!env.HUB_SECRET?.trim())
        problems.push("HUB_SECRET isn't set, so storytelling.json has no secret and the hub will refuse timer closes and reminders.");

    if (!env.HUB_URL?.trim())
        problems.push("HUB_URL isn't set, so timer closes and reminders are only logged here, not sent to the chat.");

    return problems;
}
