# title: The Stray
VAR boldness = 0
VAR trust = 0

-> opening

=== opening ===
Rain hits the city just after dusk. Your alley is flooding, and a delivery van is reversing straight toward the cardboard box you slept in last night. Your whiskers twitch. Nobody tells you where to go. That is the best thing about being you.
Where do you run?
* [Under the bakery's back awning] -> bakery
* [Up the fire escape to the roofs] -> rooftops
* [After the old man with the umbrella] -> old_man

=== bakery ===
~ boldness += 1
~ trust += 1
The awning drips, but the vent by the back door breathes warm bread air. The baker spots you, pretends not to, and leaves a crust on the step.
-> stranger

=== rooftops ===
~ boldness += 2
Four storeys up, the rain sounds like applause. You can see the whole street from here: the van, the puddles, the lit windows. None of it can reach you.
-> stranger

=== old_man ===
~ trust += 2
You trot behind him, just out of reach. He stops under a bus shelter, tips his umbrella toward you, and says nothing at all. You decide you like him.
-> stranger

=== stranger ===
Next morning a girl in a yellow coat crouches in your path. {bakery: She smells of fresh bread.} {rooftops: She must have spotted you on the roofs.} {old_man: The old man is beside her, smiling.} She opens a tin of tuna and sets down a cat carrier with its door wide open.
What do you do?
* [Eat the tuna, then slip away]
    ~ boldness += 1
    ~ trust += 1
    You eat every last flake, wash your face in front of her, and stroll off before she can even reach for the carrier. She laughs.
* [Hiss and vanish over the wall]
    ~ boldness += 2
    One hiss, one leap, and you are gone. From the top of the wall you watch her close the empty carrier. You feel magnificent.
* [Let her stroke you, but don't follow]
    ~ trust += 1
    Her hand is warm and careful. You lean into it for exactly as long as you choose, then walk away. She does not follow.
- -> midnight

=== midnight ===
Midnight. A fox is hunting in the park, the night market is glowing three streets away, and the old man's window is still lit.
Where does the night take you?
* [Stare down the fox from the park wall]
    ~ boldness += 2
    -> ending
* [Curl up on the old man's windowsill]
    ~ trust += 2
    -> ending
* [Weave through the night market stalls]
    ~ boldness += 1
    ~ trust += 1
    -> ending

=== ending ===
{
    - boldness >= 3 && trust >= 3:
        -> everyones_cat
    - boldness >= 4 || trust >= 4:
        -> own_territory
    - else:
        -> just_another_night
}

=== everyones_cat ===
# ending: Everyone's Cat, Nobody's Cat
The baker calls you Crumb. The girl calls you Captain. The noodle seller calls you Boss. You answer to all of them and belong to none, and every door on the street is one you are free to walk away from.
-> END

=== own_territory ===
# ending: A Territory of Your Own
{boldness > trust: The rooftops are yours now. The foxes know it, the pigeons know it, and at night the whole city is a map only you can read.} {trust > boldness: The old man leaves his window open a crack every night. Some nights you come in. Some nights you don't. He never closes it.} Either way, you go where you please.
-> END

=== just_another_night ===
# ending: Just Another Night
You find a car bonnet still warm from its engine and stretch out under the stars. Nobody's cat, nobody's problem. Tomorrow the city will be new again, and you will choose all over again.
-> END
