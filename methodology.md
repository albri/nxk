# Does nxk point the right way?

I wanted to know whether nxk's crowd is worth listening to, so I made it sit
some real surveys. I didn't expect it to match them to the decimal point. The
main question is whether people answer differently, and whether those
differences look like the ones real surveys found.

<!-- generated:headline -->
```text
Answers vary between people     ██████▎                  26% of people's top answer differs from the crowd's
Group gaps point the same way   ██████████████████       12 of 16 biggest published gaps (9 clearly)
Leading answer exact or close   ████████████████████▎    22 of 26 questions (16 exact)
```
<!-- /generated:headline -->

## What I ran

<!-- generated:setup -->
| | |
| --- | --- |
| Studies | 26 questions from 15 published surveys, UK and US |
| People | 1,000 PersonaGen profiles per question, 26,000 answers in total |
| Model | Jev (`jev-latest`), one Choice question per request, as in [SKILL.md](SKILL.md) |
| Cost | 72.8M input tokens, about $3.06 for the whole run |
<!-- /generated:setup -->

I chose the questions before running anything. Each one is an everyday
consumer or household question, like food prices, heating or paying bills,
where the survey publishes the exact wording, the answer options and the
results.

Each person got the survey date, any introduction the real respondents saw,
and the question, using the request pattern in [SKILL.md](SKILL.md). As the
skill says, the questions leave out "don't know" and "not sure", so the
published results are shown without them, as pollsters do when they exclude
don't-knows. Nothing was tuned to the published answers.

## 1. People answer differently

Same question, three people from the same crowd:

<!-- generated:example -->
```text
Concern about food affordability: "Thinking about food in the UK today, how concerned, if at all, do you feel about affordability of food?"

Elena, 25, fitness trainer, south west england · household £70–100k · budget managed · own with mortgage
  Not concerned at all   █▎                     6%
  Not very concerned     █████████████         65%
  Somewhat concerned     █████▊                29%
  Highly concerned                              0%

Jonathan, 61, social worker, south east england · household £20–35k · financially constrained · private rent
  Not concerned at all                          0%
  Not very concerned     ▎                      1%
  Somewhat concerned     █████████████████▊    89%
  Highly concerned       ██                    10%

Christine, 52, long term sick or disabled, london · household under £20k · high financial pressure · social housing rent
  Not concerned at all                          0%
  Not very concerned                            0%
  Somewhat concerned                            0%
  Highly concerned       ████████████████████ 100%
```
<!-- /generated:example -->

It's the same across the board. Each little chart below shows how likely the
1,000 people were to give the survey's leading answer, from 0% on the left to
100% on the right. Taller means more people. If the crowd had collapsed into
one opinion, you'd see a single spike.

<!-- generated:spread -->
| Question | Probability each person gives the real leading answer, 0 → 100% | Top answer differs from crowd |
| --- | --- | ---: |
| Concern about food affordability (UK) | `█▁▁▁▁▁▁▁▁▁` Highly concerned | 51% |
| Eating meat alternatives (UK) | `▁▂▂▄▅▆█▇▄▁` No, I have never eate… | 32% |
| Checking food hygiene ratings (UK) | `▁▁▄█▇▃▁▁▁·` No, I have not checke… | 17% |
| Installing an air source heat pump (UK) | `▆█▆▄▂▂▂▁▁·` Not very likely | 25% |
| Low-carbon heating is expensive to install (UK) | `·▁▁▃▅▆▆▆█▇` Strongly agree | 16% |
| Loyalty prices are unfair (UK) | `▁▆█▃▁·····` Neither agree nor dis… | 33% |
| Loyalty prices give good savings (UK) | `·▁▁▁▁▂▇█▂·` Agree | 5% |
| Loyalty prices make me feel valued (UK) | `▃█▄▁▁·····` Neither agree nor dis… | 6% |
| I have to join loyalty schemes to save (UK) | `▁▁▁▂▃██▅▁·` Agree | 16% |
| Trust that loyalty prices are genuine savings (UK) | `··▁▁▁▃▆█▃▁` To some extent | 2% |
| Considering a 'pot for life' pension (UK) | `▅▂▁▂▆█▂···` Probably would consid… | 36% |
| Where employers should pay pension contributions (UK) | `▁▂▃▃▃▄▇█▅▁` Employers pay workpla… | 29% |
| Reading online privacy statements (UK) | `··▁▁▂▆▇▄█▅` You read them partial… | 8% |
| Cancelling subscriptions over the cost of living (UK) | `▁▁▂▂▂▃▃▂▆█` I have not | 27% |
| Main home heating fuel (US) | `▄▄▄▅▅▆▇██▅` Natural gas from unde… | 30% |
| Main home heating equipment (US) | `▂▁▂▂▃▄▅▇██` Central furnace | 16% |
| Using buy now, pay later (US) | `··▁▁▁▁▁▁▃█` No | 7% |
| Preferred way to pay bills (US) | `▁▁▁▁▁▁▁▂▃█` Online banking bill p… | 7% |
| Preferred way to pay in person (US) | `▄▅▇████▆▄▁` Debit card | 43% |
| Preferred way to pay online (US) | `▃▂▂▂▂▂▂▃▄█` Credit card | 36% |
| Considering an electric car next time (US) | `█▂▁▁▁·····` Not at all likely | 56% |
| Wanting to ride in a driverless car (US) | `▆█▇▆▅▄▄▅▄▂` Probably NOT want | 38% |
| Enjoying TV with commercials (US) | `·····▁▁▃█▂` Less | 0% |
| Monthly budget for streaming (US) | `█▃▂▁▁▁▁▁▁▂` $15 or less | 46% |
| Streaming services are worth the cost (US) | `█▄▂▂▂▂▂▃▂▁` Worth the cost | 34% |
| Why people stay with their bank (US) | `█▆▅▃▂▁▁▁▁·` It's the account I've… | 62% |
<!-- /generated:spread -->

## 2. The differences point the right way

Many of the surveys break their results down by age, income, region or
housing. I matched each group to the same PersonaGen field and compared the
biggest published gap in each breakdown with nxk's gap between the same groups.

<!-- generated:gaps -->
| Question | Groups compared | Answer | Real gap | nxk gap | Same way? |
| --- | --- | --- | ---: | ---: | :---: |
| Concern about food affordability (UK) | Less than £19,000 vs More than £96,000 | Highly concerned | +22 | +95 | Yes |
| Concern about food affordability (UK) | High food security vs Very low food security | Highly concerned | −35 | −77 | Yes |
| Eating meat alternatives (UK) | 25-34 vs 75+ | No, I have never eaten meat alternatives | −35 | −13 | Yes |
| Eating meat alternatives (UK) | Less than £19,000 vs More than £96,000 | Yes, I currently eat meat alternatives | −23 | −2 | Faintly |
| Checking food hygiene ratings (UK) | 25-34 vs 75+ | No, I have not checked the Food Hygiene Rating of a food business | −28 | −13 | Yes |
| Installing an air source heat pump (UK) | 25 to 34 vs 65+ | Not at all likely | −13 | −4 | Faintly |
| Low-carbon heating is expensive to install (UK) | 35 to 44 vs 65+ | Strongly agree | −20 | −15 | Yes |
| Loyalty prices are unfair (UK) | 30-39 vs 70+ | Strongly agree | +12 | −3 | No |
| Loyalty prices give good savings (UK) | 30-39 vs 70+ | Agree | −14 | +3 | No |
| Loyalty prices make me feel valued (UK) | 18-29 vs 70+ | Neither agree nor disagree | −12 | +3 | No |
| I have to join loyalty schemes to save (UK) | 18-29 vs 70+ | Strongly agree | +27 | +1 | Faintly |
| Trust that loyalty prices are genuine savings (UK) | 30-39 vs 70+ | To some extent | −20 | +6 | No |
| Main home heating fuel (US) | Northeast vs South | Electricity | −37 | −24 | Yes |
| Main home heating fuel (US) | Owned by you or someone in your household vs Rented | Electricity | −20 | −12 | Yes |
| Main home heating equipment (US) | Northeast vs Midwest | Central furnace | −26 | −24 | Yes |
| Main home heating equipment (US) | Owned by you or someone in your household vs Rented | Central furnace | +21 | +6 | Yes |
<!-- /generated:gaps -->

<!-- generated:gapsAll -->
"Faintly" means the right way, but by less than 5 points. Across every pair of published groups that differ by 10 points or more on an answer, nxk's gap points the same way in 71 of 103 (69%).
<!-- /generated:gapsAll -->

## 3. The crowd gets the overall read

For comparison, I also asked the model each question once with no person
attached. It often guesses the headline answer. The crowd gets closer to the
real numbers and, more usefully, shows you which groups differ.

<!-- generated:baseline -->
| | Model alone, no person | nxk crowd |
| --- | ---: | ---: |
| Leading answer exact or one step off | 21 of 26 (14 exact) | 22 of 26 (16 exact) |
| Options in the right order (1 = perfect, questions with 4+ answers) | 0.54 | 0.72 |
| Average gap per answer | 14.0 pts | 9.7 pts |
| Group gaps pointing the same way | None, everyone gets one answer | 12 of 16 (9 clearly) |
<!-- /generated:baseline -->

<!-- generated:leaders -->
| Question | Leading answer | Options in the right order | Average gap per answer |
| --- | --- | ---: | ---: |
| Concern about food affordability (UK) | One step off | 0.80 | 12.1 pts |
| Eating meat alternatives (UK) | Exact | 1.00 | 9.2 pts |
| Checking food hygiene ratings (UK) | Missed | – | 17.1 pts |
| Installing an air source heat pump (UK) | Missed | 0.49 | 11.7 pts |
| Low-carbon heating is expensive to install (UK) | Exact | 0.90 | 12.8 pts |
| Loyalty prices are unfair (UK) | One step off | 0.60 | 7.9 pts |
| Loyalty prices give good savings (UK) | Exact | 0.90 | 6.6 pts |
| Loyalty prices make me feel valued (UK) | One step off | 0.90 | 11.3 pts |
| I have to join loyalty schemes to save (UK) | Exact | 0.90 | 7.0 pts |
| Trust that loyalty prices are genuine savings (UK) | Exact | 0.80 | 8.6 pts |
| Considering a 'pot for life' pension (UK) | Exact | 0.70 | 10.9 pts |
| Where employers should pay pension contributions (UK) | Exact | – | 12.6 pts |
| Reading online privacy statements (UK) | Exact | – | 12.0 pts |
| Cancelling subscriptions over the cost of living (UK) | Exact | – | 3.0 pts |
| Main home heating fuel (US) | Exact | 0.82 | 3.6 pts |
| Main home heating equipment (US) | Exact | 0.78 | 2.3 pts |
| Using buy now, pay later (US) | Exact | – | 4.5 pts |
| Preferred way to pay bills (US) | Exact | 0.58 | 10.3 pts |
| Preferred way to pay in person (US) | Exact | 0.85 | 4.8 pts |
| Preferred way to pay online (US) | Exact | 0.81 | 1.7 pts |
| Considering an electric car next time (US) | One step off | 0.40 | 13.3 pts |
| Wanting to ride in a driverless car (US) | Missed | 0.00 | 19.7 pts |
| Enjoying TV with commercials (US) | Exact | – | 11.9 pts |
| Monthly budget for streaming (US) | One step off | 0.90 | 6.1 pts |
| Streaming services are worth the cost (US) | Missed | – | 24.0 pts |
| Why people stay with their bank (US) | One step off | 0.56 | 6.0 pts |
<!-- /generated:leaders -->

### Question by question

<!-- generated:charts -->
```text
Concern about food affordability · Food Standards Agency, November 2023
                      Real survey              nxk crowd
Not concerned at all  ▍                    2   ▋                    4
Not very concerned    █▋                   9   ████▌               25
Somewhat concerned    ███████             39   ████████▎           46
Highly concerned      █████████           50   ████▋               26
```

```text
Eating meat alternatives · Food Standards Agency, November 2023
                                    Real survey              nxk crowd
Yes, I currently eat meat alterna…  █████               28   ██████▊             38
Yes, I used to eat meat alternati…  ████▏               23   ▊                    4
No, I have never eaten meat alter…  ████████▎           46   █████████▉          55
I have never heard of meat altern…  ▌                    3   ▋                    3
```

```text
Checking food hygiene ratings · Food Standards Agency, November 2023
                                    Real survey              nxk crowd
Yes, I have checked the Food Hygi…  ███████▉            44   ███████████         61
No, I have not checked the Food H…  ██████████▏         56   ███████             39
```

```text
Installing an air source heat pump · Department for Energy Security and Net Zero, November 2025
                                    Real survey              nxk crowd
Very likely                         █▌                   8   █▍                   8
Fairly likely                       ███▌                20   █████████▉          55
Not very likely                     █████▍              30   ████▉               27
Not at all likely                   █████▏              29   ▊                    4
Not applicable – I already have t…  ▋                    4   ▏                    1
Not applicable – not my decision    █▊                  10   █                    6
```

```text
Low-carbon heating is expensive to install · Department for Energy Security and Net Zero, November 2025
                            Real survey              nxk crowd
Strongly agree              ██████▌             36   ████████████▏       68
Slightly agree              █████▎              29   ████▉               27
Neither agree nor disagree  █████▌              31   ▊                    4
Slightly disagree           ▌                    3   ▏                    1
Strongly disagree           ▎                    2                        0
```

```text
Loyalty prices are unfair · Competition and Markets Authority, July 2024
                            Real survey              nxk crowd
Strongly agree              ███▍                19   █▌                   8
Agree                       ████▍               24   ███▊                21
Neither agree nor disagree  ████▉               27   ███▉                22
Disagree                    ████                22   ██████▋             37
Strongly disagree           █▎                   7   ██▎                 12
```

```text
Loyalty prices give good savings · Competition and Markets Authority, July 2024
                            Real survey              nxk crowd
Strongly agree              ███                 17   ███▎                18
Agree                       █████████▍          52   ████████████▏       67
Neither agree nor disagree  ███▊                21   █▋                   9
Disagree                    █▎                   7   ▊                    4
Strongly disagree           ▌                    3   ▎                    2
```

```text
Loyalty prices make me feel valued · Competition and Markets Authority, July 2024
                            Real survey              nxk crowd
Strongly agree              ██▍                 13   █▍                   8
Agree                       █████               28   ██████████▏         56
Neither agree nor disagree  ██████▏             34   ███                 17
Disagree                    ██▉                 16   ██▉                 16
Strongly disagree           █▋                   9   ▌                    3
```

```text
I have to join loyalty schemes to save · Competition and Markets Authority, July 2024
                            Real survey              nxk crowd
Strongly agree              █████▋              31   ████▌               25
Agree                       ███████▍            41   ██████████▎         57
Neither agree nor disagree  ███▎                18   █▏                   6
Disagree                    █▌                   8   █▋                   9
Strongly disagree           ▌                    3   ▌                    3
```

```text
Trust that loyalty prices are genuine savings · Competition and Markets Authority, July 2024
                Real survey              nxk crowd
Very much so    █▌                   8   █▏                   6
To some extent  █████████▏          51   ████████████▍       69
Not very much   █████               28   ████▏               23
Not at all      ██▏                 12   ▍                    2
```

```text
Considering a 'pot for life' pension · PensionBee, November 2023
                               Real survey              nxk crowd
Definitely would consider      ██████▋             37   █▊                  10
Probably would consider        ██████▉             38   ██████▊             37
Maybe / not sure               ███▋                20   █████▌              31
Probably would not consider    ▊                    4   ██▊                 16
Definitely would not consider  ▍                    2   █▎                   7
```

```text
Where employers should pay pension contributions · PensionBee, February 2024
                                    Real survey              nxk crowd
Employers pay workplace pension c…  █████████████▏      73   ██████████▏         57
Employers pay workplace pension c…  ████                22   ███▌                20
None of the above                   ▉                    5   ████▎               24
```

```text
Reading online privacy statements · European Commission, March 2019
                             Real survey              nxk crowd
You read them fully          ██▍                 13   █▍                   7
You read them partially      █████████▌          53   ████████████▊       71
You do not read them at all  ██████▏             34   ███▉                22
```

```text
Cancelling subscriptions over the cost of living · YouGov UK, April 2022
                                    Real survey              nxk crowd
I have cancelled something, for t…  ████▊               26   █████▍              30
I have cancelled something, for o…  █▍                   7   ▌                    3
I have not                          ███████████▉        66   ████████████        67
```

```text
Main home heating fuel · U.S. Energy Information Administration, 2020
                                    Real survey              nxk crowd
Electricity                         ██████▎             35   ████▏               23
Natural gas from underground pipes  █████████▏          51   ██████████          55
Propane (bottled gas)               ▊                    4   █                    5
Fuel oil                            ▊                    4   █▏                   6
Wood or pellets                     ▍                    2   ▏                    1
Other                                                    0   ▊                    4
Not applicable / home is not heat…  ▉                    5   ▉                    5
```

```text
Main home heating equipment · U.S. Energy Information Administration, 2020
                                    Real survey              nxk crowd
Central furnace                     ██████████▉         60   ███████████▉        66
Steam or hot water system with ra…  █▍                   8   ▊                    4
Central heat pump                   ██▍                 13   ███                 17
Ductless heat pump, also known as…  ▏                    1   ▏                    1
Built-in electric units installed…  █▏                   6   █                    6
Built-in room heater burning gas …  ▌                    3   ▏                    0
Wood or pellet stove                ▎                    2                        0
Portable electric heaters           ▌                    3   ▏                    1
Other                               ▏                    1   ▌                    3
Not applicable / home is not heat…  ▉                    5   ▌                    3
```

```text
Using buy now, pay later · Federal Reserve Bank of New York, 2024
     Real survey              nxk crowd
Yes  ███▋                20   ██▊                 16
No   ██████████████▍     80   ███████████████▎    84
```

```text
Preferred way to pay bills · Federal Reserve Bank of Atlanta, October 2024
                                    Real survey              nxk crowd
Cash                                ▉                    5                        0
Check                               █▏                   6   ▊                    4
Credit card                         ███▍                19   ▍                    2
Debit card                          ████▌               25   ▋                    3
Prepaid/Gift/EBT card               ▏                    1   ▌                    3
Bank account number payment         ██▌                 14   ▌                    3
Online banking bill payment         ████▊               27   ██████████████▏     78
Money order                         ▏                    1   ▏                    1
Mobile payment apps such as PayPa…  ▎                    2   ▊                    4
Account-to-account transfer         ▏                    1   ▏                    1
Other payment method                ▏                    1                        0
```

```text
Preferred way to pay in person · Federal Reserve Bank of Atlanta, October 2024
                                    Real survey              nxk crowd
Cash                                ███▏                17   █▏                   6
Check                               ▎                    2   ▎                    1
Credit card                         ██████▉             38   ████▎               24
Debit card                          ███████▏            40   ████████▎           46
Prepaid/Gift/EBT card               ▏                    1   ▉                    5
Bank account number payment                              0                        0
Online banking bill payment         ▏                    0                        0
Money order                                              0                        0
Mobile payment apps such as PayPa…  ▎                    2   ███▏                17
Account-to-account transfer                              0                        0
Other payment method                ▏                    1                        0
```

```text
Preferred way to pay online · Federal Reserve Bank of Atlanta, October 2024
                                    Real survey              nxk crowd
Cash                                                     0                        0
Check                                                    0                        0
Credit card                         ██████████▏         56   ██████████▊         59
Debit card                          ██████▌             36   █████▏              28
Prepaid/Gift/EBT card               ▎                    1   █▎                   7
Bank account number payment         ▏                    1   ▏                    1
Online banking bill payment         ▏                    1                        0
Money order                                              0                        0
Mobile payment apps such as PayPa…  ▊                    4   ▉                    5
Account-to-account transfer                              0                        0
Other payment method                ▏                    1                        0
```

```text
Considering an electric car next time · Pew Research Center, March 2026
                                    Real survey              nxk crowd
Very likely                         ██▏                 12   ▋                    3
Somewhat likely                     ███▌                19   █████▋              31
Not too likely                      ███▉                21   ███████▏            40
Not at all likely                   █████▉              32   █▍                   8
I do not expect to purchase a veh…  ██▊                 15   ███▎                18
```

```text
Wanting to ride in a driverless car · Pew Research Center, November 2021
                     Real survey              nxk crowd
Definitely want      ██▌                 14   ▌                    3
Probably want        ████▏               23   █████████▊          54
Probably NOT want    █████▉              32   ███████▍            41
Definitely NOT want  █████▌              30   ▍                    2
```

```text
Enjoying TV with commercials · YouGov US, April 2022
          Real survey              nxk crowd
More      █▌                   8   ▍                    2
The same  ████▉               27   ██▊                 16
Less      ███████████▋        65   ██████████████▉     83
```

```text
Monthly budget for streaming · The Motley Fool, January 2024
             Real survey              nxk crowd
$15 or less  ███████▎            40   ██████▎             35
$16-$30      ████▌               25   ███████▌            41
$31-$45      ██▊                 15   ██▌                 14
$46-$60      █▊                  10   █▏                   6
Over $60     █▌                   8   ▋                    4
```

```text
Streaming services are worth the cost · Pew Research Center, April 2025
                    Real survey              nxk crowd
Worth the cost      ██████████▋         59   ██████▎             35
Not worth the cost  ███████▍            41   ███████████▊        65
```

```text
Why people stay with their bank · Bankrate, January 2025
                                    Real survey              nxk crowd
It's the account I've always had    ███▍                19   ███▊                21
They have convenient branch/ATM l…  ██▍                 14   █▌                   8
It would be too much of a hassle …  █▊                  10   ███▏                18
I don't have the time to research…  ▍                    2   ▌                    3
They have no/low monthly fees       ███▍                19   █████▍              30
I am happy with the customer serv…  ███                 17   ▎                    1
Their reputation                    █▎                   7   ▌                    3
Their online or mobile tools        █                    6   ██▍                 13
They have good interest rates       ▊                    4   ▏                    1
Other                               ▋                    4   ▌                    2
```
<!-- /generated:charts -->

## Where to be careful

Like most language models, nxk makes people a bit more sensible than they
really are. More say they check food hygiene ratings than really do (61%
against 44%), and fewer think their streaming is worth the money (35% against
59%). The rest follow from the same habit or are quirks of their own:

- Gaps between groups usually come out at about a third of their real size,
  so read them for direction. Money pressure is the exception and moves
  answers more than it does in the surveys.
- Age can flip. In the CMA loyalty-pricing survey, older shoppers trust
  loyalty prices more, and nxk makes them more sceptical. That one survey
  accounts for every missed gap above.
- New technology comes out too popular. Heat pumps, driverless cars and
  electric cars all did better than in the surveys, so spell out what switching
  costs.
- People rarely pick the ends or the middle of a scale. Real respondents chose
  the end points 35% of the time and nxk's people 22%. A choice between concrete
  options gives a clearer read.

Some misses come from facts a profile doesn't hold, such as how a home is
heated or how many streaming services someone pays for. Filling in that fact
before asking fixed several of them, so the skill now has it as an
experimental recipe. The results are in
[experiments.md](experiments.md#fill-in-a-missing-fact).

## What I left out

Questions about government policy, trust in institutions, what people know
about a topic, medical technology and small-business forecasts, which nxk
isn't built for. Select-all questions are left out for now: nxk asks those as
one yes/no question per option, which needs a different comparison.

## Run it yourself

```bash
node benchmarks/run.mjs --dry-run   # draw the people and count the calls
node benchmarks/run.mjs             # ask Jev (needs JEV_API_KEY)
node benchmarks/score.mjs           # score and refresh this page
```

The questions, published results and group mappings are in
[benchmarks/studies.json](benchmarks/studies.json). Scores for every question
and group are in [benchmarks/results.json](benchmarks/results.json).

## Sources

<!-- generated:sources -->
| Question | Source | Surveyed | Population |
| --- | --- | --- | --- |
| Concern about food affordability | [Food and You 2 Wave 8](https://www.food.gov.uk/research/food-and-you-2/food-and-you-2-wave-8) | November 2023 | Adults in England, Wales and Northern Ireland |
| Eating meat alternatives | [Food and You 2 Wave 8](https://www.food.gov.uk/research/food-and-you-2/food-and-you-2-wave-8) | November 2023 | Adults in England, Wales and Northern Ireland |
| Checking food hygiene ratings | [Food and You 2 Wave 8](https://www.food.gov.uk/research/food-and-you-2/food-and-you-2-wave-8) | November 2023 | Adults in England, Wales and Northern Ireland |
| Installing an air source heat pump | [DESNZ Public Attitudes Tracker Winter 2025](https://www.gov.uk/government/statistics/desnz-public-attitudes-tracker-winter-2025) | November 2025 | UK homeowners |
| Low-carbon heating is expensive to install | [DESNZ Public Attitudes Tracker Winter 2025](https://www.gov.uk/government/statistics/desnz-public-attitudes-tracker-winter-2025) | November 2025 | UK adults |
| Loyalty prices are unfair | [Loyalty Pricing in the Groceries Sector](https://assets.publishing.service.gov.uk/media/6749f2a7ebabe47136b3a2c0/_____Findings_report___2.pdf) | July 2024 | UK adults who shop for groceries |
| Loyalty prices give good savings | [Loyalty Pricing in the Groceries Sector](https://assets.publishing.service.gov.uk/media/6749f2a7ebabe47136b3a2c0/_____Findings_report___2.pdf) | July 2024 | UK adults who shop for groceries |
| Loyalty prices make me feel valued | [Loyalty Pricing in the Groceries Sector](https://assets.publishing.service.gov.uk/media/6749f2a7ebabe47136b3a2c0/_____Findings_report___2.pdf) | July 2024 | UK adults who shop for groceries |
| I have to join loyalty schemes to save | [Loyalty Pricing in the Groceries Sector](https://assets.publishing.service.gov.uk/media/6749f2a7ebabe47136b3a2c0/_____Findings_report___2.pdf) | July 2024 | UK adults who shop for groceries |
| Trust that loyalty prices are genuine savings | [Loyalty Pricing in the Groceries Sector](https://assets.publishing.service.gov.uk/media/6749f2a7ebabe47136b3a2c0/_____Findings_report___2.pdf) | July 2024 | UK adults who shop for groceries |
| Considering a 'pot for life' pension | [PensionBee pot for life popularity](https://www.pensionbee.com/uk/press/pot-for-life-popularity) | November 2023 | UK adults |
| Where employers should pay pension contributions | [PensionBee pot for life popularity](https://www.pensionbee.com/uk/press/pot-for-life-popularity) | February 2024 | UK adults |
| Reading online privacy statements | [Special Eurobarometer 487a: GDPR](https://op.europa.eu/en/publication-detail/-/publication/87d359d4-a83c-11e9-9d01-01aa75ed71a1/language-en) | March 2019 | UK internet users |
| Cancelling subscriptions over the cost of living | [YouGov GB cost-of-living cancellation daily result](https://yougov.com/en-gb/daily-results/20220421-70e0d-2) | April 2022 | GB adults |
| Main home heating fuel | [Residential Energy Consumption Survey 2020](https://www.eia.gov/consumption/residential/data/2020/index.php?view=microdata) | 2020 | US households |
| Main home heating equipment | [Residential Energy Consumption Survey 2020](https://www.eia.gov/consumption/residential/data/2020/index.php?view=microdata) | 2020 | US households |
| Using buy now, pay later | [BNPL consumer demand drivers](https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr1167.pdf) | 2024 | US household heads |
| Preferred way to pay bills | [Survey and Diary of Consumer Payment Choice 2024](https://www.atlantafed.org/banking-and-payments/consumer-payments/survey-and-diary-of-consumer-payment-choice/2024-survey-and-diary) | October 2024 | US adults |
| Preferred way to pay in person | [Survey and Diary of Consumer Payment Choice 2024](https://www.atlantafed.org/banking-and-payments/consumer-payments/survey-and-diary-of-consumer-payment-choice/2024-survey-and-diary) | October 2024 | US adults |
| Preferred way to pay online | [Survey and Diary of Consumer Payment Choice 2024](https://www.atlantafed.org/banking-and-payments/consumer-payments/survey-and-diary-of-consumer-payment-choice/2024-survey-and-diary) | October 2024 | US adults |
| Considering an electric car next time | [Pew EV and hybrid next-purchase consideration](https://www.pewresearch.org/science/2026/04/03/how-appealing-are-electric-vehicles-and-hybrids-to-americans/) | March 2026 | US adults |
| Wanting to ride in a driverless car | [Pew AI and human enhancement](https://www.pewresearch.org/internet/wp-content/uploads/sites/9/2022/03/PS_2022.03.17_AI-HE_REPORT.pdf) | November 2021 | US adults |
| Enjoying TV with commercials | [YouGov opinions on TV and streaming](https://docs.cdn.yougov.com/6t4me9x2sz/toplines_Opinions%20on%20TV%20and%20streaming.pdf) | April 2022 | US adults who watch TV |
| Monthly budget for streaming | [The Motley Fool State of Streaming 2024](https://www.fool.com/research/state-of-streaming/) | January 2024 | US adults |
| Streaming services are worth the cost | [Pew Research Center streaming questionnaire, April 2025](https://www.pewresearch.org/wp-content/uploads/sites/20/2025/06/SR_25.07.01_streaming_questionnaire.pdf) | April 2025 | US adults who use streaming services |
| Why people stay with their bank | [Bankrate checking-account stay reasons](https://www.bankrate.com/banking/checking-fees-survey/) | January 2025 | US adults with a checking account |
<!-- /generated:sources -->
