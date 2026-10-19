# Writing a story

Stories are plain [Ink](https://www.inklestudios.com/ink/) files. A group plays one in chat: the bot posts each beat with numbered choices, members vote by reacting 1️⃣–4️⃣, and the most votes decides what happens next. At the end the bot posts a recap of the path the group took.

Any Ink story that follows the rules below will work. You don't need to touch the tool's code.

## Guides

- [Writing With Ink](https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md) is inkle's official language guide. Part 1 covers everything you need: knots, choices, diverts, gathers, variables and tags.
- [Inky](https://github.com/inkle/inky) is the editor ([downloads](https://github.com/inkle/inky/releases/latest)). You write on the left and play on the right as you type.
- [`the-stray.ink`](the-stray.ink), the starter story, already follows every rule here. Copy it as a template.

## Rules for chat stories

These are checked by `npm run check-story` and, later, by dashboard uploads and `story load`.

### Errors: the story is rejected

| Rule | Why |
| --- | --- |
| Every beat offers 2 to 4 choices, counted after any conditions on them | Voting uses 1️⃣–4️⃣, and more choices split a small group's vote |
| Every path reaches `-> END` | A branch that runs out of content leaves the group stuck |
| No path goes past 30 decisions, and the story has at most 5,000 paths | Endless loops never finish |
| One file, no `INCLUDE` | Includes can't be resolved when a story is loaded from a URL |
| No `EXTERNAL` functions | The server doesn't bind any game functions |

### Warnings: the story is accepted, but fix these

| Rule | Why |
| --- | --- |
| `# title: <name>` on the first line, before any content | Shown when the story starts |
| `# ending: <name>` on every ending | The recap names the ending the group reached |
| Choice labels in brackets: `* [Start a petition]` | Without brackets Ink repeats the label as story text |
| Choice labels under 40 characters | One line next to a number emoji |
| Beats under about 700 characters | Fits one phone screen |
| 3 to 6 decisions per path | About 15 minutes when played live |

### Good to know

- **Write plain text.** Chat won't render Markdown or HTML. Extra spaces and blank lines are tidied away.
- **Every `VAR` appears in the recap**, as in "Boldness 6 · Trust 0", so give variables readable names and keep internal counters to a minimum.
- **Let choices add up.** The Stray's choices change `boldness` and `trust`, and a final knot picks one of three endings from them. Each vote matters without the story growing into a huge tree.
- **Randomness isn't fully checked.** The checker tries every choice but each random outcome (shuffles, `RANDOM()`) only one way, so a dead end behind randomness can slip through.
- **`# image: <url>`** on a beat is reserved for a later feature that sends an image before the text.

## Skeleton

```ink
# title: My Story
VAR courage = 0

-> start

=== start ===
Two to four sentences of scene, then a question.
What do you do?
* [First option]
    ~ courage += 1
    What happens next.
* [Second option]
    What happens instead.
- -> next_beat

=== next_beat ===
...

=== brave_ending ===
# ending: The Brave Ending
Final text.
-> END
```

## Workflow

1. Write and playtest the story in Inky.
2. Save the `.ink` file in this folder, for example `stories/my-story.ink`.
3. Check it. You get its shape (decisions, paths, endings) and any problems with line numbers:
   ```
   npm run check-story -- stories/my-story.ink
   ```
4. Play it in the terminal as the group will see it, with the same text tidying and recap:
   ```
   npm run play-story -- stories/my-story.ink
   ```

Use Node 20 (`nvm use`) and run `npm install` once first.

## Adding a story from the chat

You can also add a story straight from the group, without the repo. It's checked against the same rules, and the reply names any problems with their line numbers.

- **Send the file.** Attach the `.ink` file (or compiled `.json` from Inky) as a document, then reply to it with `story add`. Sending it with `story add` as its caption works too.
- **Paste a link.** Put the story somewhere that serves its raw text, then send `story load <link>`. Links can be from `raw.githubusercontent.com`, `gist.githubusercontent.com` or `pastebin.com`. A GitHub file page or a paste's page link is turned into its raw link for you. The file must be public.

The reply says the name to start it with: the file name in lower case, with spaces as dashes (`The Lantern.ink` → `story start the-lantern`). Adding a file with the same name again replaces it, which makes editing and replaying quick. A story added this way:

- belongs to that group only, and other groups don't see it in `story list`
- can't use the name of a story in this folder
- can't be replaced while the group is playing it
- is kept until the server restarts. To keep a story for good, save it in this folder.

Each group can add up to 10 stories, of up to 200 KB each. Ink's `INCLUDE` doesn't work here, so a story must be a single file.
