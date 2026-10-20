# title: Last Order
VAR rating = 0
VAR solidarity = 0

-> opening

=== opening ===
5:58 p.m. Rain drums on the bus shelter, and your bike light blinks twice and dies. The app glows anyway: BUSY PERIOD. LOG ON NOW. Bonus ends at 6:30.
The riders' chat is already loud. Kemi has posted a flooded underpass with "avoid unless you're a duck". You've done this job three years. You know every shortcut, every kind security guard, every lift that lies about working.
How do you start the shift?
* [Log on now, light or no light] -> no_light
* [Ask the chat for a spare light] -> borrowed_light
* [Get it fixed at the bike stall] -> bike_stall

=== no_light ===
~ rating += 2
The first ping lands in forty seconds. You ride by streetlight and memory, and four drops go in before the bonus ends. The app gives you a little gold flame. Nobody in the chat sees you go by.
-> late_kitchen

=== borrowed_light ===
~ solidarity += 2
Kemi meets you at the station with a clip-on light and a flask of tea. "Pay me back in gossip." By the time you log on, the bonus is gone, but you know whose sister just had a baby.
-> late_kitchen

=== bike_stall ===
~ rating += 1
~ solidarity += 1
Mr Osei at the corner stall swaps your light in four minutes and waves off your money. "Bring me a samosa one day." You catch the last ten minutes of the bonus.
-> late_kitchen

=== late_kitchen ===
7:20, Lucky Garden. The app says the order is ready. The kitchen says twenty minutes. Your countdown turns orange, then starts to blink.
Next to you, a rider in a brand-new jacket keeps refreshing his phone. Tomás, first week. {no_light: He stares at your dead light.}{borrowed_light: He admires Kemi's light like it's a medal.}{bike_stall: He asks where you got your light.} He doesn't know you can drop a late order without a penalty.
What do you do?
* [Drop it and take the next ping] -> dropped_it
* [Wait, and show Tomás the ropes] -> showed_tomas
* [Charm the cook into hurrying] -> charmed_cook

=== dropped_it ===
~ rating += 2
Two taps and you're gone, onto a sushi order four streets away. Your timer stays green. At the lights you glance back. Tomás is still waiting, still refreshing.
-> rumour

=== showed_tomas ===
~ solidarity += 2
You wait it out together. You show him which lifts work, which buildings let you in the back, how to screenshot every late order. The app marks you late. Tomás saves your number as "Legend".
-> rumour

=== charmed_cook ===
~ rating += 1
You ask the cook about his football team, he laughs, and your bag is out in eight minutes. Tomás's isn't. You give him a thumbs up on the way out. It's something. It isn't much.
-> rumour

=== rumour ===
8:45. A notification with no name on it: "Your acceptance rate has dropped. Accounts below target may be reviewed." There's nobody to reply to.
The chat is on fire. Pay per drop was cut again this morning, to 2.90. Someone says everyone's logging off at nine and meeting at the fountain. Someone says it's just a rumour. {showed_tomas: Tomás messages you: "Are you going?"}{not showed_tomas: Kemi messages you: "You coming or what?"}
What do you do at nine?
* [Stay online and take everything] -> stayed_online
* [Ride to the fountain] -> fountain
* [Ride on, but post your pay] -> posted_pay

=== stayed_online ===
~ rating += 2
The square is two streets away. You can hear the horns from there. You take a burger run, a pharmacy run, three more. Your acceptance rate goes back to green. The chat scrolls past photos you're not in.
-> last_order

=== fountain ===
~ solidarity += 2
Forty riders, maybe fifty, bikes leaning on the fountain, phones held up showing 2.90. Nobody makes a speech. Somebody brought a speaker. For an hour, nobody's timer is running, and your rating sinks.
-> last_order

=== posted_pay ===
~ solidarity += 1
You stay online, but you screenshot every drop and post it: 2.90, 2.90, 3.10 for a hill. By ten, twenty riders are doing the same. Between screenshots you miss two pings, and the app notices.
-> last_order

=== last_order ===
11:40. One more and you can log off. Ninth floor of a tower block, lift out of order, "leave at door" switched off. The customer isn't answering. The app says wait ten minutes before you can cancel, and the wait counts against you.
Downstairs the night guard, Mrs Adeyemi, does her crossword and pretends not to watch. {stayed_online: Your legs have climbed forty floors tonight already.}{fountain: She asks if you were at the fountain. Her nephew rides.}{posted_pay: Your phone is still buzzing with screenshots.}
What do you do?
* [Climb the nine floors] -> climbed
* [Wait it out with Mrs Adeyemi] -> waited
* [Call until he comes down] -> called

=== climbed ===
~ rating += 2
Nine floors. A sleepy man in a dressing gown opens the door. "Sorry, I fell asleep." No tip. Five stars appear from somewhere. On the way down, your knees file a complaint.
-> ending

=== waited ===
~ solidarity += 2
You do the crossword together while the timer drains. He never answers, and the cancel costs you. Mrs Adeyemi knows half the riders in the city by name, and now she knows yours.
-> ending

=== called ===
~ rating += 1
~ solidarity += 1
You call four times. He comes down in slippers, a nurse off a double shift, and apologises like he means it. He tips in coins. For a minute you're just two people who work nights.
-> ending

=== ending ===
{
    - rating >= 3 && solidarity >= 3:
        -> long_way_home
    - rating >= 6 || solidarity >= 6:
        -> all_in
    - else:
        -> another_shift
}

=== long_way_home ===
# ending: The Long Way Home
You log off at midnight and ride home slowly. The pay won't cover what it should, and the app will want more tomorrow. But your phone keeps buzzing: {showed_tomas: Tomás saying he had his first good night, }{fountain: photos from the fountain, }the chat warning everyone about the underpass. You did the job well, and you didn't do it alone.
-> END

=== all_in ===
# ending: All In
{rating > solidarity: Top tier. First pick of orders, a gold badge on your profile, a message calling you a Star Rider. Your legs are shaking. When you post in the chat, it goes a little quiet. On the ride home you understand that the badge is a number, and someone you'll never meet can change it.}{solidarity > rating: At home a message is waiting: "Your account is under review." No reason, no name. But the chat has already seen it: who to email, what to screenshot, which rider got reinstated last month. Kemi writes, "We've got you." You fall asleep holding the phone.}
-> END

=== another_shift ===
# ending: Another Shift Tomorrow
You log off at 11:58 with less than you hoped and more than last Tuesday. Some of tonight went the app's way and some went yours, and neither of you is finished. You eat cold chips at the kitchen table and plug in your phone. The chat asks who's riding tomorrow. You say you are.
-> END
